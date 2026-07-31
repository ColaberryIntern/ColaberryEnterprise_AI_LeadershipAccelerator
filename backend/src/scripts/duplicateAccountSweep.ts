/**
 * Scheduled backstop for the duplicate-account point-shadowing bug found
 * repeatedly by hand overnight 2026-07-30/31 (see duplicateAccountSweepService.ts
 * for the full root-cause writeup). Finds students whose real, active account
 * shows fewer points than a duplicate under the same email, and merges the
 * safe cases automatically.
 *
 * Runs inside the backend container (has direct DB access already, no
 * host/container env-bridging needed):
 *   docker exec accelerator-backend node dist/scripts/duplicateAccountSweep.js [--dry]
 *
 * Sends an email report ONLY when there is something to report (a merge, a
 * flagged case, or an error) -- silent on a clean run, so this does not add
 * to daily notification volume.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { sequelize } from '../config/database';
import { runDuplicateAccountSweep, SweepResult } from '../services/duplicateAccountSweepService';

const DRY = process.argv.includes('--dry');

function renderReport(result: SweepResult): { html: string; text: string } {
  const merged = result.merges.flatMap((m) =>
    m.merged.map((row) => ({
      name: m.name,
      email: m.email,
      shadowId: row.shadowId,
      pointsMoved: row.pointsMoved,
      creditsMoved: row.creditsMoved,
    })),
  );
  const flagged = result.merges.flatMap((m) => [
    ...m.flaggedCollision.map((id) => ({ name: m.name, email: m.email, shadowId: id, reason: 'event_key collision -- needs manual review' })),
    ...m.flaggedRealPayment.map((id) => ({ name: m.name, email: m.email, shadowId: id, reason: 'duplicate holds a real paid Subscription -- needs manual review' })),
  ]);
  const wouldMerge = DRY
    ? result.shadowed.map((s) => ({ name: s.name, email: s.email, winnerPoints: s.winnerPoints, shadowRows: s.shadowRows.map((r) => `${r.id} (${r.points}pts)`).join(', ') }))
    : [];

  const rows = (label: string, entries: any[], cols: string[]) =>
    entries.length === 0
      ? ''
      : `
    <h3>${label} (${entries.length})</h3>
    <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:16px">
      <tr>${cols.map((c) => `<th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 8px">${c}</th>`).join('')}</tr>
      ${entries.map((e) => `<tr>${cols.map((c) => `<td style="border-bottom:1px solid #eee;padding:4px 8px">${e[c] ?? ''}</td>`).join('')}</tr>`).join('')}
    </table>`;

  const html = `<div style="font-family:arial,sans-serif;font-size:14px;color:#2d3748">
<p>Duplicate-account point-shadowing sweep${DRY ? ' (DRY RUN, nothing written)' : ''}. Checked ${result.scanned} email(s) with multiple active enrollments.</p>
${rows(DRY ? 'Would merge' : 'Merged', DRY ? wouldMerge : merged, DRY ? ['name', 'email', 'winnerPoints', 'shadowRows'] : ['name', 'email', 'shadowId', 'pointsMoved', 'creditsMoved'])}
${rows('Needs manual review', flagged, ['name', 'email', 'shadowId', 'reason'])}
</div>`;

  const text = [
    `Duplicate-account point-shadowing sweep${DRY ? ' (DRY RUN)' : ''}. Checked ${result.scanned} email(s) with multiple active enrollments.`,
    DRY
      ? wouldMerge.length ? `\nWould merge (${wouldMerge.length}):\n` + wouldMerge.map((e) => `  ${e.name} <${e.email}> winner=${e.winnerPoints}pts, shadow=${e.shadowRows}`).join('\n') : ''
      : merged.length ? `\nMerged (${merged.length}):\n` + merged.map((e) => `  ${e.name} <${e.email}> +${e.pointsMoved}pts +${e.creditsMoved} credit rows (from ${e.shadowId})`).join('\n') : '',
    flagged.length ? `\nNeeds manual review (${flagged.length}):\n` + flagged.map((e) => `  ${e.name} <${e.email}> (${e.shadowId}) -- ${e.reason}`).join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { html, text };
}

async function sendReport(result: SweepResult): Promise<void> {
  if (!env.mandrillApiKey) {
    console.warn('[duplicateAccountSweep] MANDRILL_API_KEY not set, skipping email report');
    return;
  }
  const { html, text } = renderReport(result);
  const transport = nodemailer.createTransport({
    host: 'smtp.mandrillapp.com',
    port: 587,
    auth: { user: 'ali@colaberry.com', pass: env.mandrillApiKey },
  });
  const mergedCount = result.merges.reduce((n, m) => n + m.merged.length, 0);
  const flaggedCount = result.merges.reduce((n, m) => n + m.flaggedCollision.length + m.flaggedRealPayment.length, 0);
  await transport.sendMail({
    from: '"Colaberry Enterprise AI" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    subject: `[Duplicate Account Sweep] ${DRY ? result.shadowed.length + ' would merge' : mergedCount + ' merged'}, ${flaggedCount} need review${DRY ? ' (DRY RUN)' : ''}`,
    html,
    text,
    headers: { 'X-MC-Track': 'none' },
  });
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  const result = await runDuplicateAccountSweep({ dryRun: DRY });

  const mergedCount = result.merges.reduce((n, m) => n + m.merged.length, 0);
  const flaggedCount = result.merges.reduce((n, m) => n + m.flaggedCollision.length + m.flaggedRealPayment.length, 0);

  console.log(
    JSON.stringify({
      event: 'duplicate_account_sweep',
      dry_run: DRY,
      scanned: result.scanned,
      shadowed_found: result.shadowed.length,
      merged: mergedCount,
      flagged: flaggedCount,
    }),
  );

  const hasSomethingToReport = DRY ? result.shadowed.length > 0 : mergedCount > 0 || flaggedCount > 0;
  if (hasSomethingToReport) {
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
