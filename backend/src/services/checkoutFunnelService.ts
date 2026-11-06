/**
 * Checkout conversion, per person, split by product. C10.1 criterion (2).
 *
 * WHY THIS EXISTS, AND WHY IT REFUSES TO RETURN A SINGLE NUMBER.
 *
 * C10.1's phase-1 analysis reported that checkout conversion "fell by about two thirds" - 51.4%
 * in July down to 14.3% in October - and that figure drove the ticket's whole framing toward
 * fixing the payment page. Measured again on 2026-11-05 with the population split by
 * `enrollment_type`, the paid product's conversion never fell:
 *
 *     month   standard started -> paid    explorer started -> paid
 *     2026-07   37 -> 36  (97%)             10 -> 0
 *     2026-08   17 -> 15  (88%)              2 -> 0
 *     2026-09   14 -> 13  (93%)              2 -> 0
 *     2026-10    2 ->  2 (100%)             12 -> 0
 *     2026-11    1 ->  1 (100%)              3 -> 0
 *
 * The decline was a MIX SHIFT. The aggregate blended a product converting around 90% with a free
 * tier converting at zero, and the mix moved from mostly-standard to almost-entirely-explorer.
 * Twenty-nine Explorers have started checkout since July and none has ever become a paying
 * member.
 *
 * So the aggregate rate is not merely less useful than the split - it is actively misleading, and
 * it misled this company for a month. This module therefore never returns a blended rate on its
 * own. `computeCheckoutFunnel` returns one row per (period, type), and a `mix` block alongside
 * it, so anyone quoting a headline number has the composition in the same object they are
 * reading from.
 *
 * Three further traps, all already paid for once:
 *
 *  - PER PERSON, NOT PER ROW. Clicking checkout again writes a fresh `subscriptions` row, which
 *    is how 39 abandoners were first reported as 147. The dedup to one row per person happens
 *    inside this module so it is unit tested, rather than living in whichever query runs last.
 *  - ARRIVAL COMES FROM `subscriptions`, NOT `enrollments`. `startCheckout` mints the payment
 *    link and writes a pending `subscriptions` row, so that row IS the arrival event.
 *    `enrollments.paysimple_customer_id` is populated on only 46 of 131 paid rows and must never
 *    be used as the marker: a funnel built on it reports more people paid than arrived.
 *  - SPLIT BY ORIGIN, NEVER BY `enrollment_type`. This module's first version grouped by
 *    `enrollment_type`, and that is the one field the measured event rewrites:
 *    `markEnrollmentPaid` sets it to `'standard'` when a payment lands. So an Explorer who pays
 *    stops being an Explorer, "Explorers who converted" answers ZERO BY CONSTRUCTION, and the
 *    upgraders land in the standard bucket and inflate it. Both of the numbers that version
 *    produced were artifacts. Origin comes from markers the upgrade does not touch.
 *
 * AND THE ORIGIN MARKERS THEMSELVES DISAGREE, so the module says so rather than picking one.
 * Asked "how many former Explorers have ever paid", production answered 2 by current
 * `enrollment_type`, 1 by `explorer_entered_at`, and 30 by Explorer-cohort membership. The
 * second undercovers (269 Explorers carry no `explorer_entered_at`); the third is contaminated
 * (28 of its 30 paid rows have `amount_paid = 0.00` and match a historical bug that filed real
 * signups into the Explorer cohort). `originDisagreement` carries that count into the output so
 * a split nobody should trust cannot be read as one that is fine.
 */

export type CheckoutPeriod = 'week' | 'month';

