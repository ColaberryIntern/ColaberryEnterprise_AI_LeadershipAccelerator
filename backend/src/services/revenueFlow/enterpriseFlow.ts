/**
 * R23 — enterprise.colaberry.ai as a revenue stream.
 *
 * Ali, 2026-11-21: a revenue source for the enterprise site, with its three plans, fed by
 * the intake that already turns a form into an Enterprise Client.
 *
 * ── WHAT THIS READS, AND WHAT IT DELIBERATELY DOES NOT BUILD ─────────────────────────────
 *
 * The intake pipeline is W28 and it already exists: `EnterpriseIntake` holds the form, an AI
 * interview by chat or voice, a Basecamp list per client, company research, pilot options,
 * an options email, a proposal, then signed or lost. This module adds no part of that. It
 * reads `enterprise_intakes` and reports where each prospect has got to.
 *
 * Making the FORM record which of the three plans a prospect chose is a change to W28's own
 * form and is not done here (see `enterprisePlans.planOf`). Until that lands, the plan
 * breakdown reports what is genuinely known and names the gap.
 *
 * ── THE TABLE IS EMPTY, AND THAT IS A NUMBER, NOT A BLANK ────────────────────────────────
 *
 * Measured against production on 2026-11-21, read-only: `enterprise_intakes` exists, is
 * correctly shaped, and holds ZERO rows. Zero at every stage — 0 interviewed, 0 proposals
 * sent, 0 signed, 0 lost.
 *
 * That makes this stream the one case on this board where a funnel of zeros is the honest
 * answer rather than a dishonest one. `ideaFlow`'s header sets the rule this inherits: "a
 * stage reading 0 asserts a measurement that was never taken", and the R2 finding behind it
 * is that a zero and an unknown are different answers. Here the measurement WAS taken: the
 * source exists and is empty. `TileStatus` already has the exact word for it,
 * `measured_zero`, and that is what this stream reports until a row arrives. A missing table
 * is a different state again and reports `unmeasurable`.
 *
 * A live offer that has produced no inquiries is a fact worth Ram seeing. An absent card
 * would have hidden it.
 *
 * ── WHY NOTHING HERE CAN PRINT A DOLLAR ──────────────────────────────────────────────────
 *
 * `EnterpriseIntake` has no value, price, amount or contract column anywhere on it. A signed
 * intake therefore carries no figure, and there is nothing in the schema from which one
 * could be derived.
 *
 * This is exactly the wall R16 hit on government bids, and its conclusion was recorded on
 * that ticket as "SO THE ONLY MISSING PIECE IS PRICE" — the whole funnel existed except the
 * number, which `gov_bid_values` then supplied as a human-confirmed value with a stated
 * basis. The same table, on the same pattern, is this ticket's Phase 2.
 *
 * ── PHASE 2 LANDED: THE PRICE NOW EXISTS, AND IS STILL A HUMAN'S CLAIM ───────────────────
 *
 * `enterprise_deal_values` is that table. It holds one live, human-confirmed value per
 * intake, with a basis somebody else could check, the term, and the name of the person who
 * put it there. So this stream CAN now print a figure — but only for a deal a named human has
 * priced, and only `enterprise_signed`, `enterprise_priced` and `enterprise_repriced` are
 * permitted to carry one. An inquiry, an interview and a sent proposal are still structurally
 * incapable of it, because none of them is money.
 *
 * Two rules carried over from the government stream, which learned both the hard way:
 *
 *   The headline sums ONLY priced deals. A signed deal nobody has valued is counted in a
 *   separate `unpricedSigned` figure reported BESIDE the total, never folded into it and
 *   never treated as zero. "Nobody has priced this" and "this is worth nothing" are
 *   different statements and the page must not merge them.
 *
 *   Total contract value and the annualized figure are reported side by side and never
 *   summed. A twelve-month build and a one-week training engagement are both "deal value",
 *   and adding them into one number beside annualized membership revenue would invite exactly
 *   the comparison that is wrong.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { TileStatus } from '../commercialization/commercializationTiles';
import { ENTERPRISE_PLANS, EnterprisePlanKey, planOf } from './enterprisePlans';
import { DealValue, annualizedCents, getLiveDealValues } from './enterpriseDealValueService';
import {
  FlowEvent, FunnelStage, RevenueStream, formatCents, money, noMoney,
} from './revenueFlowTypes';

export interface EnterpriseFlow {
  stream: RevenueStream;
  events: FlowEvent[];
}

/** One intake, reduced to the dated facts a funnel needs. */
interface IntakeRow {
  id: string;
  company: string | null;
  service: string | null;
  status: string | null;
  created_at: string | null;
  call_requested_at: string | null;
  interviewed_at: string | null;
  proposal_sent_at: string | null;
  signed_at: string | null;
  lost_at: string | null;
}

