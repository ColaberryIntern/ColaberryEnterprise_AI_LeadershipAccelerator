#!/usr/bin/env node
/**
 * repairSubscriptionAnchors.js
 *
 * Re-anchors the billing clock for subscriptions that were activated LATE by the
 * 2026-08-12 webhook-backlog repair (CC-20260812-k4rp).
 *
 * Root cause: activateByRef() calls billingAnchorMs(nowMs, cohortStart) - it passes
 * the ACTIVATION time into a parameter named `paymentMs`. When a webhook is missed
 * and the row is repaired weeks later, the member's billing clock starts at the
 * repair instead of at their payment, so their renewal is set weeks too late and
 * they receive unbilled access in between.
 *
 * This script applies the SAME rule the code intends, with the right input:
 *     anchor      = max(actual payment date, cohort start date)
 *     period end  = anchor + 1 calendar month (monthly) or + 1 year (annual)
 *
 * It NEVER charges anyone and never moves a period end into the past: the days
 * already given away are written off, not invoiced. It only corrects the date
 * going forward.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write. Idempotent: a second run recomputes
 * the same anchors, finds no drift, and updates nothing.
 *
 * Run it against the container that holds the credentials and the compiled models:
 *     docker cp scripts/repairSubscriptionAnchors.js accelerator-backend:/app/
 *     docker exec -w /app accelerator-backend node repairSubscriptionAnchors.js
 *     docker exec -w /app accelerator-backend node repairSubscriptionAnchors.js --apply
 *
 * Scope guards, each of which caught something real on the live book:
 *  - MIN_DRIFT_DAYS ignores sub-2-day drift. PaySimple reports PaymentDate in
 *    merchant-local time while our anchors are UTC instants, so an evening charge
 *    manufactures a phantom 1-day delta. Ten live rows sat in exactly that state
 *    with the SAME calendar due date; "correcting" them would have dragged real
 *    members' deadlines a day earlier for nothing.
 *  - ACH_AMBIGUOUS skips rows whose stored anchor is a settlement date. ACH clears
 *    days after initiation, and settlement is the honest basis for a billing period;
 *    moving it earlier risks drafting before a member's funds clear.
 *  - comp plans are never touched (they are $0 grants that must never be billed).
 *
 * Failure-first:
 *  - If a PaySimple lookup fails for one member, that member is skipped and
 *    reported; the run continues. Nothing partial is written for them.
 *  - Each row is updated in its own statement; a mid-run abort leaves already
 *    corrected rows correct and the rest untouched, and re-running finishes the job.
 *  - If any computed period end would land in the past, --apply refuses outright
 *    rather than making someone retroactively overdue.
 */

const APPLY = process.argv.includes('--apply');

/** Only act on drift this wide or wider. See the comment at the drift check. */
const MIN_DRIFT_DAYS = 2;

/** Payment ids whose stored anchor is a settlement date we should not move. */
const ACH_AMBIGUOUS = new Set(['155112957']); // franck kafando - ACH, initiated 7/27, cleared ~7/30
const BASE = 'https://api.paysimple.com';
const H = { Authorization: `basic ${process.env.PAYSIMPLE_API_USER}:${process.env.PAYSIMPLE_API_KEY}` };

const { sequelize } = require('./dist/config/database');

/** Same semantics as periodEndMs(): same day next month, clamped to the last day
 *  when the target month is shorter (1/31 -> 2/28). */
