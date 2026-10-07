"use client";

import { ArrowUpRight, Check, FileText, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useContracts } from "@/components/ContractsProvider";
import { ExportButtons } from "@/components/ExportButtons";
import { useLanguage } from "@/components/LanguageProvider";
import { SmartLink } from "@/components/SmartLink";
import { StatusBadge } from "@/components/StatusBadge";
import { assignMissingContractNumbers, updateContractStage } from "@/lib/contracts";
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
  const { profile } = useAuth();
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [contractNumberFilter, setContractNumberFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [representativeFilter, setRepresentativeFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [numberingLegacy, setNumberingLegacy] = useState(false);
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


  const hasAdvancedFilters = Boolean(
    contractNumberFilter.trim()
    || companyFilter.trim()
    || representativeFilter.trim()
    || productFilter.trim()
    || typeFilter.trim()
    || dateFrom
    || dateTo,
  );

  const filterContracts = (source: ContractRecord[]) => {
    const needle = deferredSearch.trim().toLowerCase();
    const contractNumberNeedle = contractNumberFilter.trim().toLowerCase();
    const companyNeedle = companyFilter.trim().toLowerCase();
    const representativeNeedle = representativeFilter.trim().toLowerCase();
    const productNeedle = productFilter.trim().toLowerCase();
    const typeNeedle = typeFilter.trim().toLowerCase();
    const fromMs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toMs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;

    return source.filter((contract) => {
      const matchesText =
        !needle ||
        [
          contract.contractNumber ?? "",
          contract.salesRepresentative,
          contract.companyName,
          contract.contractType,
          contract.product,
        ].some((value) => value.toLowerCase().includes(needle));

      const currentStatus = getContractStatus(contract.stages);
      const matchesStatus = status === "all" || currentStatus === status;
      const createdMs = contract.createdAt?.toMillis() ?? 0;

      return matchesText
        && matchesStatus
        && (!contractNumberNeedle || (contract.contractNumber ?? "").toLowerCase().includes(contractNumberNeedle))
        && (!companyNeedle || contract.companyName.toLowerCase().includes(companyNeedle))
        && (!representativeNeedle || contract.salesRepresentative.toLowerCase().includes(representativeNeedle))
        && (!productNeedle || contract.product.toLowerCase().includes(productNeedle))
        && (!typeNeedle || contract.contractType.toLowerCase().includes(typeNeedle))
        && (fromMs == null || createdMs >= fromMs)
        && (toMs == null || createdMs <= toMs);
    });
  };

  const filtered = useMemo(
    () => filterContracts(contracts),
    [
      companyFilter,
      contractNumberFilter,
      contracts,
      dateFrom,
      dateTo,
      deferredSearch,
      productFilter,
      representativeFilter,
      status,
      typeFilter,
    ],
  );

  const buildExportRows = (source: ContractRecord[]) => source.map((contract) => {
    const row: Record<string, string | number> = {
      [language === "ar" ? "رقم العقد" : "Contract Number"]: contract.contractNumber || "—",
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

  useEffect(() => {
    if ((deferredSearch.trim() || status !== "all" || hasAdvancedFilters) && hasMore) {
      void ensureAllLoaded();
    }
  }, [deferredSearch, ensureAllLoaded, hasAdvancedFilters, hasMore, status]);

  // Firestore pagination is the single source of pagination. The register renders
  // exactly the records already loaded into the shared store.
  const visibleContracts = filtered;

  const exportSheets = useMemo(() => [{
    name: language === "ar" ? "العقود" : "Contracts",
    rows: exportRows,
  }], [exportRows, language]);

  const exportKpis = useMemo(() => [
    { label: language === "ar" ? "إجمالي العقود" : "Total Contracts", value: totalCount || contracts.length },
    { label: language === "ar" ? "المعروض" : "Shown", value: filtered.length },
    { label: language === "ar" ? "الفلتر" : "Filter", value: activeFilterLabel },
  ], [activeFilterLabel, contracts.length, filtered.length, language, totalCount]);


  function clearFilters() {
    setSearch("");
    setStatus("all");
    setContractNumberFilter("");
    setCompanyFilter("");
    setRepresentativeFilter("");
    setProductFilter("");
    setTypeFilter("");
    setDateFrom("");
    setDateTo("");
  }

  async function numberLegacyContracts() {
    if (profile?.role !== "admin" || numberingLegacy) return;

    setNumberingLegacy(true);
    setError("");
    try {
      const all = hasMore ? await ensureAllLoaded() : contracts;
      const missing = all.filter((contract) => !contract.contractNumber);
      if (!missing.length) {
        setError(language === "ar" ? "كل العقود مرقمة بالفعل." : "All contracts already have numbers.");
        return;
      }

      const confirmed = window.confirm(
        language === "ar"
          ? `سيتم ترقيم ${missing.length} عقد قديم تلقائيًا حسب تاريخ الإنشاء. متابعة؟`
          : `Automatically number ${missing.length} legacy contracts by creation date?`,
      );
      if (!confirmed) return;

      await assignMissingContractNumbers(all);
      window.location.reload();
    } catch {
      setError(language === "ar" ? "تعذر ترقيم العقود القديمة." : "Could not number legacy contracts.");
    } finally {
      setNumberingLegacy(false);
    }
  }

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

  const canLoadMore =
    hasMore
    && (totalCount === 0 || contracts.length < totalCount);

  async function showMoreContracts() {
    if (!canLoadMore || loadingMore) return;
    await loadMore();
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
          <p data-testid="contracts-total">{t("totalContractsShown", {
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

      <section className="contract-toolbar card advanced-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            data-testid="contracts-search"
            type="search"
            placeholder={
              language === "ar"
                ? "ابحث برقم العقد، الشركة، المندوب، المنتج..."
                : "Search contract no., company, representative, product..."
            }
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
        <button
          data-testid="advanced-search-toggle"
          type="button"
          className={advancedOpen || hasAdvancedFilters ? "button button-secondary advanced-filter-toggle active" : "button button-secondary advanced-filter-toggle"}
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          <SlidersHorizontal size={16} />
          {language === "ar" ? "بحث متقدم" : "Advanced Search"}
          {hasAdvancedFilters ? <span className="advanced-filter-dot" /> : null}
        </button>
      </section>

      {advancedOpen ? (
        <section className="advanced-filter-panel card" data-testid="advanced-search-panel">
          <div className="advanced-filter-grid">
            <label>
              <span>{language === "ar" ? "رقم العقد" : "Contract Number"}</span>
              <input
                data-testid="filter-contract-number"
                value={contractNumberFilter}
                onChange={(event) => setContractNumberFilter(event.target.value)}
                placeholder="STC-2026-0001"
                dir="ltr"
              />
            </label>
            <label>
              <span>{language === "ar" ? "الشركة / العميل" : "Company / Client"}</span>
              <input value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} />
            </label>
            <label>
              <span>{language === "ar" ? "المندوب" : "Representative"}</span>
              <input value={representativeFilter} onChange={(event) => setRepresentativeFilter(event.target.value)} />
            </label>
            <label>
              <span>{language === "ar" ? "المنتج" : "Product"}</span>
              <input value={productFilter} onChange={(event) => setProductFilter(event.target.value)} />
            </label>
            <label>
              <span>{language === "ar" ? "نوع العقد" : "Contract Type"}</span>
              <input value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} />
            </label>
            <label>
              <span>{language === "ar" ? "من تاريخ" : "From Date"}</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              <span>{language === "ar" ? "إلى تاريخ" : "To Date"}</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
          </div>
          <div className="advanced-filter-actions">
            <button type="button" className="button button-secondary" onClick={clearFilters}>
              <RotateCcw size={15} />
              {language === "ar" ? "مسح الفلاتر" : "Clear Filters"}
            </button>
            {profile?.role === "admin" ? (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void numberLegacyContracts()}
                disabled={numberingLegacy}
              >
                {numberingLegacy
                  ? language === "ar" ? "جاري الترقيم..." : "Numbering..."
                  : language === "ar" ? "ترقيم العقود القديمة" : "Number Legacy Contracts"}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

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
                    <th>{language === "ar" ? "رقم العقد" : "Contract No."}</th>
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
                        <span className="contract-number-cell" dir="ltr">{contract.contractNumber || "—"}</span>
                      </td>
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
                      <span className="mobile-contract-number" dir="ltr">{contract.contractNumber || "—"}</span>
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

            {canLoadMore ? (
              <div className="contracts-load-more">
                <button
                  type="button"
                  data-testid="contracts-load-more"
                  data-loaded={visibleContracts.length}
                  data-total={totalCount || filtered.length}
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
