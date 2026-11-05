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
 * Two further traps, both already paid for once:
 *
 *  - PER PERSON, NOT PER ROW. Clicking checkout again writes a fresh `subscriptions` row, which
 *    is how 39 abandoners were first reported as 147. The dedup to one row per person happens
 *    inside this module so it is unit tested, rather than living in whichever query runs last.
 *  - ARRIVAL COMES FROM `subscriptions`, NOT `enrollments`. `startCheckout` mints the payment
 *    link and writes a pending `subscriptions` row, so that row IS the arrival event.
 *    `enrollments.paysimple_customer_id` is populated on only 46 of 131 paid rows and must never
 *    be used as the marker: a funnel built on it reports more people paid than arrived.
 */

export type CheckoutPeriod = 'week' | 'month';

/** One raw checkout attempt, as stored. Several of these can belong to one person. */
export interface CheckoutAttemptRow {
  enrollment_id: string;
  /** `subscriptions.created_at` - the moment the payment link was minted. */
  created_at: string | Date;
  /** `subscriptions.status`. 'active' is the subscription-side definition of converted. */
  status: string | null;
  /** From the joined enrollment. Null is treated as its own bucket, never folded into standard. */
  enrollment_type: string | null;
  /** `enrollments.payment_status` - the enrollment-side definition of converted. */
  payment_status: string | null;
}

export interface CheckoutFunnelRow {
  period: string;
  enrollment_type: string;
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
    firstAt: number; periodKey: string; type: string;
    everActive: boolean; everPaid: boolean;
  }>();

  for (const a of attempts) {
    if (!a || !a.enrollment_id) continue;
    const at = a.created_at instanceof Date ? a.created_at : new Date(a.created_at);
    const ms = at.getTime();
    if (Number.isNaN(ms)) continue;                   // unparseable attempt is not an attempt

    const type = a.enrollment_type || '(unknown)';
    const active = String(a.status || '').toLowerCase() === 'active';
    const paid = String(a.payment_status || '').toLowerCase() === 'paid';

    const prev = byPerson.get(a.enrollment_id);
    if (!prev) {
      byPerson.set(a.enrollment_id, {
        firstAt: ms, periodKey: periodKey(at, period), type,
        everActive: active, everPaid: paid,
      });
      continue;
    }
    prev.everActive = prev.everActive || active;
    prev.everPaid = prev.everPaid || paid;
    if (ms < prev.firstAt) {
      prev.firstAt = ms;
      prev.periodKey = periodKey(at, period);
      prev.type = type;                               // the type at their first attempt
    }
  }
  return [...byPerson.values()];
}

export function computeCheckoutFunnel(
  attempts: CheckoutAttemptRow[],
  opts: { period?: CheckoutPeriod } = {}
): CheckoutFunnel {
  const period = opts.period || 'month';
  const people = perPerson(attempts || [], period);

  const cells = new Map<string, CheckoutFunnelRow>();
  const totals = new Map<string, number>();
  const shares = new Map<string, Map<string, number>>();

  for (const p of people) {
    const key = p.periodKey + '\u0000' + p.type;
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        period: p.periodKey, enrollment_type: p.type, started: 0,
        converted_subscription: 0, converted_paid: 0,
        pct_subscription: null, pct_paid: null,
      };
      cells.set(key, cell);
    }
    cell.started += 1;
    if (p.everActive) cell.converted_subscription += 1;
    if (p.everPaid) cell.converted_paid += 1;

    totals.set(p.periodKey, (totals.get(p.periodKey) || 0) + 1);
    if (!shares.has(p.periodKey)) shares.set(p.periodKey, new Map());
    const s = shares.get(p.periodKey)!;
    s.set(p.type, (s.get(p.type) || 0) + 1);
  }

  const rows = [...cells.values()].map((r) => ({
    ...r,
    pct_subscription: pct(r.converted_subscription, r.started),
    pct_paid: pct(r.converted_paid, r.started),
  })).sort((a, b) => a.period.localeCompare(b.period)
    || a.enrollment_type.localeCompare(b.enrollment_type));

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
        + ' points for enrollment_type "' + s.type + '" between ' + first.period + ' ('
        + s.from + '%) and ' + last.period + ' (' + s.to + '%). An aggregate conversion rate '
        + 'across these periods compares different populations and must not be quoted; read the '
        + 'per-type rows instead.';
    }
  }

  return { period, rows, mix, mixShiftWarning };
}

/** The SQL behind it, kept next to the logic it feeds so the two cannot drift apart. */
export const CHECKOUT_ATTEMPTS_SQL = `
  SELECT s.enrollment_id,
         s.created_at,
         s.status,
         e.enrollment_type,
         e.payment_status
  FROM subscriptions s
  JOIN enrollments e ON e.id = s.enrollment_id
  WHERE s.created_at >= :since
  ORDER BY s.created_at`;
