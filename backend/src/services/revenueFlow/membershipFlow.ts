/**
 * R16 — membership as a funnel, and the gap between the plan and the bank.
 *
 * ── THIS CARD ABSORBS "ANNUALIZED REVENUE", BECAUSE THEY WERE ALWAYS ONE NUMBER ──────────
 *
 * Ali asked whether Membership and Annualized should be combined. They already were, twice
 * over: `revenueRoomService` fills the Membership card by calling `annualizedRevenue()`, and
 * the Commercialization board's `annualized_revenue` tile calls the same function. Since
 * R13 merged that board into the Revenue Room, one computation has been printing on one page
 * under two names. This stream is the single home for it.
 *
 * The figure is read through `annualizedRevenueCents()` rather than re-derived here, for the
 * reason that function's own header gives: two surfaces computing revenue independently
 * eventually disagree, and the first anyone notices is a meeting with two different numbers
 * on two screens.
 *
 * ── THE NUMBER THAT MATTERS MOST IS NOT THE REVENUE ──────────────────────────────────────
 *
 * Measured against production on 2026-11-12, across 274 subscription rows:
 *
 *     status    plan      rows   with paysimple
 *     pending   monthly     96                0
 *     pending   annual      36                0
 *     failed    monthly     25                0
 *     failed    annual      17                0
 *     active    monthly     26               26
 *     active    comp        27                0   ($0 by definition)
 *     active    annual       6                6
 *     canceled  monthly     35               34
 *     canceled  comp         5                0
 *     canceled  annual       1                1
 *
 * 32 rows are billable. 174 rows carry a plan and a price and NO payment id, so they never
 * paid anything. That gap is the story of this stream, and it gets its own classification
 * and its own funnel stage rather than being folded into a status pill, because
 * "most of the stated MRR cannot be billed" is a finding this business has already had to
 * learn once.
 *
 * The `would_be` figure attached to those rows is shown as what it WOULD have been, never as
 * revenue. That distinction is the entire reason `carriesValue` and `direction` are separate
 * fields on a classification.
 *
 * ── WHAT THIS STREAM CANNOT SHOW, AND WHY IT SAYS SO ─────────────────────────────────────
 *
 * There is no payments ledger. `information_schema` on 2026-11-12 returned no `payments`,
 * `invoices` or `transactions` table; the only money-bearing tables are `subscriptions`,
 * `refunds`, `account_credits`, `marketing_spend_facts` and
 * `subscription_renewal_reminders`. So:
 *
 *   - RENEWAL HISTORY IS NOT RECONSTRUCTABLE. `current_period_end` holds ONE date: the next
 *     boundary. A member who has paid nine times looks identical to one who has paid once.
 *     `member_renewed` is therefore forward-looking only and never appears in the historical
 *     timeline.
 *   - A FAILED PAYMENT HAS NO DATE. Nothing records when it failed, and dating it from
 *     `updated_at` would put a guess on a timeline wearing a timestamp. It is a funnel state
 *     and not an event.
 *
 * Both are stated on the page rather than left for a reader to assume the timeline is
 * complete.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { TileStatus } from '../commercialization/commercializationTiles';
import { annualizedRevenueCents } from '../commercialization/commercializationBoardService';
import {
  FlowEvent, FunnelStage, Money, RevenueStream, money, noMoney, formatCents,
} from './revenueFlowTypes';

interface SubRow {
  id: string;
  plan: string;
  status: string;
  amount_cents: number;
  has_payment: boolean;
  created_at: string | null;
  started_at: string | null;
  canceled_at: string | null;
  current_period_end: string | null;
}

interface RefundRow {
  id: string;
  amount_cents: number;
  status: string | null;
  created_at: string;
}

interface Tally {
  rows: number;
  cents: number;
}

/** Day precision. The timeline buckets by day; a time of day would be false detail. */
function day(iso: string | null): string | null {
  return iso ? String(iso).slice(0, 10) : null;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await sequelize.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :name`,
    { type: QueryTypes.SELECT, replacements: { name } },
  );
  return (rows[0]?.n ?? 0) > 0;
}

export interface MembershipFlow {
  stream: RevenueStream;
  events: FlowEvent[];
  /** Pulled up for the page headline. */
  annualizedCents: number | null;
}

function absentFlow(reason: string): MembershipFlow {
  return {
    stream: {
      key: 'membership',
      label: 'Membership (annualized)',
      status: 'unmeasurable' as TileStatus,
      headline: noMoney('Cannot be read', reason),
      funnel: [],
      provenance: reason,
      caveat: reason,
      drillDownKey: 'membership_subscriptions',
    },
    events: [],
    annualizedCents: null,
  };
}

export async function buildMembershipFlow(windowStart: Date): Promise<MembershipFlow> {
  if (!(await tableExists('subscriptions'))) {
    return absentFlow(
      'subscriptions is not present in this database, so membership cannot be counted. '
      + 'A missing source is not an empty one.',
    );
  }

  const subs = await sequelize.query<SubRow>(
    `SELECT id, plan::text AS plan, status::text AS status,
            COALESCE(amount_cents, 0)::int AS amount_cents,
            (paysimple_payment_id IS NOT NULL) AS has_payment,
            created_at::text, started_at::text, canceled_at::text,
            current_period_end::text
       FROM subscriptions`,
    { type: QueryTypes.SELECT },
  );

  const refunds = (await tableExists('refunds'))
    ? await sequelize.query<RefundRow>(
      `SELECT id, COALESCE(amount_cents, 0)::int AS amount_cents, status::text AS status,
              created_at::text
         FROM refunds`,
      { type: QueryTypes.SELECT },
    )
    : [];

  // ── TALLIES ───────────────────────────────────────────────────────────────────────────
  const add = (t: Tally, cents: number): Tally => ({ rows: t.rows + 1, cents: t.cents + cents });
  const zero: Tally = { rows: 0, cents: 0 };

  let signedUp = zero;
  let neverPaid = zero;      // no payment id, ever. the gap.
  let payingNow = zero;      // active AND has a payment id AND priced
  let comped = zero;         // active comp, $0
  let churned = zero;        // canceled, having paid
  let failed = zero;         // status failed

  for (const s of subs) {
    signedUp = add(signedUp, s.amount_cents);
    const isComp = s.plan === 'comp' || s.amount_cents === 0;

    if (s.status === 'active' && isComp) { comped = add(comped, 0); continue; }
    if (s.status === 'active' && s.has_payment) { payingNow = add(payingNow, s.amount_cents); continue; }
    if (s.status === 'canceled') {
      if (s.has_payment) churned = add(churned, s.amount_cents);
      else neverPaid = add(neverPaid, s.amount_cents);
      continue;
    }
    if (s.status === 'failed') {
      failed = add(failed, s.amount_cents);
      // A failed row also never paid. Counted in BOTH, deliberately: the funnel stage
      // answers "what went wrong" and the gap answers "how much of the plan is fiction".
      neverPaid = add(neverPaid, s.amount_cents);
      continue;
    }
    if (!s.has_payment) neverPaid = add(neverPaid, s.amount_cents);
  }

  const settledRefunds = refunds.filter((r) => (r.status ?? 'succeeded') !== 'failed');
  const refundedCents = settledRefunds.reduce((a, r) => a + r.amount_cents, 0);

  // ── THE HEADLINE, READ THROUGH THE ONE FUNCTION THAT OWNS THE RULE ────────────────────
  let annualized: number | null = null;
  let annualizedCaveat: string | undefined;
  try {
    const r = await annualizedRevenueCents();
    annualized = r.cents;
    annualizedCaveat = r.caveat;
  } catch (e: any) {
    annualizedCaveat = `The annualized figure could not be read: ${e?.message}`;
  }

  // ── EVENTS ────────────────────────────────────────────────────────────────────────────
  //
  // Only classifications with a REAL date appear here. `member_renewed` is forward-looking
  // and `payment_failed` has no date at all, so neither is emitted; both live in the funnel.
  const since = day(windowStart.toISOString()) as string;
  const events: FlowEvent[] = [];

  for (const s of subs) {
    const isComp = s.plan === 'comp' || s.amount_cents === 0;

    const started = day(s.started_at);
    if (started && started >= since && s.has_payment) {
      events.push({
        at: started,
        classification: 'member_started',
        stream: 'membership',
        label: `${s.plan} member started at ${formatCents(s.amount_cents)}`,
        entityKey: s.id,
        valueCents: s.amount_cents,
      });
    }
    if (started && started >= since && isComp && !s.has_payment) {
      events.push({
        at: started,
        classification: 'comped',
        stream: 'membership',
        label: 'Comped seat granted (no revenue)',
        entityKey: s.id,
        // The classification declares carriesValue: false. A comp is $0 by definition and
        // printing "$0" invites it to be read as a measurement rather than a definition.
        valueCents: null,
      });
    }

    // Signed up and never paid, dated from when they signed up. This is the only honest
    // date for the gap, and it is a real one.
    const created = day(s.created_at);
    if (created && created >= since && !s.has_payment && !isComp) {
      events.push({
        at: created,
        classification: 'never_paid',
        stream: 'membership',
        label: `${s.plan} signup, never paid (would have been ${formatCents(s.amount_cents)})`,
        entityKey: s.id,
        valueCents: s.amount_cents,
      });
    }

    const canceled = day(s.canceled_at);
    if (canceled && canceled >= since) {
      events.push({
        at: canceled,
        classification: 'member_canceled',
        stream: 'membership',
        label: s.has_payment
          ? `${s.plan} member canceled (was ${formatCents(s.amount_cents)})`
          : `${s.plan} signup canceled, had never paid`,
        entityKey: s.id,
        valueCents: s.has_payment ? s.amount_cents : null,
      });
    }
  }

  for (const r of settledRefunds) {
    const at = day(r.created_at);
    if (!at || at < since) continue;
    events.push({
      at,
      classification: 'refunded',
      stream: 'membership',
      label: `Refund issued (${formatCents(r.amount_cents)})`,
      entityKey: r.id,
      valueCents: r.amount_cents,
    });
  }

  // ── FUNNEL ────────────────────────────────────────────────────────────────────────────
  // Renewals still ahead of today. Compared as ISO day strings, which sort
  // lexicographically in date order, so no Date parsing is needed per row.
  const today = day(new Date().toISOString()) as string;
  const upcoming = subs.filter((s) => {
    if (s.status !== 'active' || !s.has_payment) return false;
    const end = day(s.current_period_end);
    return end !== null && end >= today;
  });

  const funnel: FunnelStage[] = [
    {
      key: 'signed_up',
      label: 'Signed up',
      count: signedUp.rows,
      value: noMoney(
        'Not revenue',
        'Every subscription row regardless of status. A plan, not a payment.',
      ),
      classification: 'never_paid',
      definition: 'Any row in subscriptions. The widest possible reading of "member".',
    },
    {
      key: 'never_paid',
      label: 'Never paid',
      count: neverPaid.rows,
      value: money(
        neverPaid.cents,
        'What these plans WOULD have been worth. Not revenue, and never counted as any. '
        + 'These rows carry no paysimple_payment_id, so no charge ever landed.',
      ),
      classification: 'never_paid',
      definition:
        'A subscription with no paysimple_payment_id. Pending and failed rows both qualify: '
        + 'the plan exists and the money never did.',
    },
    {
      key: 'failed',
      label: 'Payment failed',
      count: failed.rows,
      value: money(
        failed.cents,
        'The priced amount on rows at status=failed. A subset of "never paid", shown '
        + 'separately because a failure is recoverable and an abandonment is not.',
      ),
      classification: 'payment_failed',
      definition:
        'status = failed. No column records WHEN it failed, so this stage has a count and '
        + 'no timeline events.',
    },
    {
      key: 'comped',
      label: 'Comped',
      count: comped.rows,
      value: noMoney(
        'Zero by definition',
        'A comp plan carries no charge. Shown so a member count can never be mistaken '
        + 'for revenue.',
      ),
      classification: 'comped',
      definition: 'An active comp plan at zero cents.',
    },
    {
      key: 'paying',
      label: 'Paying now',
      count: payingNow.rows,
      value: money(
        payingNow.cents,
        'The sum of the billed amount on active subscriptions that carry a PaySimple '
        + 'payment id. This is money, at its own billing cadence rather than annualized.',
      ),
      classification: 'member_started',
      definition:
        'status = active AND paysimple_payment_id IS NOT NULL. The app-origination marker, '
        + 'which is the same rule the revenue figure uses.',
    },
    {
      key: 'renewal_due',
      label: 'Renewal ahead',
      count: upcoming.length,
      value: noMoney(
        'Forward-looking',
        'The next billing boundary on paying subscriptions. Past renewals cannot be '
        + 'reconstructed: current_period_end holds one date and there is no payment ledger.',
      ),
      classification: 'member_renewed',
      definition: 'An active, paying subscription whose current_period_end is still ahead.',
    },
    {
      key: 'churned',
      label: 'Canceled after paying',
      count: churned.rows,
      value: money(
        churned.cents,
        'The amount these subscriptions were billed before cancellation. Money that stopped, '
        + 'not money returned.',
      ),
      classification: 'member_canceled',
      definition: 'status = canceled AND the row carried a payment id, so it really was revenue once.',
    },
    {
      key: 'refunded',
      label: 'Refunded',
      count: settledRefunds.length,
      value: settledRefunds.length
        ? money(refundedCents, 'Sum of settled rows in the refunds table. The only money genuinely paid back.')
        : noMoney('None', 'The refunds table holds no settled row.'),
      classification: 'refunded',
      definition: 'A refunds row that is not status=failed.',
    },
  ];

  const caveats = [
    annualizedCaveat,
    neverPaid.rows > 0
      ? `${neverPaid.rows} of ${signedUp.rows} subscription rows never carried a payment, `
        + `representing ${formatCents(neverPaid.cents)} of plans that were never billable. `
        + 'That figure is shown as a gap, never as revenue or pipeline.'
      : null,
    'There is no payments ledger in this database, so this stream reports subscription '
    + 'state changes rather than cash events. Renewal history is not reconstructable.',
  ].filter(Boolean) as string[];

  return {
    stream: {
      key: 'membership',
      label: 'Membership (annualized)',
      status: (annualized === null ? 'unmeasurable' : 'live') as TileStatus,
      headline: annualized === null
        ? noMoney('Cannot be read', annualizedCaveat ?? 'The annualized figure is unavailable.')
        : money(
          annualized,
          'Annualized from active subscriptions carrying a paysimple_payment_id, computed by '
          + 'annualizedRevenueCents() — the same function the Commercialization tile used, so '
          + 'the two can never disagree. This card absorbs that tile.',
        ),
      funnel,
      provenance:
        'subscriptions for the lifecycle and the amounts, refunds for money returned. '
        + 'The annualized headline comes from the one shared revenue function.',
      caveat: caveats.join(' '),
      drillDownKey: 'membership_subscriptions',
    },
    events,
    annualizedCents: annualized,
  };
}
