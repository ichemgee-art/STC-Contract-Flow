"use client";

// Private contract documents are NEVER persisted to CacheStorage. Previous
// releases used a private CacheStorage namespace; purge those legacy bytes on
// login/logout and whenever an authenticated user changes.
const PREFIX = "stc-private-images-v1-";
let generation = 0;
const pending = new Map<string, Promise<Blob>>();
const channel = typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("stc-private-image-invalidation") : null;

channel?.addEventListener("message", () => {
  generation += 1;
  pending.clear();
});

function notifyOtherTabs(type: string) {
  if (!channel) return;
  channel.postMessage({ type });
}

async function removeLegacyCaches() {
  if (typeof caches === "undefined") return;
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(PREFIX))
      .map((name) => caches.delete(name)),
  );
}

export async function retainAttachmentUser(_uid: string) {
  generation += 1;
  pending.clear();
  notifyOtherTabs("switch-user");
  await removeLegacyCaches();
}

export async function clearAttachmentCaches() {
  generation += 1;
  pending.clear();
  notifyOtherTabs("clear");
  await removeLegacyCaches();
}

export async function invalidateAttachment(_uid: string, _url: string) {
  generation += 1;
  pending.clear();
  notifyOtherTabs("delete");
  await removeLegacyCaches();
}

// In-flight deduplication remains in RAM only, and every read checks active
// Firebase access server-side. No private attachment bytes hit browser storage.
export async function cachedAttachment(
  uid: string,
  url: string,
  headers: Record<string, string>,
  isCurrentUser: () => boolean,
) {
  const key = uid + url;
  const existing = pending.get(key);
  if (existing) return existing;
  const epoch = generation;

  const task = (async () => {
    if (!isCurrentUser()) throw new Error("Authentication changed.");
    const response = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if (epoch !== generation || !isCurrentUser()) {
      throw new Error("Authentication or attachment changed.");
    }
    if (!response.ok) throw new Error("Could not load attachment.");
    const blob = await response.blob();
    if (epoch !== generation || !isCurrentUser()) {
      throw new Error("Authentication or attachment changed.");
    }
    return blob;
  })();

  pending.set(key, task);
  try {
    return await task;
  } finally {
    if (pending.get(key) === task) pending.delete(key);
  }
}