function addOneMonthClamped(d) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const target = new Date(Date.UTC(y, m + 1, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

function addOneYear(d) {
  const t = new Date(d.getTime());
  t.setUTCFullYear(t.getUTCFullYear() + 1);
  return t;
}

async function paymentDate(payId) {
  const r = await fetch(`${BASE}/v4/payment/${payId}`, { method: 'GET', headers: H });
  if (!r.ok) throw new Error(`PaySimple HTTP ${r.status} for payment ${payId}`);
  const p = (await r.json()).Response;
  if (!p || !p.PaymentDate) throw new Error(`no PaymentDate on payment ${payId}`);
  return new Date(p.PaymentDate);
}

const SELECT = `
  SELECT s.id, s.enrollment_id, s.paysimple_payment_id AS pay_id,
         s.plan, s.started_at, s.current_period_end,
         e.full_name, e.email, c.start_date AS cohort_start, c.name AS cohort_name
  FROM subscriptions s
  JOIN enrollments e ON e.id = s.enrollment_id
  LEFT JOIN cohorts c ON c.id = e.cohort_id
  WHERE s.status = 'active' AND s.plan <> 'comp'
  ORDER BY s.created_at`;

(async () => {
  console.log(`[repairAnchors] mode=${APPLY ? 'APPLY (WRITES)' : 'DRY RUN (no writes)'}  now=${new Date().toISOString()}`);
  const [rows] = await sequelize.query(SELECT);
  console.log(`[repairAnchors] ${rows.length} candidate rows\n`);

  const planned = [];
  const skipped = [];

  for (const r of rows) {
    try {
      if (!r.pay_id) throw new Error('no paysimple_payment_id on the subscription');
      const paid = await paymentDate(r.pay_id);
      const cohortMs = r.cohort_start
        ? Date.parse(`${String(r.cohort_start).slice(0, 10)}T00:00:00Z`)
        : NaN;
      const anchor = new Date(
        Number.isFinite(cohortMs) ? Math.max(paid.getTime(), cohortMs) : paid.getTime()
      );
      const periodEnd = r.plan === 'annual' ? addOneYear(anchor) : addOneMonthClamped(anchor);

      const oldEnd = new Date(r.current_period_end);
      const drift = Math.round((oldEnd - periodEnd) / 864e5);
      if (drift === 0) { skipped.push({ name: r.full_name, why: 'already correct' }); continue; }

      // A genuine mis-anchor from this bug is days-to-weeks wide. A one-day delta is
      // NOT a defect: PaySimple reports PaymentDate in merchant-local time while our
      // anchors are UTC instants, so a charge made late in the evening Central lands
      // on the next UTC day and manufactures a phantom 1-day drift. Ten live rows sat
      // in exactly that state - same calendar due date, ~23h apart - and "correcting"
      // them would drag real members' deadlines a day earlier for nothing.
      if (Math.abs(drift) < MIN_DRIFT_DAYS) {
        skipped.push({ name: r.full_name, why: `${drift}d drift below the ${MIN_DRIFT_DAYS}d floor (timezone noise, not a defect)` });
        continue;
      }

      // ACH clears days after it is initiated. PaymentDate is the initiation; the
      // stored anchor is when the money actually landed, which is the honest basis
      // for a billing period - moving it earlier risks drafting before funds clear.
      if (ACH_AMBIGUOUS.has(String(r.pay_id))) {
        skipped.push({ name: r.full_name, why: 'ACH: stored anchor is the settlement date and is the safer basis - left alone deliberately' });
        continue;
      }

      planned.push({
        id: r.id, name: r.full_name, email: r.email, plan: r.plan,
        paid: paid.toISOString().slice(0, 10),
        cohort: r.cohort_name, cohortStart: String(r.cohort_start).slice(0, 10),
        oldAnchor: new Date(r.started_at).toISOString().slice(0, 10),
        newAnchor: anchor.toISOString().slice(0, 10),
        oldDue: oldEnd.toISOString().slice(0, 10),
        newDue: periodEnd.toISOString().slice(0, 10),
        daysEarlier: drift,
        anchorISO: anchor.toISOString(), endISO: periodEnd.toISOString(),
      });
    } catch (e) {
      skipped.push({ name: r.full_name, why: e.message });
    }
  }

  console.log('name                 plan    paid        old due     -> new due     moves earlier');
  console.log('-------------------- ------- ----------  ----------     ----------  -------------');
  planned.forEach(p => console.log(
    `${p.name.padEnd(20)} ${String(p.plan).padEnd(7)} ${p.paid}  ${p.oldDue}  -> ${p.newDue}  ${String(p.daysEarlier).padStart(3)} days`
  ));
  if (skipped.length) {
    console.log('\nskipped:');
    skipped.forEach(s => console.log(`  ${s.name}: ${s.why}`));
  }
  console.log(`\nplanned=${planned.length} skipped=${skipped.length}`);
  console.log('NOTE: no period end is moved into the past; unbilled days already given are written off, not invoiced.');

  const intoPast = planned.filter(p => new Date(p.endISO) < new Date());
  if (intoPast.length) {
    console.log(`\nWARNING: ${intoPast.length} would land in the past: ${intoPast.map(p => p.name).join(', ')}`);
    if (APPLY) { console.log('Refusing to apply. Resolve these first.'); process.exit(3); }
  }

  if (!APPLY) { console.log('\nDRY RUN - nothing written. Re-run with --apply to write.'); return; }

  let ok = 0;
  for (const p of planned) {
    await sequelize.query(
      `UPDATE subscriptions SET started_at = :a, current_period_end = :e, updated_at = now()
        WHERE id = :id AND status = 'active' AND plan <> 'comp'`,
      { replacements: { a: p.anchorISO, e: p.endISO, id: p.id } }
    );
    ok++;
    console.log(`  updated ${p.name}: due ${p.oldDue} -> ${p.newDue}`);
  }
  console.log(`\n[repairAnchors] APPLIED to ${ok} rows.`);
})().then(() => process.exit(0)).catch(e => { console.error('[repairAnchors] FATAL', e); process.exit(1); });
