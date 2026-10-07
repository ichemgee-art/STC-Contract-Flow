"use client";

import type { ContractNote, ContractRecord, StageKey } from "@/types/contract";
import { getContractStatus, getProgress, STAGES } from "@/types/contract";

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(
  value: ContractRecord["createdAt"] | ContractNote["createdAt"],
  locale: string,
  fallback: string,
) {
  return value
    ? value.toDate().toLocaleString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : fallback;
}

export async function exportContractReport({
  popup,
  contract,
  notes,
  attachmentCount,
  language,
  locale,
  stageLabel,
  statusLabel,
}: {
  popup: Window;
  contract: ContractRecord;
  notes: ContractNote[];
  attachmentCount: number;
  language: "ar" | "en";
  locale: string;
  stageLabel: (key: StageKey, short?: boolean) => string;
  statusLabel: (status: ReturnType<typeof getContractStatus>) => string;
}) {
  const rtl = language === "ar";
  const fallback = rtl ? "غير مسجل" : "Not recorded";
  const contractNumber = contract.contractNumber || contract.id;
  const status = getContractStatus(contract.stages);
  const progress = getProgress(contract.stages);
  const generatedAt = new Date().toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const logoUrl = new URL("/stc-logo.png", window.location.origin).href;

  const stageRows = STAGES.map((stage, index) => {
    const done = contract.stages[stage.key];
    const date = formatDate(contract.stageDates[stage.key], locale, "—");
    return `
      <tr>
        <td class="num">${index + 1}</td>
        <td><strong>${esc(stageLabel(stage.key))}</strong></td>
        <td><span class="pill ${done ? "done" : "pending"}">${done ? (rtl ? "تم" : "Done") : (rtl ? "معلق" : "Pending")}</span></td>
        <td>${esc(date)}</td>
      </tr>
    `;
  }).join("");

  const noteRows = notes.length
    ? notes.slice(0, 20).map((note) => `
        <article class="note">
          <div class="note-head">
            <strong>${esc(note.createdByName || "STC User")}</strong>
            <span>${esc(formatDate(note.createdAt, locale, generatedAt))}</span>
          </div>
          <p>${esc(note.text)}</p>
        </article>
      `).join("")
    : `<div class="empty">${rtl ? "لا توجد ملاحظات مسجلة على العقد." : "No notes recorded for this contract."}</div>`;

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="${language}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8" />
<title>${esc(contractNumber)} - ${esc(contract.companyName)}</title>
<style>
@page { size: A4 portrait; margin: 11mm 10mm 12mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: #253A55;
  font-family: Tahoma, Arial, "Segoe UI", sans-serif;
  -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
}
body { font-variant-numeric: tabular-nums; }
.report { width: 100%; }
.header {
  min-height: 90px; position: relative; display: flex; align-items: center;
  padding: 16px 18px 16px 108px; border-radius: 12px;
  background: #253A55 !important; color: #fff !important;
}
.logo {
  position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
  width: 72px; height: 58px; display: grid; place-items: center;
  padding: 5px; border-radius: 10px; background: #fff !important;
}
.logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
.header-copy { display: grid; gap: 4px; }
.kicker { color: #F3B820 !important; font-size: 8px; font-weight: 900; letter-spacing: .8px; }
.header h1 { margin: 0; font-size: 20px; color: #fff !important; }
.header p { margin: 0; color: rgba(255,255,255,.74) !important; font-size: 8px; }
.summary {
  margin: 12px 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.summary article {
  min-height: 60px; padding: 10px 11px; border: 1px solid #D8DEE6;
  border-radius: 9px; background: #F8FAFC !important;
}
.summary span { display: block; color: #6F7D8F; font-size: 7px; margin-bottom: 5px; }
.summary strong { display: block; color: #253A55; font-size: 11px; overflow-wrap: anywhere; }
.section { margin-top: 14px; break-inside: avoid; }
.section-title {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 7px; padding-bottom: 6px; border-bottom: 2px solid #253A55;
}
.section-title h2 { margin: 0; font-size: 12px; color: #253A55; }
.section-title span { color: #8A96A4; font-size: 7px; }
.info-grid {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 0;
  border: 1px solid #D8DEE6; border-radius: 9px; overflow: hidden;
}
.info {
  min-height: 48px; padding: 9px 11px; border-bottom: 1px solid #E5EAF0;
  background: #fff !important;
}
.info:nth-child(odd) { border-inline-end: 1px solid #E5EAF0; }
.info span { display: block; color: #7B8797; font-size: 7px; margin-bottom: 4px; }
.info strong { display: block; color: #253A55; font-size: 9px; overflow-wrap: anywhere; }
.progress {
  height: 7px; margin-top: 7px; border-radius: 99px; overflow: hidden; background: #E8EDF2 !important;
}
.progress > div { height: 100%; background: #F3B820 !important; }
table { width: 100%; border-collapse: collapse; font-size: 8px; }
th {
  padding: 7px 6px; background: #253A55 !important; color: #fff !important;
  border: 1px solid #253A55; text-align: center;
}
td { padding: 7px 6px; border: 1px solid #D8DEE6; color: #253A55; }
td.num { width: 28px; text-align: center; font-weight: 800; }
.pill {
  display: inline-block; min-width: 54px; padding: 4px 7px; border-radius: 99px;
  text-align: center; font-size: 7px; font-weight: 800;
}
.pill.done { color: #1F8A5B; background: #EAF7F0 !important; }
.pill.pending { color: #9A6A00; background: #FFF4CC !important; }
.notes { display: grid; gap: 7px; }
.note { padding: 9px 11px; border: 1px solid #D8DEE6; border-radius: 8px; break-inside: avoid; }
.note-head { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.note-head strong { font-size: 8px; }
.note-head span { color: #7B8797; font-size: 7px; }
.note p { margin: 0; font-size: 8px; line-height: 1.65; white-space: pre-wrap; }
.empty {
  padding: 14px; border: 1px dashed #C8D0D9; border-radius: 8px;
  color: #7B8797; font-size: 8px; text-align: center;
}
.footer {
  margin-top: 14px; padding-top: 6px; border-top: 1px solid #D8DEE6;
  color: #7B8797; font-size: 6.5px; display: flex; justify-content: space-between;
}
@media screen {
  body { max-width: 900px; margin: 0 auto; padding: 20px; background: #EEF1F4; }
  .report { padding: 16px; border-radius: 14px; background: #fff; box-shadow: 0 12px 36px rgba(37,58,85,.14); }
}
@media print {
  body, .report { width: 100% !important; max-width: none !important; background: #fff !important; }
  .report { padding: 0 !important; box-shadow: none !important; }
}
</style>
</head>
<body>
<main class="report">
  <header class="header">
    <div class="logo"><img src="${esc(logoUrl)}" alt="STC" /></div>
    <div class="header-copy">
      <span class="kicker">SPECIALIZED TRADING & CONSTRUCTION</span>
      <h1>${rtl ? "تقرير العقد" : "Contract Report"} · ${esc(contractNumber)}</h1>
      <p>${esc(contract.companyName)} · ${esc(generatedAt)}</p>
    </div>
  </header>

  <section class="summary">
    <article><span>${rtl ? "الحالة الحالية" : "Current Status"}</span><strong>${esc(statusLabel(status))}</strong></article>
    <article><span>${rtl ? "نسبة الإنجاز" : "Progress"}</span><strong>${progress}%</strong><div class="progress"><div style="width:${progress}%"></div></div></article>
    <article><span>${rtl ? "عدد المرفقات" : "Attachments"}</span><strong>${attachmentCount}</strong></article>
  </section>

  <section class="section">
    <div class="section-title"><h2>${rtl ? "بيانات العقد" : "Contract Information"}</h2><span>${esc(contractNumber)}</span></div>
    <div class="info-grid">
      <div class="info"><span>${rtl ? "رقم العقد" : "Contract Number"}</span><strong>${esc(contractNumber)}</strong></div>
      <div class="info"><span>${rtl ? "الشركة / العميل" : "Company / Client"}</span><strong>${esc(contract.companyName)}</strong></div>
      <div class="info"><span>${rtl ? "المندوب" : "Sales Representative"}</span><strong>${esc(contract.salesRepresentative)}</strong></div>
      <div class="info"><span>${rtl ? "نوع العقد" : "Contract Type"}</span><strong>${esc(contract.contractType)}</strong></div>
      <div class="info"><span>${rtl ? "المنتج" : "Product"}</span><strong>${esc(contract.product)}</strong></div>
      <div class="info"><span>${rtl ? "أنشئ بواسطة" : "Created By"}</span><strong>${esc(contract.createdByName || fallback)}</strong></div>
      <div class="info"><span>${rtl ? "تاريخ الإنشاء" : "Created At"}</span><strong>${esc(formatDate(contract.createdAt, locale, fallback))}</strong></div>
      <div class="info"><span>${rtl ? "آخر تحديث" : "Last Updated"}</span><strong>${esc(formatDate(contract.updatedAt, locale, fallback))}</strong></div>
    </div>
  </section>

  <section class="section">
    <div class="section-title"><h2>${rtl ? "مراحل العقد" : "Contract Workflow"}</h2><span>${progress}%</span></div>
    <table>
      <thead><tr>
        <th>#</th>
        <th>${rtl ? "المرحلة" : "Stage"}</th>
        <th>${rtl ? "الحالة" : "Status"}</th>
        <th>${rtl ? "التاريخ" : "Date"}</th>
      </tr></thead>
      <tbody>${stageRows}</tbody>
    </table>
  </section>

  <section class="section">
    <div class="section-title"><h2>${rtl ? "ملاحظات المتابعة" : "Follow-up Notes"}</h2><span>${notes.length}</span></div>
    <div class="notes">${noteRows}</div>
  </section>

  <footer class="footer">
    <span>STC Contract Flow</span>
    <span>${esc(contractNumber)} · ${esc(generatedAt)}</span>
  </footer>
</main>
<script>
(() => {
  const printWhenReady = async () => {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const images = Array.from(document.images);
      await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        });
      }));
    } catch (_) {}
    window.focus();
    window.print();
  };
  window.addEventListener("load", () => setTimeout(printWhenReady, 180));
  window.addEventListener("afterprint", () => setTimeout(() => window.close(), 200));
})();
<\/script>
</body>
</html>`);
  popup.document.close();
}
