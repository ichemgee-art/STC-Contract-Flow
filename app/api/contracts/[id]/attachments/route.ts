import { del, get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/serverAuth";
import { acquireAttachmentLock } from "@/lib/attachmentLock";

export const runtime = "nodejs";

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1024 * 1024;
const MAX_IMAGE_DIMENSION = 3000;
const MAX_IMAGE_PIXELS = 9_000_000;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function cleanFilename(name: string) {
  const normalized = name.normalize("NFKC").replace(/[\\/]+/g, "-").trim();
  const cleaned = normalized.replace(/[^\p{L}\p{N}._ -]+/gu, "").replace(/\s+/g, "-");
  return cleaned.slice(-140) || "contract-file";
}

function prefixFor(contractId: string) {
  return `contracts/${contractId}/`;
}

function displayNameFromPath(pathname: string) {
  const leaf = pathname.split("/").pop() || "contract-file";
  const marker = leaf.indexOf("--");
  return marker >= 0 ? leaf.slice(marker + 2) : leaf;
}

function inferContentType(pathname: string) {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function uint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function jpegDimensions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  const sofMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3,
    0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb,
    0xcd, 0xce, 0xcf,
  ]);

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;

    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

    if (sofMarkers.has(marker) && segmentLength >= 7) {
      return {
        height: view.getUint16(offset + 3, false),
        width: view.getUint16(offset + 5, false),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function webpDimensions(bytes: Uint8Array) {
  if (bytes.length < 30) return null;
  const chunk = String.fromCharCode(...bytes.slice(12, 16));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (chunk === "VP8X") {
    return {
      width: uint24LE(bytes, 24) + 1,
      height: uint24LE(bytes, 27) + 1,
    };
  }

  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      width: 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8)),
      height: 1 + (
        ((bytes[22] & 0xc0) >> 6)
        | (bytes[23] << 2)
        | ((bytes[24] & 0x0f) << 10)
      ),
    };
  }

  if (
    chunk === "VP8 "
    && bytes.length >= 30
    && bytes[23] === 0x9d
    && bytes[24] === 0x01
    && bytes[25] === 0x2a
  ) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  return null;
}

async function validateImageContent(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let detectedType = "";
  let dimensions: { width: number; height: number } | null = null;

  const isJpeg =
    bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const isPng =
    bytes.length >= 24
    && pngSignature.every((value, index) => bytes[index] === value);

  const isWebp =
    bytes.length >= 16
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  if (isJpeg) {
    detectedType = "image/jpeg";
    dimensions = jpegDimensions(bytes);
  } else if (isPng) {
    detectedType = "image/png";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    dimensions = {
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    };
  } else if (isWebp) {
    detectedType = "image/webp";
    dimensions = webpDimensions(bytes);
  }

  if (!detectedType || detectedType !== file.type || !dimensions) {
    return { ok: false as const, reason: "Invalid image content." };
  }

  const { width, height } = dimensions;
  if (
    width <= 0
    || height <= 0
    || width > MAX_IMAGE_DIMENSION
    || height > MAX_IMAGE_DIMENSION
    || width * height > MAX_IMAGE_PIXELS
  ) {
    return { ok: false as const, reason: "Invalid image dimensions." };
  }

  return { ok: true as const };
}

function errorResponse(cause: unknown) {
  if (cause instanceof Response) return cause;
  console.error("Contract attachment API error", cause);
  return NextResponse.json({ error: "Attachment request failed." }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireActiveMember(request, id);

    const url = new URL(request.url);
    const pathname = url.searchParams.get("pathname");
    const prefix = prefixFor(id);

    if (pathname) {
      if (!pathname.startsWith(prefix)) {
        return NextResponse.json({ error: "Invalid attachment path." }, { status: 400 });
      }

      const result = await get(pathname, {
        access: "private",
        ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
      });

      if (!result) {
        return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
      }

      const commonHeaders = {
        ETag: result.blob.etag,
        "Cache-Control": "private, no-store",
        Vary: "Authorization",
        "X-Content-Type-Options": "nosniff",
      };

      if (result.statusCode === 304) {
        return new Response(null, {
          status: 304,
          headers: commonHeaders,
        });
      }

      return new Response(result.stream, {
        headers: {
          ...commonHeaders,
          "Content-Type": result.blob.contentType || inferContentType(pathname),
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(displayNameFromPath(pathname))}`,
        },
      });
    }

    const result = await list({
      prefix,
      limit: 100,
    });

    const attachments = result.blobs
      .map((blob) => ({
        pathname: blob.pathname,
        name: displayNameFromPath(blob.pathname),
        size: blob.size,
        uploadedAt: blob.uploadedAt,
        contentType: inferContentType(blob.pathname),
      }))
      .sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());

    return NextResponse.json(
      { attachments },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let release: (() => Promise<void>) | undefined;
  let uploadedPath = "";

  try {
    const { id } = await context.params;
    await requireActiveMember(request, id);

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type." }, { status: 415 });
    }

    if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File is too large." }, { status: 413 });
    }

    const validation = await validateImageContent(file);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 415 });
    }

    release = await acquireAttachmentLock(id);

    // Re-check after waiting for the distributed lease so a deleted/disabled
    // contract cannot receive a late upload.
    await requireActiveMember(request, id);

    const prefix = prefixFor(id);
    const signal = AbortSignal.timeout(45_000);
    const current = await list({
      prefix,
      limit: MAX_ATTACHMENTS + 1,
      abortSignal: signal,
    });

    if (current.blobs.length >= MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: "Maximum attachments reached." },
        { status: 409 },
      );
    }

    const filename = cleanFilename(file.name);
    const pathname = `${prefix}${Date.now()}-${crypto.randomUUID()}--${filename}`;

    const blob = await put(pathname, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type,
      abortSignal: signal,
    });
    uploadedPath = blob.pathname;

    // Fail closed if access or the contract disappeared while Blob storage was
    // writing. This also removes the just-written orphan.
    await requireActiveMember(request, id);

    return NextResponse.json({
      attachment: {
        pathname: blob.pathname,
        name: filename,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        contentType: file.type,
      },
    });
  } catch (cause) {
    if (uploadedPath) {
      await del(uploadedPath).catch(() => undefined);
    }
    return errorResponse(cause);
  } finally {
    await release?.();
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let release: (() => Promise<void>) | undefined;

  try {
    const { id } = await context.params;
    await requireActiveMember(request, id);

    const body = (await request.json()) as { pathname?: string };
    const pathname = body.pathname || "";
    const prefix = prefixFor(id);

    if (!pathname || !pathname.startsWith(prefix)) {
      return NextResponse.json({ error: "Invalid attachment path." }, { status: 400 });
    }

    release = await acquireAttachmentLock(id);
    await requireActiveMember(request, id);
    await del(pathname);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return errorResponse(cause);
  } finally {
    await release?.();
  }
}
