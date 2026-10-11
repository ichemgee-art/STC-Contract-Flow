import { del, list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { acquireAttachmentLock } from "@/lib/attachmentLock";
import { requireActiveMember } from "@/lib/serverAuth";
import { contractTombstonePath } from "@/lib/contractDeletion";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function contractPrefix(contractId: string) {
  return `contracts/${contractId}/`;
}

function firestoreBaseUrl() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase project ID is not configured.");

  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
    ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
}

async function deleteFirestoreContract(contractId: string, token: string) {
  return fetch(
    `${firestoreBaseUrl()}/contracts/${encodeURIComponent(contractId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
}

async function cleanupContractNotes(contractId: string, token: string) {
  const baseUrl = firestoreBaseUrl();

  // Always drain the first page. Deleting documents while following a page
  // token can skip records because the collection changes between pages.
  for (let pass = 0; pass < 100; pass += 1) {
    const response = await fetch(
      `${baseUrl}/contracts/${encodeURIComponent(contractId)}/notes?pageSize=100`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 404) return 0;
    if (!response.ok) throw new Error("Could not list contract notes.");

    const payload = (await response.json()) as {
      documents?: Array<{ name?: string }>;
    };
    const documents = payload.documents ?? [];
    if (!documents.length) return 0;

    const deletions = await Promise.allSettled(
      documents.map(async (document) => {
        const noteId = document.name?.split("/").at(-1);
        if (!noteId) return;

        const deletion = await fetch(
          `${baseUrl}/contracts/${encodeURIComponent(contractId)}/notes/${encodeURIComponent(noteId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
          },
        );

        if (!deletion.ok && deletion.status !== 404) {
          throw new Error("Could not delete contract note.");
        }
      }),
    );

    const failed = deletions.filter((result) => result.status === "rejected");
    if (failed.length) throw new Error("Could not delete all contract notes.");

    if (documents.length < 100) return 0;
  }

  throw new Error("Contract note cleanup exceeded its safety bound.");
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

    // Authenticate/authorize independently of the contract document so this
    // endpoint remains idempotent and can retry orphan cleanup after a partial
    // previous deletion.
    const member = await requireActiveMember(request);
    if (member.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = bearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    release = await acquireAttachmentLock(id);

    const lockedMember = await requireActiveMember(request);
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

    const tombstonePath = contractTombstonePath(id);
    let tombstoneCreated = false;

    if (!emulatorMode) {
      await put(
        tombstonePath,
        JSON.stringify({ contractId: id, deletedAt: new Date().toISOString() }),
        {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
          abortSignal: AbortSignal.timeout(15_000),
        },
      );
      tombstoneCreated = true;
    }

    // Delete the parent first. Hardened Firestore rules deny new note creation
    // once the parent is gone, closing the create-note-vs-delete race. The
    // private Blob tombstone makes every pre-existing QR token fail immediately,
    // even if attachment cleanup later has a transient failure.
    const deletion = await deleteFirestoreContract(id, token);
    if (!deletion.ok && deletion.status !== 404) {
      if (tombstoneCreated) {
        await del(tombstonePath).catch(() => undefined);
      }

      const status = deletion.status === 403 ? 403 : 500;
      return NextResponse.json(
        { error: "Could not delete contract." },
        { status },
      );
    }

    let notesCleanupPending = false;
    try {
      await cleanupContractNotes(id, token);
    } catch (error) {
      notesCleanupPending = true;
      console.error("Contract deleted but note cleanup failed", {
        contractId: id,
        error,
      });
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

    const cleanupPending = notesCleanupPending || failedCleanup.length > 0;

    return NextResponse.json(
      {
        ok: true,
        alreadyDeleted: deletion.status === 404,
        attachmentsDeleted: blobs.blobs.length - failedCleanup.length,
        attachmentCleanupPending: failedCleanup.length,
        notesCleanupPending,
      },
      { status: cleanupPending ? 202 : 200 },
    );
  } catch (cause) {
    if (cause instanceof Response) return cause;
    console.error("Contract delete API error", cause);
    return NextResponse.json({ error: "Could not delete contract." }, { status: 500 });
  } finally {
    await release?.();
  }
}