/** One raw checkout attempt, as stored. Several of these can belong to one person. */
export interface CheckoutAttemptRow {
  enrollment_id: string;
  /** `subscriptions.created_at` - the moment the payment link was minted. */
  created_at: string | Date;
  /** `subscriptions.status`. 'active' is the subscription-side definition of converted. */
  status: string | null;
  /**
   * Durable origin marker: did this person ever enter as a free Explorer? Computed in SQL as
   * `explorer_entered_at IS NOT NULL OR cohorts.cohort_type = 'explorer'`.
   *
   * NOT `enrollment_type`, and the reason has changed shape as of C10.17 Phase 2 without
   * changing the decision.
   *
   * It used to be that `markEnrollmentPaid` and four other writers rewrote that column to
   * 'standard' on payment, so grouping on it made the Explorer conversion rate zero by
   * definition. Phase 2 deleted those rewrites, so from now on `enrollment_type` does hold
   * origin and would be usable here.
   *
   * These markers stay, because Phase 2 is NOT RETROACTIVE. Every row that paid before it
   * shipped already had its origin overwritten, and nothing can recover it from that column.
   * `explorer_entered_at` and `cohorts.cohort_type` were never touched by payment, so they
   * are the only signals under which the historical conversion rate is computable at all -
   * which is exactly why this module was built on them rather than waiting for the schema
   * to be fixed.
   */
  explorer_origin: boolean | null;
  /** The two markers separately, so their disagreement can be counted rather than hidden. */
  marker_entered_at?: boolean | null;
  marker_explorer_cohort?: boolean | null;
  /** `enrollments.payment_status` - the enrollment-side definition of converted. */
  payment_status: string | null;
}

export interface CheckoutFunnelRow {
  period: string;
  /** 'explorer-origin' | 'never-explorer'. Durable; see CheckoutAttemptRow.explorer_origin. */
  origin: string;
  started: number;
  /** Converted on the subscription side: an 'active' subscription ever existed. */
  converted_subscription: number;
  /** Converted on the enrollment side: payment_status reached 'paid'. */
  converted_paid: number;
  /** Null rather than 0 when nobody started, so "no data" cannot read as "0%". */
  pct_subscription: number | null;
  pct_paid: number | null;
}

export interface CheckoutMixRow {
  period: string;
  total_started: number;
  /** Share of this period's starters per type, rounded to one decimal. */
  share: Record<string, number>;
}

export interface CheckoutFunnel {
  period: CheckoutPeriod;
  rows: CheckoutFunnelRow[];
  mix: CheckoutMixRow[];
  /**
   * Set when the composition moved enough between the first and last period that an aggregate
   * rate would be comparing different populations. The thing that fooled C10.1 phase 1.
   */
  mixShiftWarning: string | null;
  /**
   * How many people the two origin markers classify differently. Non-zero means the
   * explorer/never-explorer split is only as good as whichever marker you believe, and the
   * rates below it should not be quoted as settled.
   */
  originDisagreement: number;
  /** Set when originDisagreement is non-zero, in the same shape as mixShiftWarning. */
  originWarning: string | null;
}

/** ISO week/month bucket key. UTC throughout, so a bucket never depends on server timezone. */
export function periodKey(at: string | Date, period: CheckoutPeriod): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return 'unknown';
  if (period === 'month') return d.toISOString().slice(0, 7);
  // Week starting Monday, matching date_trunc('week') in Postgres.
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (utc.getUTCDay() + 6) % 7;              // Monday = 0
  utc.setUTCDate(utc.getUTCDate() - dow);
  return utc.toISOString().slice(0, 10);
}

const pct = (n: number, d: number): number | null =>
  (d === 0 ? null : Math.round((1000 * n) / d) / 10);

/**
 * Collapse attempts to one record per person: their FIRST attempt decides the period they are
 * counted in, and conversion is "ever" across all of their rows.
 */
