"use client";

const PREFIX = "stc-private-images-v1-";
let generation = 0;
const pending = new Map<string, Promise<Blob>>();
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("stc-private-image-invalidation") : null;
channel?.addEventListener("message", () => {
  // CacheStorage is shared across tabs; cancel any older in-flight cache writes.
  generation += 1;
  pending.clear();
});

export async function retainAttachmentUser(uid: string) {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  const otherUsers = names.filter(name => name.startsWith(PREFIX) && name !== PREFIX + uid);
  if (otherUsers.length) {
    generation += 1;
    pending.clear();
    channel?.postMessage({ type: "switch-user" });
    await Promise.all(otherUsers.map(name => caches.delete(name)));
  }
}

export async function clearAttachmentCaches() {
  generation += 1;
  pending.clear();
  channel?.postMessage({ type: "clear" });
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith(PREFIX)).map(name => caches.delete(name)));
}

export async function invalidateAttachment(uid: string, url: string) {
  generation += 1;
  pending.clear();
  channel?.postMessage({ type: "delete" });
  if (typeof caches !== "undefined") {
    const cache = await caches.open(PREFIX + uid);
    await cache.delete(url);
  }
}

// Only synthetic, token-free responses are persisted. Every cached read is
// revalidated through the authenticated API before bytes are returned.
export async function cachedAttachment(uid: string, url: string, headers: Record<string, string>, isCurrentUser: () => boolean) {
  const key = uid + url;
  const existing = pending.get(key);
  if (existing) return existing;
  const epoch = generation;
  const task = (async () => {
    const cache = typeof caches === "undefined" ? null : await caches.open(PREFIX + uid).catch(() => null);
    const stored = await cache?.match(url).catch(() => undefined);
    if (!isCurrentUser() || epoch !== generation) throw new Error("Authentication changed.");
    // Always revalidate with the authenticated API before serving cached bytes.
    // A 304 keeps the bandwidth saving while ensuring disabled users, deleted
    // contracts and revoked access cannot keep reading a previously cached image.
    const etag = stored?.headers.get("ETag");
    const response = await fetch(url, {
      headers: { ...headers, ...(etag ? { "If-None-Match": etag } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (!isCurrentUser() || epoch !== generation) throw new Error("Authentication or attachment changed.");
    if (response.status === 304 && !stored) {
      throw new Error("Attachment cache is unavailable.");
    }
    if (!response.ok && response.status !== 304) {
      await cache?.delete(url);
      throw new Error("Could not load attachment.");
    }

    const blob = response.status === 304 && stored
      ? await stored.blob()
      : await response.blob();

    const saved = new Response(blob, { headers: {
      "Content-Type": blob.type,
      ...(response.headers.get("ETag") || etag ? { ETag: response.headers.get("ETag") || etag! } : {}),
    } });
    if (cache && epoch === generation && isCurrentUser()) {
      await cache.put(url, saved).catch(() => undefined);
      // A logout/delete can occur while CacheStorage is writing.
      if (epoch !== generation || !isCurrentUser()) await cache.delete(url);
    }
    return blob;
  })();
  pending.set(key, task);
  try { return await task; } finally { if (pending.get(key) === task) pending.delete(key); }
}
