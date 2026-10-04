"use client";

import {
  CalendarDays,
  Edit3,
  FileText,
  PackageCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { ContractForm } from "@/components/ContractForm";
import { StageChecklist } from "@/components/StageChecklist";
import { StatusBadge } from "@/components/StatusBadge";
import {
  deleteContract,
  subscribeContract,
  updateContractBasics,
  updateContractStage,
} from "@/lib/contracts";
import {
  getProgress,
  STAGE_KEYS,
  type ContractInput,
  type ContractRecord,
  type StageKey,
} from "@/types/contract";

function formatDate(value: ContractRecord["createdAt"]) {
  return value
    ? value.toDate().toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Just now";
}

export default function ContractDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStage, setBusyStage] = useState<StageKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id) return;
    return subscribeContract(
      params.id,
      (next) => {
        setContract(next);
        setLoading(false);
      },
      () => {
        setError("Could not load this contract.");
        setLoading(false);
      },
    );
  }, [params.id]);

  const basicValue = useMemo<ContractInput | undefined>(
    () =>
      contract
        ? {
            salesRepresentative: contract.salesRepresentative,
            companyName: contract.companyName,
            contractType: contract.contractType,
            product: contract.product,
          }
        : undefined,
    [contract],
  );

  async function toggleStage(stage: StageKey, checked: boolean) {
    if (!contract) return;

    if (!checked) {
      const index = STAGE_KEYS.indexOf(stage);
      const laterCompleted = STAGE_KEYS.slice(index + 1).some((key) => contract.stages[key]);
      if (
        laterCompleted &&
        !window.confirm("This will reopen the selected stage and clear every stage after it. Continue?")
      ) {
        return;
      }
    }

    setBusyStage(stage);
    setError("");
    try {
      await updateContractStage(contract, stage, checked);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update this stage.");
    } finally {
      setBusyStage(null);
    }
  }

  async function saveBasics(input: ContractInput) {
    if (!contract) return;
    setSaving(true);
    setError("");
    try {
      await updateContractBasics(contract.id, input);
      setEditing(false);
    } catch {
      setError("Could not save the changes.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!contract || profile?.role !== "admin") return;
    if (!window.confirm("Delete the contract for " + contract.companyName + "? This cannot be undone.")) return;

    try {
      await deleteContract(contract.id);
      router.replace("/contracts");
    } catch {
      setError("Could not delete this contract.");
    }
  }

  if (loading) return <div className="detail-state card">Loading contract…</div>;

  if (!contract) {
    return (
      <div className="detail-state card">
        <FileText size={28} />
        <strong>Contract not found</strong>
        <span>It may have been deleted or you may not have access.</span>
      </div>
    );
  }

  if (editing && basicValue) {
    return (
      <div className="page-stack form-page">
        <section className="page-intro">
          <div>
            <p className="eyebrow">Edit contract</p>
            <h2>{contract.companyName}</h2>
            <p>Update the basic information without changing the workflow history.</p>
          </div>
        </section>
        <ContractForm
          initialValue={basicValue}
          onSubmit={saveBasics}
          busy={saving}
          error={error}
          submitLabel="Save Changes"
          cancelHref={"/contracts/" + contract.id}
        />
        <button className="edit-return-button" onClick={() => setEditing(false)}>Back to contract</button>
      </div>
    );
  }

  const progress = getProgress(contract.stages);

  return (
    <div className="page-stack">
      <section className="contract-detail-hero card">
        <div>
          <div className="detail-title-line">
            <p className="eyebrow">Contract record</p>
            <StatusBadge stages={contract.stages} />
          </div>
          <h2>{contract.companyName}</h2>
          <p>{contract.contractType} · {contract.product}</p>
        </div>

        <div className="detail-actions">
          <button className="button button-secondary" onClick={() => setEditing(true)}>
            <Edit3 size={16} /> Edit
          </button>
          {profile?.role === "admin" && (
            <button className="button button-danger" onClick={remove}>
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="detail-metrics">
        <article className="detail-metric card">
          <UserRound size={18} />
          <span>Representative</span>
          <strong>{contract.salesRepresentative}</strong>
        </article>
        <article className="detail-metric card">
          <PackageCheck size={18} />
          <span>Product / Item</span>
          <strong>{contract.product}</strong>
        </article>
        <article className="detail-metric card">
          <CalendarDays size={18} />
          <span>Created</span>
          <strong>{formatDate(contract.createdAt)}</strong>
        </article>
        <article className="detail-metric progress-metric card">
          <div className="progress-number">{progress}%</div>
          <span>Workflow progress</span>
          <div className="detail-progress-track">
            <div style={{ width: progress + "%" }} />
          </div>
        </article>
      </section>

      <section className="detail-grid">
        <article className="workflow-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Workflow</p>
              <h3>Contract stages</h3>
            </div>
            <span>Complete in order</span>
          </div>
          <StageChecklist contract={contract} busyStage={busyStage} onToggle={toggleStage} />
        </article>

        <aside className="record-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Record info</p>
              <h3>Audit details</h3>
            </div>
          </div>

          <dl className="record-list">
            <div><dt>Contract ID</dt><dd>{contract.id}</dd></div>
            <div><dt>Created by</dt><dd>{contract.createdByName || "STC User"}</dd></div>
            <div><dt>Created at</dt><dd>{formatDate(contract.createdAt)}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(contract.updatedAt)}</dd></div>
          </dl>

          <div className="record-note">
            Stage dates are captured automatically when a checkbox is completed.
          </div>
        </aside>
      </section>
    </div>
  );
}
