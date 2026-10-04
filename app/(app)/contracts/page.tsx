"use client";

import { ArrowUpRight, Check, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ExportButtons } from "@/components/ExportButtons";
import { useLanguage } from "@/components/LanguageProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { subscribeContracts, updateContractStage } from "@/lib/contracts";
import { playUiSound, primeUiAudio } from "@/lib/sounds";
import {
  canCompleteStage,
  getContractStatus,
  getProgress,
  STAGES,
  STAGE_KEYS,
  type ContractRecord,
  type ContractStatus,
  type StageKey,
} from "@/types/contract";

const statuses: ContractStatus[] = [
  "Waiting for STC Stamp",
  "Waiting for Client Stamp",
  "Waiting for Down Payment",
  "Waiting for Supply",
  "Waiting for Settlement",
  "Completed",
];

export default function ContractsPage() {
  const { t, stageLabel, statusLabel, locale, dir, language } = useLanguage();
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | ContractStatus>("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  function dateText(contract: ContractRecord) {
    return contract.createdAt
      ? contract.createdAt.toDate().toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
      : t("justNow");
  }

  function stageDateText(contract: ContractRecord, key: StageKey) {
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

  useEffect(
    () =>
      subscribeContracts(
        (next) => {
          setContracts(next);
          setLoading(false);
        },
        () => {
          setError(t("loadContractsError"));
          setLoading(false);
        },
      ),
    [t],
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
      const matchesStatus = status === "all" || currentStatus === status;
      return matchesText && matchesStatus;
    });
  }, [contracts, search, status]);

  const exportRows = filtered.map((contract) => {
    const row: Record<string, string | number> = {
      [language === "ar" ? "الشركة" : "Company"]: contract.companyName,
      [language === "ar" ? "المندوب" : "Representative"]: contract.salesRepresentative,
      [language === "ar" ? "نوع العقد" : "Contract Type"]: contract.contractType,
      [language === "ar" ? "المنتج" : "Product"]: contract.product,
    };

    STAGES.forEach((stage) => {
      row[stageLabel(stage.key)] = stageDateText(contract, stage.key);
    });

    row[language === "ar" ? "الحالة الحالية" : "Current Status"] =
      statusLabel(getContractStatus(contract.stages));
    row[language === "ar" ? "نسبة الإنجاز" : "Progress"] = getProgress(contract.stages);
    row[language === "ar" ? "تاريخ الإنشاء" : "Created"] = dateText(contract);
    return row;
  });

  const activeFilterLabel =
    status === "all"
      ? t("allStatuses")
      : statusLabel(status);

  async function toggle(contract: ContractRecord, key: StageKey) {
    primeUiAudio();
    const checked = !contract.stages[key];

    if (!checked) {
      const index = STAGE_KEYS.indexOf(key);
      const hasLaterProgress = STAGE_KEYS.slice(index + 1).some((later) => contract.stages[later]);
      if (hasLaterProgress && !window.confirm(t("reopenConfirm"))) return;
    }

    setBusy(contract.id + ":" + key);
    setError("");
    try {
      await updateContractStage(contract, key, checked);
      playUiSound(checked ? (key === "settlement" ? "completed" : "advance") : "reopen");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("updateStageError"));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">{t("contractRegister")}</p>
          <h2>{t("contractsHeadline")}</h2>
          <p>{t("totalContractsShown", { total: contracts.length, shown: filtered.length })}</p>
        </div>
        <ExportButtons
          filename={language === "ar" ? "STC-العقود-المفلترة" : "STC-Filtered-Contracts"}
          title={language === "ar" ? "سجل العقود" : "Contracts Register"}
          subtitle={
            language === "ar"
              ? `الفلتر: ${activeFilterLabel}${search ? ` · البحث: ${search}` : ""}`
              : `Filter: ${activeFilterLabel}${search ? ` · Search: ${search}` : ""}`
          }
          sheets={[{
            name: language === "ar" ? "العقود" : "Contracts",
            rows: exportRows,
          }]}
          kpis={[
            { label: language === "ar" ? "إجمالي العقود" : "Total Contracts", value: contracts.length },
            { label: language === "ar" ? "المعروض" : "Shown", value: filtered.length },
            { label: language === "ar" ? "الفلتر" : "Filter", value: activeFilterLabel },
          ]}
          disabled={loading || filtered.length === 0}
          compact
        />
      </section>

      <section className="contract-toolbar card">
        <label className="search-box">
          <Search size={17} />
          <input
            type="search"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="filter-select"
          value={status}
          onChange={(event) => setStatus(event.target.value as "all" | ContractStatus)}
        >
          <option value="all">{t("allStatuses")}</option>
          {statuses.map((item) => <option value={item} key={item}>{statusLabel(item)}</option>)}
        </select>
      </section>

      {error && <div className="notice notice-error">{error}</div>}

      <section className="contracts-table-card card">
        {loading ? (
          <div className="table-state">{t("loadingContracts")}</div>
        ) : filtered.length === 0 ? (
          <div className="table-state empty-state">
            <FileText size={28} />
            <strong>{t("noMatchingContracts")}</strong>
            <span>{t("noMatchingContractsHelp")}</span>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="contracts-table">
                <thead>
                  <tr>
                    <th>{t("company")}</th>
                    <th>{t("representative")}</th>
                    <th>{t("contract")}</th>
                    {STAGES.map((stage) => <th className="stage-column" key={stage.key}>{stageLabel(stage.key, true)}</th>)}
                    <th>{t("status")}</th>
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
                        <span className="cell-sub">{getProgress(contract.stages)}% {t("complete")}</span>
                      </td>
                      {STAGES.map((stage) => {
                        const checked = contract.stages[stage.key];
                        const enabled = checked || canCompleteStage(contract.stages, stage.key);
                        const isBusy = busy === contract.id + ":" + stage.key;
                        const label = stageLabel(stage.key);
                        return (
                          <td className="stage-column" key={stage.key}>
                            <button
                              className={checked ? "mini-check checked" : "mini-check"}
                              disabled={!enabled || Boolean(busy)}
                              onClick={() => toggle(contract, stage.key)}
                              title={label}
                              aria-label={label}
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
                          aria-label={t("openContract") + " " + contract.companyName}
                        >
                          <ArrowUpRight size={17} className={dir === "rtl" ? "rtl-open-arrow" : ""} />
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
                      <ArrowUpRight size={17} className={dir === "rtl" ? "rtl-open-arrow" : ""} />
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
                          <small>{stageLabel(stage.key, true)}</small>
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
