"use client";

import { Timestamp } from "firebase/firestore";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import { subscribeContracts } from "@/lib/contracts";
import { STAGE_KEYS, type ContractRecord, type StageKey } from "@/types/contract";

interface ContractsContextValue {
  contracts: ContractRecord[];
  loading: boolean;
  syncing: boolean;
  error: Error | null;
  getContract: (id: string) => ContractRecord | null;
}

interface StoredContract extends Omit<ContractRecord, "createdAt" | "updatedAt" | "stageDates"> {
  createdAt: number | null;
  updatedAt: number | null;
  stageDates: Record<StageKey, number | null>;
}

const ContractsContext = createContext<ContractsContextValue | undefined>(undefined);
const memoryByUser = new Map<string, ContractRecord[]>();
const SESSION_PREFIX = "stc-contracts-session-v1-";

function timestampMillis(value: ContractRecord["createdAt"]) {
  return value ? value.toMillis() : null;
}

function serializeContract(contract: ContractRecord): StoredContract {
  return {
    ...contract,
    createdAt: timestampMillis(contract.createdAt),
    updatedAt: timestampMillis(contract.updatedAt),
    stageDates: Object.fromEntries(
      STAGE_KEYS.map((key) => [key, contract.stageDates[key]?.toMillis() ?? null]),
    ) as Record<StageKey, number | null>,
  };
}

function hydrateContract(contract: StoredContract): ContractRecord {
  return {
    ...contract,
    createdAt: contract.createdAt == null ? null : Timestamp.fromMillis(contract.createdAt),
    updatedAt: contract.updatedAt == null ? null : Timestamp.fromMillis(contract.updatedAt),
    stageDates: Object.fromEntries(
      STAGE_KEYS.map((key) => [
        key,
        contract.stageDates[key] == null ? null : Timestamp.fromMillis(contract.stageDates[key]!),
      ]),
    ) as ContractRecord["stageDates"],
  };
}

function readSession(uid: string) {
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + uid);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredContract[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map(hydrateContract);
  } catch {
    return null;
  }
}

function writeSession(uid: string, contracts: ContractRecord[]) {
  try {
    window.sessionStorage.setItem(
      SESSION_PREFIX + uid,
      JSON.stringify(contracts.map(serializeContract)),
    );
  } catch {
    // Performance cache only. Firestore remains the source of truth.
  }
}

function retainSessionUser(uid: string) {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(SESSION_PREFIX) && key !== SESSION_PREFIX + uid) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage restrictions.
  }
}

export function clearContractSessionCache() {
  memoryByUser.clear();
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(SESSION_PREFIX)) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage restrictions.
  }
}

export function ContractsProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const uid = user?.uid;
    if (authLoading) return;

    if (!uid || !profile?.active) {
      if (!uid) clearContractSessionCache();
      setContracts([]);
      setLoading(false);
      setSyncing(false);
      setError(null);
      return;
    }

    retainSessionUser(uid);

    const remembered = memoryByUser.get(uid) ?? readSession(uid);
    if (remembered) {
      memoryByUser.set(uid, remembered);
      setContracts(remembered);
      setLoading(false);
      setSyncing(true);
    } else {
      setContracts([]);
      setLoading(true);
      setSyncing(true);
    }
    setError(null);

    return subscribeContracts(
      (next) => {
        memoryByUser.set(uid, next);
        writeSession(uid, next);
        setContracts(next);
        setLoading(false);
        setSyncing(false);
        setError(null);
      },
      (cause) => {
        setError(cause);
        setLoading(false);
        setSyncing(false);
      },
    );
  }, [authLoading, profile?.active, user?.uid]);

  const byId = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts],
  );

  const value = useMemo<ContractsContextValue>(
    () => ({
      contracts,
      loading,
      syncing,
      error,
      getContract: (id) => byId.get(id) ?? null,
    }),
    [byId, contracts, error, loading, syncing],
  );

  return <ContractsContext.Provider value={value}>{children}</ContractsContext.Provider>;
}

export function useContracts() {
  const context = useContext(ContractsContext);
  if (!context) throw new Error("useContracts must be used inside ContractsProvider");
  return context;
}
