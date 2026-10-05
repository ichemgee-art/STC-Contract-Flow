import { del, list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { acquireAttachmentLock } from "@/lib/attachmentLock";
import { requireActiveMember } from "@/lib/serverAuth";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function contractPrefix(contractId: string) {
  return `contracts/${contractId}/`;
}

async function deleteFirestoreContract(contractId: string, token: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase project ID is not configured.");

  const baseUrl =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
      ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  return fetch(
    `${baseUrl}/contracts/${encodeURIComponent(contractId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
}

async function cleanupBlobs(pathnames: string[]) {
  if (!pathnames.length) return [];

  const firstPass = await Promise.allSettled(
    pathnames.map((pathname) => del(pathname)),
  );
  const failed = pathnames.filter((_, index) => firstPass[index].status === "rejected");

  if (!failed.length) return [];

  const retry = await Promise.allSettled(
    failed.map((pathname) => del(pathname)),
  );
  return failed.filter((_, index) => retry[index].status === "rejected");
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let release: (() => Promise<void>) | undefined;

  try {
    const { id } = await context.params;
    const member = await requireActiveMember(request, id);

    if (member.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    release = await acquireAttachmentLock(id);

    // Re-check after obtaining the same lease used by uploads. This prevents
    // a late image write from racing with contract deletion.
    const lockedMember = await requireActiveMember(request, id);
    if (lockedMember.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const emulatorMode = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
    const blobs = emulatorMode
      ? { blobs: [] as Array<{ pathname: string }> }
      : await list({
          prefix: contractPrefix(id),
          limit: 100,
          abortSignal: AbortSignal.timeout(30_000),
        });

    const deletion = await deleteFirestoreContract(id, token);
    if (!deletion.ok) {
      const status = deletion.status === 404 ? 404 : deletion.status === 403 ? 403 : 500;
      return NextResponse.json(
        { error: status === 404 ? "Contract not found." : "Could not delete contract." },
        { status },
      );
    }

    const failedCleanup = await cleanupBlobs(
      blobs.blobs.map((blob) => blob.pathname),
    );

    if (failedCleanup.length) {
      console.error("Contract deleted but some attachment cleanup failed", {
        contractId: id,
        failedCleanup,
      });
    }

    return NextResponse.json({
      ok: true,
      attachmentsDeleted: blobs.blobs.length - failedCleanup.length,
      cleanupPending: failedCleanup.length,
    });
  } catch (cause) {
    if (cause instanceof Response) return cause;
    console.error("Contract delete API error", cause);
    return NextResponse.json({ error: "Could not delete contract." }, { status: 500 });
  } finally {
    await release?.();
  }
}
