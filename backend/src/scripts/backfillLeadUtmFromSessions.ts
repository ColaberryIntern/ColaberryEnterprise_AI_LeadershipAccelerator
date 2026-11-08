/**
 * ONE-TIME REPAIR (C10.4): carry the ad's tags onto the leads that identify never reached.
 *
 * `/api/t/identify` already copies a visitor session's UTM tags onto the lead
 * (`controllers/trackingController.ts`, rule in `services/marketing/utmBackfill.ts`). That path
 * only fires at signup, so it can only ever fix leads created after it shipped — and ADS-3, which
 * added `utm_content`/`utm_term` to the copied set, shipped on 2026-11-03. Everything before that
 * kept its tags in `visitor_sessions` and never got them onto the lead.
 *
 * Measured against production on 2026-11-08:
 *   - 384 leads carry no `utm_content` while a session of their OWN visitor does
 *   - 447 have a recoverable `utm_medium` (the column for it landed with this change)
 *   - only 66 of 25,380 leads all-time carry a `utm_content` at all
 *
 * That matters past tidiness. Of 76 paid enrollments in the last 180 days, every one matches a
 * lead by email, but only 17 carry a source or campaign and ZERO carry a content — so "which ad
 * produced a paying member" has an empty numerator by construction, not because the answer is
 * zero. This script is how the already-captured half of that answer gets onto the rows a report
 * reads.
 *
 * ── THE RULE IS NOT RE-IMPLEMENTED HERE ──
 *
 * `historicalBackfillUpdates` in `services/marketing/utmBackfill.ts` makes every decision: which
 * session to believe, which fields travel, and never overwriting a tag the signup itself supplied.
 * This file is the loop and the report around it. A second opinion about attribution living in a
 * script is exactly the drift C10.13 found three copies of.
 *
 * The one thing worth knowing: the attribution window is anchored on the LEAD'S `created_at`, not
 * on the clock, because "was the click recent enough" is a question about the gap between the click
 * and the signup. Anchored on now, every historical lead's sessions read as stale and the bounded
 * last-touch rule silently degrades to "whatever session is newest". `utmBackfill.test.ts` holds
 * that as a control assertion.
 *
 * ── IDEMPOTENCY ──
 *
 * By construction, not by a flag: the rule never overwrites a field that is already present, so a
 * second run computes `{}` for every row it filled on the first and writes nothing. Proven by
 * running it twice, which is the only proof worth having.
 *
 * ── FAILURE PATH ──
 *
 * Per lead, not per run. A lead whose sessions cannot be read is counted as `failed` and the loop
 * continues: this is a repair, so finishing 600 rows and reporting 3 failures is strictly better
 * than aborting on the third. Nothing here deletes or overwrites, so a partial run is safe to
 * re-run, and a dry run writes nothing at all.
 *
 * Usage, inside the production container:
 *   node dist/scripts/backfillLeadUtmFromSessions.js                 (dry run - default)
 *   node dist/scripts/backfillLeadUtmFromSessions.js --execute
 *   node dist/scripts/backfillLeadUtmFromSessions.js --limit 50      (cap the rows examined)
 */

import { Op } from 'sequelize';
import { Lead, VisitorSession } from '../models';
import {
  historicalBackfillUpdates,
  UTM_FIELDS,
  UTM_SESSION_LOOKBACK,
  UtmField,
  UtmSession,
} from '../services/marketing/utmBackfill';

export interface BackfillRow {
  leadId: string;
  email: string;
  /** The lead's own created_at as a date key, which is what the window is measured from. */
  signedUpOn: string | null;
  /** The fields this lead would gain, in UTM_FIELDS order. Empty means nothing to do. */
  fields: UtmField[];
  action: 'written' | 'would-write' | 'nothing-to-carry' | 'failed';
  /** Set only when action is 'failed'. */
  error?: string;
}

/** Leads that could gain something: they have a visitor to join by and at least one blank tag. */
function incompleteLeadScope() {
  return {
    [Op.and]: [
      { visitor_id: { [Op.ne]: null } },
      { [Op.or]: UTM_FIELDS.map((field) => ({ [field]: null })) },
    ],
  } as any;
}

export async function run(execute: boolean, limit?: number): Promise<BackfillRow[]> {
  const leads = await Lead.findAll({
    where: incompleteLeadScope(),
    order: [['created_at', 'DESC']],
    ...(limit ? { limit } : {}),
  });

  const rows: BackfillRow[] = [];
  for (const lead of leads) {
    const base = {
      leadId: String((lead as any).id),
      email: String((lead as any).email ?? '(no email)'),
      signedUpOn: (lead as any).created_at
        ? new Date((lead as any).created_at).toISOString().slice(0, 10)
        : null,
    };
    try {
      // Per lead rather than one grouped read: the population is in the hundreds, a visitor can
      // hold an unbounded number of sessions, and LIMIT in the database is cheaper than slicing a
      // large in-memory group. The bound is the same one identify uses.
      const sessions = await VisitorSession.findAll({
        where: { visitor_id: (lead as any).visitor_id } as any,
        order: [['created_at', 'DESC']],
        limit: UTM_SESSION_LOOKBACK,
      });

      const updates = historicalBackfillUpdates(sessions as unknown as UtmSession[], lead as any);
      const fields = UTM_FIELDS.filter((f) => updates[f] !== undefined);
      if (!fields.length) {
        rows.push({ ...base, fields: [], action: 'nothing-to-carry' });
        continue;
      }
      if (!execute) {
        rows.push({ ...base, fields, action: 'would-write' });
        continue;
      }
      await lead.update(updates);
      rows.push({ ...base, fields, action: 'written' });
    } catch (err: any) {
      rows.push({
        ...base,
        fields: [],
        action: 'failed',
        error: `${err?.name || 'Error'}: ${err?.message || String(err)}`,
      });
    }
  }
  return rows;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const limitAt = process.argv.indexOf('--limit');
  const limit = limitAt >= 0 ? Number(process.argv[limitAt + 1]) : undefined;
  if (limitAt >= 0 && (!Number.isFinite(limit) || (limit as number) < 1)) {
    console.error('--limit needs a positive number');
    process.exit(1);
  }

  const rows = await run(execute, limit);

  console.log(`=== Lead UTM backfill from visitor sessions (${execute ? 'EXECUTE' : 'DRY RUN'}) ===`);
  for (const r of rows.filter((x) => x.action === 'written' || x.action === 'would-write')) {
    console.log(`[${r.action}] ${r.email}  signed up ${r.signedUpOn ?? '-'}  gains: ${r.fields.join(', ')}`);
  }
  for (const r of rows.filter((x) => x.action === 'failed')) {
    console.log(`[failed] ${r.email}  ${r.error}`);
  }

  const count = (a: BackfillRow['action']) => rows.filter((r) => r.action === a).length;
  // Per FIELD as well as per lead: "300 leads updated" says nothing about whether the content
  // dimension moved, which is the one the report needs.
  const perField = UTM_FIELDS.map((f) => `${f}=${rows.filter((r) => r.fields.includes(f)).length}`).join('  ');
  console.log(
    `\n${rows.length} lead(s) examined: ` +
    `${execute ? `${count('written')} written` : `${count('would-write')} would be written`}, ` +
    `${count('nothing-to-carry')} with nothing to carry, ${count('failed')} failed.`
  );
  console.log(`fields recovered: ${perField}`);
  if (!execute && count('would-write')) {
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
