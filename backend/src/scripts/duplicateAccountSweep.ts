/**
 * Scheduled backstop for the duplicate-account bugs found repeatedly by hand
 * overnight 2026-07-30/31 (see duplicateAccountSweepService.ts for the full
 * root-cause writeup). Runs two independent detectors: students whose real,
 * active account shows fewer points than a duplicate under the same email
 * (point shadowing), and students with an active duplicate in a *different*
 * cohort, which silently fails live-session check-in regardless of points
 * (Britiana Akhile and 4 others). Merges the safe cases automatically and
 * corrects attendance history when the pattern is unambiguous.
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

  const crossCohortMerged = result.crossCohortMerges.flatMap((m) =>
    m.merged.map((row) => ({ name: m.name, email: m.email, dupeId: row.dupeId, pointsMoved: row.pointsMoved, creditsMoved: row.creditsMoved })),
  );
  const crossCohortAttendance = result.crossCohortMerges
    .filter((m) => m.attendanceCorrected > 0)
    .map((m) => ({ name: m.name, email: m.email, sessionsExcused: m.attendanceCorrected }));
  const crossCohortFlagged = result.crossCohortMerges.flatMap((m) => [
    ...m.flaggedCollision.map((id) => ({ name: m.name, email: m.email, dupeId: id, reason: 'event_key collision -- needs manual review' })),
    ...m.flaggedRealPayment.map((id) => ({ name: m.name, email: m.email, dupeId: id, reason: 'duplicate holds a real paid Subscription -- needs manual review' })),
    ...m.flaggedStaffAccount.map((id) => ({ name: m.name, email: m.email, dupeId: id, reason: 'a non-winning row is a real staff/admin account -- entire email skipped, needs a manual decision' })),
    ...(m.attendanceFlaggedForReview > 0
      ? [{ name: m.name, email: m.email, dupeId: '(attendance)', reason: `${m.attendanceFlaggedForReview} absent session(s) left uncorrected -- mixed history, ask the student before excusing` }]
      : []),
  ]);
  const wouldMergeCrossCohort = DRY
    ? result.crossCohort.map((c) => ({ name: c.name, email: c.email, otherRows: c.otherRows.map((r) => `${r.id} (cohort ${r.cohortId})`).join(', ') }))
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
<p>Duplicate-account sweep${DRY ? ' (DRY RUN, nothing written)' : ''}. Checked ${result.scanned} email(s) with multiple active enrollments.</p>
<h2 style="font-size:15px;margin-top:20px">Point shadowing</h2>
${rows(DRY ? 'Would merge' : 'Merged', DRY ? wouldMerge : merged, DRY ? ['name', 'email', 'winnerPoints', 'shadowRows'] : ['name', 'email', 'shadowId', 'pointsMoved', 'creditsMoved'])}
${rows('Needs manual review', flagged, ['name', 'email', 'shadowId', 'reason'])}
<h2 style="font-size:15px;margin-top:20px">Cross-cohort (check-in failure risk)</h2>
${rows(DRY ? 'Would merge' : 'Merged', DRY ? wouldMergeCrossCohort : crossCohortMerged, DRY ? ['name', 'email', 'otherRows'] : ['name', 'email', 'dupeId', 'pointsMoved', 'creditsMoved'])}
${rows('Attendance corrected to excused', crossCohortAttendance, ['name', 'email', 'sessionsExcused'])}
${rows('Needs manual review', crossCohortFlagged, ['name', 'email', 'dupeId', 'reason'])}
</div>`;

  const text = [
    `Duplicate-account sweep${DRY ? ' (DRY RUN)' : ''}. Checked ${result.scanned} email(s) with multiple active enrollments.`,
    `\n-- Point shadowing --`,
    DRY
      ? wouldMerge.length ? `Would merge (${wouldMerge.length}):\n` + wouldMerge.map((e) => `  ${e.name} <${e.email}> winner=${e.winnerPoints}pts, shadow=${e.shadowRows}`).join('\n') : ''
      : merged.length ? `Merged (${merged.length}):\n` + merged.map((e) => `  ${e.name} <${e.email}> +${e.pointsMoved}pts +${e.creditsMoved} credit rows (from ${e.shadowId})`).join('\n') : '',
    flagged.length ? `Needs manual review (${flagged.length}):\n` + flagged.map((e) => `  ${e.name} <${e.email}> (${e.shadowId}) -- ${e.reason}`).join('\n') : '',
    `\n-- Cross-cohort (check-in failure risk) --`,
    DRY
      ? wouldMergeCrossCohort.length ? `Would merge (${wouldMergeCrossCohort.length}):\n` + wouldMergeCrossCohort.map((e) => `  ${e.name} <${e.email}> other rows: ${e.otherRows}`).join('\n') : ''
      : crossCohortMerged.length ? `Merged (${crossCohortMerged.length}):\n` + crossCohortMerged.map((e) => `  ${e.name} <${e.email}> +${e.pointsMoved}pts +${e.creditsMoved} credit rows (from ${e.dupeId})`).join('\n') : '',
    crossCohortAttendance.length ? `Attendance corrected to excused (${crossCohortAttendance.length}):\n` + crossCohortAttendance.map((e) => `  ${e.name} <${e.email}> ${e.sessionsExcused} session(s)`).join('\n') : '',
    crossCohortFlagged.length ? `Needs manual review (${crossCohortFlagged.length}):\n` + crossCohortFlagged.map((e) => `  ${e.name} <${e.email}> (${e.dupeId}) -- ${e.reason}`).join('\n') : '',
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
  const mergedCount = result.merges.reduce((n, m) => n + m.merged.length, 0) + result.crossCohortMerges.reduce((n, m) => n + m.merged.length, 0);
  const flaggedCount =
    result.merges.reduce((n, m) => n + m.flaggedCollision.length + m.flaggedRealPayment.length, 0) +
    result.crossCohortMerges.reduce(
      (n, m) => n + m.flaggedCollision.length + m.flaggedRealPayment.length + m.flaggedStaffAccount.length + (m.attendanceFlaggedForReview > 0 ? 1 : 0),
      0,
    );
  const wouldMergeCount = result.shadowed.length + result.crossCohort.length;
  await transport.sendMail({
    from: '"Colaberry Enterprise AI" <ali@colaberry.com>',
    to: 'ali@colaberry.com',
    subject: `[Duplicate Account Sweep] ${DRY ? wouldMergeCount + ' would merge' : mergedCount + ' merged'}, ${flaggedCount} need review${DRY ? ' (DRY RUN)' : ''}`,
    html,
    text,
    headers: { 'X-MC-Track': 'none' },
  });
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  const result = await runDuplicateAccountSweep({ dryRun: DRY });

  const mergedCount = result.merges.reduce((n, m) => n + m.merged.length, 0) + result.crossCohortMerges.reduce((n, m) => n + m.merged.length, 0);
  const flaggedCount =
    result.merges.reduce((n, m) => n + m.flaggedCollision.length + m.flaggedRealPayment.length, 0) +
    result.crossCohortMerges.reduce(
      (n, m) => n + m.flaggedCollision.length + m.flaggedRealPayment.length + m.flaggedStaffAccount.length + (m.attendanceFlaggedForReview > 0 ? 1 : 0),
      0,
    );
  const attendanceCorrectedCount = result.crossCohortMerges.reduce((n, m) => n + m.attendanceCorrected, 0);

  console.log(
    JSON.stringify({
      event: 'duplicate_account_sweep',
      dry_run: DRY,
      scanned: result.scanned,
      shadowed_found: result.shadowed.length,
      cross_cohort_found: result.crossCohort.length,
      merged: mergedCount,
      flagged: flaggedCount,
      attendance_sessions_corrected: attendanceCorrectedCount,
    }),
  );

  const hasSomethingToReport = DRY ? result.shadowed.length + result.crossCohort.length > 0 : mergedCount > 0 || flaggedCount > 0;
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
