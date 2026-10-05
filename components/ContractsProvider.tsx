"use client";

import {
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  CONTRACT_REALTIME_WINDOW,
  getContract as fetchContract,
  getContractCount,
  loadOlderContracts,
  subscribeContracts,
} from "@/lib/contracts";
import { STAGE_KEYS, type ContractRecord, type StageKey } from "@/types/contract";

interface ContractsContextValue {
  contracts: ContractRecord[];
  totalCount: number;
  loading: boolean;
  syncing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  getContract: (id: string) => ContractRecord | null;
  loadMore: () => Promise<ContractRecord[]>;
  ensureAllLoaded: () => Promise<ContractRecord[]>;
  refreshContract: (id: string) => Promise<void>;
  removeContractLocal: (id: string) => void;
  refreshCount: () => Promise<number>;
}

interface StoredContract extends Omit<ContractRecord, "createdAt" | "updatedAt" | "stageDates"> {
  createdAt: number | null;
  updatedAt: number | null;
  stageDates: Record<StageKey, number | null>;
}

const ContractsContext = createContext<ContractsContextValue | undefined>(undefined);
const memoryByUser = new Map<string, ContractRecord[]>();
const SESSION_PREFIX = "stc-contracts-session-v2-";

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
    // Keep disk-backed session data bounded even when the database grows large.
    const bounded = contracts.slice(0, CONTRACT_REALTIME_WINDOW);
    window.sessionStorage.setItem(
      SESSION_PREFIX + uid,
      JSON.stringify(bounded.map(serializeContract)),
    );
  } catch {
    // Performance cache only. Firestore remains the source of truth.
  }
}

function retainSessionUser(uid: string) {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("stc-contracts-session-") && key !== SESSION_PREFIX + uid) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage restrictions.
  }
}

function mergeUnique(primary: ContractRecord[], secondary: ContractRecord[]) {
  const byId = new Map<string, ContractRecord>();
  for (const contract of secondary) byId.set(contract.id, contract);
  for (const contract of primary) byId.set(contract.id, contract);
  return [...byId.values()].sort(
    (a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
  );
}

export function clearContractSessionCache() {
  memoryByUser.clear();
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith("stc-contracts-session-")) window.sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore storage restrictions.
  }
}

