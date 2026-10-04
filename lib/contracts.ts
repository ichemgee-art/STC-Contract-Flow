import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getContractStatus,
  STAGE_KEYS,
  type ContractInput,
  type ContractRecord,
  type ContractStages,
  type StageKey,
} from "@/types/contract";

const contractsRef = collection(db, "contracts");

function fromSnapshot(snapshot: DocumentSnapshot<DocumentData>): ContractRecord {
  const data = snapshot.data();
  if (!data) throw new Error("Contract document has no data.");

  return {
    id: snapshot.id,
    salesRepresentative: data.salesRepresentative ?? "",
    companyName: data.companyName ?? "",
    contractType: data.contractType ?? "",
    product: data.product ?? "",
    stages: data.stages,
    stageDates: data.stageDates,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    createdBy: data.createdBy ?? "",
    createdByName: data.createdByName ?? "",
  };
}

export function subscribeContracts(
  onData: (contracts: ContractRecord[]) => void,
  onError?: (error: Error) => void,
) {
  const contractsQuery = query(contractsRef, orderBy("createdAt", "desc"));
  return onSnapshot(
    contractsQuery,
    (snapshot) => onData(snapshot.docs.map(fromSnapshot)),
    (error) => onError?.(error),
  );
}

export function subscribeContract(
  id: string,
  onData: (contract: ContractRecord | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(db, "contracts", id),
    (snapshot) => onData(snapshot.exists() ? fromSnapshot(snapshot) : null),
    (error) => onError?.(error),
  );
}

export async function createContract(
  input: ContractInput,
  user: { uid: string; displayName: string },
) {
  const stages = Object.fromEntries(STAGE_KEYS.map((key) => [key, false])) as ContractStages;
  const stageDates = Object.fromEntries(STAGE_KEYS.map((key) => [key, null]));

  return addDoc(contractsRef, {
    ...input,
    stages,
    stageDates,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: user.uid,
    createdByName: user.displayName,
  });
}

export async function getContract(id: string) {
  const snapshot = await getDoc(doc(db, "contracts", id));
  if (!snapshot.exists()) return null;
  return fromSnapshot(snapshot);
}

export async function updateContractBasics(id: string, input: ContractInput) {
  return updateDoc(doc(db, "contracts", id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

export async function updateContractStage(contract: ContractRecord, stage: StageKey, checked: boolean) {
  const stageIndex = STAGE_KEYS.indexOf(stage);
  const nextStages = { ...contract.stages };
  const nextDates: Record<string, unknown> = { ...contract.stageDates };

  if (checked) {
    if (stageIndex > 0 && !nextStages[STAGE_KEYS[stageIndex - 1]]) {
      throw new Error("Complete the previous stage first.");
    }
    nextStages[stage] = true;
    nextDates[stage] = serverTimestamp();
  } else {
    for (let index = stageIndex; index < STAGE_KEYS.length; index += 1) {
      const key = STAGE_KEYS[index];
      nextStages[key] = false;
      nextDates[key] = null;
    }
  }

  return updateDoc(doc(db, "contracts", contract.id), {
    stages: nextStages,
    stageDates: nextDates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteContract(id: string) {
  return deleteDoc(doc(db, "contracts", id));
}


export async function getContractSummary() {
  const snapshot = await getDocs(query(contractsRef, orderBy("createdAt", "desc")));
  const contracts = snapshot.docs.map(fromSnapshot);

  const summary = {
    total: contracts.length,
    waitingStc: 0,
    waitingClient: 0,
    waitingPayment: 0,
    waitingSupply: 0,
    waitingSettlement: 0,
    completed: 0,
  };

  for (const contract of contracts) {
    const status = getContractStatus(contract.stages);
    if (status === "Waiting for STC Stamp") summary.waitingStc += 1;
    else if (status === "Waiting for Client Stamp") summary.waitingClient += 1;
    else if (status === "Waiting for Down Payment") summary.waitingPayment += 1;
    else if (status === "Waiting for Supply") summary.waitingSupply += 1;
    else if (status === "Waiting for Settlement") summary.waitingSettlement += 1;
    else summary.completed += 1;
  }

  return summary;
}
