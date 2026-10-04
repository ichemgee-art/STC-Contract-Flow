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
import { useLanguage } from "@/components/LanguageProvider";
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

export default function ContractDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t, locale } = useLanguage();
  const [contract, setContract] = useState<ContractRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyStage, setBusyStage] = useState<StageKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function formatDate(value: ContractRecord["createdAt"]) {
    return value
      ? value.toDate().toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : t("justNow");
  }

  useEffect(() => {
    if (!params.id) return;
    return subscribeContract(
      params.id,
      (next) => {
        setContract(next);
        setLoading(false);
      },
      () => {
        setError(t("loadContractError"));
        setLoading(false);
      },
    );
  }, [params.id, t]);

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
      if (laterCompleted && !window.confirm(t("reopenConfirm"))) return;
    }

    setBusyStage(stage);
    setError("");
    try {
      await updateContractStage(contract, stage, checked);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("updateStageError"));
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
      setError(t("saveChangesError"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!contract || profile?.role !== "admin") return;
    const message = t("deleteConfirmPrefix") + " " + contract.companyName + t("deleteConfirmSuffix");
    if (!window.confirm(message)) return;

    try {
      await deleteContract(contract.id);
      router.replace("/contracts");
    } catch {
      setError(t("deleteContractError"));
    }
  }

  if (loading) return <div className="detail-state card">{t("loadingContract")}</div>;

  if (!contract) {
    return (
      <div className="detail-state card">
        <FileText size={28} />
        <strong>{t("contractNotFound")}</strong>
        <span>{t("contractNotFoundHelp")}</span>
      </div>
    );
  }

  if (editing && basicValue) {
    return (
      <div className="page-stack form-page">
        <section className="page-intro">
          <div>
            <p className="eyebrow">{t("editContract")}</p>
            <h2>{contract.companyName}</h2>
            <p>{t("editContractDescription")}</p>
          </div>
        </section>
        <ContractForm
          initialValue={basicValue}
          onSubmit={saveBasics}
          busy={saving}
          error={error}
          submitLabel={t("saveChanges")}
          cancelHref={"/contracts/" + contract.id}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const progress = getProgress(contract.stages);

  return (
    <div className="page-stack">
      <section className="contract-detail-hero card">
        <div>
          <div className="detail-title-line">
            <p className="eyebrow">{t("contractRecord")}</p>
            <StatusBadge stages={contract.stages} />
          </div>
          <h2>{contract.companyName}</h2>
          <p>{contract.contractType} · {contract.product}</p>
        </div>

        <div className="detail-actions">
          <button className="button button-secondary" onClick={() => setEditing(true)}>
            <Edit3 size={16} /> {t("edit")}
          </button>
          {profile?.role === "admin" && (
            <button className="button button-danger" onClick={remove}>
              <Trash2 size={16} /> {t("delete")}
            </button>
          )}
        </div>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="detail-metrics">
        <article className="detail-metric card">
          <UserRound size={18} />
          <span>{t("representative")}</span>
          <strong>{contract.salesRepresentative}</strong>
        </article>
        <article className="detail-metric card">
          <PackageCheck size={18} />
          <span>{t("productItem")}</span>
          <strong>{contract.product}</strong>
        </article>
        <article className="detail-metric card">
          <CalendarDays size={18} />
          <span>{t("created")}</span>
          <strong>{formatDate(contract.createdAt)}</strong>
        </article>
        <article className="detail-metric progress-metric card">
          <div className="progress-number">{progress}%</div>
          <span>{t("workflowProgress")}</span>
          <div className="detail-progress-track">
            <div style={{ width: progress + "%" }} />
          </div>
        </article>
      </section>

      <section className="detail-grid">
        <article className="workflow-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("workflow")}</p>
              <h3>{t("contractStages")}</h3>
            </div>
            <span>{t("completeInOrder")}</span>
          </div>
          <StageChecklist contract={contract} busyStage={busyStage} onToggle={toggleStage} />
        </article>

        <aside className="record-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("recordInfo")}</p>
              <h3>{t("auditDetails")}</h3>
            </div>
          </div>

          <dl className="record-list">
            <div><dt>{t("contractId")}</dt><dd dir="ltr">{contract.id}</dd></div>
            <div><dt>{t("createdBy")}</dt><dd>{contract.createdByName || t("stcUser")}</dd></div>
            <div><dt>{t("createdAt")}</dt><dd>{formatDate(contract.createdAt)}</dd></div>
            <div><dt>{t("lastUpdated")}</dt><dd>{formatDate(contract.updatedAt)}</dd></div>
          </dl>

          <div className="record-note">{t("stageDatesNote")}</div>
        </aside>
      </section>
    </div>
  );
}
