/**
 * grantOpenHouseScholarships.js — grant the Open House scholarship (50% off a
 * year: $894 account credit, usable ONLY on the annual plan) to each winner,
 * and place them in the paid cohort the Open House fed.
 *
 *   node /app/grantOpenHouseScholarships.js <winners.json> [--apply]
 *
 * winners.json: { "event": "OH1029", "cohort": "Cohort - November 2026",
 *                 "winners": [{ "name": "...", "email": "..." }, ...] }
 *
 * Dry run by default (writes nothing, reports what WOULD happen). Idempotent:
 * the credit is keyed on `<event>-SCHOLAR-<email>`, so a re-run never
 * double-credits; the enrollment is matched (or created) by email. Same engine
 * as the $50 deposit grants (openHouseCreditService.reconcileOpenHousePayer).
 * Annual-only is enforced at checkout by the credit's reason
 * (accountCreditService.ANNUAL_ONLY_CREDIT_REASONS).
 */
const fs = require('fs');

const file = process.argv[2];
const apply = process.argv.includes('--apply');
if (!file) { console.error('usage: node grantOpenHouseScholarships.js <winners.json> [--apply]'); process.exit(2); }

const {
  reconcileOpenHousePayer, OPEN_HOUSE_SCHOLARSHIP_REASON, OPEN_HOUSE_SCHOLARSHIP_CENTS,
} = require('/app/dist/services/openHouseCreditService');
const { Cohort } = require('/app/dist/models');

(async () => {
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!spec.event || !spec.cohort || !Array.isArray(spec.winners) || !spec.winners.length) throw new Error('winners.json needs event, cohort, winners[]');
  const cohort = await Cohort.findOne({ where: { name: spec.cohort } });
  if (!cohort) throw new Error('cohort not found: ' + spec.cohort);
  const outcomes = [];
  for (const w of spec.winners) {
    const email = String(w.email || '').trim().toLowerCase();
    outcomes.push(await reconcileOpenHousePayer({
      email, name: w.name,
      sourceEventId: `${spec.event}-SCHOLAR-${email}`,
      amountCents: OPEN_HOUSE_SCHOLARSHIP_CENTS,
      reason: OPEN_HOUSE_SCHOLARSHIP_REASON,
      note: 'Open House scholarship: 50% off the annual membership (annual plan only)',
    }, { cohort, grantedBy: 'ali@colaberry.com', apply }));
  }
  outcomes.forEach((o) => console.log(JSON.stringify({ email: o.email, matched: o.matched, enrollment: o.enrollmentId, cohortSet: o.cohortSet,
    creditGranted: o.creditGranted, alreadyHad: o.creditAlreadyPresent, cents: o.amountCents, note: o.note || null })));
  console.error(`${apply ? 'APPLIED' : 'DRY RUN'} winners=${outcomes.length} granted=${outcomes.filter((o) => o.creditGranted).length} already=${outcomes.filter((o) => o.creditAlreadyPresent).length}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
