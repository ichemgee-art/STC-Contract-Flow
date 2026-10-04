import { list } from "@vercel/blob";
import { NextResponse } from "next/server";
import {
  ATTACHMENT_SHARE_TTL_MS,
  createAttachmentShareToken,
} from "@/lib/attachmentShare";
import { requireActiveMember } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function displayNameFromPath(pathname: string) {
  const leaf = pathname.split("/").pop() || "contract-file";
  const marker = leaf.indexOf("--");
  return marker >= 0 ? leaf.slice(marker + 2) : leaf;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    await requireActiveMember(request, id);

    const body = (await request.json()) as { pathname?: string };
    const pathname = body.pathname?.trim() || "";
    const prefix = `contracts/${id}/`;

    if (!pathname || !pathname.startsWith(prefix)) {
      return NextResponse.json({ error: "Invalid attachment path." }, { status: 400 });
    }

    const current = await list({
      prefix,
      limit: 100,
      abortSignal: AbortSignal.timeout(20_000),
    });
    const attachment = current.blobs.find((blob) => blob.pathname === pathname);

    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const name = displayNameFromPath(pathname);
    const { token, payload } = createAttachmentShareToken({
      contractId: id,
      pathname,
      name,
    });

    const origin = new URL(request.url).origin;
    const encodedToken = encodeURIComponent(token);

    return NextResponse.json(
      {
        shareUrl: `${origin}/share/attachment/${encodedToken}`,
        downloadUrl: `${origin}/api/share/attachment/${encodedToken}?download=1`,
        expiresAt: new Date(payload.exp).toISOString(),
        expiresInSeconds: Math.floor(ATTACHMENT_SHARE_TTL_MS / 1000),
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (cause) {
    if (cause instanceof Response) return cause;
    console.error("Attachment share link error", cause);
    return NextResponse.json(
      { error: "Could not create share link." },
      { status: 500 },
    );
  }
}
