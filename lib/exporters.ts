"use client";

export type ExportValue = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportValue>;

export interface ExportSheet {
  name: string;
  rows: ExportRow[];
  subtitle?: string;
}

export interface ExportKpi {
  label: string;
  value: string | number;
}

const COLORS = {
  navy: "#253A55",
  gold: "#F3B820",
  white: "#FFFFFF",
  text: "#253A55",
  muted: "#6F7D8F",
  border: "#D8DEE6",
  soft: "#F6F8FA",
  softGold: "#FFF7DC",
  green: "#1F8A5B",
  greenSoft: "#EAF7F0",
  red: "#D64545",
  redSoft: "#FDECEC",
  amber: "#9A6A00",
  amberSoft: "#FFF4CC",
};

const safeName = (value: string) =>
  String(value || "export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim()
    .slice(0, 80) || "export";

function excelBorder() {
  return {
    borderColor: COLORS.border,
    borderStyle: "thin" as const,
  };
}

function statusTone(value: ExportValue) {
  const text = String(value ?? "").toLowerCase();
  if (/مكتمل|تم$|completed|done|yes|نعم/.test(text)) return "success";
  if (/معلق|بانتظار|pending|waiting|no|لا/.test(text)) return "warning";
  if (/ملغي|فشل|error|failed|deleted/.test(text)) return "danger";
  return "neutral";
}

function bodyCell(key: string, value: ExportValue, index: number) {
  const cell: Record<string, unknown> = {
    value: value == null ? "" : value,
    backgroundColor: index % 2 ? COLORS.soft : COLORS.white,
    textColor: COLORS.text,
    align: typeof value === "number" ? "center" : "right",
    alignVertical: "center",
    wrap: true,
    ...excelBorder(),
  };

  const tone = statusTone(value);
  if (tone === "success") {
    cell.backgroundColor = COLORS.greenSoft;
    cell.textColor = COLORS.green;
    cell.fontWeight = "bold";
  } else if (tone === "warning") {
    cell.backgroundColor = COLORS.amberSoft;
    cell.textColor = COLORS.amber;
    cell.fontWeight = "bold";
  } else if (tone === "danger") {
    cell.backgroundColor = COLORS.redSoft;
    cell.textColor = COLORS.red;
    cell.fontWeight = "bold";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (/%|نسبة|progress|percentage/i.test(key)) cell.format = '#,##0"%"';
    else cell.format = Number.isInteger(value) ? "#,##0" : "#,##0.00";
  }

  return cell;
}

function estimateWidth(key: string, rows: ExportRow[]) {
  const values = rows.slice(0, 120).map((row) => String(row[key] ?? ""));
  const max = Math.max(key.length, ...values.map((value) => value.length), 8);
  const textHeavy = /شركة|عميل|مندوب|نوع|منتج|حالة|company|client|representative|product|status/i.test(key);
  return Math.min(textHeavy ? 34 : 24, Math.max(12, Math.ceil(max * 0.9) + 3));
}

function uniqueSheetNames(sheets: ExportSheet[]) {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    const base = safeName(sheet.name || `Sheet ${index + 1}`).slice(0, 31) || `Sheet ${index + 1}`;
    let name = base;
    let counter = 2;
    while (used.has(name)) {
      const suffix = ` ${counter}`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }
    used.add(name);
    return name;
  });
}

