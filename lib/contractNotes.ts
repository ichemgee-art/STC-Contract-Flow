"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ContractNote } from "@/types/contract";

function notesRef(contractId: string) {
  return collection(db, "contracts", contractId, "notes");
}

function fromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ContractNote {
  const data = snapshot.data();
  if (!data) throw new Error("Note document has no data.");

  return {
    id: snapshot.id,
    text: data.text ?? "",
    createdAt: data.createdAt ?? null,
    createdBy: data.createdBy ?? "",
    createdByName: data.createdByName ?? "",
  };
}

export function subscribeContractNotes(
  contractId: string,
  onData: (notes: ContractNote[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    query(notesRef(contractId), orderBy("createdAt", "desc"), limit(100)),
    (snapshot) => onData(snapshot.docs.map(fromSnapshot)),
    (error) => onError?.(error),
  );
}

export async function listContractNotes(contractId: string) {
  const snapshot = await getDocs(
    query(notesRef(contractId), orderBy("createdAt", "desc"), limit(100)),
  );
  return snapshot.docs.map(fromSnapshot);
}

export async function addContractNote(
  contractId: string,
  text: string,
  user: { uid: string; displayName: string },
) {
  const normalized = text.trim();
  if (!normalized) throw new Error("Note cannot be empty.");
  if (normalized.length > 2000) throw new Error("Note is too long.");

  return addDoc(notesRef(contractId), {
    text: normalized,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByName: user.displayName,
  });
}

export async function deleteContractNote(contractId: string, noteId: string) {
  return deleteDoc(doc(db, "contracts", contractId, "notes", noteId));
}
