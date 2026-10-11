import "server-only";

import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

// Deletion attempts are journaled BEFORE any destructive Firestore operation.
// Every record has a unique private Blob path: do not overwrite prior events.
// This is not a replacement for a transactional Firestore audit of all edits.
export function createDeletionAttemptId() {
  return randomUUID();
}

export async function appendDeletionJournal(input: {
  attemptId: string;
  contractId: string;
  actorUid: string;
  actorName: string;
  outcome: "requested" | "succeeded";
  alreadyDeleted?: boolean;
}) {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") return;

  // Keep audit records outside the contracts/<id>/ attachment cleanup prefix.
  const pathname = `audit/contract-deletions/${encodeURIComponent(input.contractId)}/${input.attemptId}-${input.outcome}.json`;
  await put(
    pathname,
    JSON.stringify({
      schemaVersion: 1,
      ...input,
      recordedAt: new Date().toISOString(),
    }),
    {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "application/json",
      abortSignal: AbortSignal.timeout(15_000),
    },
  );
}
