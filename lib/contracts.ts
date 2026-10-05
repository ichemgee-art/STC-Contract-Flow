import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAttachmentCaches } from "@/lib/attachmentCache";
import {
  canCompleteStage,
  getContractStatus,
  STAGE_KEYS,
  type ContractInput,
  type ContractRecord,
  type ContractStages,
  type StageKey,
} from "@/types/contract";

const contractsRef = collection(db, "contracts");

export const CONTRACT_REALTIME_WINDOW = 50;
export const CONTRACT_PAGE_SIZE = 50;

export interface ContractPage {
  contracts: ContractRecord[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

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
  onData: (page: ContractPage) => void,
  onError?: (error: Error) => void,
  windowSize = CONTRACT_REALTIME_WINDOW,
) {
  const contractsQuery = query(
    contractsRef,
    orderBy("createdAt", "desc"),
    limit(windowSize),
  );

  return onSnapshot(
    contractsQuery,
    (snapshot) => {
      onData({
        contracts: snapshot.docs.map(fromSnapshot),
        cursor: snapshot.docs.at(-1) ?? null,
        hasMore: snapshot.size === windowSize,
      });
    },
    (error) => onError?.(error),
  );
}

export async function loadOlderContracts(
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  pageSize = CONTRACT_PAGE_SIZE,
): Promise<ContractPage> {
  if (!cursor) {
    return { contracts: [], cursor: null, hasMore: false };
  }

  const snapshot = await getDocs(
    query(
      contractsRef,
      orderBy("createdAt", "desc"),
      startAfter(cursor),
      limit(pageSize),
    ),
  );

  return {
    contracts: snapshot.docs.map(fromSnapshot),
    cursor: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.size === pageSize,
  };
}

export async function getContractCount() {
  const snapshot = await getCountFromServer(contractsRef);
  return snapshot.data().count;
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
  if (stageIndex < 0) throw new Error("Invalid workflow stage.");

  const contractRef = doc(db, "contracts", contract.id);
  const localLaterProgress =
    !checked
    && STAGE_KEYS.slice(stageIndex + 1).some((key) => contract.stages[key]);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(contractRef);
    if (!snapshot.exists()) throw new Error("Contract no longer exists.");

    const data = snapshot.data();
    const currentStages = data.stages as ContractStages | undefined;
    const currentDates = data.stageDates as Record<StageKey, unknown> | undefined;

    if (
      !currentStages
      || !currentDates
      || STAGE_KEYS.some((key) => typeof currentStages[key] !== "boolean")
    ) {
      throw new Error("Contract workflow data is invalid.");
    }

    // A realtime snapshot can be a few milliseconds behind another user's edit.
    // Always decide against the latest Firestore state so one user cannot
    // accidentally overwrite another user's workflow progress.
    if (currentStages[stage] === checked) return;

    const nextStages = { ...currentStages };
    const nextDates: Record<StageKey, unknown> = { ...currentDates };

    if (checked) {
      if (!canCompleteStage(currentStages, stage)) {
        throw new Error("Complete the previous stages first.");
      }

      nextStages[stage] = true;
      nextDates[stage] = serverTimestamp();
    } else {
      const latestLaterProgress = STAGE_KEYS
        .slice(stageIndex + 1)
        .some((key) => currentStages[key]);

      // If this browser did not know about newly completed later stages, do not
      // silently erase another user's fresh progress without confirmation.
      if (latestLaterProgress && !localLaterProgress) {
        throw new Error("The workflow changed while you were editing. Try again.");
      }

      for (let index = stageIndex; index < STAGE_KEYS.length; index += 1) {
        const key = STAGE_KEYS[index];
        nextStages[key] = false;
        nextDates[key] = null;
      }
    }

    transaction.update(contractRef, {
      stages: nextStages,
      stageDates: nextDates,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function deleteContract(id: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const retryDelays = [600, 1200, 2200];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const token = await user.getIdToken();
    const response = await fetch(`/api/contracts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });

    if (response.ok) {
      // Deleted contract images must not remain readable from the local private
      // image cache after the record itself is gone.
      await clearAttachmentCaches();
      return;
    }

    const message = await response.text().catch(() => "");
    const busy =
      response.status === 409
      && /upload in progress/i.test(message);

    if (busy && attempt < retryDelays.length) {
      await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
      continue;
    }

    throw new Error("Could not delete contract.");
  }

  throw new Error("Could not delete contract.");
}


export function summarizeContracts(contracts: ContractRecord[]) {
  const summary = {
    total: contracts.length,
    waitingStc: 0,
    waitingClient: 0,
    waitingPayment: 0,
    waitingSupply: 0,
    waitingStockingPayment: 0,
    completed: 0,
  };

  for (const contract of contracts) {
    const status = getContractStatus(contract.stages);
    if (status === "Waiting for STC Stamp") summary.waitingStc += 1;
    else if (status === "Waiting for Client Stamp") summary.waitingClient += 1;
    else if (status === "Waiting for Down Payment") summary.waitingPayment += 1;
    else if (status === "Waiting for Supply") summary.waitingSupply += 1;
    else if (status === "Waiting for Stocking Payment") summary.waitingStockingPayment += 1;
    else summary.completed += 1;
  }

  return summary;
}

export async function getContractSummary() {
  const snapshot = await getDocs(query(contractsRef, orderBy("createdAt", "desc")));
  return summarizeContracts(snapshot.docs.map(fromSnapshot));
}