export function ContractsProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [recentContracts, setRecentContracts] = useState<ContractRecord[]>([]);
  const [olderContracts, setOlderContracts] = useState<ContractRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const recentRef = useRef<ContractRecord[]>([]);
  const olderRef = useRef<ContractRecord[]>([]);
  const tailCursorRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const totalCountRef = useRef(0);
  const uidRef = useRef("");

  const contracts = useMemo(
    () => mergeUnique(recentContracts, olderContracts),
    [olderContracts, recentContracts],
  );

  const publishHasMore = useCallback((next: boolean) => {
    hasMoreRef.current = next;
    setHasMore(next);
  }, []);

  const refreshCount = useCallback(async () => {
    if (!uidRef.current) return totalCountRef.current;
    try {
      const count = await getContractCount();
      totalCountRef.current = count;
      setTotalCount(count);
      const loaded = mergeUnique(recentRef.current, olderRef.current).length;
      if (loaded >= count) publishHasMore(false);
      return count;
    } catch {
      return totalCountRef.current;
    }
  }, [publishHasMore]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMoreRef.current || !tailCursorRef.current) {
      return mergeUnique(recentRef.current, olderRef.current);
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const page = await loadOlderContracts(tailCursorRef.current);
      const recentIds = new Set(recentRef.current.map((contract) => contract.id));
      const nextOlder = mergeUnique(
        page.contracts.filter((contract) => !recentIds.has(contract.id)),
        olderRef.current,
      );

      olderRef.current = nextOlder;
      setOlderContracts(nextOlder);
      tailCursorRef.current = page.cursor;

      const loadedCount = mergeUnique(recentRef.current, nextOlder).length;
      const countAllowsMore =
        totalCountRef.current === 0 || loadedCount < totalCountRef.current;
      publishHasMore(Boolean(page.cursor) && page.hasMore && countAllowsMore);

      return mergeUnique(recentRef.current, nextOlder);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [publishHasMore]);

  const ensureAllLoaded = useCallback(async () => {
    let all = mergeUnique(recentRef.current, olderRef.current);
    while (hasMoreRef.current && tailCursorRef.current) {
      const before = all.length;
      all = await loadMore();
      if (all.length <= before) break;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    return all;
  }, [loadMore]);

  const refreshContract = useCallback(async (id: string) => {
    const next = await fetchContract(id);
    if (!next) return;

    if (recentRef.current.some((contract) => contract.id === id)) {
      const updated = recentRef.current.map((contract) => contract.id === id ? next : contract);
      recentRef.current = updated;
      setRecentContracts(updated);
      return;
    }

    if (olderRef.current.some((contract) => contract.id === id)) {
      const updated = olderRef.current.map((contract) => contract.id === id ? next : contract);
      olderRef.current = updated;
      setOlderContracts(updated);
    }
  }, []);

  const removeContractLocal = useCallback((id: string) => {
    const recent = recentRef.current.filter((contract) => contract.id !== id);
    const older = olderRef.current.filter((contract) => contract.id !== id);
    recentRef.current = recent;
    olderRef.current = older;
    setRecentContracts(recent);
    setOlderContracts(older);
    totalCountRef.current = Math.max(0, totalCountRef.current - 1);
    setTotalCount(totalCountRef.current);
  }, []);

  useEffect(() => {
    const uid = user?.uid;
    if (authLoading) return;

    if (!uid || !profile?.active) {
      uidRef.current = "";
      if (!uid) clearContractSessionCache();
      recentRef.current = [];
      olderRef.current = [];
      tailCursorRef.current = null;
      totalCountRef.current = 0;
      setRecentContracts([]);
      setOlderContracts([]);
      setTotalCount(0);
      setLoading(false);
      setSyncing(false);
      publishHasMore(false);
      setError(null);
      return;
    }

    uidRef.current = uid;
    retainSessionUser(uid);

    const remembered = memoryByUser.get(uid) ?? readSession(uid);
    if (remembered?.length) {
      const bounded = remembered.slice(0, CONTRACT_REALTIME_WINDOW);
      recentRef.current = bounded;
      setRecentContracts(bounded);
      setLoading(false);
      setSyncing(true);
    } else {
      recentRef.current = [];
      setRecentContracts([]);
      setLoading(true);
      setSyncing(true);
    }

    olderRef.current = [];
    setOlderContracts([]);
    setError(null);
    void refreshCount();

    return subscribeContracts(
      (page) => {
        recentRef.current = page.contracts;
        setRecentContracts(page.contracts);
        memoryByUser.set(uid, page.contracts);
        writeSession(uid, page.contracts);

        // Keep already loaded historical pages across realtime emissions.
        // createdAt is immutable, so newly-created/deleted recent contracts can
        // safely overlap with older pages; mergeUnique removes duplicates.
        // Resetting the history here made large registers jump back to page 1.
        if (olderRef.current.length === 0) {
          tailCursorRef.current = page.cursor;
        }

        const loaded = mergeUnique(page.contracts, olderRef.current).length;
        const countAllowsMore =
          totalCountRef.current === 0 || loaded < totalCountRef.current;
        publishHasMore(page.hasMore && countAllowsMore);

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
  }, [authLoading, profile?.active, publishHasMore, refreshCount, user?.uid]);

  const byId = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts],
  );

  const value = useMemo<ContractsContextValue>(
    () => ({
      contracts,
      totalCount,
      loading,
      syncing,
      loadingMore,
      hasMore,
      error,
      getContract: (id) => byId.get(id) ?? null,
      loadMore,
      ensureAllLoaded,
      refreshContract,
      removeContractLocal,
      refreshCount,
    }),
    [
      byId,
      contracts,
      ensureAllLoaded,
      error,
      hasMore,
      loadMore,
      loading,
      loadingMore,
      refreshContract,
      refreshCount,
      removeContractLocal,
      syncing,
      totalCount,
    ],
  );

  return <ContractsContext.Provider value={value}>{children}</ContractsContext.Provider>;
}

export function useContracts() {
  const context = useContext(ContractsContext);
  if (!context) throw new Error("useContracts must be used inside ContractsProvider");
  return context;
}
