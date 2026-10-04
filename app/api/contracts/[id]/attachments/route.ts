import { del, get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/serverAuth";
import { acquireAttachmentLock } from "@/lib/attachmentLock";

export const runtime = "nodejs";

const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 1024 * 1024;
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

async function hasValidImageSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  if (file.type === "image/jpeg") {
    return bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff;
  }

  if (file.type === "image/png") {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= png.length && png.every((value, index) => bytes[index] === value);
  }

  if (file.type === "image/webp") {
    return bytes.length >= 12
      && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }

  return false;
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

    if (!(await hasValidImageSignature(file))) {
      return NextResponse.json({ error: "Invalid image content." }, { status: 415 });
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
