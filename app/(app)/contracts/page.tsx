"use client";

import { ArrowUpRight, Check, FileText, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useContracts } from "@/components/ContractsProvider";
import { ExportButtons } from "@/components/ExportButtons";
import { useLanguage } from "@/components/LanguageProvider";
import { SmartLink } from "@/components/SmartLink";
import { StatusBadge } from "@/components/StatusBadge";
import { updateContractStage } from "@/lib/contracts";
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
  "Waiting for Stocking Payment",
  "Completed",
];

export default function ContractsPage() {
  const { t, stageLabel, statusLabel, locale, dir, language } = useLanguage();
  const {
    contracts,
    totalCount,
    loading,
    syncing,
    loadingMore,
    hasMore,
    error: loadError,
    loadMore,
    ensureAllLoaded,
    refreshContract,
  } = useContracts();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
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


  const filterContracts = (source: ContractRecord[]) => {
    const needle = deferredSearch.trim().toLowerCase();
    return source.filter((contract) => {
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
  };

  const filtered = useMemo(
    () => filterContracts(contracts),
    [contracts, deferredSearch, status],
  );

  const buildExportRows = (source: ContractRecord[]) => source.map((contract) => {
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

  const exportRows = useMemo(
    () => buildExportRows(filtered),
    [filtered, language, locale, stageLabel, statusLabel, t],
  );

  const activeFilterLabel =
    status === "all"
      ? t("allStatuses")
      : statusLabel(status);

  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if ((deferredSearch.trim() || status !== "all") && hasMore) {
      void ensureAllLoaded();
    }
  }, [deferredSearch, ensureAllLoaded, hasMore, status]);

  const visibleContracts = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const exportSheets = useMemo(() => [{
    name: language === "ar" ? "العقود" : "Contracts",
    rows: exportRows,
  }], [exportRows, language]);

  const exportKpis = useMemo(() => [
    { label: language === "ar" ? "إجمالي العقود" : "Total Contracts", value: totalCount || contracts.length },
    { label: language === "ar" ? "المعروض" : "Shown", value: filtered.length },
    { label: language === "ar" ? "الفلتر" : "Filter", value: activeFilterLabel },
  ], [activeFilterLabel, contracts.length, filtered.length, language, totalCount]);


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
      await refreshContract(contract.id);
      playUiSound(checked ? (key === "settlement" ? "completed" : "advance") : "reopen");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t("updateStageError"));
    } finally {
      setBusy("");
    }
  }

  async function showMoreContracts() {
    if (visibleCount < filtered.length) {
      setVisibleCount((current) => current + PAGE_SIZE);
      return;
    }

    if (!hasMore) return;
    await loadMore();
    setVisibleCount((current) => current + PAGE_SIZE);
  }

  async function prepareFullExport() {
    const all = hasMore ? await ensureAllLoaded() : contracts;
    const source = filterContracts(all);
    const rows = buildExportRows(source);
    return {
      sheets: [{
        name: language === "ar" ? "العقود" : "Contracts",
        rows,
      }],
      kpis: [
        { label: language === "ar" ? "إجمالي العقود" : "Total Contracts", value: totalCount || all.length },
        { label: language === "ar" ? "المعروض" : "Shown", value: source.length },
        { label: language === "ar" ? "الفلتر" : "Filter", value: activeFilterLabel },
      ],
      subtitle:
        language === "ar"
          ? `الفلتر: ${activeFilterLabel}${search ? ` · البحث: ${search}` : ""}`
          : `Filter: ${activeFilterLabel}${search ? ` · Search: ${search}` : ""}`,
    };
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">{t("contractRegister")}</p>
          <h2>{t("contractsHeadline")}</h2>
          <p>{t("totalContractsShown", {
            total: totalCount || contracts.length,
            shown: hasMore ? `${filtered.length}+` : filtered.length,
          })}</p>
        </div>
        <ExportButtons
          filename={language === "ar" ? "STC-العقود-المفلترة" : "STC-Filtered-Contracts"}
          title={language === "ar" ? "سجل العقود" : "Contracts Register"}
          subtitle={
            language === "ar"
              ? `الفلتر: ${activeFilterLabel}${search ? ` · البحث: ${search}` : ""}`
              : `Filter: ${activeFilterLabel}${search ? ` · Search: ${search}` : ""}`
          }
          sheets={exportSheets}
          kpis={exportKpis}
          prepareExport={prepareFullExport}
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

      {loadError && <div className="notice notice-error">{t("loadContractsError")}</div>}
      {error && <div className="notice notice-error">{error}</div>}
      {(syncing || loadingMore) && !loading ? <div className="sync-indicator">
        {language === "ar"
          ? loadingMore ? "جاري تحميل عقود أقدم…" : "جاري مزامنة أحدث البيانات…"
          : loadingMore ? "Loading older contracts…" : "Syncing latest data…"}
      </div> : null}

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
                  {visibleContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>
                        <SmartLink className="table-company" href={"/contracts/" + contract.id}>
                          <strong>{contract.companyName}</strong>
                          <span>{contract.product} · {dateText(contract)}</span>
                        </SmartLink>
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
                        <SmartLink
                          className="row-open"
                          href={"/contracts/" + contract.id}
                          aria-label={t("openContract") + " " + contract.companyName}
                        >
                          <ArrowUpRight size={17} className={dir === "rtl" ? "rtl-open-arrow" : ""} />
                        </SmartLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="contracts-mobile-list">
              {visibleContracts.map((contract) => (
                <article className="contract-mobile-card" key={contract.id}>
                  <div className="mobile-card-head">
                    <div>
                      <strong>{contract.companyName}</strong>
                      <span>{contract.product} · {contract.contractType}</span>
                    </div>
                    <SmartLink className="row-open" href={"/contracts/" + contract.id}>
                      <ArrowUpRight size={17} className={dir === "rtl" ? "rtl-open-arrow" : ""} />
                    </SmartLink>
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

            {(visibleContracts.length < filtered.length || hasMore) ? (
              <div className="contracts-load-more">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void showMoreContracts()}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? (language === "ar" ? "جاري التحميل…" : "Loading…")
                    : language === "ar"
                      ? `عرض المزيد (${visibleContracts.length} من ${totalCount || filtered.length})`
                      : `Load more (${visibleContracts.length} of ${totalCount || filtered.length})`}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
