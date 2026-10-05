"use client";

import {
  AlertTriangle,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileClock,
  Files,
  Plus,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useContracts } from "@/components/ContractsProvider";
import { ExportButtons } from "@/components/ExportButtons";
import { SmartLink } from "@/components/SmartLink";
import { StatusBadge } from "@/components/StatusBadge";
import { useLanguage } from "@/components/LanguageProvider";
import {
  getContractStatus,
  getProgress,
  STAGES,
  type ContractRecord,
  type ContractStatus,
} from "@/types/contract";

type DashboardPeriod = "all" | "month" | "quarter" | "year";

function startOfPeriod(period: DashboardPeriod, now: Date) {
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), quarterStartMonth, 1);
  }
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

function activityDate(contract: ContractRecord) {
  return contract.updatedAt ?? contract.createdAt;
}

function daysSince(value: ContractRecord["updatedAt"], nowMs: number) {
  if (!value) return 0;
  return Math.max(0, Math.floor((nowMs - value.toMillis()) / 86_400_000));
}

export default function DashboardPage() {
  const { t, stageLabel, statusLabel, locale, language } = useLanguage();
  const { contracts, loading, syncing, error } = useContracts();
  const [period, setPeriod] = useState<DashboardPeriod>("all");

  function formatDate(contract: ContractRecord) {
    if (!contract.createdAt) return t("justNow");
    return contract.createdAt.toDate().toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const periodLabel = useMemo(() => {
    if (language === "ar") {
      if (period === "month") return "الشهر الحالي";
      if (period === "quarter") return "الربع الحالي";
      if (period === "year") return "السنة الحالية";
      return "كل الفترات";
    }
    if (period === "month") return "This month";
    if (period === "quarter") return "Current quarter";
    if (period === "year") return "This year";
    return "All time";
  }, [language, period]);

  const scopedContracts = useMemo(() => {
    const start = startOfPeriod(period, new Date());
    if (!start) return contracts;
    const startMs = start.getTime();
    return contracts.filter((contract) => {
      const created = contract.createdAt?.toMillis();
      return created != null && created >= startMs;
    });
  }, [contracts, period]);

  const stats = useMemo(() => {
    let completed = 0;
    let waitingClient = 0;

    for (const contract of scopedContracts) {
      const status = getContractStatus(contract.stages);
      if (status === "Completed") completed += 1;
      if (status === "Waiting for Client Stamp") waitingClient += 1;
    }

    return {
      total: scopedContracts.length,
      active: scopedContracts.length - completed,
      completed,
      waitingClient,
      completion: scopedContracts.length
        ? Math.round((completed / scopedContracts.length) * 100)
        : 0,
    };
  }, [scopedContracts]);

  const attention = useMemo(() => {
    const nowMs = Date.now();
    return scopedContracts
      .filter((contract) => getContractStatus(contract.stages) !== "Completed")
      .map((contract) => ({
        contract,
        idleDays: daysSince(activityDate(contract), nowMs),
      }))
      .filter((item) => item.idleDays >= 7)
      .sort((a, b) => b.idleDays - a.idleDays);
  }, [scopedContracts]);

  const criticalAttention = useMemo(
    () => attention.filter((item) => item.idleDays >= 14),
    [attention],
  );

  const pipeline = useMemo(
    () =>
      STAGES.map((stage) => {
        const count = scopedContracts.filter((contract) => contract.stages[stage.key]).length;
        return {
          ...stage,
          count,
          percentage: scopedContracts.length
            ? Math.round((count / scopedContracts.length) * 100)
            : 0,
        };
      }),
    [scopedContracts],
  );

  const bottlenecks = useMemo(() => {
    const statuses: ContractStatus[] = [
      "Waiting for STC Stamp",
      "Waiting for Client Stamp",
      "Waiting for Down Payment",
      "Waiting for Supply",
      "Waiting for Stocking Payment",
    ];

    const rows = statuses.map((status) => ({
      status,
      count: scopedContracts.filter(
        (contract) => getContractStatus(contract.stages) === status,
      ).length,
    }));

    const max = Math.max(1, ...rows.map((row) => row.count));
    return rows.map((row) => ({
      ...row,
      percentage: Math.round((row.count / max) * 100),
    }));
  }, [scopedContracts]);

  const representativePerformance = useMemo(() => {
    const reps = new Map<string, { total: number; completed: number; progress: number }>();

    for (const contract of scopedContracts) {
      const name = contract.salesRepresentative.trim() || (language === "ar" ? "غير محدد" : "Unassigned");
      const current = reps.get(name) ?? { total: 0, completed: 0, progress: 0 };
      current.total += 1;
      current.progress += getProgress(contract.stages);
      if (getContractStatus(contract.stages) === "Completed") current.completed += 1;
      reps.set(name, current);
    }

    return [...reps.entries()]
      .map(([name, value]) => ({
        name,
        total: value.total,
        completed: value.completed,
        averageProgress: Math.round(value.progress / Math.max(1, value.total)),
        completionRate: Math.round((value.completed / Math.max(1, value.total)) * 100),
      }))
      .sort(
        (a, b) =>
          b.completionRate - a.completionRate
          || b.averageProgress - a.averageProgress
          || b.total - a.total,
      )
      .slice(0, 6);
  }, [language, scopedContracts]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, offset) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - offset), 1);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        label: date.toLocaleDateString(locale, { month: "short" }),
        created: 0,
        completed: 0,
      };
    });

    for (const contract of contracts) {
      const created = contract.createdAt?.toDate();
      const completed = contract.stageDates.settlement?.toDate();

      if (created) {
        const bucket = months.find(
          (item) => item.year === created.getFullYear() && item.month === created.getMonth(),
        );
        if (bucket) bucket.created += 1;
      }

      if (completed) {
        const bucket = months.find(
          (item) => item.year === completed.getFullYear() && item.month === completed.getMonth(),
        );
        if (bucket) bucket.completed += 1;
      }
    }

    const max = Math.max(
      1,
      ...months.flatMap((item) => [item.created, item.completed]),
    );

    return months.map((item) => ({
      ...item,
      createdHeight: Math.max(item.created ? 8 : 2, Math.round((item.created / max) * 100)),
      completedHeight: Math.max(item.completed ? 8 : 2, Math.round((item.completed / max) * 100)),
    }));
  }, [contracts, locale]);

  const exportSheets = useMemo(() => [{
    name: language === "ar" ? "العقود" : "Contracts",
    subtitle:
      language === "ar"
        ? `تقرير حالة العقود · ${periodLabel}`
        : `Contract status report · ${periodLabel}`,
    rows: scopedContracts.map((contract) => {
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
  }], [language, locale, periodLabel, scopedContracts, stageLabel, statusLabel, t]);

  const exportKpis = useMemo(() => [
    { label: t("totalContracts"), value: stats.total },
    { label: t("inProgress"), value: stats.active },
    { label: t("completed"), value: stats.completed },
    {
      label: language === "ar" ? "تحتاج متابعة" : "Needs follow-up",
      value: attention.length,
    },
    {
      label: language === "ar" ? "نسبة الإكمال" : "Completion",
      value: stats.completion + "%",
    },
  ], [attention.length, language, stats, t]);

  return (
    <div className="page-stack">
      <div className="dashboard-control-row">
        <div className="dashboard-period-control card">
          <div>
            <CalendarRange size={17} />
            <span>{language === "ar" ? "فترة التحليل" : "Analysis period"}</span>
          </div>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
            aria-label={language === "ar" ? "فترة التحليل" : "Analysis period"}
          >
            <option value="all">{language === "ar" ? "كل الفترات" : "All time"}</option>
            <option value="month">{language === "ar" ? "الشهر الحالي" : "This month"}</option>
            <option value="quarter">{language === "ar" ? "الربع الحالي" : "Current quarter"}</option>
            <option value="year">{language === "ar" ? "السنة الحالية" : "This year"}</option>
          </select>
        </div>

        <div className="page-export-row">
          <ExportButtons
            filename={language === "ar" ? "STC-تقرير-العقود" : "STC-Contract-Report"}
            title={language === "ar" ? "تقرير متابعة العقود" : "Contract Flow Report"}
            subtitle={
              language === "ar"
                ? `ملخص تنفيذي · ${periodLabel}`
                : `Executive overview · ${periodLabel}`
            }
            sheets={exportSheets}
            kpis={exportKpis}
            disabled={loading}
          />
        </div>
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
      {syncing && !loading ? (
        <div className="sync-indicator">
          {language === "ar" ? "جاري مزامنة أحدث البيانات…" : "Syncing latest data…"}
        </div>
      ) : null}

      <section className="stats-grid dashboard-stats-extended">
        <article className="stat-card card">
          <div className="stat-icon"><Files size={20} /></div>
          <div><span>{t("totalContracts")}</span><strong>{loading ? "—" : stats.total}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon blue"><CircleDot size={20} /></div>
          <div><span>{t("inProgress")}</span><strong>{loading ? "—" : stats.active}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon green"><CheckCircle2 size={20} /></div>
          <div><span>{t("completed")}</span><strong>{loading ? "—" : stats.completed}</strong></div>
        </article>
        <article className="stat-card card">
          <div className="stat-icon gold"><Clock3 size={20} /></div>
          <div>
            <span>{language === "ar" ? "بدون تحديث 7+ أيام" : "No update 7+ days"}</span>
            <strong>{loading ? "—" : attention.length}</strong>
          </div>
        </article>
        <article className="stat-card card attention-stat">
          <div className="stat-icon danger"><AlertTriangle size={20} /></div>
          <div>
            <span>{language === "ar" ? "بدون تحديث 14+ يوم" : "No update 14+ days"}</span>
            <strong>{loading ? "—" : criticalAttention.length}</strong>
          </div>
        </article>
      </section>

      <section className="dashboard-management-grid">
        <article className="management-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{language === "ar" ? "نقاط التعطّل" : "Bottlenecks"}</p>
              <h3>{language === "ar" ? "العقود الواقفة عند كل مرحلة" : "Contracts waiting at each stage"}</h3>
            </div>
            <BarChart3 size={19} />
          </div>

          <div className="bottleneck-list">
            {bottlenecks.map((item) => (
              <div className="bottleneck-row" key={item.status}>
                <div className="bottleneck-copy">
                  <strong>{statusLabel(item.status)}</strong>
                  <span>{item.count}</span>
                </div>
                <div className="bottleneck-track">
                  <div style={{ width: item.percentage + "%" }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="management-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{language === "ar" ? "أداء الفريق" : "Team performance"}</p>
              <h3>{language === "ar" ? "أداء المندوبين" : "Representative performance"}</h3>
            </div>
            <UsersRound size={19} />
          </div>

          {representativePerformance.length ? (
            <div className="rep-performance-list">
              {representativePerformance.map((rep, index) => (
                <div className="rep-performance-row" key={rep.name}>
                  <span className="rep-rank">{index + 1}</span>
                  <div className="rep-copy">
                    <strong>{rep.name}</strong>
                    <span>
                      {language === "ar"
                        ? `${rep.completed} مكتمل من ${rep.total} · متوسط التقدم ${rep.averageProgress}%`
                        : `${rep.completed} completed of ${rep.total} · avg. progress ${rep.averageProgress}%`}
                    </span>
                  </div>
                  <b>{rep.completionRate}%</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="analytics-empty">{language === "ar" ? "لا توجد بيانات كافية." : "Not enough data yet."}</div>
          )}
        </article>
      </section>

      <section className="dashboard-management-grid trend-attention-grid">
        <article className="management-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{language === "ar" ? "الاتجاه" : "Trend"}</p>
              <h3>{language === "ar" ? "آخر 6 شهور" : "Last 6 months"}</h3>
            </div>
            <TrendingUp size={19} />
          </div>

          <div className="trend-legend">
            <span><i className="trend-dot created" />{language === "ar" ? "عقود جديدة" : "Created"}</span>
            <span><i className="trend-dot completed" />{language === "ar" ? "مكتملة" : "Completed"}</span>
          </div>

          <div className="monthly-trend" aria-label={language === "ar" ? "اتجاه العقود آخر ستة شهور" : "Six month contract trend"}>
            {monthlyTrend.map((month) => (
              <div className="trend-month" key={month.year + "-" + month.month}>
                <div className="trend-bars">
                  <div
                    className="trend-bar created"
                    style={{ height: month.createdHeight + "%" }}
                    title={String(month.created)}
                  />
                  <div
                    className="trend-bar completed"
                    style={{ height: month.completedHeight + "%" }}
                    title={String(month.completed)}
                  />
                </div>
                <strong>{month.label}</strong>
                <span>{month.created} / {month.completed}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="management-card card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{language === "ar" ? "تحتاج متابعة" : "Needs attention"}</p>
              <h3>{language === "ar" ? "عقود بدون تحديث 7 أيام أو أكثر" : "Contracts idle for 7+ days"}</h3>
            </div>
            <AlertTriangle size={19} />
          </div>

          {attention.length ? (
            <div className="attention-list">
              {attention.slice(0, 6).map(({ contract, idleDays }) => (
                <SmartLink
                  className="attention-row"
                  href={"/contracts/" + contract.id}
                  key={contract.id}
                >
                  <div>
                    <strong>{contract.companyName}</strong>
                    <span>{statusLabel(getContractStatus(contract.stages))}</span>
                  </div>
                  <b className={idleDays >= 14 ? "critical" : ""}>
                    {language === "ar" ? `${idleDays} يوم` : `${idleDays}d`}
                  </b>
                </SmartLink>
              ))}
            </div>
          ) : (
            <div className="analytics-empty">
              {language === "ar"
                ? "ممتاز — لا توجد عقود نشطة متوقفة 7 أيام أو أكثر."
                : "Great — no active contracts have been idle for 7+ days."}
            </div>
          )}
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
                  <span>{stage.count} / {scopedContracts.length}</span>
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
          ) : scopedContracts.length === 0 ? (
            <div className="empty-compact">
              <Files size={22} />
              <strong>{t("noContractsYet")}</strong>
              <span>{t("addFirstContract")}</span>
            </div>
          ) : (
            <div className="recent-list">
              {scopedContracts.slice(0, 5).map((contract) => (
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
