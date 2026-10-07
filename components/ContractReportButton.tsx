"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { listContractAttachments } from "@/lib/contractAttachments";
import { listContractNotes } from "@/lib/contractNotes";
import type { ContractRecord } from "@/types/contract";

export function ContractReportButton({ contract }: { contract: ContractRecord }) {
  const { language, locale, stageLabel, statusLabel } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError(
        language === "ar"
          ? "المتصفح منع نافذة التقرير. اسمح بالنوافذ المنبثقة وحاول مرة أخرى."
          : "The browser blocked the report window. Allow pop-ups and try again.",
      );
      return;
    }

    popup.document.write(
      `<div style="font-family:Arial;padding:32px;color:#253A55">${language === "ar" ? "جاري تجهيز التقرير..." : "Preparing report..."}</div>`,
    );

    setBusy(true);
    setError("");
    try {
      const [{ exportContractReport }, notes, attachments] = await Promise.all([
        import("@/lib/contractReport"),
        listContractNotes(contract.id),
        listContractAttachments(contract.id),
      ]);

      await exportContractReport({
        popup,
        contract,
        notes,
        attachmentCount: attachments.length,
        language,
        locale,
        stageLabel,
        statusLabel,
      });
    } catch {
      popup.close();
      setError(
        language === "ar"
          ? "تعذر تجهيز تقرير العقد."
          : "Could not prepare the contract report.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contract-report-action">
      <button
        data-testid="contract-report-pdf"
        type="button"
        className="button button-primary"
        onClick={() => void generate()}
        disabled={busy}
      >
        <FileDown size={16} />
        {busy
          ? language === "ar" ? "جاري التجهيز..." : "Preparing..."
          : language === "ar" ? "PDF تقرير العقد" : "Contract PDF"}
      </button>
      {error ? <span className="contract-report-error">{error}</span> : null}
    </div>
  );
}
