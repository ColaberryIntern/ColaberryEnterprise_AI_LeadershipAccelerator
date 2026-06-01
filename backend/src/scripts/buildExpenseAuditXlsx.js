#!/usr/bin/env node
// One-off: build the expense-audit XLSX for the May 8 2026 payroll period
// and post it to Basecamp as a new todo in Ali Personal / AI Products
// with the file linked. Reference: Ram's email 2026-06-01 forwarding
// Durga's payroll-period expense list.
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const ExcelJS = require(path.resolve(__dirname, '../../../node_modules/exceljs'));

const EXPENSES = [
  { exp: 'Exp#771', vendor: 'SYNTHFLOW AI', date: '2026-02-25', amount: 900.00, employee: 'Ali Muwwakkil', category: 'AI / Voice', subscriptionType: 'Likely subscription', notes: 'Voice AI platform - tied to 972-992-1024 setup. Track A1 work referenced.' },
  { exp: 'Exp#770', vendor: 'PEOPLE DATA LABS', date: '2026-02-26', amount: 420.00, employee: 'Ali Muwwakkil', category: 'Data / Enrichment', subscriptionType: 'Subscription', notes: 'CANCELLED 2026-06-01 per Ali.', actionStatus: 'CANCELLED' },
  { exp: 'Exp#769', vendor: 'SECRETARY OF STATE', date: '2026-02-27', amount: 25.00, employee: 'Ali Muwwakkil', category: 'Legal / Filings', subscriptionType: 'One-time fee', notes: 'State filing - one-off, not a subscription.' },
  { exp: 'Exp#768', vendor: 'TEXAS SOS SVC', date: '2026-02-27', amount: 0.68, employee: 'Ali Muwwakkil', category: 'Legal / Filings', subscriptionType: 'One-time fee', notes: 'Service fee on SoS filing - one-off.' },
  { exp: 'Exp#767', vendor: 'OPENAI OPCO', date: '2026-02-27', amount: 53.13, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage charge. Keep (core dependency for CB drafts).' },
  { exp: 'Exp#766', vendor: 'BUBBLE GROUP', date: '2026-02-27', amount: 34.11, employee: 'Ali Muwwakkil', category: 'No-code platform', subscriptionType: 'Subscription', notes: 'Bubble no-code. Confirm if still in active use.' },
  { exp: 'Exp#765', vendor: 'GOOGLE SERVICES', date: '2026-03-01', amount: 53.73, employee: 'Ali Muwwakkil', category: 'Infra / Cloud', subscriptionType: 'Subscription', notes: 'Google Workspace or Cloud services. Confirm which account.' },
  { exp: 'Exp#764', vendor: 'OPENAI OPCO', date: '2026-03-03', amount: 53.13, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#762', vendor: 'FRESHR SAS', date: '2026-03-03', amount: 110.00, employee: 'Ali Muwwakkil', category: 'Email deliverability', subscriptionType: 'Subscription', notes: 'Freshr email warmup / deliverability. Tied to outbound campaigns - confirm if still active.' },
  { exp: 'Exp#761', vendor: 'RELEVANCE AI', date: '2026-03-06', amount: 349.00, employee: 'Ali Muwwakkil', category: 'AI / Workflow', subscriptionType: 'Subscription', notes: 'Relevance AI - agent platform. Confirm if we have replaced with Claude Code workflow.' },
  { exp: 'Exp#760', vendor: 'REFERRAL ROCK', date: '2026-03-07', amount: 50.00, employee: 'Ali Muwwakkil', category: 'Marketing / Referrals', subscriptionType: 'Subscription', notes: 'Referral Rock. Confirm if active program exists.' },
  { exp: 'Exp#759', vendor: 'OPENAI OPCO', date: '2026-03-08', amount: 53.13, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#758', vendor: 'MICROSOFT', date: '2026-03-09', amount: 598.44, employee: 'Ali Muwwakkil', category: 'Infra / Cloud', subscriptionType: 'Subscription', notes: 'Microsoft - confirm M365 / Azure / dev tools. Largest non-Bending-Spoons line item to validate.' },
  { exp: 'Exp#757', vendor: 'ANTHROPIC PBC', date: '2026-03-09', amount: 213.20, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Subscription / API', notes: 'Anthropic - Claude Code + API. CORE keep. Cannot cancel.' },
  { exp: 'Exp#756', vendor: 'BENDING SPOONS', date: '2026-03-11', amount: 3179.23, employee: 'Ali Muwwakkil', category: 'Software (catch-all)', subscriptionType: 'Subscription', notes: 'LARGEST line item ($3,179). Bending Spoons owns Evernote, Meetup, Remini, WeTransfer. Verify which product + active use.' },
  { exp: 'Exp#755', vendor: 'OPENAI OPCO', date: '2026-03-12', amount: 48.15, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#754', vendor: 'BUBBLE GROUP', date: '2026-03-14', amount: 34.11, employee: 'Ali Muwwakkil', category: 'No-code platform', subscriptionType: 'Subscription', notes: 'Bubble (2nd month). Same review as Exp#766.' },
  { exp: 'Exp#753', vendor: 'BOOST MOBILE', date: '2026-03-14', amount: 15.00, employee: 'Ali Muwwakkil', category: 'Mobile / SIM', subscriptionType: 'Subscription', notes: 'Boost Mobile prepaid. Confirm if needed (separate line for client work?).' },
  { exp: 'Exp#752', vendor: 'ZENLEADS', date: '2026-03-14', amount: 527.67, employee: 'Ali Muwwakkil', category: 'Sales / B2B data', subscriptionType: 'Subscription', notes: 'Zenleads (Apollo competitor). Confirm if still in active outbound use.' },
  { exp: 'Exp#751', vendor: 'ELEVENLABS', date: '2026-03-15', amount: 5.33, employee: 'Ali Muwwakkil', category: 'AI / Voice', subscriptionType: 'Subscription', notes: 'ElevenLabs voice. Tiny charge - keep or cancel low impact.' },
  { exp: 'Exp#750', vendor: 'STACKBLITZ', date: '2026-03-15', amount: 200.00, employee: 'Ali Muwwakkil', category: 'Dev tools', subscriptionType: 'Subscription', notes: 'StackBlitz cloud IDE. Confirm if Tejesh/Kes still uses or shifted to Claude Code locally.' },
  { exp: 'Exp#749', vendor: 'BEAUTIFUL SLIDES', date: '2026-03-15', amount: 153.50, employee: 'Ali Muwwakkil', category: 'AI / Presentation', subscriptionType: 'Subscription', notes: 'Beautiful.AI slides. Confirm if used for client decks.' },
  { exp: 'Exp#748', vendor: 'PIPEDREAM', date: '2026-03-16', amount: 300.71, employee: 'Ali Muwwakkil', category: 'Workflow / Integration', subscriptionType: 'Subscription', notes: 'Pipedream workflow automation. Confirm if replaced by GHL or Claude Code.' },
  { exp: 'Exp#747', vendor: 'OPENAI OPCO', date: '2026-03-17', amount: 48.11, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#746', vendor: 'THINKRRAI', date: '2026-03-17', amount: 39.00, employee: 'Ali Muwwakkil', category: 'AI tool', subscriptionType: 'Subscription', notes: 'Thinkr AI. Confirm what it does + if active.' },
  { exp: 'Exp#745', vendor: 'HIGGSFIELD', date: '2026-03-17', amount: 49.00, employee: 'Ali Muwwakkil', category: 'AI / Video', subscriptionType: 'Subscription', notes: 'Higgsfield - AI video generator. Tied to viral video pipeline? Confirm.' },
  { exp: 'Exp#744', vendor: 'ALPHA VANTAGE', date: '2026-03-18', amount: 99.99, employee: 'Ali Muwwakkil', category: 'Finance data API', subscriptionType: 'Subscription', notes: 'Alpha Vantage stock/finance API. Confirm if any project still consumes.' },
  { exp: 'Exp#743', vendor: 'COLABERRY', date: '2026-03-18', amount: 0.01, employee: 'Ali Muwwakkil', category: 'Internal', subscriptionType: 'Test charge', notes: 'Penny test charge - safe to ignore (Stripe verify).' },
  { exp: 'Exp#742', vendor: 'COLABERRY', date: '2026-03-18', amount: 0.01, employee: 'Ali Muwwakkil', category: 'Internal', subscriptionType: 'Test charge', notes: 'Penny test charge.' },
  { exp: 'Exp#741', vendor: 'COLABERRY', date: '2026-03-18', amount: 0.01, employee: 'Ali Muwwakkil', category: 'Internal', subscriptionType: 'Test charge', notes: 'Penny test charge.' },
  { exp: 'Exp#740', vendor: 'MAILREACH', date: '2026-03-18', amount: 100.00, employee: 'Ali Muwwakkil', category: 'Email deliverability', subscriptionType: 'Subscription', notes: 'MailReach warmup. Confirm if still active (vs Freshr).' },
  { exp: 'Exp#739', vendor: 'OPENAI OPCO', date: '2026-03-19', amount: 47.82, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#738', vendor: 'HETZNER ONLINE GMBH', date: '2026-03-20', amount: 5.71, employee: 'Ali Muwwakkil', category: 'Infra / Hosting', subscriptionType: 'Subscription', notes: 'Hetzner VPS. THIS IS PROD - cannot cancel. Hosts 95.216.199.47 (accelerator stack).' },
  { exp: 'Exp#737', vendor: 'UPTIMEROBOT', date: '2026-03-21', amount: 3.00, employee: 'Ali Muwwakkil', category: 'Monitoring', subscriptionType: 'Subscription', notes: 'UptimeRobot. Keep - critical monitoring, tiny cost.' },
  { exp: 'Exp#736', vendor: 'OPENAI OPCO', date: '2026-03-22', amount: 48.90, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#734', vendor: 'OPENAI OPCO', date: '2026-03-24', amount: 47.84, employee: 'Ali Muwwakkil', category: 'AI / LLM', subscriptionType: 'Usage / API', notes: 'OpenAI API - usage. Keep.' },
  { exp: 'Exp#733', vendor: 'GITHUB', date: '2026-03-24', amount: 4.26, employee: 'Ali Muwwakkil', category: 'Dev tools', subscriptionType: 'Subscription', notes: 'GitHub. Keep - core dependency.' },
  { exp: 'Exp#730', vendor: "Nats Inc Coffee", date: '2026-04-06', amount: 30.98, employee: 'John McBride', category: 'Meals / Coffee', subscriptionType: 'One-time', notes: 'Coffee meeting - one-off, not a subscription. JM expense.' },
];

(async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CB System';
  wb.created = new Date();

  // --- Summary sheet ---
  const summary = wb.addWorksheet('Summary');
  summary.addRow(['Expense Audit - Payroll Period Ending 2026-05-08']);
  summary.addRow(['Source: Ram email 2026-06-01 forwarding Durga Siralam expense list']);
  summary.addRow(['Audit generated: ' + new Date().toISOString().slice(0, 10)]);
  summary.addRow([]);
  const aliExpenses = EXPENSES.filter((e) => e.employee === 'Ali Muwwakkil');
  const aliTotal = aliExpenses.reduce((s, e) => s + e.amount, 0);
  const otherTotal = EXPENSES.filter((e) => e.employee !== 'Ali Muwwakkil').reduce((s, e) => s + e.amount, 0);
  summary.addRow(['Totals']);
  summary.addRow(['Ali (Alimayu Muwwakkil)', aliExpenses.length + ' line items', aliTotal.toFixed(2)]);
  summary.addRow(['Other (John McBride)', '1 line item', otherTotal.toFixed(2)]);
  summary.addRow(['Grand total', EXPENSES.length + ' line items', (aliTotal + otherTotal).toFixed(2)]);
  summary.addRow([]);
  summary.addRow(['Subscription review buckets']);
  const byCategory = new Map();
  for (const e of EXPENSES) {
    const k = e.category;
    if (!byCategory.has(k)) byCategory.set(k, { count: 0, total: 0 });
    const v = byCategory.get(k); v.count++; v.total += e.amount;
  }
  summary.addRow(['Category', 'Count', 'Total']);
  for (const [k, v] of [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total)) {
    summary.addRow([k, v.count, v.total.toFixed(2)]);
  }
  summary.addRow([]);
  summary.addRow(['Already cancelled (per Ali 2026-06-01)']);
  for (const e of EXPENSES.filter((x) => x.actionStatus === 'CANCELLED')) {
    summary.addRow([e.vendor, e.exp, '$' + e.amount.toFixed(2)]);
  }
  summary.addRow([]);
  summary.addRow(['Top 5 highest-amount line items (review priority)']);
  summary.addRow(['Vendor', 'Exp#', 'Amount', 'Category', 'Notes']);
  for (const e of [...EXPENSES].sort((a, b) => b.amount - a.amount).slice(0, 5)) {
    summary.addRow([e.vendor, e.exp, '$' + e.amount.toFixed(2), e.category, e.notes]);
  }
  // Style header rows
  for (const rowNum of [1, 5, 9, 11, 15, 18]) {
    const r = summary.getRow(rowNum);
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
  }
  summary.columns.forEach((c) => { c.width = 28; });
  summary.getColumn(5).width = 80;

  // --- Detail sheet ---
  const detail = wb.addWorksheet('All expenses');
  detail.addRow(['Vendor', 'Exp ID', 'Date', 'Amount', 'Employee', 'Category', 'Subscription type', 'Action (Ali fills in)', 'Action status', 'CB notes']);
  for (const e of EXPENSES) {
    detail.addRow([e.vendor, e.exp, e.date, e.amount, e.employee, e.category, e.subscriptionType, e.actionStatus || '', e.actionStatus || 'Open', e.notes]);
  }
  const head = detail.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
  detail.columns.forEach((col, i) => {
    let maxLen = 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = (cell.value || '').toString().length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 2, i === 9 ? 80 : 40);
  });
  // Highlight already-cancelled rows
  for (let r = 2; r <= EXPENSES.length + 1; r++) {
    const row = detail.getRow(r);
    if (row.getCell(9).value === 'CANCELLED') {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
    }
  }
  // Format amount column as currency
  for (let r = 2; r <= EXPENSES.length + 1; r++) {
    detail.getRow(r).getCell(4).numFmt = '"$"#,##0.00';
  }

  // --- Cancel candidates sheet (the action list Ali will work from) ---
  const candidates = wb.addWorksheet('Cancel candidates');
  candidates.addRow(['Vendor', 'Monthly amount', 'Why on this list', 'Action for Ali', 'Result']);
  const candidatesData = [
    { v: 'PEOPLE DATA LABS', amt: 420.00, why: 'Already cancelled per Ali 2026-06-01.', action: 'No action - already done.', result: 'CANCELLED 2026-06-01' },
    { v: 'BENDING SPOONS', amt: 3179.23, why: 'Largest non-API line item. Bending Spoons owns multiple apps - verify which product, who uses it, ROI.', action: 'Identify the product. Cancel if unclear value.', result: '' },
    { v: 'ZENLEADS', amt: 527.67, why: 'B2B sales data. We are not running outbound prospecting at this scale.', action: 'Confirm with Sohail / Roselen. Cancel if dormant.', result: '' },
    { v: 'RELEVANCE AI', amt: 349.00, why: 'Agent platform. Likely overlaps with Claude Code workflow we built.', action: 'Cancel if no active agent depends on it.', result: '' },
    { v: 'PIPEDREAM', amt: 300.71, why: 'Workflow automation. Overlaps with GHL + our cron jobs.', action: 'Audit active Pipedream workflows. Cancel if migrated.', result: '' },
    { v: 'STACKBLITZ', amt: 200.00, why: 'Cloud IDE. We mostly use Claude Code + local dev.', action: 'Confirm no team member needs it. Cancel.', result: '' },
    { v: 'BEAUTIFUL SLIDES', amt: 153.50, why: 'AI slides tool. Confirm last use.', action: 'Cancel if no client decks shipped from it this quarter.', result: '' },
    { v: 'FRESHR SAS', amt: 110.00, why: 'Email deliverability. MailReach also charged $100 - probable duplicate function.', action: 'Pick one (Freshr or MailReach), cancel the other.', result: '' },
    { v: 'MAILREACH', amt: 100.00, why: 'Email warmup. Duplicate of Freshr.', action: 'Pick one (Freshr or MailReach), cancel the other.', result: '' },
    { v: 'ALPHA VANTAGE', amt: 99.99, why: 'Finance API. Unlikely active dependency.', action: 'Confirm no client project depends. Cancel.', result: '' },
    { v: 'REFERRAL ROCK', amt: 50.00, why: 'Referral marketing tool. No active program.', action: 'Cancel.', result: '' },
    { v: 'HIGGSFIELD', amt: 49.00, why: 'AI video. May feed viral video pipeline (Aleem).', action: 'Confirm Aleem uses. Keep if yes, cancel if no.', result: '' },
    { v: 'THINKRRAI', amt: 39.00, why: 'AI tool, unclear function.', action: 'Identify use case. Likely cancel.', result: '' },
    { v: 'BUBBLE GROUP', amt: 68.22, why: 'No-code platform charged twice in March ($34.11 x 2). Likely subscription per project.', action: 'Identify which Bubble app(s) are live. Cancel idle ones.', result: '' },
    { v: 'BOOST MOBILE', amt: 15.00, why: 'Prepaid SIM. Probably tied to a specific test/dev phone.', action: 'Confirm purpose. Cancel if not needed.', result: '' },
  ];
  for (const c of candidatesData) {
    candidates.addRow([c.v, c.amt, c.why, c.action, c.result]);
  }
  const candHead = candidates.getRow(1);
  candHead.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  candHead.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
  candidates.getColumn(1).width = 24;
  candidates.getColumn(2).width = 16;
  candidates.getColumn(3).width = 60;
  candidates.getColumn(4).width = 50;
  candidates.getColumn(5).width = 30;
  for (let r = 2; r <= candidatesData.length + 1; r++) {
    candidates.getRow(r).getCell(2).numFmt = '"$"#,##0.00';
  }
  // Total at bottom
  const totalCancelable = candidatesData.filter((c) => c.result !== 'CANCELLED 2026-06-01').reduce((s, c) => s + c.amt, 0);
  const totalAlready = candidatesData.filter((c) => c.result === 'CANCELLED 2026-06-01').reduce((s, c) => s + c.amt, 0);
  candidates.addRow([]);
  candidates.addRow(['Already cancelled', totalAlready.toFixed(2)]);
  candidates.addRow(['Potential additional monthly savings if all cancelled', totalCancelable.toFixed(2)]);
  candidates.getRow(candidates.rowCount).font = { bold: true };
  candidates.getRow(candidates.rowCount - 1).font = { bold: true, color: { argb: 'FF166534' } };

  // --- Keep / cannot cancel sheet ---
  const keep = wb.addWorksheet('Must keep (core)');
  keep.addRow(['Vendor', 'Why we keep it']);
  const keepData = [
    ['HETZNER ONLINE GMBH', 'Hosts the production VPS (95.216.199.47) running the accelerator stack. Cancel = lose everything.'],
    ['ANTHROPIC PBC', 'Claude Code + Anthropic API. Core to CB System and every AI task it executes.'],
    ['OPENAI OPCO', 'gpt-4o powers daily exec summary + task generator + auto-runner deliverables. Usage-billed.'],
    ['GITHUB', 'Source of truth for code. Cheap + critical.'],
    ['UPTIMEROBOT', 'Monitoring. $3/mo. Keep.'],
    ['MICROSOFT', 'Verify: M365 mailbox / Azure / GitHub Copilot? If just mailbox, evaluate consolidation.'],
    ['GOOGLE SERVICES', 'Verify: Workspace mailbox / Cloud bills? If just mailbox we already have Gmail.'],
    ['SECRETARY OF STATE + TEXAS SOS SVC', 'One-time legal filings, not a subscription.'],
  ];
  for (const k of keepData) keep.addRow(k);
  keep.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  keep.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } };
  keep.getColumn(1).width = 32;
  keep.getColumn(2).width = 80;

  const outPath = path.resolve(__dirname, '../../../tmp/expense-audit-2026-05-08-payroll.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log('XLSX written:', outPath, fs.statSync(outPath).size, 'bytes');
})().catch((e) => { console.error('FAIL:', e.stack || e.message); process.exit(1); });
