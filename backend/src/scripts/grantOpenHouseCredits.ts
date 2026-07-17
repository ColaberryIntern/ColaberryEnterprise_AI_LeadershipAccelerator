/**
 * One-off: grant the Open House "$50 hold your spot" deposit as an account
 * credit to each payer, and make sure they're enrolled in the July cohort.
 *
 * Idempotent — credits are keyed on the PaySimple deposit ref (source_event_id)
 * and enrollments are matched by email, so this is safe to run twice.
 *
 * Input: a JSON array of { email, name, sourceEventId, amountCents? } — e.g. the
 * openhouse-live seat-claim export. Pass with --file.
 *
 * Usage (dry run — reports what WOULD change, writes nothing):
 *   docker exec accelerator-backend node dist/scripts/grantOpenHouseCredits.js --file /tmp/oh716-claims.json
 * Apply for real:
 *   docker exec accelerator-backend node dist/scripts/grantOpenHouseCredits.js --file /tmp/oh716-claims.json --apply
 *
 * Options:
 *   --file <path>     JSON array of payers (required)
 *   --apply           write changes (default: dry run)
 *   --amount <cents>  per-payer credit override (default: 5000 = $50)
 *   --granted-by <s>  audit tag (default: openhouse-2026-07-16)
 */

import fs from 'fs';
import { connectDatabase } from '../config/database';
import '../models';
import { grantOpenHouseCreditsBatch, OpenHousePayer, OPEN_HOUSE_DEPOSIT_CENTS } from '../services/openHouseCreditService';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string): boolean => process.argv.includes(name);

async function run() {
  const file = arg('--file');
  if (!file) { console.error('Missing --file <path to JSON array of payers>'); process.exit(1); }
  const apply = hasFlag('--apply');
  const amountCents = arg('--amount') ? parseInt(arg('--amount')!, 10) : OPEN_HOUSE_DEPOSIT_CENTS;
  const grantedBy = arg('--granted-by') || 'openhouse-2026-07-16';

  const raw = JSON.parse(fs.readFileSync(file!, 'utf8'));
  if (!Array.isArray(raw)) { console.error('Input must be a JSON array'); process.exit(1); }
  // Accept either {sourceEventId} or {externalId} (the openhouse-live export uses externalId).
  const payers: OpenHousePayer[] = raw.map((r: any) => ({
    email: r.email,
    name: r.name,
    sourceEventId: r.sourceEventId || r.externalId,
    amountCents: r.amountCents ?? amountCents,
  }));

  await connectDatabase();
  console.log(`\n[grant-open-house-credits] ${apply ? 'APPLY' : 'DRY RUN'} — ${payers.length} payer(s), $${(amountCents / 100).toFixed(2)} each, granted_by=${grantedBy}\n`);

  const summary = await grantOpenHouseCreditsBatch(payers, { grantedBy, apply });

  for (const o of summary.outcomes) {
    const bits = [
      `$${(o.amountCents / 100).toFixed(2)}`.padStart(9),
      o.matched.padEnd(8),
      o.creditGranted ? 'credit+' : (o.creditAlreadyPresent ? 'credit=' : 'credit·'),
      o.cohortSet ? 'cohort+' : 'cohort·',
      o.enrollmentId ? o.enrollmentId.slice(0, 8) : '--------',
    ];
    console.log(`  ${o.email.padEnd(34)} ${bits.join('  ')}${o.note ? `  (${o.note})` : ''}`);
  }

  console.log(`\n[summary] ${apply ? 'APPLIED' : 'DRY RUN'}`);
  console.log(`  payers:             ${summary.total}`);
  console.log(`  matched existing:   ${summary.matched_existing}`);
  console.log(`  created new:        ${summary.created}`);
  console.log(`  skipped (no email): ${summary.skipped}`);
  console.log(`  cohort set/would:   ${summary.cohorts_set}`);
  console.log(`  credits granted:    ${summary.credits_granted}  ($${(summary.credited_cents / 100).toFixed(2)})`);
  console.log(`  credits already:    ${summary.credits_already_present}`);
  if (!apply) console.log(`\n  Dry run — nothing written. Re-run with --apply to commit.\n`);

  process.exit(0);
}

run().catch((err) => {
  console.error('Failed:', err?.message || err);
  process.exit(1);
});
