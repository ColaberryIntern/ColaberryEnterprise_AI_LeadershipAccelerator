#!/usr/bin/env node
// Build the final-state expense audit XLSX + HTML visual report after the
// 2026-06-01 cancellation pass. Numbers an accountant would be proud of.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ExcelJS = require(path.resolve(__dirname, '../../../node_modules/exceljs'));

// All 37 expense line items + final disposition
const EXPENSES = [
  { exp: 'Exp#771', vendor: 'SYNTHFLOW AI', date: '2026-02-25', amount: 900.00, category: 'AI / Voice', disposition: 'KEEP', effective: '', notes: 'Voice AI platform for 972-992-1024.' },
  { exp: 'Exp#770', vendor: 'PEOPLE DATA LABS', date: '2026-02-26', amount: 420.00, category: 'Data / Enrichment', disposition: 'CANCELLED', effective: '2026-06-01', notes: 'Cancelled immediate.' },
  { exp: 'Exp#769', vendor: 'SECRETARY OF STATE', date: '2026-02-27', amount: 25.00, category: 'Legal / Filings', disposition: 'ONE-TIME', effective: '', notes: 'State filing fee, not a subscription.' },
  { exp: 'Exp#768', vendor: 'TEXAS SOS SVC', date: '2026-02-27', amount: 0.68, category: 'Legal / Filings', disposition: 'ONE-TIME', effective: '', notes: 'Service fee on SoS, one-off.' },
  { exp: 'Exp#767', vendor: 'OPENAI OPCO', date: '2026-02-27', amount: 53.13, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency, usage billed.' },
  { exp: 'Exp#766', vendor: 'BUBBLE GROUP', date: '2026-02-27', amount: 34.11, category: 'No-code platform', disposition: 'CANCELLED', effective: '2026-06-01', notes: 'Cancelled per Ali.' },
  { exp: 'Exp#765', vendor: 'GOOGLE SERVICES', date: '2026-03-01', amount: 53.73, category: 'Infra / Cloud', disposition: 'KEEP', effective: '', notes: 'Google Workspace + Cloud.' },
  { exp: 'Exp#764', vendor: 'OPENAI OPCO', date: '2026-03-03', amount: 53.13, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#762', vendor: 'FRESHR SAS', date: '2026-03-03', amount: 110.00, category: 'Email deliverability', disposition: 'KEEP', effective: '', notes: 'Email deliverability, kept per Ali.' },
  { exp: 'Exp#761', vendor: 'RELEVANCE AI', date: '2026-03-06', amount: 349.00, category: 'AI / Workflow', disposition: 'PENDING (CORA MIGRATION)', effective: '', notes: 'Gated by Cora migration (Kes, due 2026-06-17). Will save $349/mo when Cora is off Relevance.' },
  { exp: 'Exp#760', vendor: 'REFERRAL ROCK', date: '2026-03-07', amount: 50.00, category: 'Marketing / Referrals', disposition: 'CANCELLED', effective: '2026-06-08', notes: 'Account closed effective 2026-06-08.' },
  { exp: 'Exp#759', vendor: 'OPENAI OPCO', date: '2026-03-08', amount: 53.13, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#758', vendor: 'MICROSOFT', date: '2026-03-09', amount: 598.44, category: 'Infra / Cloud', disposition: 'KEEP', effective: '', notes: 'Microsoft 365 / Azure / dev tools.' },
  { exp: 'Exp#757', vendor: 'ANTHROPIC PBC', date: '2026-03-09', amount: 213.20, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Claude Code + API. Core to CB System.' },
  { exp: 'Exp#756', vendor: 'BENDING SPOONS', date: '2026-03-11', amount: 3179.23, category: 'Hardware', disposition: 'ONE-TIME', effective: '', notes: 'Laptop purchase. Not a subscription.' },
  { exp: 'Exp#755', vendor: 'OPENAI OPCO', date: '2026-03-12', amount: 48.15, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#754', vendor: 'BUBBLE GROUP', date: '2026-03-14', amount: 34.11, category: 'No-code platform', disposition: 'CANCELLED', effective: '2026-06-01', notes: '2nd Bubble line, same cancellation.' },
  { exp: 'Exp#753', vendor: 'BOOST MOBILE', date: '2026-03-14', amount: 15.00, category: 'Mobile / SIM', disposition: 'AMEX DISPUTE PENDING', effective: '', notes: 'Direct cancellation blocked, AMEX claim filed 2026-06-01. 30-60d to resolve.' },
  { exp: 'Exp#752', vendor: 'ZENLEADS (APOLLO.IO)', date: '2026-03-14', amount: 527.67, category: 'Sales / B2B data', disposition: 'KEEP', effective: '', notes: 'Apollo.io, active outbound use.' },
  { exp: 'Exp#751', vendor: 'ELEVENLABS', date: '2026-03-15', amount: 5.33, category: 'AI / Voice', disposition: 'KEEP', effective: '', notes: 'Voice AI, tiny cost.' },
  { exp: 'Exp#750', vendor: 'STACKBLITZ (BOLT.NEW)', date: '2026-03-15', amount: 200.00, category: 'AI / Dev tools', disposition: 'CANCELLED', effective: '2026-06-15', notes: 'Bolt.new Pro 200, cancelled per Ali.' },
  { exp: 'Exp#749', vendor: 'BEAUTIFUL SLIDES', date: '2026-03-15', amount: 153.50, category: 'AI / Presentation', disposition: 'CANCELLED', effective: '2026-06-01', notes: 'Beautiful.AI cancelled per Ali.' },
  { exp: 'Exp#748', vendor: 'PIPEDREAM', date: '2026-03-16', amount: 300.71, category: 'Workflow / Integration', disposition: 'CANCELLED', effective: '2026-06-16', notes: 'Pipedream cancelled per Ali.' },
  { exp: 'Exp#747', vendor: 'OPENAI OPCO', date: '2026-03-17', amount: 48.11, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#746', vendor: 'THINKRRAI', date: '2026-03-17', amount: 39.00, category: 'AI tool', disposition: 'CANCELLED', effective: '2026-06-17', notes: 'Cancelled per Ali.' },
  { exp: 'Exp#745', vendor: 'HIGGSFIELD', date: '2026-03-17', amount: 49.00, category: 'AI / Video', disposition: 'KEEP', effective: '', notes: 'Tied to viral video pipeline (Aleem).' },
  { exp: 'Exp#744', vendor: 'ALPHA VANTAGE', date: '2026-03-18', amount: 99.99, category: 'Finance data API', disposition: 'CONDITIONAL (SUNDAY DEMO)', effective: '', notes: 'Internship project (Sunday/AegisFX). Demo required by 2026-06-08, decision by 2026-06-15.' },
  { exp: 'Exp#743', vendor: 'COLABERRY', date: '2026-03-18', amount: 0.01, category: 'Internal', disposition: 'TEST CHARGE', effective: '', notes: 'Penny test (Stripe).' },
  { exp: 'Exp#742', vendor: 'COLABERRY', date: '2026-03-18', amount: 0.01, category: 'Internal', disposition: 'TEST CHARGE', effective: '', notes: 'Penny test.' },
  { exp: 'Exp#741', vendor: 'COLABERRY', date: '2026-03-18', amount: 0.01, category: 'Internal', disposition: 'TEST CHARGE', effective: '', notes: 'Penny test.' },
  { exp: 'Exp#740', vendor: 'MAILREACH', date: '2026-03-18', amount: 100.00, category: 'Email deliverability', disposition: 'CANCELLED', effective: '2026-06-01', notes: 'Cancelled per Ali. Freshr kept for now.' },
  { exp: 'Exp#739', vendor: 'OPENAI OPCO', date: '2026-03-19', amount: 47.82, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#738', vendor: 'HETZNER ONLINE GMBH', date: '2026-03-20', amount: 5.71, category: 'Infra / Hosting', disposition: 'KEEP', effective: '', notes: 'Prod VPS 95.216.199.47. Cannot cancel.' },
  { exp: 'Exp#737', vendor: 'UPTIMEROBOT', date: '2026-03-21', amount: 3.00, category: 'Monitoring', disposition: 'KEEP', effective: '', notes: 'Monitoring, $3/mo.' },
  { exp: 'Exp#736', vendor: 'OPENAI OPCO', date: '2026-03-22', amount: 48.90, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#734', vendor: 'OPENAI OPCO', date: '2026-03-24', amount: 47.84, category: 'AI / LLM', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#733', vendor: 'GITHUB', date: '2026-03-24', amount: 4.26, category: 'Dev tools', disposition: 'KEEP', effective: '', notes: 'Core dependency.' },
  { exp: 'Exp#730', vendor: 'NATS INC COFFEE (JM)', date: '2026-04-06', amount: 30.98, category: 'Meals', disposition: 'ONE-TIME', effective: '', notes: 'John McBride coffee meeting, one-off.' },
];

const CANCELLED = EXPENSES.filter((e) => e.disposition === 'CANCELLED');
const PENDING = EXPENSES.filter((e) => /PENDING|CONDITIONAL/.test(e.disposition));
const KEEP = EXPENSES.filter((e) => e.disposition === 'KEEP');
const ONE_TIME = EXPENSES.filter((e) => /ONE-TIME|TEST/.test(e.disposition));

const cancelledMonthly = CANCELLED.reduce((s, e) => s + e.amount, 0);
const pendingMonthly = PENDING.reduce((s, e) => s + e.amount, 0);
const keepMonthly = KEEP.reduce((s, e) => s + e.amount, 0);
const oneTimeTotal = ONE_TIME.reduce((s, e) => s + e.amount, 0);
const grandTotal = EXPENSES.reduce((s, e) => s + e.amount, 0);

// ============================================================================
// XLSX
// ============================================================================
async function buildXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ali Muwwakkil / CB System';
  wb.lastModifiedBy = 'CB System';
  wb.created = new Date();

  // Helper: style header row
  function styleHeader(ws, row, bg = 'FF1A365D') {
    const r = ws.getRow(row);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    r.alignment = { vertical: 'middle', horizontal: 'left' };
    r.height = 22;
  }
  function styleSubheader(ws, row, bg = 'FFE2E8F0') {
    const r = ws.getRow(row);
    r.font = { bold: true, color: { argb: 'FF1A365D' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  }
  function setBorder(ws, range) {
    for (const cell of ws.getCell(range).model || []) {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }
  }

  // === 1. Executive Summary ===
  const exec = wb.addWorksheet('Executive Summary', { properties: { tabColor: { argb: 'FF1A365D' } } });
  exec.getColumn('A').width = 50;
  exec.getColumn('B').width = 22;
  exec.getColumn('C').width = 22;
  exec.mergeCells('A1:C1');
  exec.getCell('A1').value = 'Colaberry Inc - Expense Audit & Cancellation Summary';
  exec.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF1A365D' } };
  exec.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
  exec.getRow(1).height = 32;
  exec.mergeCells('A2:C2');
  exec.getCell('A2').value = 'Payroll period ending 2026-05-08 + audit completed 2026-06-01';
  exec.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } };

  exec.addRow([]);
  exec.addRow(['Metric', 'Monthly $', 'Annualized $']);
  styleHeader(exec, exec.rowCount);
  exec.addRow(['Recurring subscriptions cancelled', cancelledMonthly, cancelledMonthly * 12]);
  exec.addRow(['Pending (AMEX dispute + Cora migration + Sunday demo)', pendingMonthly + 15, (pendingMonthly + 15) * 12]);
  exec.addRow(['Subscriptions kept (operational dependencies)', keepMonthly, keepMonthly * 12]);
  exec.addRow(['One-time charges (laptop, filings, test charges)', oneTimeTotal, '']);
  exec.addRow([]);
  exec.addRow(['Grand total - all 37 line items reviewed', grandTotal, '']);
  styleSubheader(exec, exec.rowCount);

  for (let r = 5; r <= 8; r++) {
    exec.getCell(`B${r}`).numFmt = '"$"#,##0.00';
    if (exec.getCell(`C${r}`).value) exec.getCell(`C${r}`).numFmt = '"$"#,##0.00';
  }
  exec.getCell(`B${exec.rowCount}`).numFmt = '"$"#,##0.00';

  // Highlight the cancellation row
  exec.getRow(5).font = { bold: true, color: { argb: 'FF166534' } };
  exec.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };

  exec.addRow([]);
  exec.addRow(['Key takeaways']);
  styleHeader(exec, exec.rowCount, 'FF1E40AF');
  exec.addRow([`${CANCELLED.length} subscriptions cancelled today, saving $${cancelledMonthly.toFixed(2)}/month ($${(cancelledMonthly * 12).toFixed(0)}/year).`]);
  exec.addRow(['Largest line item ($3,179) was a one-time laptop purchase, not a recurring subscription.']);
  exec.addRow(['Relevance AI ($349/mo) cancellation is gated by the Cora migration, due 2026-06-17.']);
  exec.addRow(['Boost Mobile ($15/mo) blocked via AMEX dispute (vendor would not process direct cancellation).']);
  exec.addRow(['Alpha Vantage ($100/mo) conditional on Sunday demo by 2026-06-08, decision by 2026-06-15.']);

  // === 2. Cancellations ===
  const cancel = wb.addWorksheet('Cancellations', { properties: { tabColor: { argb: 'FF15803D' } } });
  cancel.addRow(['Vendor', 'Monthly $', 'Effective date', 'Annualized savings', 'Category', 'Notes']);
  styleHeader(cancel, 1, 'FF15803D');
  for (const e of CANCELLED) {
    cancel.addRow([e.vendor, e.amount, e.effective, e.amount * 12, e.category, e.notes]);
  }
  cancel.addRow([]);
  cancel.addRow(['TOTAL CANCELLED', cancelledMonthly, '', cancelledMonthly * 12]);
  cancel.getRow(cancel.rowCount).font = { bold: true, color: { argb: 'FF15803D' } };
  cancel.getRow(cancel.rowCount).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  cancel.getColumn('A').width = 28;
  cancel.getColumn('B').width = 14;
  cancel.getColumn('C').width = 18;
  cancel.getColumn('D').width = 18;
  cancel.getColumn('E').width = 24;
  cancel.getColumn('F').width = 60;
  for (let r = 2; r <= cancel.rowCount; r++) {
    cancel.getCell(`B${r}`).numFmt = '"$"#,##0.00';
    cancel.getCell(`D${r}`).numFmt = '"$"#,##0.00';
  }
  cancel.views = [{ state: 'frozen', ySplit: 1 }];

  // === 3. Pending Decisions ===
  const pend = wb.addWorksheet('Pending Decisions', { properties: { tabColor: { argb: 'FFD97706' } } });
  pend.addRow(['Vendor', 'Monthly $', 'Status', 'Gate / decision', 'Owner', 'Decision deadline', 'Notes']);
  styleHeader(pend, 1, 'FFD97706');
  pend.addRow(['BOOST MOBILE', 15.00, 'AMEX dispute filed', 'AMEX rules', 'Ali', '~2026-07-30', 'Direct cancellation blocked; AMEX claim filed 2026-06-01.']);
  pend.addRow(['RELEVANCE AI', 349.00, 'Gated by Cora migration', 'Kes finishes Cora migration', 'Kes', '2026-06-17', 'Cora is the only remaining dependency on Relevance AI.']);
  pend.addRow(['ALPHA VANTAGE', 99.99, 'Conditional on Sunday demo', 'AegisFX project must justify spend', 'Ali (after Sunday demo)', '2026-06-15', 'Sunday must demo project by 2026-06-08.']);
  pend.addRow([]);
  pend.addRow(['POTENTIAL ADDITIONAL SAVINGS', 463.99, '', '', '', '', 'If all 3 land: +$5,567.88/year']);
  pend.getRow(pend.rowCount).font = { bold: true, color: { argb: 'FFD97706' } };
  pend.getRow(pend.rowCount).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
  pend.getColumn('A').width = 22;
  pend.getColumn('B').width = 14;
  pend.getColumn('C').width = 30;
  pend.getColumn('D').width = 36;
  pend.getColumn('E').width = 24;
  pend.getColumn('F').width = 18;
  pend.getColumn('G').width = 60;
  for (let r = 2; r <= pend.rowCount; r++) pend.getCell(`B${r}`).numFmt = '"$"#,##0.00';
  pend.views = [{ state: 'frozen', ySplit: 1 }];

  // === 4. Subscriptions Kept ===
  const kept = wb.addWorksheet('Subscriptions Kept', { properties: { tabColor: { argb: 'FF1E40AF' } } });
  kept.addRow(['Vendor', 'Monthly $', 'Category', 'Why we keep it']);
  styleHeader(kept, 1, 'FF1E40AF');
  // Group by vendor name to show OPENAI as one combined line
  const groupedKept = new Map();
  for (const e of KEEP) {
    if (!groupedKept.has(e.vendor)) groupedKept.set(e.vendor, { total: 0, count: 0, category: e.category, notes: e.notes });
    const g = groupedKept.get(e.vendor); g.total += e.amount; g.count++;
  }
  for (const [vendor, g] of [...groupedKept.entries()].sort((a, b) => b[1].total - a[1].total)) {
    kept.addRow([vendor + (g.count > 1 ? ` (${g.count} usage charges)` : ''), g.total, g.category, g.notes]);
  }
  kept.addRow([]);
  kept.addRow(['TOTAL KEPT', keepMonthly]);
  kept.getRow(kept.rowCount).font = { bold: true, color: { argb: 'FF1E40AF' } };
  kept.getRow(kept.rowCount).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
  kept.getColumn('A').width = 32;
  kept.getColumn('B').width = 16;
  kept.getColumn('C').width = 22;
  kept.getColumn('D').width = 60;
  for (let r = 2; r <= kept.rowCount; r++) kept.getCell(`B${r}`).numFmt = '"$"#,##0.00';
  kept.views = [{ state: 'frozen', ySplit: 1 }];

  // === 5. All Expenses (raw) ===
  const all = wb.addWorksheet('All 37 Expenses', { properties: { tabColor: { argb: 'FF64748B' } } });
  all.addRow(['Exp #', 'Vendor', 'Date', 'Amount', 'Category', 'Disposition', 'Effective', 'Notes']);
  styleHeader(all, 1, 'FF1A365D');
  for (const e of EXPENSES) {
    all.addRow([e.exp, e.vendor, e.date, e.amount, e.category, e.disposition, e.effective, e.notes]);
  }
  all.addRow([]);
  all.addRow(['GRAND TOTAL (all 37 line items)', '', '', grandTotal]);
  all.getRow(all.rowCount).font = { bold: true };
  all.getColumn('A').width = 10;
  all.getColumn('B').width = 26;
  all.getColumn('C').width = 12;
  all.getColumn('D').width = 14;
  all.getColumn('E').width = 22;
  all.getColumn('F').width = 30;
  all.getColumn('G').width = 14;
  all.getColumn('H').width = 60;
  for (let r = 2; r <= all.rowCount; r++) all.getCell(`D${r}`).numFmt = '"$"#,##0.00';
  // Highlight cancellation rows green, pending amber, one-time grey
  for (let r = 2; r <= EXPENSES.length + 1; r++) {
    const row = all.getRow(r);
    const disp = String(row.getCell(6).value || '');
    if (disp === 'CANCELLED') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    else if (/PENDING|CONDITIONAL/.test(disp)) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
    else if (/ONE-TIME|TEST/.test(disp)) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  }
  all.views = [{ state: 'frozen', ySplit: 1 }];

  const outPath = path.resolve(__dirname, '../../../tmp/expense-audit-final-2026-06-01.xlsx');
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

// ============================================================================
// HTML visual report
// ============================================================================
function buildHtmlReport() {
  // Compute donut data: by disposition
  const donutData = {
    'Cancelled': cancelledMonthly,
    'Pending': pendingMonthly + 15, // include Boost
    'Kept (operational)': keepMonthly,
  };
  const donutTotal = Object.values(donutData).reduce((a, b) => a + b, 0);

  const cancelRows = CANCELLED.sort((a, b) => b.amount - a.amount).map((e, i) => `
<tr>
  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569;font-weight:600">${i + 1}</td>
  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1a365d;font-weight:700">${e.vendor}</td>
  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569">${e.category}</td>
  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569">${e.effective || 'immediate'}</td>
  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#15803d;font-weight:800;text-align:right">$${e.amount.toFixed(2)}</td>
  <td style="padding:14px 18px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#15803d;font-weight:800;text-align:right">$${(e.amount * 12).toFixed(2)}</td>
</tr>`).join('');

  // Donut SVG
  let cumulative = 0;
  const colors = { 'Cancelled': '#15803d', 'Pending': '#d97706', 'Kept (operational)': '#1e40af' };
  const donutSegments = Object.entries(donutData).map(([label, val]) => {
    const startAngle = (cumulative / donutTotal) * 360;
    cumulative += val;
    const endAngle = (cumulative / donutTotal) * 360;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const startRad = (startAngle - 90) * Math.PI / 180;
    const endRad = (endAngle - 90) * Math.PI / 180;
    const x1 = 120 + 100 * Math.cos(startRad);
    const y1 = 120 + 100 * Math.sin(startRad);
    const x2 = 120 + 100 * Math.cos(endRad);
    const y2 = 120 + 100 * Math.sin(endRad);
    const pct = ((val / donutTotal) * 100).toFixed(1);
    return { label, val, pct, color: colors[label], path: `M 120 120 L ${x1.toFixed(2)} ${y1.toFixed(2)} A 100 100 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z` };
  });

  return `<!doctype html><html><head><meta charset="utf-8"><title>Colaberry Expense Audit - 2026-06-01</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a202c;line-height:1.55">

<div style="max-width:900px;margin:0 auto;background:white">

<!-- Hero -->
<div style="background:linear-gradient(135deg,#15803d 0%,#16a34a 100%);color:white;padding:48px 40px;text-align:center">
  <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#bbf7d0;font-weight:700">Expense Audit Result - 2026-06-01</div>
  <div style="font-size:64px;font-weight:900;margin-top:14px;line-height:1">$${cancelledMonthly.toFixed(2)}</div>
  <div style="font-size:14px;color:#dcfce7;margin-top:4px">monthly recurring savings already booked</div>
  <div style="font-size:28px;font-weight:700;margin-top:18px">~$${(cancelledMonthly * 12).toFixed(0)}/year</div>
  <div style="font-size:12px;color:#bbf7d0;margin-top:4px">${CANCELLED.length} subscriptions cancelled in one afternoon</div>
</div>

<!-- Story bar -->
<div style="background:#1c1917;color:white;padding:24px 40px;line-height:1.65">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#fbbf24;font-weight:700">For Ram</div>
  <p style="font-size:15px;color:#e2e8f0;margin:8px 0 0">
    Ram, here is the cleanup from the expense list you forwarded this morning. I went through all 37 line items, identified what was recurring vs one-time, what we still need vs what we do not, and cancelled what was cancellable. The single biggest line ($3,179 Bending Spoons) turned out to be a one-time laptop purchase, not a subscription, which made the audit a lot cleaner. Net of everything we cancelled and the items still in flight, we will be saving over $1,200 per month going forward.
  </p>
</div>

<!-- KPI cards -->
<div style="padding:30px 40px">
  <table cellpadding="0" cellspacing="0" style="width:100%">
    <tr>
      <td style="background:#dcfce7;padding:24px;border-radius:10px;width:31%;text-align:center;vertical-align:top">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#166534;font-weight:700">Cancelled</div>
        <div style="font-size:36px;font-weight:900;color:#15803d;margin-top:8px">${CANCELLED.length}</div>
        <div style="font-size:13px;color:#166534;margin-top:4px">subscriptions</div>
        <div style="font-size:18px;font-weight:800;color:#15803d;margin-top:10px">$${cancelledMonthly.toFixed(0)}/mo</div>
      </td>
      <td style="width:2%"></td>
      <td style="background:#fef3c7;padding:24px;border-radius:10px;width:31%;text-align:center;vertical-align:top">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#78350f;font-weight:700">Pending</div>
        <div style="font-size:36px;font-weight:900;color:#d97706;margin-top:8px">${PENDING.length + 1}</div>
        <div style="font-size:13px;color:#78350f;margin-top:4px">decisions in flight</div>
        <div style="font-size:18px;font-weight:800;color:#d97706;margin-top:10px">$${(pendingMonthly + 15).toFixed(0)}/mo</div>
      </td>
      <td style="width:2%"></td>
      <td style="background:#dbeafe;padding:24px;border-radius:10px;width:31%;text-align:center;vertical-align:top">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1e3a8a;font-weight:700">Kept</div>
        <div style="font-size:36px;font-weight:900;color:#1e40af;margin-top:8px">${groupedKeptUniqueCount()}</div>
        <div style="font-size:13px;color:#1e3a8a;margin-top:4px">core dependencies</div>
        <div style="font-size:18px;font-weight:800;color:#1e40af;margin-top:10px">$${keepMonthly.toFixed(0)}/mo</div>
      </td>
    </tr>
  </table>
</div>

<!-- Donut -->
<div style="padding:0 40px 30px">
  <h2 style="color:#1a365d;font-size:20px;margin:0 0 16px;border-bottom:2px solid #1a365d;padding-bottom:8px">Monthly subscription spend after the audit</h2>
  <table cellpadding="0" cellspacing="0" style="width:100%">
    <tr>
      <td style="width:280px;vertical-align:top;text-align:center">
        <svg width="240" height="240" viewBox="0 0 240 240" style="display:block;margin:0 auto">
          ${donutSegments.map((s) => `<path d="${s.path}" fill="${s.color}"/>`).join('')}
          <circle cx="120" cy="120" r="55" fill="white"/>
          <text x="120" y="113" text-anchor="middle" font-size="11" fill="#64748b" font-family="Arial">Total recurring</text>
          <text x="120" y="135" text-anchor="middle" font-size="20" font-weight="800" fill="#1a365d" font-family="Arial">$${donutTotal.toFixed(0)}</text>
          <text x="120" y="152" text-anchor="middle" font-size="10" fill="#64748b" font-family="Arial">/month</text>
        </svg>
      </td>
      <td style="vertical-align:top;padding-left:30px">
        <table cellpadding="0" cellspacing="0" style="width:100%">
          ${donutSegments.map((s) => `
          <tr>
            <td style="padding:8px 0">
              <span style="display:inline-block;width:14px;height:14px;background:${s.color};border-radius:3px;vertical-align:middle"></span>
              <span style="margin-left:10px;font-size:14px;font-weight:700;color:#1a365d">${s.label}</span>
            </td>
            <td style="padding:8px 0;text-align:right">
              <span style="font-size:14px;color:#475569">$${s.val.toFixed(2)}/mo</span>
              <span style="display:inline-block;margin-left:10px;font-size:12px;color:#94a3b8;min-width:50px">${s.pct}%</span>
            </td>
          </tr>`).join('')}
        </table>
        <div style="margin-top:16px;padding:14px 16px;background:#dcfce7;border-left:4px solid #15803d;border-radius:0 6px 6px 0">
          <div style="font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:1px;font-weight:700">Net result</div>
          <div style="font-size:14px;color:#14532d;margin-top:4px">Cancelled spend represents <strong>${((cancelledMonthly / donutTotal) * 100).toFixed(1)}%</strong> of pre-audit recurring subscriptions. Kept spend is all core (LLM API, hosting, M365, monitoring, sales data).</div>
        </div>
      </td>
    </tr>
  </table>
</div>

<!-- Cancellation table -->
<div style="padding:0 40px 30px">
  <h2 style="color:#1a365d;font-size:20px;margin:0 0 16px;border-bottom:2px solid #1a365d;padding-bottom:8px">${CANCELLED.length} cancellations - what saved how much</h2>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#1a365d;color:white">
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px;font-weight:700">#</th>
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px;font-weight:700">VENDOR</th>
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px;font-weight:700">CATEGORY</th>
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px;font-weight:700">EFFECTIVE</th>
        <th style="padding:14px 18px;text-align:right;font-size:11px;letter-spacing:1px;font-weight:700">SAVED / MO</th>
        <th style="padding:14px 18px;text-align:right;font-size:11px;letter-spacing:1px;font-weight:700">SAVED / YEAR</th>
      </tr>
    </thead>
    <tbody>${cancelRows}
      <tr style="background:#dcfce7">
        <td colspan="4" style="padding:18px;font-size:14px;font-weight:800;color:#15803d">TOTAL CANCELLED RECURRING</td>
        <td style="padding:18px;font-size:18px;font-weight:900;color:#15803d;text-align:right">$${cancelledMonthly.toFixed(2)}</td>
        <td style="padding:18px;font-size:18px;font-weight:900;color:#15803d;text-align:right">$${(cancelledMonthly * 12).toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Pending -->
<div style="padding:0 40px 30px">
  <h2 style="color:#1a365d;font-size:20px;margin:0 0 16px;border-bottom:2px solid #1a365d;padding-bottom:8px">Pending decisions - $464/mo still in play</h2>
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <thead>
      <tr style="background:#d97706;color:white">
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px">VENDOR</th>
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px">STATUS</th>
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px">DECISION GATE</th>
        <th style="padding:14px 18px;text-align:left;font-size:11px;letter-spacing:1px">DEADLINE</th>
        <th style="padding:14px 18px;text-align:right;font-size:11px;letter-spacing:1px">$/MO</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#fef3c7">
        <td style="padding:14px 18px;font-weight:700;color:#1a365d">RELEVANCE AI</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">Cora migration in progress</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">Kes ports Cora off Relevance AI</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">2026-06-17</td>
        <td style="padding:14px 18px;text-align:right;font-weight:800;color:#d97706">$349.00</td>
      </tr>
      <tr style="background:white">
        <td style="padding:14px 18px;font-weight:700;color:#1a365d">ALPHA VANTAGE</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">Conditional on Sunday demo</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">AegisFX project must justify spend</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">2026-06-15</td>
        <td style="padding:14px 18px;text-align:right;font-weight:800;color:#d97706">$99.99</td>
      </tr>
      <tr style="background:#fef3c7">
        <td style="padding:14px 18px;font-weight:700;color:#1a365d">BOOST MOBILE</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">AMEX dispute filed</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">Vendor blocked direct cancellation</td>
        <td style="padding:14px 18px;color:#475569;font-size:13px">~2026-07-30</td>
        <td style="padding:14px 18px;text-align:right;font-weight:800;color:#d97706">$15.00</td>
      </tr>
      <tr style="background:#fffbeb">
        <td colspan="4" style="padding:18px;font-size:14px;font-weight:800;color:#78350f">If all 3 pending land</td>
        <td style="padding:18px;font-size:16px;font-weight:900;color:#d97706;text-align:right">+$463.99/mo</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Footer -->
<div style="background:#1a365d;color:white;padding:28px 40px;text-align:center">
  <div style="font-size:12px;color:#cbd5e0">Full backup spreadsheet attached: expense-audit-final-2026-06-01.xlsx (5 tabs)</div>
  <div style="font-size:11px;color:#94a3b8;margin-top:6px">Audit conducted by Ali Muwwakkil 2026-06-01. Numbers reconciled against Durga Siralam expense list for payroll period ending 2026-05-08.</div>
</div>

</div>
</body></html>`;
}

function groupedKeptUniqueCount() {
  const u = new Set();
  for (const e of KEEP) u.add(e.vendor);
  return u.size;
}

(async () => {
  const xlsxPath = await buildXlsx();
  console.log('XLSX:', xlsxPath, fs.statSync(xlsxPath).size, 'bytes');
  const htmlPath = path.resolve(__dirname, '../../../tmp/expense-audit-final-2026-06-01.html');
  fs.writeFileSync(htmlPath, buildHtmlReport());
  console.log('HTML:', htmlPath, fs.statSync(htmlPath).size, 'bytes');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
