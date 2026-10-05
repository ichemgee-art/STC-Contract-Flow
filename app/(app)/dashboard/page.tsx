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
import { useMemo } from "react";
import { useContracts } from "@/components/ContractsProvider";
import { ExportButtons } from "@/components/ExportButtons";
import { SmartLink } from "@/components/SmartLink";
import { StatusBadge } from "@/components/StatusBadge";
import { useLanguage } from "@/components/LanguageProvider";
import { getContractStatus, getProgress, STAGES, type ContractRecord } from "@/types/contract";

export default function DashboardPage() {
  const { t, stageLabel, statusLabel, locale, language } = useLanguage();
  const { contracts, loading, syncing, error } = useContracts();

  function formatDate(contract: ContractRecord) {
    if (!contract.createdAt) return t("justNow");
    return contract.createdAt.toDate().toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatStageDate(contract: ContractRecord, key: (typeof STAGES)[number]["key"]) {
    const value = contract.stageDates[key];
    return value
      ? value.toDate().toLocaleString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : language === "ar" ? "معلق" : "Pending";
  }


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

  const exportSheets = useMemo(() => [{
    name: language === "ar" ? "العقود" : "Contracts",
    subtitle: language === "ar" ? "تقرير شامل لحالة العقود" : "Complete contract status report",
    rows: contracts.map((contract) => {
      const row: Record<string, string | number> = {
        [language === "ar" ? "الشركة" : "Company"]: contract.companyName,
        [language === "ar" ? "المندوب" : "Representative"]: contract.salesRepresentative,
        [language === "ar" ? "نوع العقد" : "Contract Type"]: contract.contractType,
        [language === "ar" ? "المنتج" : "Product"]: contract.product,
      };

      STAGES.forEach((stage) => {
        const value = contract.stageDates[stage.key];
        row[stageLabel(stage.key)] = value
          ? value.toDate().toLocaleString(locale, {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : language === "ar" ? "معلق" : "Pending";
      });

      row[language === "ar" ? "الحالة الحالية" : "Current Status"] =
        statusLabel(getContractStatus(contract.stages));
      row[language === "ar" ? "نسبة الإنجاز" : "Progress"] = getProgress(contract.stages);
      row[language === "ar" ? "تاريخ الإنشاء" : "Created"] = contract.createdAt
        ? contract.createdAt.toDate().toLocaleDateString(locale, {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : t("justNow");
      return row;
    }),
  }], [contracts, language, locale, stageLabel, statusLabel, t]);

  const exportKpis = useMemo(() => [
    { label: t("totalContracts"), value: stats.total },
    { label: t("inProgress"), value: stats.active },
    { label: t("waitingClientStamp"), value: stats.waitingClient },
    { label: t("completed"), value: stats.completed },
    {
      label: language === "ar" ? "نسبة الإكمال" : "Completion",
      value: stats.completion + "%",
    },
  ], [language, stats, t]);

  return (
    <div className="page-stack">
      <div className="page-export-row">
        <ExportButtons
          filename={language === "ar" ? "STC-تقرير-العقود" : "STC-Contract-Report"}
          title={language === "ar" ? "تقرير متابعة العقود" : "Contract Flow Report"}
          subtitle={language === "ar" ? "ملخص تنفيذي شامل لحالة العقود" : "Executive overview of contract workflow"}
          sheets={exportSheets}
          kpis={exportKpis}
          disabled={loading}
        />
      </div>
      <section className="dashboard-hero card">
        <div className="hero-copy">
          <p className="eyebrow">{t("contractLifecycle")}</p>
          <h2>{t("dashboardHeadline")}</h2>
          <p>{t("dashboardDescription")}</p>
          <div className="hero-actions">
            <Link href="/contracts/new" className="button button-primary">
              <Plus size={17} /> {t("newContract")}
            </Link>
            <Link href="/contracts" className="button button-secondary">
              {t("viewAllContracts")}
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
              <span>{t("completed")}</span>
            </div>
          </div>
          <p>{stats.completed} / {stats.total} {t("contractsFullySettled")}</p>
        </div>
      </section>

      {error && <div className="notice notice-error">{t("loadContractsError")}</div>}
      {syncing && !loading ? <div className="sync-indicator">{language === "ar" ? "جاري مزامنة أحدث البيانات…" : "Syncing latest data…"}</div> : null}

      <section className="stats-grid">
        <article className="stat-card card">
          <div className="stat-icon"><Files size={20} /></div>
          <div><span>{t("totalContracts")}</span><strong>{loading ? "—" : stats.total}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon blue"><CircleDot size={20} /></div>
          <div><span>{t("inProgress")}</span><strong>{loading ? "—" : stats.active}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon gold"><FileClock size={20} /></div>
          <div><span>{t("waitingClientStamp")}</span><strong>{loading ? "—" : stats.waitingClient}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon green"><CheckCircle2 size={20} /></div>
          <div><span>{t("completed")}</span><strong>{loading ? "—" : stats.completed}</strong></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="pipeline-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("pipeline")}</p>
              <h3>{t("stageCompletion")}</h3>
            </div>
            <TrendingUp size={19} />
          </div>

          <div className="pipeline-list">
            {pipeline.map((stage) => (
              <div className="pipeline-row" key={stage.key}>
                <div className="pipeline-label">
                  <strong>{stageLabel(stage.key)}</strong>
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
              <p className="eyebrow">{t("latestActivity")}</p>
              <h3>{t("recentContracts")}</h3>
            </div>
            <Link href="/contracts">{t("viewAll")}</Link>
          </div>

          {loading ? (
            <div className="list-loading">{t("loadingContracts")}</div>
          ) : contracts.length === 0 ? (
            <div className="empty-compact">
              <Files size={22} />
              <strong>{t("noContractsYet")}</strong>
              <span>{t("addFirstContract")}</span>
            </div>
          ) : (
            <div className="recent-list">
              {contracts.slice(0, 5).map((contract) => (
                <SmartLink className="recent-row" href={"/contracts/" + contract.id} key={contract.id}>
                  <div className="recent-company">
                    <strong>{contract.companyName}</strong>
                    <span>{contract.product} · {contract.contractType}</span>
                  </div>
                  <div className="recent-meta">
                    <StatusBadge stages={contract.stages} />
                    <span>{getProgress(contract.stages)}% · {formatDate(contract)}</span>
                  </div>
                </SmartLink>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
