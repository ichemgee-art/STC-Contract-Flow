"use client";

import { AlertTriangle, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect } from "react";

type DeleteContractModalProps = {
  open: boolean;
  companyName: string;
  contractNumber?: string;
  busy?: boolean;
  language: "ar" | "en";
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteContractModal({
  open,
  companyName,
  contractNumber,
  busy = false,
  language,
  onCancel,
  onConfirm,
}: DeleteContractModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  const ar = language === "ar";

  return (
    <div
      className="delete-modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="delete-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-contract-title"
        aria-describedby="delete-contract-description"
        data-testid="delete-contract-modal"
      >
        <button
          type="button"
          className="delete-modal-close"
          onClick={onCancel}
          disabled={busy}
          aria-label={ar ? "إغلاق" : "Close"}
        >
          <X size={18} />
        </button>

        <div className="delete-modal-icon-wrap" aria-hidden="true">
          <div className="delete-modal-icon">
            <Trash2 size={34} strokeWidth={2.3} />
          </div>
          <span className="delete-modal-warning-badge">
            <AlertTriangle size={14} />
          </span>
        </div>

        <div className="delete-modal-copy">
          <span className="delete-modal-kicker">
            <ShieldAlert size={14} />
            {ar ? "إجراء حساس" : "Sensitive Action"}
          </span>

          <h3 id="delete-contract-title">
            {ar ? "تأكيد حذف العقد" : "Confirm Contract Deletion"}
          </h3>

          <p id="delete-contract-description">
            {ar
              ? "أنت على وشك حذف هذا العقد نهائيًا من النظام."
              : "You are about to permanently delete this contract from the system."}
          </p>
        </div>

        <div className="delete-modal-contract">
          <span>{ar ? "العقد المحدد" : "Selected Contract"}</span>
          <strong>{companyName}</strong>
          <code dir="ltr">{contractNumber || "—"}</code>
        </div>

        <div className="delete-modal-alert">
          <AlertTriangle size={17} />
          <p>
            {ar
              ? "سيتم حذف العقد والملاحظات والملفات المرتبطة به. لا يمكن التراجع عن العملية بعد التأكيد."
              : "The contract, notes, and related files will be deleted. This action cannot be undone after confirmation."}
          </p>
        </div>

        <div className="delete-modal-actions">
          <button
            type="button"
            className="button button-secondary delete-cancel-button"
            onClick={onCancel}
            disabled={busy}
            data-testid="delete-contract-cancel"
          >
            {ar ? "إلغاء" : "Cancel"}
          </button>

          <button
            type="button"
            className="button delete-confirm-button"
            onClick={onConfirm}
            disabled={busy}
            data-testid="delete-contract-confirm"
          >
            {busy ? (
              <>
                <span className="delete-button-spinner" aria-hidden="true" />
                {ar ? "جاري الحذف..." : "Deleting..."}
              </>
            ) : (
              <>
                <Trash2 size={16} />
                {ar ? "تأكيد الحذف" : "Delete Contract"}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
