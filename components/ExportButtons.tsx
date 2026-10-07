"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { ExportKpi, ExportSheet } from "@/lib/exporters";

export function ExportButtons({
  filename,
  title,
  subtitle,
  sheets,
  kpis = [],
  disabled = false,
  compact = false,
  showExcel = true,
  showPdf = true,
  prepareExport,
}: {
  filename: string;
  title: string;
  subtitle: string;
  sheets: ExportSheet[];
  kpis?: ExportKpi[];
  disabled?: boolean;
  compact?: boolean;
  showExcel?: boolean;
  showPdf?: boolean;
  prepareExport?: () => Promise<{
    sheets?: ExportSheet[];
    kpis?: ExportKpi[];
    subtitle?: string;
  }>;
}) {
  const { language, dir } = useLanguage();
  const [busy, setBusy] = useState<"" | "excel" | "pdf">("");
  const [error, setError] = useState("");

  async function runExcel() {
    setBusy("excel");
    setError("");
    try {
      const prepared = prepareExport ? await prepareExport() : null;
      const { exportExcel } = await import("@/lib/exporters");
      await exportExcel({
        filename,
        title,
        subtitle: prepared?.subtitle ?? subtitle,
        sheets: prepared?.sheets ?? sheets,
        kpis: prepared?.kpis ?? kpis,
        rightToLeft: dir === "rtl",
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : language === "ar"
            ? "تعذر تصدير ملف Excel."
            : "Could not export Excel.",
      );
    } finally {
      setBusy("");
    }
  }

  async function runPdf() {
    setBusy("pdf");
    setError("");
    try {
      const prepared = prepareExport ? await prepareExport() : null;
      const { exportPdf } = await import("@/lib/exporters");
      await exportPdf({
        filename,
        title,
        subtitle: prepared?.subtitle ?? subtitle,
        sheets: prepared?.sheets ?? sheets,
        kpis: prepared?.kpis ?? kpis,
        language,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : language === "ar"
            ? "تعذر تصدير ملف PDF."
            : "Could not export PDF.",
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={compact ? "export-suite compact" : "export-suite"}>
      <div className="export-suite-main">
        <span className="export-suite-label">
          <Download size={15} />
          {language === "ar" ? "تصدير" : "Export"}
        </span>
        {showExcel ? <button
          type="button"
          className="export-button excel"
          onClick={() => void runExcel()}
          disabled={disabled || Boolean(busy)}
        >
          <FileSpreadsheet size={16} />
          {busy === "excel" ? "..." : "Excel"}
        </button> : null}
        {showPdf ? <button
          type="button"
          className="export-button pdf"
          onClick={() => void runPdf()}
          disabled={disabled || Boolean(busy)}
        >
          <FileText size={16} />
          {busy === "pdf" ? "..." : "PDF"}
        </button> : null}
      </div>
      {error ? <span className="export-suite-error">{error}</span> : null}
    </div>
  );
}
