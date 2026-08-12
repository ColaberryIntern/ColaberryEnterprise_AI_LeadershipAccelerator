/**
 * Scheduled backstop for the PaySimple side-channel reconciliation gap found
 * repeatedly by hand on 2026-07-30 (see paymentReconciliationService.ts for
 * the full root-cause writeup). Cross-references recent PaySimple payments
 * against enrollment records; high-confidence matches are reconciled
 * automatically, everything else is reported for a human to check.
 *
 * Runs inside the backend container (has direct DB + PaySimple credentials
 * already, no host/container env-bridging needed):
 *   docker exec accelerator-backend node dist/scripts/paymentReconciliationSweep.js [--dry] [--since-days=14]
 *
 * Sends an email report ONLY when there is something to report (an
 * auto-reconciliation, a flagged case, or an error) -- silent on a clean run,
 * so this does not add to daily notification volume.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { sequelize } from '../config/database';
import { runPaymentReconciliationSweep, ReconciliationResult } from '../services/paymentReconciliationService';

const DRY = process.argv.includes('--dry');
const sinceDaysArg = process.argv.find((a) => a.startsWith('--since-days='));
const SINCE_DAYS = sinceDaysArg ? parseInt(sinceDaysArg.split('=')[1], 10) : 14;

function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDate(d: string | undefined): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 16).replace('T', ' ');
}

function renderReport(result: ReconciliationResult): { html: string; text: string } {
  const rows = (label: string, entries: any[], cols: string[]) => entries.length === 0 ? '' : `
    <h3>${label} (${entries.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:16px">
      <tr>${cols.map((c) => `<th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px">${c}</th>`).join('')}</tr>
      ${entries.map((e) => `<tr>${cols.map((c) => `<td style="border-bottom:1px solid #eee;padding:4px 8px">${e[c] ?? ''}</td>`).join('')}</tr>`).join('')}
    </table>`;

  const auto = result.autoReconciled.map((e) => ({
    name: e.name, email: e.email, amount: fmtMoney(e.amount), paymentId: e.paymentId, paymentDate: fmtDate(e.paymentDate), matchType: e.matchType,
  }));
  const flagged = result.flagged.map((e) => ({
    name: e.name, email: e.email || '(no email)', amount: fmtMoney(e.amount), status: e.status, paymentDate: fmtDate(e.paymentDate), reason: e.reason,
  }));
  const errors = result.errors.map((e) => ({ paymentId: e.paymentId, message: e.message }));

  const html = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748">
<p>Payment reconciliation sweep${DRY ? ' (DRY RUN, nothing written)' : ''}. Scanned ${result.scanned} PaySimple payment(s) from the last ${SINCE_DAYS} days.</p>
${rows(DRY ? 'Would auto-reconcile' : 'Auto-reconciled', auto, ['name', 'email', 'amount', 'paymentId', 'paymentDate', 'matchType'])}
${rows('Needs manual review', flagged, ['name', 'email', 'amount', 'status', 'paymentDate', 'reason'])}
${rows('Errors', errors, ['paymentId', 'message'])}
</div>`;

  const text = [
    `Payment reconciliation sweep${DRY ? ' (DRY RUN)' : ''}. Scanned ${result.scanned} payments, last ${SINCE_DAYS} days.`,
    auto.length ? `\n${DRY ? 'Would auto-reconcile' : 'Auto-reconciled'} (${auto.length}):\n` + auto.map((e) => `  ${e.name} <${e.email}> ${e.amount} (payment ${e.paymentId}, ${e.matchType})`).join('\n') : '',
    flagged.length ? `\nNeeds manual review (${flagged.length}):\n` + flagged.map((e) => `  ${e.name} <${e.email}> ${e.amount} [${e.status}] -- ${e.reason}`).join('\n') : '',
    errors.length ? `\nErrors (${errors.length}):\n` + errors.map((e) => `  payment ${e.paymentId}: ${e.message}`).join('\n') : '',
  ].filter(Boolean).join('\n');

  return { html, text };
}

async function sendReport(result: ReconciliationResult): Promise<void> {
  if (!env.mandrillApiKey) {
    console.warn('[paymentReconciliationSweep] MANDRILL_API_KEY not set, skipping email report');
    return;
  }
  const { html, text } = renderReport(result);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: 'ali@colaberry.com', pass: env.mandrillApiKey },
  });
  await transport.sendMail({
    from: '"Colaberry Enterprise AI" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    subject: `[Payment Reconciliation] ${result.autoReconciled.length} reconciled, ${result.flagged.length} need review${DRY ? ' (DRY RUN)' : ''}`,
    html,
    text,
    headers: { 'X-MC-Track': 'none' },
  });
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  const result = await runPaymentReconciliationSweep({ sinceDays: SINCE_DAYS, dryRun: DRY });

  console.log(JSON.stringify({
    event: 'payment_reconciliation_sweep',
    dry_run: DRY,
    since_days: SINCE_DAYS,
    scanned: result.scanned,
    auto_reconciled: result.autoReconciled.length,
    flagged: result.flagged.length,
    errors: result.errors.length,
  }));

  const hasAnythingToReport = result.autoReconciled.length > 0 || result.flagged.length > 0 || result.errors.length > 0;
  if (hasAnythingToReport) {
    await sendReport(result);
  }
}

main()
  .then(async () => { await sequelize.close(); process.exit(0); })
  .catch(async (err: unknown) => {
    console.error('FATAL:', err instanceof Error ? err.message : err);
    try { await sequelize.close(); } catch { /* connection may already be gone */ }
    process.exit(1);
  });