function perPerson(attempts: CheckoutAttemptRow[], period: CheckoutPeriod) {
  const byPerson = new Map<string, {
    firstAt: number; periodKey: string; origin: string;
    everActive: boolean; everPaid: boolean; markersDisagree: boolean;
  }>();

  for (const a of attempts) {
    if (!a || !a.enrollment_id) continue;
    const at = a.created_at instanceof Date ? a.created_at : new Date(a.created_at);
    const ms = at.getTime();
    if (Number.isNaN(ms)) continue;                   // unparseable attempt is not an attempt

    const origin = a.explorer_origin ? 'explorer-origin' : 'never-explorer';
    const active = String(a.status || '').toLowerCase() === 'active';
    const paid = String(a.payment_status || '').toLowerCase() === 'paid';
    // Only counted when BOTH markers were supplied; one missing marker is unknown, not a
    // disagreement, and inflating this number would make the warning meaningless.
    const disagree = a.marker_entered_at != null && a.marker_explorer_cohort != null
      && Boolean(a.marker_entered_at) !== Boolean(a.marker_explorer_cohort);

    const prev = byPerson.get(a.enrollment_id);
    if (!prev) {
      byPerson.set(a.enrollment_id, {
        firstAt: ms, periodKey: periodKey(at, period), origin,
        everActive: active, everPaid: paid, markersDisagree: disagree,
      });
      continue;
    }
    prev.everActive = prev.everActive || active;
    prev.everPaid = prev.everPaid || paid;
    prev.markersDisagree = prev.markersDisagree || disagree;
    if (ms < prev.firstAt) {
      prev.firstAt = ms;
      prev.periodKey = periodKey(at, period);
      prev.origin = origin;                           // their origin, which does not change
    }
  }
  return [...byPerson.values()];
}

export function computeCheckoutFunnel(
  attempts: CheckoutAttemptRow[],
  opts: { period?: CheckoutPeriod; since?: string } = {}
): CheckoutFunnel {
  const period = opts.period || 'month';
  // First attempts are computed over EVERY row, then periods before `since` are dropped from
  // the output. Filtering the input instead would redefine "first attempt" as "first attempt in
  // the window" and report returning people as new. See CHECKOUT_ATTEMPTS_SQL.
  const all = perPerson(attempts || [], period);
  const people = opts.since
    ? all.filter((p) => p.periodKey >= periodKey(opts.since as string, period))
    : all;

  const cells = new Map<string, CheckoutFunnelRow>();
  const totals = new Map<string, number>();
  const shares = new Map<string, Map<string, number>>();

  let originDisagreement = 0;

  for (const p of people) {
    const key = p.periodKey + '\u0000' + p.origin;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        period: p.periodKey, origin: p.origin, started: 0,
        converted_subscription: 0, converted_paid: 0,
        pct_subscription: null, pct_paid: null,
      };
      cells.set(key, cell);
    }
    cell.started += 1;
    if (p.everActive) cell.converted_subscription += 1;
    if (p.everPaid) cell.converted_paid += 1;
    if (p.markersDisagree) originDisagreement += 1;

    totals.set(p.periodKey, (totals.get(p.periodKey) || 0) + 1);
    if (!shares.has(p.periodKey)) shares.set(p.periodKey, new Map());
    const s = shares.get(p.periodKey)!;
    s.set(p.origin, (s.get(p.origin) || 0) + 1);
  }

  const rows = [...cells.values()].map((r) => ({
    ...r,
    pct_subscription: pct(r.converted_subscription, r.started),
    pct_paid: pct(r.converted_paid, r.started),
  })).sort((a, b) => a.period.localeCompare(b.period)
    || a.origin.localeCompare(b.origin));

  const mix: CheckoutMixRow[] = [...totals.keys()].sort().map((k) => {
    const share: Record<string, number> = {};
    for (const [type, n] of shares.get(k)!) share[type] = pct(n, totals.get(k)!) as number;
    return { period: k, total_started: totals.get(k)!, share };
  });

  // The warning that phase 1 needed. Compare each type's share in the first and last period
  // with data; 25 points is enough that a blended rate compares two populations.
  //
  // The winner is chosen DETERMINISTICALLY - largest shift, ties broken alphabetically - rather
  // than by whichever type object-key order happens to yield. In the real July-to-October data
  // standard moves -64.4 and explorer +64.4, exactly equal, so "first one found" would have made
  // the message depend on insertion order. A warning whose text changes between runs is a
  // warning nobody can test or trust.
  let mixShiftWarning: string | null = null;
  if (mix.length >= 2) {
    const first = mix[0];
    const last = mix[mix.length - 1];
    const shifts = [...new Set([...Object.keys(first.share), ...Object.keys(last.share)])]
      .map((t) => ({ type: t, from: first.share[t] || 0, to: last.share[t] || 0 }))
      .map((s) => ({ ...s, delta: Math.abs(s.to - s.from) }))
      .filter((s) => s.delta >= 25)
      .sort((a, b) => (b.delta - a.delta) || a.type.localeCompare(b.type));

    if (shifts.length) {
      const s = shifts[0];
      mixShiftWarning = 'Composition moved by ' + Math.round(s.delta)
        + ' points for origin "' + s.type + '" between ' + first.period + ' ('
        + s.from + '%) and ' + last.period + ' (' + s.to + '%). An aggregate conversion rate '
        + 'across these periods compares different populations and must not be quoted; read the '
        + 'per-origin rows instead.';
    }
  }

  const originWarning = originDisagreement > 0
    ? 'The two origin markers classify ' + originDisagreement + ' of ' + people.length
      + ' people differently (explorer_entered_at vs Explorer-cohort membership). The '
      + 'explorer-origin / never-explorer split below is only as good as whichever marker you '
      + 'believe, so do not quote these rates as settled. Asked on production 2026-11-05, the '
      + 'two markers answered 1 and 30 to "how many former Explorers have ever paid".'
    : null;

  return { period, rows, mix, mixShiftWarning, originDisagreement, originWarning };
}