const STREAM_KEY = 'enterprise_site' as const;
const LABEL = 'Enterprise site (enterprise.colaberry.ai)';

/** Day precision, matching every other dated thing on this board. */
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

/**
 * The money line for the signed cohort.
 *
 * Three genuinely different answers, kept apart on purpose:
 *   - nothing signed at all
 *   - signed, and nobody has put a value on any of it
 *   - signed, with some or all of it priced
 *
 * The third case reports the priced total and says in its provenance how many signed deals
 * are missing from it, so the gap travels with the figure rather than living in a caveat
 * nobody scrolls to.
 */
function signedMoney(signed: number, priced: DealValue[], unpricedSigned: number) {
  if (signed === 0) {
    return noMoney(
      'No signed deal yet',
      'No enterprise intake has reached signed, so there is nothing to value. This is a '
      + 'measured zero: the funnel was read and the stage is empty.',
    );
  }
  if (priced.length === 0) {
    return noMoney(
      `${signed} signed, none valued`,
      'enterprise_deal_values holds no live value for any signed intake. A value is written '
      + 'only by a named person with a stated basis, so an unvalued deal reports as signed '
      + 'with no number rather than as a guess. Printing a 0 would claim the work is worth '
      + 'nothing, which is a different statement from nobody having priced it.',
    );
  }
  const total = priced.reduce((n, v) => n + v.dealValueCents, 0);
  const gap = unpricedSigned > 0
    ? ` ${unpricedSigned} signed deal(s) carry no value and are absent from this total rather `
      + 'than counted as zero.'
    : ' Every signed deal is valued.';
  return money(
    total,
    `Total contract value of ${priced.length} live, human-confirmed enterprise deal value(s). `
    + 'A value exists only where a named person recorded one with a basis another person '
    + `could check, so an estimate nobody owns cannot enter this total.${gap}`,
  );
}

/**
 * A stage of this funnel.
 *
 * `value` defaults to the structural absence, because for all but one stage that is the
 * truth: a count of inquiries or interviews is not money and no column could make it so.
 * The signed stage passes its own figure.
 */
function stage(
  key: string,
  label: string,
  count: number,
  definition: string,
  value: FunnelStage['value'] = noMoney(
    'Not money',
    'This stage counts people at a point in the funnel, not dollars. Only the signed stage '
    + 'can carry a figure, and only where a human has recorded one.',
  ),
  classification: FunnelStage['classification'] = 'enterprise_inquiry',
): FunnelStage {
  return { key, label, count, value, classification, definition };
}

function absentFlow(reason: string): EnterpriseFlow {
  return {
    stream: {
      key: STREAM_KEY,
      label: LABEL,
      status: 'unmeasurable' as TileStatus,
      headline: noMoney('Cannot be read', reason),
      funnel: [],
      provenance: reason,
      caveat: reason,
      drillDownKey: null,
    },
    events: [],
  };
}

/**
 * Build the enterprise site stream.
 *
 * `windowStart` bounds the EVENTS only, never the funnel. The funnel is a statement about
 * every prospect who has ever come through the door, and a funnel that silently dropped
 * anyone older than the timeline window would report a smaller business than we have.
 */
