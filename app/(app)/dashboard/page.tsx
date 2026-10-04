"use client";

import {
  CheckCircle2,
  CircleDot,
  FileClock,
  Files,
  Plus,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { subscribeContracts } from "@/lib/contracts";
import { getContractStatus, getProgress, STAGES, type ContractRecord } from "@/types/contract";

function formatDate(contract: ContractRecord) {
  if (!contract.createdAt) return "Just now";
  return contract.createdAt.toDate().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DashboardPage() {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(
    () =>
      subscribeContracts(
        (next) => {
          setContracts(next);
          setLoading(false);
        },
        () => {
          setError("Could not load contracts. Check your Firebase setup and access.");
          setLoading(false);
        },
      ),
    [],
  );

  const stats = useMemo(() => {
    const completed = contracts.filter((contract) => getContractStatus(contract.stages) === "Completed").length;
    const waitingClient = contracts.filter(
      (contract) => getContractStatus(contract.stages) === "Waiting for Client Stamp",
    ).length;

    return {
      total: contracts.length,
      active: contracts.length - completed,
      completed,
      waitingClient,
      completion: contracts.length ? Math.round((completed / contracts.length) * 100) : 0,
    };
  }, [contracts]);

  const pipeline = useMemo(
    () =>
      STAGES.map((stage) => {
        const count = contracts.filter((contract) => contract.stages[stage.key]).length;
        return {
          ...stage,
          count,
          percentage: contracts.length ? Math.round((count / contracts.length) * 100) : 0,
        };
      }),
    [contracts],
  );

  return (
    <div className="page-stack">
      <section className="dashboard-hero card">
        <div className="hero-copy">
          <p className="eyebrow">Contract lifecycle</p>
          <h2>Everything moving through one clear flow.</h2>
          <p>
            See what is signed, paid, supplied and settled without opening multiple sheets.
          </p>
          <div className="hero-actions">
            <Link href="/contracts/new" className="button button-primary">
              <Plus size={17} /> New Contract
            </Link>
            <Link href="/contracts" className="button button-secondary">
              View all contracts
            </Link>
          </div>
        </div>
        <div className="hero-score">
          <div
            className="hero-score-ring"
            style={{ "--progress": stats.completion + "%" } as React.CSSProperties}
          >
            <div>
              <strong>{stats.completion}%</strong>
              <span>completed</span>
            </div>
          </div>
          <p>{stats.completed} of {stats.total} contracts fully settled</p>
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="stats-grid">
        <article className="stat-card card">
          <div className="stat-icon"><Files size={20} /></div>
          <div><span>Total contracts</span><strong>{loading ? "—" : stats.total}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon blue"><CircleDot size={20} /></div>
          <div><span>In progress</span><strong>{loading ? "—" : stats.active}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon gold"><FileClock size={20} /></div>
          <div><span>Waiting client stamp</span><strong>{loading ? "—" : stats.waitingClient}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon green"><CheckCircle2 size={20} /></div>
          <div><span>Completed</span><strong>{loading ? "—" : stats.completed}</strong></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="pipeline-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h3>Stage completion</h3>
            </div>
            <TrendingUp size={19} />
          </div>

          <div className="pipeline-list">
            {pipeline.map((stage) => (
              <div className="pipeline-row" key={stage.key}>
                <div className="pipeline-label">
                  <strong>{stage.label}</strong>
                  <span>{stage.count} / {contracts.length}</span>
                </div>
                <div className="pipeline-track">
                  <div className="pipeline-fill" style={{ width: stage.percentage + "%" }} />
                </div>
                <b>{stage.percentage}%</b>
              </div>
            ))}
          </div>
        </article>

        <article className="recent-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Latest activity</p>
              <h3>Recent contracts</h3>
            </div>
            <Link href="/contracts">View all</Link>
          </div>

          {loading ? (
            <div className="list-loading">Loading contracts…</div>
          ) : contracts.length === 0 ? (
            <div className="empty-compact">
              <Files size={22} />
              <strong>No contracts yet</strong>
              <span>Add the first contract to start the flow.</span>
            </div>
          ) : (
            <div className="recent-list">
              {contracts.slice(0, 5).map((contract) => (
                <Link className="recent-row" href={"/contracts/" + contract.id} key={contract.id}>
                  <div className="recent-company">
                    <strong>{contract.companyName}</strong>
                    <span>{contract.product} · {contract.contractType}</span>
                  </div>
                  <div className="recent-meta">
                    <StatusBadge stages={contract.stages} />
                    <span>{getProgress(contract.stages)}% · {formatDate(contract)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