/**
 * The SQL behind it, kept next to the logic it feeds so the two cannot drift apart.
 *
 * `enrollment_type` is deliberately NOT selected. Until C10.17 Phase 2 it was rewritten to
 * 'standard' by `markEnrollmentPaid` and four other payment writers, so grouping on it made
 * the Explorer conversion rate zero by definition. Those writers have stopped, but the rows
 * that paid before they stopped cannot be recovered - Phase 2 preserves origin from here on,
 * it does not restore it. Origin is therefore still taken from the two markers payment never
 * touched, and both are returned separately so the module can count how often they disagree.
 *
 * IT DELIBERATELY HAS NO DATE FILTER, and that is load-bearing rather than lazy. A person's
 * FIRST attempt decides which period they are counted in, so filtering rows by date before the
 * grouping makes "first" mean "first within the window": someone who tried in June and again in
 * November would be reported as a November first-timer, and a weekly report would count every
 * returning person as new. Caught by two passes over the same data disagreeing about November
 * (4 people versus 6). The window is applied to the OUTPUT instead, via `opts.since`.
 *
 * Loading the whole table is affordable because it is small - 248 rows in total as of
 * 2026-11-05. If it ever grows past a few tens of thousands, bound it by a date far enough back
 * to precede any person's first attempt, never by the reporting window.
 */
export const CHECKOUT_ATTEMPTS_SQL = `
  SELECT s.enrollment_id,
         s.created_at,
         s.status,
         e.payment_status,
         (e.explorer_entered_at IS NOT NULL)                       AS marker_entered_at,
         coalesce(c.cohort_type = 'explorer', false)               AS marker_explorer_cohort,
         -- coalesce, because the LEFT JOIN makes \`c.cohort_type = 'explorer'\` NULL for an
         -- enrollment with no cohort, and \`false OR NULL\` is NULL rather than false. Absence
         -- of any Explorer evidence is treated as never-explorer, which is the conservative
         -- reading: it cannot invent an Explorer, only miss one whose markers are both absent.
         coalesce(e.explorer_entered_at IS NOT NULL
                    OR c.cohort_type = 'explorer', false)          AS explorer_origin
  FROM subscriptions s
  JOIN enrollments e ON e.id = s.enrollment_id
  LEFT JOIN cohorts c ON c.id = e.cohort_id
  ORDER BY s.created_at`;
