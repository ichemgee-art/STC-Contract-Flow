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
import { ContractAttachments } from "@/components/ContractAttachments";
import { ContractNotes } from "@/components/ContractNotes";
import { ContractReportButton } from "@/components/ContractReportButton";
import { useContracts } from "@/components/ContractsProvider";
import { ContractForm } from "@/components/ContractForm";
import { ExportButtons } from "@/components/ExportButtons";
import { useLanguage } from "@/components/LanguageProvider";
import { StageChecklist } from "@/components/StageChecklist";
import { StatusBadge } from "@/components/StatusBadge";
import { SuccessCelebration } from "@/components/SuccessCelebration";
import {
  deleteContract,
  getContract as fetchContract,
  updateContractBasics,
  updateContractStage,
} from "@/lib/contracts";
import { playUiSound, primeUiAudio } from "@/lib/sounds";
import {
  getContractStatus,
  getProgress,
  STAGES,
  STAGE_KEYS,
  type ContractInput,
  type ContractRecord,
  type StageKey,
} from "@/types/contract";

export default function ContractDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const { t, locale, language, stageLabel, statusLabel } = useLanguage();
  const {
    getContract: getCachedContract,
    loading: contractsLoading,
    error: contractsError,
    refreshContract,
    removeContractLocal,
  } = useContracts();
  const cachedContract = params.id ? getCachedContract(params.id) : null;
  const [fallbackContract, setFallbackContract] = useState<ContractRecord | null>(null);
  const [fallbackChecked, setFallbackChecked] = useState(false);
  const contract = cachedContract ?? fallbackContract;
  const loading = contractsLoading || (!cachedContract && !fallbackChecked);
  const [busyStage, setBusyStage] = useState<StageKey | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);

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

    if (cachedContract) {
      setFallbackContract(null);
      setFallbackChecked(true);
      return;
    }

    if (contractsLoading) return;

    let cancelled = false;
    setFallbackChecked(false);

    void fetchContract(params.id)
      .then((next) => {
        if (!cancelled) setFallbackContract(next);
      })
      .catch(() => {
        if (!cancelled) setError(t("loadContractError"));
      })
      .finally(() => {
        if (!cancelled) setFallbackChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [cachedContract, contractsLoading, params.id, t]);

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
    primeUiAudio();

    if (!checked) {
      const index = STAGE_KEYS.indexOf(stage);
      const laterCompleted = STAGE_KEYS.slice(index + 1).some((key) => contract.stages[key]);
      if (laterCompleted && !window.confirm(t("reopenConfirm"))) return;
    }

    setBusyStage(stage);
    setError("");
    try {
      await updateContractStage(contract, stage, checked);
      if (cachedContract) {
        await refreshContract(contract.id);
      } else {
        setFallbackContract(await fetchContract(contract.id));
      }
      if (checked && stage === "settlement") {
        playUiSound("completed");
        setShowCompletionCelebration(true);
      } else {
        playUiSound(checked ? "advance" : "reopen");
      }
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
      if (cachedContract) {
        await refreshContract(contract.id);
      } else {
        setFallbackContract(await fetchContract(contract.id));
      }
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
      removeContractLocal(contract.id);
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

  const progress = getProgress(contract.stages);
  const currentStatus = getContractStatus(contract.stages);

  const exportSheets = [
    {
      name: language === "ar" ? "بيانات العقد" : "Contract Details",
      rows: [{
        [language === "ar" ? "رقم العقد" : "Contract Number"]: contract.contractNumber || contract.id,
        [language === "ar" ? "المعرف الداخلي" : "Internal ID"]: contract.id,
        [language === "ar" ? "الشركة" : "Company"]: contract.companyName,
        [language === "ar" ? "المندوب" : "Representative"]: contract.salesRepresentative,
        [language === "ar" ? "نوع العقد" : "Contract Type"]: contract.contractType,
        [language === "ar" ? "المنتج" : "Product"]: contract.product,
        [language === "ar" ? "الحالة الحالية" : "Current Status"]: statusLabel(currentStatus),
        [language === "ar" ? "نسبة الإنجاز" : "Progress"]: progress,
        [language === "ar" ? "أنشأه" : "Created By"]: contract.createdByName || t("stcUser"),
        [language === "ar" ? "تاريخ الإنشاء" : "Created At"]: formatDate(contract.createdAt),
        [language === "ar" ? "آخر تحديث" : "Last Updated"]: formatDate(contract.updatedAt),
      }],
    },
    {
      name: language === "ar" ? "مراحل العقد" : "Contract Stages",
      rows: STAGES.map((stage, index) => ({
        [language === "ar" ? "الترتيب" : "Order"]: index + 1,
        [language === "ar" ? "المرحلة" : "Stage"]: stageLabel(stage.key),
        [language === "ar" ? "الحالة" : "Status"]:
          contract.stages[stage.key]
            ? (language === "ar" ? "تم" : "Done")
            : (language === "ar" ? "معلق" : "Pending"),
        [language === "ar" ? "التاريخ" : "Date"]:
          contract.stageDates[stage.key]
            ? formatDate(contract.stageDates[stage.key])
            : (language === "ar" ? "معلق" : "Pending"),
      })),
    },
  ];

  const exportKpis = [
    { label: language === "ar" ? "الحالة" : "Status", value: statusLabel(currentStatus) },
    { label: language === "ar" ? "نسبة الإنجاز" : "Progress", value: progress + "%" },
    {
      label: language === "ar" ? "المراحل المكتملة" : "Completed Stages",
      value: STAGE_KEYS.filter((key) => contract.stages[key]).length + " / " + STAGE_KEYS.length,
    },
  ];

  if (editing && basicValue) {
    return (
      <div className="page-stack form-page">
        <section className="page-intro">
          <div>
            <p className="eyebrow">{t("editContract")}</p>
            <h2>{contract.companyName}</h2>
            <p>{t("editContractDescription")}</p>
          </div>
          <ExportButtons
            filename={`STC-${contract.companyName}-Contract`}
            title={language === "ar" ? `تقرير عقد - ${contract.companyName}` : `Contract Report - ${contract.companyName}`}
            subtitle={language === "ar" ? "تقرير تفصيلي لمسار العقد" : "Detailed contract workflow report"}
            sheets={exportSheets}
            kpis={exportKpis}
            compact
            showPdf={false}
          />
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

  return (
    <>
      <SuccessCelebration
        open={showCompletionCelebration}
        celebrate
        title={language === "ar" ? "تم اكتمال العقد" : "Contract Completed"}
        subtitle={
          language === "ar"
            ? "تم إنهاء جميع مراحل العقد بنجاح"
            : "All contract stages were completed successfully"
        }
        onComplete={() => setShowCompletionCelebration(false)}
      />
      <div className="page-stack">
      <section className="contract-detail-hero card">
        <div>
          <div className="detail-title-line">
            <p className="eyebrow" data-testid="contract-number">
              {contract.contractNumber || t("contractRecord")}
            </p>
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
            <button data-testid="contract-delete" className="button button-danger" onClick={remove}>
              <Trash2 size={16} /> {t("delete")}
            </button>
          )}
        </div>
      </section>

      <div className="page-export-row contract-export-actions">
        <ContractReportButton contract={contract} />
        <ExportButtons
          filename={`STC-${contract.contractNumber || contract.companyName}-Contract`}
          title={language === "ar" ? `تقرير عقد - ${contract.companyName}` : `Contract Report - ${contract.companyName}`}
          subtitle={language === "ar" ? "بيانات العقد بصيغة Excel" : "Contract data in Excel format"}
          sheets={exportSheets}
          kpis={exportKpis}
          compact
          showPdf={false}
        />
      </div>

      {contractsError && <div className="notice notice-error">{t("loadContractError")}</div>}
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

      <ContractAttachments contractId={contract.id} />

      <ContractNotes contractId={contract.id} />

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
            <div>
              <dt>{language === "ar" ? "رقم العقد" : "Contract Number"}</dt>
              <dd dir="ltr">{contract.contractNumber || "—"}</dd>
            </div>
            <div><dt>{language === "ar" ? "المعرف الداخلي" : "Internal ID"}</dt><dd dir="ltr">{contract.id}</dd></div>
            <div><dt>{t("createdBy")}</dt><dd>{contract.createdByName || t("stcUser")}</dd></div>
            <div><dt>{t("createdAt")}</dt><dd>{formatDate(contract.createdAt)}</dd></div>
            <div><dt>{t("lastUpdated")}</dt><dd>{formatDate(contract.updatedAt)}</dd></div>
          </dl>

          <div className="record-note">{t("stageDatesNote")}</div>
        </aside>
      </section>
      </div>
    </>
  );
}
