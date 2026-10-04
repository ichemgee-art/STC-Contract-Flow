"use client";

import { ArrowUpRight, Check, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { subscribeContracts, updateContractStage } from "@/lib/contracts";
import {
  canCompleteStage,
  getContractStatus,
  getProgress,
  STAGES,
  STAGE_KEYS,
  type ContractRecord,
  type StageKey,
} from "@/types/contract";

const statuses = [
  "All statuses",
  "Waiting for STC Stamp",
  "Waiting for Client Stamp",
  "Waiting for Down Payment",
  "Waiting for Supply",
  "Waiting for Settlement",
  "Completed",
] as const;

function dateText(contract: ContractRecord) {
  return contract.createdAt
    ? contract.createdAt.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "Just now";
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("All statuses");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(
    () =>
      subscribeContracts(
        (next) => {
          setContracts(next);
          setLoading(false);
        },
        () => {
          setError("Could not load contracts.");
          setLoading(false);
        },
      ),
    [],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return contracts.filter((contract) => {
      const matchesText =
        !needle ||
        [
          contract.salesRepresentative,
          contract.companyName,
          contract.contractType,
          contract.product,
        ].some((value) => value.toLowerCase().includes(needle));

      const currentStatus = getContractStatus(contract.stages);
      const matchesStatus = status === "All statuses" || currentStatus === status;
      return matchesText && matchesStatus;
    });
  }, [contracts, search, status]);

  async function toggle(contract: ContractRecord, key: StageKey) {
    const checked = !contract.stages[key];

    if (!checked) {
      const index = STAGE_KEYS.indexOf(key);
      const hasLaterProgress = STAGE_KEYS.slice(index + 1).some((later) => contract.stages[later]);
      if (hasLaterProgress && !window.confirm("Reopening this stage will also clear every stage after it. Continue?")) {
        return;
      }
    }

    setBusy(contract.id + ":" + key);
    setError("");
    try {
      await updateContractStage(contract, key, checked);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update this stage.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Contract register</p>
          <h2>Track every agreement from stamp to settlement.</h2>
          <p>{contracts.length} total contracts · {filtered.length} shown</p>
        </div>
      </section>

      <section className="contract-toolbar card">
        <label className="search-box">
          <Search size={17} />
          <input
            type="search"
            placeholder="Search company, representative, type or product…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="filter-select"
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof statuses)[number])}
        >
          {statuses.map((item) => <option key={item}>{item}</option>)}
        </select>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="contracts-table-card card">
        {loading ? (
          <div className="table-state">Loading contracts…</div>
        ) : filtered.length === 0 ? (
          <div className="table-state empty-state">
            <FileText size={28} />
            <strong>No matching contracts</strong>
            <span>Try another search or add a new contract.</span>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="contracts-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Representative</th>
                    <th>Contract</th>
                    {STAGES.map((stage) => <th className="stage-column" key={stage.key}>{stage.shortLabel}</th>)}
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contract) => (
                    <tr key={contract.id}>
                      <td>
                        <Link className="table-company" href={"/contracts/" + contract.id}>
                          <strong>{contract.companyName}</strong>
                          <span>{contract.product} · {dateText(contract)}</span>
                        </Link>
                      </td>
                      <td><span className="cell-main">{contract.salesRepresentative}</span></td>
                      <td>
                        <span className="cell-main">{contract.contractType}</span>
                        <span className="cell-sub">{getProgress(contract.stages)}% complete</span>
                      </td>
                      {STAGES.map((stage) => {
                        const checked = contract.stages[stage.key];
                        const enabled = checked || canCompleteStage(contract.stages, stage.key);
                        const isBusy = busy === contract.id + ":" + stage.key;
                        return (
                          <td className="stage-column" key={stage.key}>
                            <button
                              className={checked ? "mini-check checked" : "mini-check"}
                              disabled={!enabled || Boolean(busy)}
                              onClick={() => toggle(contract, stage.key)}
                              title={stage.label}
                              aria-label={stage.label + ": " + (checked ? "completed" : "pending")}
                            >
                              {isBusy ? "…" : checked ? <Check size={14} /> : null}
                            </button>
                          </td>
                        );
                      })}
                      <td><StatusBadge stages={contract.stages} /></td>
                      <td>
                        <Link
                          className="row-open"
                          href={"/contracts/" + contract.id}
                          aria-label={"Open " + contract.companyName}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="contracts-mobile-list">
              {filtered.map((contract) => (
                <article className="contract-mobile-card" key={contract.id}>
                  <div className="mobile-card-head">
                    <div>
                      <strong>{contract.companyName}</strong>
                      <span>{contract.product} · {contract.contractType}</span>
                    </div>
                    <Link className="row-open" href={"/contracts/" + contract.id}>
                      <ArrowUpRight size={17} />
                    </Link>
                  </div>

                  <div className="mobile-contract-meta">
                    <span>{contract.salesRepresentative}</span>
                    <span>{dateText(contract)}</span>
                  </div>

                  <div className="mobile-stage-strip">
                    {STAGES.map((stage) => {
                      const checked = contract.stages[stage.key];
                      const enabled = checked || canCompleteStage(contract.stages, stage.key);
                      return (
                        <button
                          key={stage.key}
                          className={checked ? "mobile-stage checked" : "mobile-stage"}
                          disabled={!enabled || Boolean(busy)}
                          onClick={() => toggle(contract, stage.key)}
                        >
                          <span>{checked ? <Check size={13} /> : STAGE_KEYS.indexOf(stage.key) + 1}</span>
                          <small>{stage.shortLabel}</small>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mobile-card-foot">
                    <StatusBadge stages={contract.stages} />
                    <span>{getProgress(contract.stages)}%</span>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
