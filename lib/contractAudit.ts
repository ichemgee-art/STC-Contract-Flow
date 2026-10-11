import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { ContractStages } from "@/types/contract";

// Off until the matching firestore.rules have been tested AND deployed to
// the real Firebase project. Never enable against unverified production rules.
export const CONTRACT_AUDIT_ENABLED =
  process.env.NEXT_PUBLIC_CONTRACT_AUDIT_ENABLED === "true";

export type ContractAuditAction =
  | "created"
  | "details_updated"
  | "stage_updated"
  | "number_assigned";

export interface ContractAuditSummary {
  contractNumber: string;
  salesRepresentative: string;
  companyName: string;
  contractType: string;
  product: string;
  stages: ContractStages;
}

export interface ContractAuditActor {
  uid: string;
  displayName: string;
}

export function auditSummary(data: {
  contractNumber?: string;
  salesRepresentative: string;
  companyName: string;
  contractType: string;
  product: string;
  stages: ContractStages;
}): ContractAuditSummary {
  return {
    contractNumber: data.contractNumber ?? "",
    salesRepresentative: data.salesRepresentative,
    companyName: data.companyName,
    contractType: data.contractType,
    product: data.product,
    stages: { ...data.stages },
  };
}

export async function currentAuditActor(): Promise<ContractAuditActor> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in for contract audit.");

  const snapshot = await getDoc(doc(db, "users", uid));
  const member = snapshot.data();
  if (
    !member
    || member.active !== true
    || (member.role !== "admin" && member.role !== "editor")
    || typeof member.displayName !== "string"
  ) {
    throw new Error("Active member profile required for contract audit.");
  }
  return { uid, displayName: member.displayName };
}

// The event and corresponding contract write are committed in ONE Firestore
// transaction. Security rules verify request.auth.uid, timestamps, and exact
// old/new contract summaries and deny later edits/deletions to audit entries.
export function appendContractAudit(
  transaction: Transaction,
  contractId: string,
  action: ContractAuditAction,
  actor: ContractAuditActor,
  before: ContractAuditSummary | null,
  after: ContractAuditSummary,
): string {
  const eventRef = doc(collection(db, "contractAudit", contractId, "entries"));
  transaction.set(eventRef, {
    contractId,
    action,
    actorUid: actor.uid,
    actorName: actor.displayName,
    at: serverTimestamp(),
    before,
    after,
  });
  return eventRef.id;
}
