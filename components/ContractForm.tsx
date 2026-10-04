"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
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
  busy?: boolean;
  error?: string;
  onSubmit: (input: ContractInput) => Promise<void> | void;
}

export function ContractForm({
  initialValue = emptyValue,
  submitLabel = "Save Contract",
  cancelHref = "/contracts",
  busy = false,
  error,
  onSubmit,
}: ContractFormProps) {
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

  return (
    <form className="contract-form card" onSubmit={submit}>
      <div className="form-section-heading">
        <div>
          <p className="eyebrow">Contract information</p>
          <h3>Basic details</h3>
          <p>Keep the entry short and searchable. Contract type and product are free text.</p>
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Sales representative</span>
          <input
            value={value.salesRepresentative}
            onChange={(event) => update("salesRepresentative", event.target.value)}
            placeholder="e.g. Ahmed Mohamed"
            minLength={2}
            maxLength={100}
            required
          />
        </label>

        <label className="field">
          <span>Company / Client</span>
          <input
            value={value.companyName}
            onChange={(event) => update("companyName", event.target.value)}
            placeholder="e.g. ABC Contracting"
            minLength={2}
            maxLength={160}
            required
          />
        </label>

        <label className="field">
          <span>Contract type</span>
          <input
            value={value.contractType}
            onChange={(event) => update("contractType", event.target.value)}
            placeholder="e.g. Supply & Installation"
            minLength={2}
            maxLength={120}
            required
          />
          <small>Manual entry — not limited to a predefined list.</small>
        </label>

        <label className="field">
          <span>Product / Item</span>
          <input
            value={value.product}
            onChange={(event) => update("product", event.target.value)}
            placeholder="e.g. HPL"
            minLength={1}
            maxLength={120}
            required
          />
          <small>Examples: HPL, Corian, Raised Floor, Expansion Joints.</small>
        </label>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <Link href={cancelHref} className="button button-secondary">
          <ArrowLeft size={16} /> Cancel
        </Link>
        <button className="button button-primary" type="submit" disabled={busy}>
          <Save size={16} /> {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
