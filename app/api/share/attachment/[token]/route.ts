import { get } from "@vercel/blob";
import { verifyAttachmentShareToken } from "@/lib/attachmentShare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inferContentType(pathname: string) {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const payload = verifyAttachmentShareToken(token);

  if (!payload) {
    return new Response("Share link is invalid or expired.", {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const result = await get(payload.pathname, { access: "private" });

  if (!result) {
    return new Response("Attachment not found.", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const disposition = download ? "attachment" : "inline";

  return new Response(result.stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": result.blob.contentType || inferContentType(payload.pathname),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(payload.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