function buildSheet(sheet: ExportSheet, resolvedName: string, rightToLeft: boolean) {
  const keys = Object.keys(sheet.rows[0] || {});
  const width = Math.max(keys.length, 1);

  const titleRow = [
    {
      value: sheet.name,
      columnSpan: width,
      backgroundColor: COLORS.navy,
      textColor: COLORS.white,
      fontWeight: "bold",
      fontSize: 18,
      align: rightToLeft ? "right" : "left",
      alignVertical: "center",
      height: 34,
      wrap: true,
      ...excelBorder(),
    },
    ...Array.from({ length: width - 1 }, () => null),
  ];

  const subtitleRow = [
    {
      value: sheet.subtitle || "STC Contract Flow",
      columnSpan: width,
      backgroundColor: COLORS.softGold,
      textColor: COLORS.navy,
      fontWeight: "bold",
      fontSize: 10,
      align: rightToLeft ? "right" : "left",
      alignVertical: "center",
      height: 24,
      wrap: true,
      ...excelBorder(),
    },
    ...Array.from({ length: width - 1 }, () => null),
  ];

  if (!keys.length) {
    return {
      sheet: resolvedName,
      data: [
        titleRow,
        subtitleRow,
        [{
          value: rightToLeft ? "لا توجد بيانات" : "No data",
          columnSpan: width,
          textColor: COLORS.muted,
          align: "center",
          ...excelBorder(),
        }],
      ],
      columns: [{ width: 26 }],
      rightToLeft,
      showGridLines: false,
      stickyRowsCount: 2,
      orientation: "landscape" as const,
    };
  }

  const header = keys.map((value) => ({
    value,
    backgroundColor: COLORS.navy,
    textColor: COLORS.white,
    fontWeight: "bold",
    align: "center",
    alignVertical: "center",
    height: 30,
    wrap: true,
    ...excelBorder(),
  }));

  const body = sheet.rows.map((row, rowIndex) =>
    keys.map((key) => bodyCell(key, row[key], rowIndex)),
  );

  return {
    sheet: resolvedName,
    data: [titleRow, subtitleRow, header, ...body],
    columns: keys.map((key) => ({ width: estimateWidth(key, sheet.rows) })),
    rightToLeft,
    showGridLines: false,
    stickyRowsCount: 3,
    stickyColumnsCount: keys.length >= 7 ? 2 : 1,
    orientation: keys.length >= 6 ? ("landscape" as const) : ("portrait" as const),
    zoomScale: keys.length >= 10 ? 0.8 : 0.95,
  };
}

function buildDashboardSheet(
  title: string,
  subtitle: string,
  kpis: ExportKpi[],
  rightToLeft: boolean,
) {
  const width = 6;
  const safeKpis = [...kpis].slice(0, 6);
  while (safeKpis.length < 6) safeKpis.push({ label: "—", value: "—" });

  const row = (slice: ExportKpi[]) =>
    slice.flatMap((item) => [
      {
        value: item.label,
        backgroundColor: COLORS.navy,
        textColor: COLORS.gold,
        fontWeight: "bold",
        align: "center",
        wrap: true,
        ...excelBorder(),
      },
      {
        value: item.value,
        backgroundColor: COLORS.white,
        textColor: COLORS.navy,
        fontWeight: "bold",
        fontSize: 13,
        align: "center",
        wrap: true,
        ...excelBorder(),
      },
    ]);

  return {
    sheet: "Dashboard",
    data: [
      [
        {
          value: title,
          columnSpan: width,
          backgroundColor: COLORS.navy,
          textColor: COLORS.white,
          fontWeight: "bold",
          fontSize: 19,
          align: rightToLeft ? "right" : "left",
          height: 36,
          ...excelBorder(),
        },
        ...Array.from({ length: width - 1 }, () => null),
      ],
      [
        {
          value: subtitle,
          columnSpan: width,
          backgroundColor: COLORS.softGold,
          textColor: COLORS.navy,
          fontWeight: "bold",
          align: rightToLeft ? "right" : "left",
          height: 24,
          ...excelBorder(),
        },
        ...Array.from({ length: width - 1 }, () => null),
      ],
      Array.from({ length: width }, () => null),
      row(safeKpis.slice(0, 3)),
      row(safeKpis.slice(3, 6)),
    ],
    columns: [
      { width: 20 }, { width: 16 }, { width: 20 },
      { width: 16 }, { width: 20 }, { width: 16 },
    ],
    rightToLeft,
    showGridLines: false,
    stickyRowsCount: 2,
    orientation: "landscape" as const,
    zoomScale: 0.95,
  };
}

