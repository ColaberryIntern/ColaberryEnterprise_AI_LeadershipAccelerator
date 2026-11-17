/**
 * ONE-TIME REPAIR (R18): link the enrollments that already exist to the leads they came from.
 *
 * `enrollmentLeadLinkHook` stamps `enrollments.lead_id` at INSERT, so it can only ever link rows
 * created after it ships. Every enrollment in the book predates it. This script is how the
 * existing rows get the same edge.
 *
 * Measured against production on 2026-11-17:
 *   - 1,436 distinct enrollment emails; 1,336 match exactly one `leads` row, 100 match none
 *   - ZERO match more than one, so there is no ambiguity to resolve in the live book
 *   - all 26 currently-paying members match, covering $4,824/mo of MRR
 *
 * That last line is the point. Until these rows carry a `lead_id`, the question "which campaign
 * produced the members who pay us" is answered by hand-matching lowercased email, which is what
 * every audit of this has done since July.
 *
 * ── THE RULE IS NOT RE-IMPLEMENTED HERE ──
 *
 * `pickLeadForEnrollment` in `services/marketing/enrollmentLeadLink.ts` makes the decision, and
 * `resolveLeadIdForEmail` does the read. This file is the loop and the report around them. A
 * second opinion about which lead a member came from, living in a script, is the drift that
 * `backfillLeadUtmFromSessions.ts` names in its own header.
 *
 * ── IDEMPOTENCY ──
 *
 * By construction, not by a flag: only rows whose `lead_id` IS NULL are considered, and the rule
 * picks the OLDEST matching lead, which cannot change as more leads arrive. A second run finds
 * the rows it filled already set, skips them, and writes nothing.
 *
 * ── FAILURE PATH ──
 *
 * Per row. A row whose lookup or update throws is counted `failed` with its reason and the loop
 * continues: one unresolvable enrollment must not cost the other 1,335. Nothing is deleted and
 * nothing already set is overwritten, so the worst outcome of a bad run is that some rows stay
 * NULL and the script can be run again.
 *
 * Usage:
 *   node dist/scripts/backfillEnrollmentLeadId.js                 # dry run, writes nothing
 *   node dist/scripts/backfillEnrollmentLeadId.js --execute
 *   node dist/scripts/backfillEnrollmentLeadId.js --execute --limit 50
 */
import { Enrollment } from '../models';
import { resolveLeadIdForEmail } from '../services/marketing/enrollmentLeadResolver';

export interface BackfillRow {
  enrollmentId: string;
  email: string;
  action: 'written' | 'would-write' | 'no-lead' | 'no-email' | 'failed';
  leadId?: number;
  error?: string;
}

export async function run(execute: boolean, limit?: number): Promise<BackfillRow[]> {
  const enrollments = await Enrollment.findAll({
    where: { lead_id: null },
    attributes: ['id', 'email'],
    order: [['created_at', 'ASC']],
    ...(limit ? { limit } : {}),
  });

  const rows: BackfillRow[] = [];

  for (const e of enrollments) {
    const email = (e.email ?? '').trim();
    if (email === '') {
      rows.push({ enrollmentId: e.id, email: '(blank)', action: 'no-email' });
      continue;
    }

    try {
      const leadId = await resolveLeadIdForEmail(email);
      if (leadId === null) {
        rows.push({ enrollmentId: e.id, email, action: 'no-lead' });
        continue;
      }

      if (!execute) {
        rows.push({ enrollmentId: e.id, email, action: 'would-write', leadId });
        continue;
      }

      // `update` on the instance rather than a bulk `Enrollment.update`, so the write is
      // scoped to this one row and a failure cannot touch another.
      await e.update({ lead_id: leadId });
      rows.push({ enrollmentId: e.id, email, action: 'written', leadId });
    } catch (err: any) {
      rows.push({
        enrollmentId: e.id,
        email,
        action: 'failed',
        error: err?.message?.split('\n')[0] ?? String(err),
      });
    }
  }

  return rows;
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const limitAt = process.argv.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : undefined;
  if (limitAt >= 0 && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error('--limit needs a positive number');
    process.exit(1);
  }

  const rows = await run(execute, limit);

  console.log(`=== Enrollment -> lead backfill (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  for (const r of rows.filter((x) => x.action === 'failed')) {
    console.log(`[failed] ${r.email}  ${r.error}`);
  }

  const count = (a: BackfillRow['action']) => rows.filter((r) => r.action === a).length;
  const linked = execute ? count('written') : count('would-write');
  console.log(
    `\n${rows.length} unlinked enrollment(s) examined: `
    + `${execute ? `${linked} linked` : `${linked} would be linked`}, `
    + `${count('no-lead')} with no lead row, ${count('no-email')} with no email, ${count('failed')} failed.`,
  );
  // Coverage, not just a row count. "1,336 linked" says nothing about whether the rows that
  // matter moved, and the rows that matter are the ones with revenue behind them.
  console.log(
    `coverage: ${rows.length === 0 ? 'n/a' : `${Math.round((linked / rows.length) * 100)}%`} of the rows examined`,
  );
  if (!execute && linked > 0) {
    console.log('Dry run: nothing was written. Re-run with --execute.');
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Script failed:', err);
      process.exit(1);
    });
}
