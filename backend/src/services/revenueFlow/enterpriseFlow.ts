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
 * Until it exists, every classification this stream uses declares `carriesValue: false`, so
 * `revenueFlowService.enforceValueHonesty` physically rejects any event that tries to carry
 * a number. The headline is `noMoney` and says why in words. A stream that cannot print a
 * figure cannot be misread as pipeline, which is the condition on which streams without
 * revenue were allowed onto a board whose headline is money.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { TileStatus } from '../commercialization/commercializationTiles';
import { ENTERPRISE_PLANS, EnterprisePlanKey, planOf } from './enterprisePlans';
import {
  FlowEvent, FunnelStage, RevenueStream, noMoney,
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
 * The money line, which is the same sentence whatever the counts are.
 *
 * Pulled out so the empty case and the populated case cannot drift into saying different
 * things about why there is no figure. The reason is structural, not a function of how many
 * rows there are.
 */
function noValueYet(signed: number): ReturnType<typeof noMoney> {
  const lead = signed === 0
    ? 'No signed deal yet'
    : `${signed} signed, value not recorded`;
  return noMoney(
    lead,
    'enterprise_intakes has no value, price or amount column, so a signed deal carries no '
    + 'figure and none can be derived. A human-confirmed deal value is this ticket\'s next '
    + 'phase, on the gov_bid_values pattern. Printing a 0 here would claim the work is worth '
    + 'nothing, which is a different statement from nobody having priced it.',
  );
}

/** A stage whose value is structurally absent. Every stage on this stream is one. */
function stage(key: string, label: string, count: number, definition: string): FunnelStage {
  return {
    key,
    label,
    count,
    value: noMoney(
      'Not priced',
      'No column on enterprise_intakes holds a value, so no stage of this funnel can carry '
      + 'one. The count is real; the figure does not exist yet.',
    ),
    classification: 'enterprise_inquiry',
    definition,
  };
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

  // ── THE FUNNEL ────────────────────────────────────────────────────────────────────────
  // Cumulative reach: a signed prospect is also an interviewed one. Counting each stage
  // exclusively would make the funnel sum to the total and read like a pie chart, which
  // hides the thing a funnel is for - how far the whole cohort got.
  const reached = {
    inquired: rows.length,
    callRequested: rows.filter((r) => r.call_requested_at || r.status === 'call_requested').length,
    interviewed: rows.filter((r) => r.interviewed_at || r.status === 'interviewed').length,
    proposalSent: rows.filter((r) => r.proposal_sent_at).length,
    signed: rows.filter((r) => r.signed_at || r.status === 'signed').length,
  };
  const lost = rows.filter((r) => r.lost_at || r.status === 'lost').length;

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
      'The intake reached signed. This is the stage a deal value would attach to, and the '
      + 'reason the next phase of this ticket exists.',
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

  for (const r of rows) {
    const who = r.company?.trim() || 'an unnamed company';
    const plan = planOf(r.service);
    const planSuffix = plan
      ? ` (${ENTERPRISE_PLANS.find((p) => p.key === plan)?.label})`
      : ' (plan not recorded)';
    push(r.created_at, 'enterprise_inquiry', `${who} enquired${planSuffix}`, r.id);
    push(r.interviewed_at, 'enterprise_interviewed', `${who} completed the intake interview`, r.id);
    push(r.proposal_sent_at, 'enterprise_proposal_sent', `Proposal sent to ${who}`, r.id);
    push(r.signed_at, 'enterprise_signed', `${who} signed`, r.id);
    push(r.lost_at, 'enterprise_lost', `${who} did not proceed`, r.id);
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
    : noValueYet(reached.signed);

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
  if (reached.signed > 0) {
    caveatParts.push(
      `${reached.signed} enterprise deal(s) are recorded as signed with no value, because `
      + 'no column holds one. They are absent from every figure on this page rather than '
      + 'counted as zero.',
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