export async function buildEnterpriseFlow(windowStart: Date): Promise<EnterpriseFlow> {
  if (!(await tableExists('enterprise_intakes'))) {
    return absentFlow(
      'enterprise_intakes is not present in this database, so enterprise inquiries cannot '
      + 'be counted. A missing source is not an empty one: this reads as unmeasurable, not '
      + 'as zero inquiries.',
    );
  }

  const rows = await sequelize.query<IntakeRow>(
    `SELECT id::text,
            company,
            service,
            status::text,
            created_at::text,
            call_requested_at::text,
            interviewed_at::text,
            proposal_sent_at::text,
            signed_at::text,
            lost_at::text
       FROM enterprise_intakes`,
    { type: QueryTypes.SELECT },
  );

  // Phase 2. Tolerated as absent rather than required: the table is created at boot, and a
  // board that 500s because one of its ten streams cannot find an optional table is not the
  // better outcome. An empty list simply means nothing is priced yet.
  const liveValues = await getLiveDealValues().catch(() => [] as DealValue[]);
  const valueByIntake = new Map<string, DealValue>(
    liveValues.map((v) => [v.enterpriseIntakeId, v]),
  );

  // ── THE FUNNEL ────────────────────────────────────────────────────────────────────────
  // Cumulative reach: a signed prospect is also an interviewed one. Counting each stage
  // exclusively would make the funnel sum to the total and read like a pie chart, which
  // hides the thing a funnel is for - how far the whole cohort got.
  // `signedRows` is the SINGLE definition of "signed" in this module, and the funnel's count
  // comes FROM it rather than from a second copy of the same predicate.
  //
  // That is not tidiness. Mutation testing on 2026-11-21 widened a duplicated `signedRows` to
  // include every intake and no test failed, because the headline was gated on a
  // separately-derived count that still read the right number. Two derivations of one fact
  // can drift, and what hid behind them was a value from an UNSIGNED deal landing in a
  // revenue total. One derivation cannot drift from itself.
  const signedRows = rows.filter((r) => r.signed_at || r.status === 'signed');

  const reached = {
    inquired: rows.length,
    callRequested: rows.filter((r) => r.call_requested_at || r.status === 'call_requested').length,
    interviewed: rows.filter((r) => r.interviewed_at || r.status === 'interviewed').length,
    proposalSent: rows.filter((r) => r.proposal_sent_at).length,
    signed: signedRows.length,
  };
  const lost = rows.filter((r) => r.lost_at || r.status === 'lost').length;

  // ── WHAT IS PRICED, AND WHAT IS SIGNED BUT NOT ────────────────────────────────────────
  // Scoped to SIGNED intakes deliberately. A value could in principle be recorded against a
  // deal still in proposal, and that is legitimate forecasting - but the headline on a board
  // whose other number is booked membership revenue must not quietly include it. Pipeline
  // and revenue stay apart, which is the rule the government stream's headline follows too.
  const signedPriced = signedRows
    .map((r) => valueByIntake.get(r.id))
    .filter((v): v is DealValue => Boolean(v));
  const unpricedSigned = signedRows.length - signedPriced.length;

  const funnel: FunnelStage[] = [
    stage(
      'inquired', 'Filled out the form', reached.inquired,
      'An enterprise_intakes row exists. This is the moment W28 was built to start from: '
      + '"the moment they decide to fill out the form".',
    ),
    stage(
      'call_requested', 'Asked for the call', reached.callRequested,
      'They ticked that the AI may call them and a call was requested. A number without '
      + 'that explicit consent is never dialled, so this stage counts permission as well '
      + 'as intent.',
    ),
    stage(
      'interviewed', 'Completed the AI interview', reached.interviewed,
      'The intake interview finished, by typed chat or by call, and produced a write-up. '
      + 'This is the first stage where we know what they actually need.',
    ),
    stage(
      'proposal_sent', 'Proposal sent', reached.proposalSent,
      'A proposal was drafted from their list and SENT. Drafting alone does not count: '
      + 'proposal_sent_at is set only by a real send, which Ali performs.',
    ),
    stage(
      'signed', 'Signed', reached.signed,
      'The intake reached signed and the prospect became an Enterprise Client. This is the '
      + 'one stage that can carry a figure, and only where a named person recorded one.',
      signedMoney(reached.signed, signedPriced, unpricedSigned),
      'enterprise_signed',
    ),
  ];

  // ── THE PLAN BREAKDOWN ────────────────────────────────────────────────────────────────
  // Reported as stages so it renders in the same grammar as the funnel, with its own
  // definitions. These are NOT cumulative and each definition says so.
  const byPlan = new Map<EnterprisePlanKey, number>();
  let blank = 0;
  let unrecognized = 0;
  for (const r of rows) {
    const key = planOf(r.service);
    if (key) byPlan.set(key, (byPlan.get(key) ?? 0) + 1);
    else if (!String(r.service ?? '').trim()) blank += 1;
    else unrecognized += 1;
  }

  for (const plan of ENTERPRISE_PLANS) {
    funnel.push(stage(
      `plan_${plan.key}`, plan.label, byPlan.get(plan.key) ?? 0,
      `${plan.means} Counts inquiries asking for this plan, not cumulative reach. Read off `
      // "open-text" rather than the usual technical term for it: this string is COPY, and
      // the TWC 807.172(d) ratchet over backend/src correctly cannot tell that term from
      // advertising. It caught this on the first CI run. Same fix R16 made when
      // membershipFlow's provenance tripped it.
      + 'the open-text service field, so it undercounts rather than guesses.',
    ));
  }

  // The honest gap, always shown, never folded into a plan. Blank and unrecognized are
  // counted apart because they are different problems: one is a form that never asked, the
  // other is an answer we could not read.
  funnel.push(stage(
    'plan_unattributed', 'Plan not recorded', blank + unrecognized,
    `${blank} inquiry(ies) left the service field empty and ${unrecognized} carried text `
    + 'matching none of the three plans. The W28 form does not yet constrain this field to '
    + 'the three plans, which is a change to that form and not made here. Shown beside the '
    + 'plans so the gap is visible rather than quietly excluded.',
  ));

  // ── EVENTS ────────────────────────────────────────────────────────────────────────────
  // One event per dated transition that actually happened, bounded by the window. Every
  // valueCents is null because the classification says it must be.
  const start = day(windowStart.toISOString());
  const events: FlowEvent[] = [];
  const push = (at: string | null, classification: string, label: string, entityKey: string | null): void => {
    const d = day(at);
    if (!d || (start && d < start)) return;
    events.push({ at: d, classification, stream: STREAM_KEY, label, entityKey, valueCents: null });
  };

  // Only the three money classifications may carry a figure, and they do so only where a
  // human recorded one. `enforceValueHonesty` rejects a violation at the boundary, so passing
  // a number on the wrong classification here would be caught rather than rendered.
  const pushValued = (
    at: string | null,
    classification: string,
    label: string,
    entityKey: string | null,
    valueCents: number | null,
  ): void => {
    const d = day(at);
    if (!d || (start && d < start)) return;
    events.push({ at: d, classification, stream: STREAM_KEY, label, entityKey, valueCents });
  };

  for (const r of rows) {
    const who = r.company?.trim() || 'an unnamed company';
    const plan = planOf(r.service);
    const planSuffix = plan
      ? ` (${ENTERPRISE_PLANS.find((p) => p.key === plan)?.label})`
      : ' (plan not recorded)';
    const priced = valueByIntake.get(r.id) ?? null;

    push(r.created_at, 'enterprise_inquiry', `${who} enquired${planSuffix}`, r.id);
    push(r.interviewed_at, 'enterprise_interviewed', `${who} completed the intake interview`, r.id);
    push(r.proposal_sent_at, 'enterprise_proposal_sent', `Proposal sent to ${who}`, r.id);

    // A signed deal carries its value where one exists, and null where it does not. Null, not
    // zero: the event still appears, so a reader sees the win and sees that nobody has
    // valued it.
    pushValued(
      r.signed_at, 'enterprise_signed',
      priced ? `${who} signed, worth ${formatCents(priced.dealValueCents, priced.currency)}`
        : `${who} signed, value not recorded`,
      r.id, priced ? priced.dealValueCents : null,
    );
    push(r.lost_at, 'enterprise_lost', `${who} did not proceed`, r.id);

    // The valuation is its own dated event, because "the number was revised on the 14th" is
    // worth reading. `superseded_by_id` on the old row is what makes a revision knowable;
    // this live row is a reprice exactly when the history behind it is not empty, which the
    // service exposes through its own history read rather than being guessed at here.
    if (priced) {
      pushValued(
        priced.confirmedAt, 'enterprise_priced',
        `${who} valued at ${formatCents(priced.dealValueCents, priced.currency)} `
        + `by ${priced.confirmedBy} (${priced.basisSource.replace(/_/g, ' ')})`,
        r.id, priced.dealValueCents,
      );
    }
  }

  // ── STATUS ────────────────────────────────────────────────────────────────────────────
  // measured_zero is the point of this stream today: the source exists, it is shaped
  // correctly, and the answer is genuinely 0. 'live' only once something is in it.
  const status: TileStatus = rows.length === 0 ? 'measured_zero' : 'live';

  const headline = rows.length === 0
    ? noMoney(
      'No inquiries yet',
      'enterprise_intakes exists and holds 0 rows, measured 2026-11-21. The offer is live '
      + 'on enterprise.colaberry.ai and the intake pipeline is built; nobody has applied. '
      + 'This is a measured zero, not a missing measurement.',
    )
    : signedMoney(reached.signed, signedPriced, unpricedSigned);

  const caveatParts: string[] = [];
  if (rows.length === 0) {
    caveatParts.push(
      'The enterprise site has produced no inquiries at all. The form, the AI interview and '
      + 'the per-client Basecamp list are built and live, so this is a demand problem rather '
      + 'than a plumbing one.',
    );
  }
  if (blank + unrecognized > 0) {
    caveatParts.push(
      `${blank + unrecognized} enterprise inquiry(ies) cannot be attributed to one of the `
      + 'three plans, because the intake form does not yet constrain its service field to '
      + 'them.',
    );
  }
  if (unpricedSigned > 0) {
    caveatParts.push(
      `${unpricedSigned} signed enterprise deal(s) carry no confirmed value and are therefore `
      + 'absent from the total rather than counted as zero. A value is written only by a named '
      + 'person with a stated basis, so this gap closes by somebody pricing the deal, not by '
      + 'the system inferring a figure.',
    );
  }
  // Said out loud whenever the headline prints money, because the two figures are not
  // comparable and a reader scanning a revenue board will try to compare them.
  const annualizable = signedPriced.filter((v) => annualizedCents(v) !== null);
  if (signedPriced.length > 0 && annualizable.length < signedPriced.length) {
    caveatParts.push(
      `${signedPriced.length - annualizable.length} priced enterprise deal(s) have no recorded `
      + 'term, so no annualized figure is offered for them. Assuming twelve months would '
      + 'flatter a short engagement and understate a multi-year one.',
    );
  }

  return {
    stream: {
      key: STREAM_KEY,
      label: LABEL,
      status,
      headline,
      funnel,
      provenance:
        'Counted from enterprise_intakes, the table the W28 intake writes when someone fills '
        + 'in the enterprise form. Stages are the real dated columns on that row, so a stage '
        + 'is reached only when the thing actually happened, never when it was scheduled. '
        + 'The three plans are the site\'s own Build / Guide / Train services.',
      caveat: caveatParts.length ? caveatParts.join(' ') : null,
      // No Revenue Room drill-down exists for enterprise intakes. The admin surface that
      // shows them is the Enterprise Clients page, which is not a revenue drill-down, so
      // this stays null rather than pointing at something that would not open.
      drillDownKey: null,
    },
    events,
  };
}