export async function exportExcel({
  filename,
  title,
  subtitle,
  sheets,
  kpis = [],
  rightToLeft = true,
}: {
  filename: string;
  title: string;
  subtitle: string;
  sheets: ExportSheet[];
  kpis?: ExportKpi[];
  rightToLeft?: boolean;
}) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const validSheets = sheets.filter((sheet) => Array.isArray(sheet.rows));
  const names = uniqueSheetNames(validSheets);
  const workbook = [
    ...(kpis.length ? [buildDashboardSheet(title, subtitle, kpis, rightToLeft)] : []),
    ...validSheets.map((sheet, index) => buildSheet(sheet, names[index], rightToLeft)),
  ];

  if (!workbook.length) {
    workbook.push(buildSheet({ name: title, subtitle, rows: [] }, "Data", rightToLeft));
  }

  await writeExcelFile(workbook as never, {
    fontFamily: "Arial",
    fontSize: 10,
  }).toFile(`${safeName(filename)}.xlsx`);
}

const escapeHtml = (value: ExportValue) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function displayValue(value: ExportValue, locale: string) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString(locale);
  if (typeof value === "boolean") return value ? "✓" : "—";
  return String(value);
}

export async function exportPdf({
  filename,
  title,
  subtitle,
  sheets,
  kpis = [],
  language = "ar",
}: {
  filename: string;
  title: string;
  subtitle: string;
  sheets: ExportSheet[];
  kpis?: ExportKpi[];
  language?: "ar" | "en";
}) {
  const validSheets = sheets.filter((sheet) => Array.isArray(sheet.rows));
  const popup = window.open("", "_blank");
  if (!popup) {
    throw new Error(language === "ar"
      ? "المتصفح منع نافذة التصدير. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى."
      : "The browser blocked the export window. Allow pop-ups and try again.");
  }

  const rtl = language === "ar";
  const locale = rtl ? "ar-EG" : "en-GB";
  const generatedAt = new Date().toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const logoUrl = new URL("/stc-logo.png", window.location.origin).href;

  const maxColumns = validSheets.reduce(
    (max, sheet) => Math.max(max, Object.keys(sheet.rows[0] || {}).length),
    0,
  );
  const pageSize = maxColumns >= 10 ? "A3 landscape" : "A4 landscape";
  const fontSize = maxColumns >= 12 ? 6.8 : maxColumns >= 8 ? 7.7 : 9;

  const kpiHtml = kpis.length
    ? `<section class="kpis">${kpis.slice(0, 6).map((item) => `
      <article><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></article>
    `).join("")}</section>`
    : "";

  const sections = validSheets.map((sheet, sheetIndex) => {
    const rows = sheet.rows || [];
    const keys = Object.keys(rows[0] || {});
    const table = keys.length
      ? `
        <div class="table-shell">
          <table>
            <thead><tr>${keys.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  ${keys.map((key) => {
                    const value = displayValue(row[key], locale);
                    const tone = statusTone(row[key]);
                    return `<td class="tone-${tone}">${escapeHtml(value)}</td>`;
                  }).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>`
      : `<div class="empty">${rtl ? "لا توجد بيانات" : "No data"}</div>`;

    return `
      <section class="sheet ${sheetIndex > 0 ? "new-page" : ""}">
        <div class="section-title">
          <div>
            <span>STC CONTRACT FLOW</span>
            <h2>${escapeHtml(sheet.name)}</h2>
          </div>
          <small>${rows.length.toLocaleString(locale)} ${rtl ? "سجل" : "records"}</small>
        </div>
        ${table}
      </section>
    `;
  }).join("");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="${language}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)}</title>
<style>
@page { size: ${pageSize}; margin: 8mm 7mm 10mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: #fff; color: #253A55;
  font-family: Tahoma, Arial, "Segoe UI", sans-serif;
  -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
}
body { font-variant-numeric: tabular-nums; }
.print-root { width: 100%; }
.header {
  min-height: 82px; position: relative; display: flex; align-items: center;
  gap: 18px; margin-bottom: 9px; padding: 15px 18px 15px 96px; border-radius: 9px;
  background: #253A55 !important; color: #fff !important;
}
.header-copy { display: grid; gap: 3px; }
.header-logo {
  position: absolute; left: 18px; top: 50%; transform: translateY(-50%);
  width: 60px; height: 52px; display: grid; place-items: center;
  padding: 4px; border-radius: 9px; background: #fff !important;
}
.header-logo img {
  display: block; max-width: 100%; max-height: 100%; object-fit: contain;
}
.header .eyebrow { color: #F3B820 !important; font-size: 7px; font-weight: 800; letter-spacing: .7px; }
.header h1 { margin: 0; color: #fff !important; font-size: 18px; }
.header p { margin: 0; color: rgba(255,255,255,.76) !important; font-size: 7.5px; }

.kpis {
  display: grid; grid-template-columns: repeat(${Math.min(Math.max(kpis.length, 1), 6)}, minmax(0,1fr));
  gap: 7px; margin-bottom: 10px;
}
.kpis article {
  min-height: 50px; display: grid; gap: 3px; padding: 8px 10px;
  border: 1px solid #D8DEE6; border-radius: 7px; background: #fff;
}
.kpis span { color: #7B8797; font-size: 6.8px; }
.kpis strong { color: #253A55; font-size: 13px; }
.section-title {
  display: flex; align-items: end; justify-content: space-between; gap: 10px;
  margin: 0 0 5px; padding: 0 2px 5px; border-bottom: 2px solid #253A55;
  break-inside: avoid; page-break-inside: avoid;
}
.section-title span { color: #B07E00; font-size: 5.8px; font-weight: 800; letter-spacing: .5px; }
.section-title h2 { margin: 0; color: #253A55; font-size: 11px; }
.section-title small { color: #66758A; font-size: 6.7px; }
.table-shell { width: 100%; border: 1px solid #D8DEE6; border-radius: 6px; overflow: hidden; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${fontSize}px; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th {
  padding: 4px 3px; border: 1px solid #253A55; background: #253A55 !important;
  color: #fff !important; font-weight: 800; line-height: 1.4; text-align: center;
  vertical-align: middle; overflow-wrap: anywhere;
}
td {
  padding: 4px 3px; border: 1px solid #D8DEE6; background: #fff !important;
  color: #253A55 !important; line-height: 1.45; text-align: center;
  vertical-align: middle; overflow-wrap: anywhere;
}
tbody tr:nth-child(even) td { background: #F7F8FA !important; }
td.tone-success { background: #EAF7F0 !important; color: #1F8A5B !important; font-weight: 700; }
td.tone-warning { background: #FFF4CC !important; color: #9A6A00 !important; font-weight: 700; }
td.tone-danger { background: #FDECEC !important; color: #D64545 !important; font-weight: 700; }
.empty { padding: 28px; border: 1px dashed #B8C1CD; border-radius: 7px; text-align: center; color: #66758A; }
.new-page { break-before: page; page-break-before: always; }
.footer {
  margin-top: 7px; padding-top: 5px; border-top: 1px solid #D8DEE6;
  color: #7B8797; font-size: 6px; text-align: center;
}
@media screen {
  body { max-width: 1500px; margin: 0 auto; padding: 18px; background: #EEF1F4; }
  .print-root { padding: 14px; border-radius: 12px; background:#fff; box-shadow: 0 8px 30px rgba(37,58,85,.14); }
}
@media print {
  body, .print-root { width:100% !important; max-width:none !important; background:#fff !important; }
  .print-root { padding:0 !important; box-shadow:none !important; }
  thead { display: table-header-group !important; }
  tr, td, th { break-inside: avoid !important; page-break-inside: avoid !important; }
}
</style>
</head>
<body>
<main class="print-root">
  <header class="header">
    <div class="header-logo">
      <img src="${escapeHtml(logoUrl)}" alt="STC" />
    </div>
    <div class="header-copy">
      <span class="eyebrow">SPECIALIZED TRADING & CONSTRUCTION</span>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)} · ${escapeHtml(generatedAt)}</p>
    </div>
  </header>
  ${kpiHtml}
  ${sections}
  <footer class="footer">STC Contract Flow · ${escapeHtml(generatedAt)}</footer>
</main>
<script>
(() => {
  const runPrint = async () => {
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
    window.focus();
    window.print();
  };
  window.addEventListener("load", () => setTimeout(runPrint, 160));
  window.addEventListener("afterprint", () => setTimeout(() => window.close(), 200));
})();
<\/script>
</body>
</html>`);
  popup.document.close();
}
