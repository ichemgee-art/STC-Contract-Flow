import { del, get, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireActiveMember } from "@/lib/serverAuth";

export const runtime = "nodejs";

const MAX_ATTACHMENTS = 20;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
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
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
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
        "Cache-Control": "private, no-cache",
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

    const attachments = result.blobs.map((blob) => ({
      pathname: blob.pathname,
      name: displayNameFromPath(blob.pathname),
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      contentType: inferContentType(blob.pathname),
    }));

    return NextResponse.json({ attachments });
  } catch (cause) {
    return errorResponse(cause);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireActiveMember(request, id);

    const prefix = prefixFor(id);
    const current = await list({ prefix, limit: MAX_ATTACHMENTS + 1 });

    if (current.blobs.length >= MAX_ATTACHMENTS) {
      return NextResponse.json(
        { error: "Maximum attachments reached." },
        { status: 409 },
      );
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

    const filename = cleanFilename(file.name);
    const pathname = `${prefix}${Date.now()}-${crypto.randomUUID()}--${filename}`;

    const blob = await put(pathname, file, {
      access: "private",
      addRandomSuffix: false,
    });

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
    return errorResponse(cause);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireActiveMember(request, id);

    const body = (await request.json()) as { pathname?: string };
    const pathname = body.pathname || "";
    const prefix = prefixFor(id);

    if (!pathname || !pathname.startsWith(prefix)) {
      return NextResponse.json({ error: "Invalid attachment path." }, { status: 400 });
    }

    await del(pathname);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    return errorResponse(cause);
  }
}
