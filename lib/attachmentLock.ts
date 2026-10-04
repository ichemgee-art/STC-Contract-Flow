import { del, get, put, BlobPreconditionFailedError } from "@vercel/blob";

// A store-level lease serializes uploads across Vercel instances, rather than
// relying on an in-process mutex. Writes are bounded well below the lease TTL.
export async function acquireAttachmentLock(contractId: string) {
  const path = `attachment-locks/${encodeURIComponent(contractId)}.json`;
  const previous = await get(path, { access: "private", useCache: false });
  let etag: string | undefined;
  if (previous && previous.statusCode === 200) {
    const lease = await new Response(previous.stream).json() as { expiresAt: number };
    if (lease.expiresAt > Date.now()) throw new Response("Upload in progress. Try again.", { status: 409 });
    etag = previous.blob.etag;
  }
  try {
    const lock = await put(path, JSON.stringify({ expiresAt: Date.now() + 120_000 }), {
      access: "private", addRandomSuffix: false, allowOverwrite: !!etag,
      ...(etag ? { ifMatch: etag } : {}), contentType: "application/json",
      abortSignal: AbortSignal.timeout(15_000),
    });
    return async () => {
      await del(path, { ifMatch: lock.etag }).catch(() => undefined);
    };
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || /already exists/i.test(String(error))) {
      throw new Response("Upload in progress. Try again.", { status: 409 });
    }
    throw error;
  }
}
