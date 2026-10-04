import { del, get, put, BlobPreconditionFailedError } from "@vercel/blob";

function busyResponse() {
  return new Response("Upload in progress. Try again.", {
    status: 409,
    headers: { "Retry-After": "1" },
  });
}

// A store-level lease serializes uploads, attachment deletion and contract
// deletion across Vercel instances. Writes are bounded below the lease TTL.
export async function acquireAttachmentLock(contractId: string) {
  const path = `attachment-locks/${encodeURIComponent(contractId)}.json`;
  const previous = await get(path, { access: "private", useCache: false });
  let etag: string | undefined;

  if (previous && previous.statusCode === 200) {
    etag = previous.blob.etag;

    let expiresAt = 0;
    try {
      const lease = await new Response(previous.stream).json() as { expiresAt?: number };
      expiresAt = typeof lease.expiresAt === "number" ? lease.expiresAt : 0;
    } catch {
      // A malformed stale lock should be replaceable using its ETag instead of
      // permanently blocking uploads with a server error.
      expiresAt = 0;
    }

    if (expiresAt > Date.now()) throw busyResponse();
  }

  try {
    const lock = await put(
      path,
      JSON.stringify({ expiresAt: Date.now() + 120_000 }),
      {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        ...(etag ? { ifMatch: etag } : {}),
        contentType: "application/json",
        abortSignal: AbortSignal.timeout(15_000),
      },
    );

    return async () => {
      await del(path, { ifMatch: lock.etag }).catch(() => undefined);
    };
  } catch (error) {
    if (
      error instanceof BlobPreconditionFailedError
      || /already exists|precondition/i.test(String(error))
    ) {
      throw busyResponse();
    }
    throw error;
  }
}
