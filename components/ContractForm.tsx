"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import type { ContractInput } from "@/types/contract";

const emptyValue: ContractInput = {
  salesRepresentative: "",
  companyName: "",
  contractType: "",
  product: "",
};

interface ContractFormProps {
  initialValue?: ContractInput;
  submitLabel?: string;
  cancelHref?: string;
  onCancel?: () => void;
  busy?: boolean;
  error?: string;
  onSubmit: (input: ContractInput) => Promise<void> | void;
}

export function ContractForm({
  initialValue = emptyValue,
  submitLabel,
  cancelHref = "/contracts",
  onCancel,
  busy = false,
  error,
  onSubmit,
}: ContractFormProps) {
  const { t, dir } = useLanguage();
  const [value, setValue] = useState<ContractInput>(initialValue);

  useEffect(() => setValue(initialValue), [initialValue]);

  function update<K extends keyof ContractInput>(key: K, next: ContractInput[K]) {
    setValue((current) => ({ ...current, [key]: next }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      salesRepresentative: value.salesRepresentative.trim(),
      companyName: value.companyName.trim(),
      contractType: value.contractType.trim(),
      product: value.product.trim(),
    });
  }

  const cancelControl = onCancel ? (
    <button type="button" className="button button-secondary" onClick={onCancel}>
      <ArrowLeft size={16} className={dir === "rtl" ? "rtl-flip" : ""} /> {t("cancel")}
    </button>
  ) : (
    <Link href={cancelHref} className="button button-secondary">
      <ArrowLeft size={16} className={dir === "rtl" ? "rtl-flip" : ""} /> {t("cancel")}
    </Link>
  );

  return (
    <form className="contract-form card" onSubmit={submit}>
      <div className="form-section-heading">
        <div>
          <p className="eyebrow">{t("contractInformation")}</p>
          <h3>{t("basicDetails")}</h3>
          <p>{t("basicDetailsHelp")}</p>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>{t("salesRepresentative")}</span>
          <input
            data-testid="contract-sales-representative"
            value={value.salesRepresentative}
            onChange={(event) => update("salesRepresentative", event.target.value)}
            placeholder={t("salesRepresentativePlaceholder")}
            minLength={2}
            maxLength={100}
            required
          />
        </label>

        <label className="field">
          <span>{t("companyClient")}</span>
          <input
            data-testid="contract-company-name"
            value={value.companyName}
            onChange={(event) => update("companyName", event.target.value)}
            placeholder={t("companyPlaceholder")}
            minLength={2}
            maxLength={160}
            required
          />
        </label>

        <label className="field">
          <span>{t("contractType")}</span>
          <input
            data-testid="contract-type"
            value={value.contractType}
            onChange={(event) => update("contractType", event.target.value)}
            placeholder={t("contractTypePlaceholder")}
            minLength={2}
            maxLength={120}
            required
          />
          <small>{t("contractTypeHelp")}</small>
        </label>

        <label className="field">
          <span>{t("productItem")}</span>
          <input
            data-testid="contract-product"
            value={value.product}
            onChange={(event) => update("product", event.target.value)}
            placeholder={t("productPlaceholder")}
            minLength={1}
            maxLength={120}
            required
          />
          <small>{t("productHelp")}</small>
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        {cancelControl}
        <button data-testid="contract-submit" className="button button-primary" type="submit" disabled={busy}>
          <Save size={16} /> {busy ? t("saving") : submitLabel ?? t("saveContract")}
        </button>
      </div>
    </form>
  );
}
