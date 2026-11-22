/**
 * R18 — the revenue sources that exist as decisions rather than as data.
 *
 * Ali, 2026-11-13: "The Revenue room should bring back all the business ideas we had - the
 * only thing is they are just not setup yet and should show that status. At least we can
 * have everything all in the same place."
 *
 * ── THIS REVERSES A DECISION R16 MADE ON PURPOSE, AND SAYS SO ────────────────────────────
 *
 * `revenueFlowService`'s header argued the five bets should stay off this board: "they are
 * bets rather than revenue, and adding them to a board whose headline is money would invite
 * them to be read as pipeline." That reasoning was sound and the instruction overrides it,
 * so the risk it named is handled here instead of ignored: nothing in this module can emit a
 * dollar figure. Every headline is `noMoney`, every stage value is `noMoney`, and the two
 * classifications these streams use both declare `carriesValue: false`, which
 * `revenueFlowService.enforceValueHonesty` checks at the boundary. A bet cannot be misread
 * as pipeline if it is structurally incapable of printing a number.
 *
 * ── WHY THE FUNNEL MEASURES *SETUP*, NOT THE BET ─────────────────────────────────────────
 *
 * The obvious funnel for a bet is its own evidence: "3 paid pilots by 31 Dec" becomes a
 * stage with a count of pilots. That funnel would be a lie in this module, because nothing
 * here reads production — and a stage reading `0` asserts a measurement that was never
 * taken. The R2 finding this ladder keeps relearning is that a zero and an unknown are
 * different answers.
 *
 * So these funnels count something this module genuinely knows, from the register and the
 * codebase in front of it: how far each idea has got toward being measurable at all.
 * Declared, then given a checkable definition, then wired to a data source, then earning.
 * Those four counts are facts about our own setup, and "not set up yet" is exactly the
 * status Ali asked to see.
 */
import { REVENUE_HYPOTHESES } from '../commercialization/hypothesisRegister';
import { TileStatus } from '../commercialization/commercializationTiles';
import { FlowEvent, FunnelStage, RevenueStream, noMoney } from './revenueFlowTypes';

export interface IdeaFlows {
  streams: RevenueStream[];
  events: FlowEvent[];
}

/**
 * One setup stage. `count` is a count of IDEAS at that stage, never of customers or dollars.
 *
 * The label says "ideas" in every case so a reader scanning the funnel cannot mistake the
 * number for pilots, members or bids.
 */
function setupStage(
  key: string,
  label: string,
  count: number,
  definition: string,
  /**
   * The stage wears its own stream's classification rather than a shared one, so a stage and
   * the legend entry explaining its colour always belong to the same stream. Both keys passed
   * here declare `carriesValue: false`, which is what keeps these stages structurally unable
   * to print a figure.
   */
  classification: 'hypothesis_evidence' | 'fde_setup' | 'conversion_setup',
): FunnelStage {
  return {
    key,
    label,
    count,
    value: noMoney(
      'Not revenue',
      'A setup stage counts ideas, not money. No idea on this board has a recorded value, '
      + 'because none of them has a source that could hold one.',
    ),
    classification,
    definition,
  };
}

/**
 * The five C0.1 revenue bets, as one filterable source.
 *
 * ── WHY FIVE BETS ARE ONE STREAM AND NOT FIVE ────────────────────────────────────────────
 *
 * Filtering is per stream, so five streams would give five filter chips, which is closer to
 * "filter by source" read literally. They are one stream anyway, for a reason that is about
 * colour rather than tidiness: stream identity is a categorical hue assigned in fixed order
 * from `--chart-N`, and the dataviz rule this repo follows caps a categorical series before
 * it runs out of pairs that survive a colour-vision check. Eight streams would mean eight
 * hues nobody validated, and the fix for a series that outgrows its palette is to fold, not
 * to generate. The five bets fold into the thing they have in common.
 *
 * Each bet is still individually visible as a stage definition, with its own evidence
 * requirement and deadline, so nothing is hidden by the folding.
 */
function betsStream(): RevenueStream {
  const bets = REVENUE_HYPOTHESES;
  const withDefinition = bets.filter((b) => b.evidenceRequired.trim().length > 0).length;

  return {
    key: 'hypotheses',
    label: 'Revenue bets (none set up)',
    status: 'unmeasurable' as TileStatus,
    headline: noMoney(
      `${bets.length} bets, none set up`,
      'A bet is a decision to test a way of making money, not money. None of the five has a '
      + 'source table, so there is no figure to report and a zero would be the wrong answer.',
    ),
    funnel: [
      setupStage(
        'declared', 'Ideas declared', bets.length,
        'A bet written down in the C0.1 register with a buyer, an evidence requirement and a '
        + 'kill condition. Declared is the weakest possible reading of "we have this idea".',
        'hypothesis_evidence',
      ),
      setupStage(
        'defined', 'Given a checkable definition', withDefinition,
        'The bet states what evidence keeps it alive and by when, so it can be judged from '
        + 'data rather than argued about. Every one of the five clears this bar.',
        'hypothesis_evidence',
      ),
      setupStage(
        'wired', 'Wired to a data source', 0,
        'Something in the database would move when this bet progresses. None of the five has '
        + 'one, which is why the Revenue Room cards all read unmeasurable.',
        'hypothesis_evidence',
      ),
      setupStage(
        'earning', 'Producing revenue', 0,
        'Money has arrived and can be traced to this bet. Nothing here has reached this stage.',
        'hypothesis_evidence',
      ),
    ],
    provenance:
      'The five bets come from the C0.1 revenue hypothesis register, transcribed 2026-10-23, '
      + 'and are read from `hypothesisRegister.ts` rather than retyped, so this stream cannot '
      + 'drift from the board that already renders them. The setup counts are facts about our '
      + 'own register and codebase, not measurements of the bets.',
    caveat:
      'The bets are shown so they are visible, not because they are pipeline. None of them '
      + 'carries a value anywhere in the schema, and this stream cannot print one.',
    // No drill-down: the Revenue Room cards below this dashboard already hold the per-bet
    // detail, and linking a stream to a card on the same page would be a loop, not a path.
    drillDownKey: null,
  };
}

/**
 * Companies hiring forward-deployed engineers through hire.refactored.ai.
 *
 * Ali, 2026-11-13: "add a Money making entity for Hire.refactored.ai where companies can
 * hire FDE's."
 *
 * ── WHY THIS SHIPS DECLARED RATHER THAN WIRED ────────────────────────────────────────────
 *
 * Placement billing already exists in this platform, so pointing this stream at it was the
 * tempting option and is the wrong one today. Two findings say so: most of the stated
 * recurring revenue cannot actually be billed, and `interaction_outcomes` rows are events
 * rather than people. Wiring a brand-new revenue line to tables carrying those caveats
 * would produce a confident number on its first render, which is the failure this whole
 * surface exists to prevent. It is declared, its status says so, and what it would take to
 * make it measurable is written down where the next person will find it.
 *
 * ── THE PRICE IS NOW DECIDED, WHICH ADVANCES ONE STAGE AND ONLY ONE ──────────────────────
 *
 * Ali, 2026-11-21: the fee is 10% of the first year salary, for talent hired out of the
 * platform. That settles the basis, so `defined` moves from 0 to 1. It deliberately does
 * NOT move `wired`: a fee basis is an agreement, and the three things still missing are a
 * table that records a placement, a hired salary to take a percentage OF, and an event that
 * marks the fee earned. None of those exists, and a stated price is not a measurement.
 *
 * ── CORRECTED FROM 1% ON 2026-11-21, AND THE CORRECTION IS RECORDED RATHER THAN QUIET ────
 *
 * This file said 1% from 16 November until 21 November, quoting Ali by date in four places
 * and asserting it in a test. On 21 November, describing the enterprise offer, he priced
 * the same motion at 10%. A tenfold difference in a stated price is not a thing to resolve
 * by picking the more plausible number, so it was put back to him with both figures and
 * their sources; he confirmed 10% and that the earlier 1% was wrong.
 *
 * It is written down here, not just changed, for two reasons. The figure was live on a
 * board Ram reads, so "it has always said 10%" would be false. And a price attributed to a
 * person by date is a claim about what they said - if the attribution can be rewritten
 * silently, the date beside it stops meaning anything.
 *
 * The number is carried here as a stated basis rather than rendered as money, which is the
 * same treatment `gov_bid_values` gives a priced bid: a human put their name to a figure,
 * and the figure still waits on an actual transaction before it counts.
 */
function fdeStream(): RevenueStream {
  return {
    key: 'hire_fde',
    label: 'FDE hiring (hire.refactored.ai)',
    status: 'unmeasurable' as TileStatus,
    headline: noMoney(
      'Priced, not yet set up',
      'Declared as a revenue source on 2026-11-13, priced on 2026-11-16 and REPRICED by Ali '
      + 'on 2026-11-21 at 10% of first '
      + 'year salary per hire. Nothing records a company paying to hire a forward-deployed '
      + 'engineer, so there is still no figure to report.',
    ),
    funnel: [
      setupStage(
        'declared', 'Ideas declared', 1,
        'Named as a revenue source: companies hire forward-deployed engineers through '
        + 'hire.refactored.ai. The product itself exists; the revenue path is what is new here.',
        'fde_setup',
      ),
      setupStage(
        'defined', 'Given a checkable definition', 1,
        'Settled by Ali on 2026-11-21: a fee per hire, at 10% of the first year salary, for '
        + 'all talent hired from the platform. That is a basis a system can compute against, '
        + 'which is what this stage asks for.',
        'fde_setup',
      ),
      setupStage(
        'wired', 'Wired to a data source', 0,
        'Still 0, and a stated price does not change it. Three things are missing: a table '
        + 'that records a placement made through hire.refactored.ai, the hired salary to take '
        + 'the percentage of, and the event that marks the fee earned. Placement billing '
        + 'exists elsewhere in the platform but carries its own caveats and is deliberately '
        + 'not read here yet.',
        'fde_setup',
      ),
      setupStage(
        'earning', 'Producing revenue', 0,
        'A company has paid a placement fee and it can be traced here. Not reached.',
        'fde_setup',
      ),
    ],
    provenance:
      'Declared by Ali on 2026-11-13, priced by Ali on 2026-11-16 and corrected to 10% on '
      + '2026-11-21. Every count above '
      + 'describes setup state, not trading activity, and no figure is derived from any table.',
    caveat:
      'FDE hiring has a price (10% of first year salary per hire, corrected from a mistaken '
      + '1% on 2026-11-21) and no way to record a '
      + 'placement, a salary or an earned fee. Until a table holds those three things, this '
      + 'stream can report progress but not money.',
    drillDownKey: null,
  };
}

/**
 * Converting people onto yearly subscriptions.
 *
 * Ali, 2026-11-16: "another source of revenue could be converting current customers over to
 * yearly subscription and also converting alumni to yearly subscription - those can both be
 * campaigns." A third population arrived in the same breath, from his thread with Taiwo:
 * moving DA-program students onto the AI platform, forgiving their existing contract in
 * exchange for a year paid up front.
 *
 * ── THREE AUDIENCES, ONE STREAM ──────────────────────────────────────────────────────────
 *
 * They fold for the reason `betsStream` gives: stream identity is a categorical hue and this
 * page has two validated slots, so a series that outgrows its palette folds rather than
 * generating hues nobody checked. They also belong together on the merits — every one of the
 * three ends in the same place, an `annual` row on `subscriptions`. Each audience stays
 * individually visible as its own stage definition, so the folding hides nothing.
 *
 * ── THE ONE COUNT THAT IS REAL, AND THE TWO THAT ARE NOT ─────────────────────────────────
 *
 * Measured against production on 2026-11-16, and this is the finding the stream exists to
 * make visible:
 *
 *   - **Current customers: 29.** Active `monthly` subscriptions carrying a
 *     `paysimple_payment_id`. People who actually pay us, every month, today. This audience
 *     is countable, addressable and sitting in this database.
 *   - **Alumni: not in this database.** `alumni_referral_profiles` holds 2 rows and
 *     `alumni_referrals` holds 1. There is no alumni roster here to run a campaign against.
 *   - **DA-program students: not in this database at all.** They live on the platform Ali
 *     wants to shut down, under the TFC, Clasp and IPBC contracts Taiwo is checking.
 *
 * So two of the three campaigns have no audience list on this side, and that is a migration
 * problem before it is a revenue problem. A funnel that printed an audience of 0 for them
 * would read as "nobody to ask", when the truth is "we cannot see them from here" — the zero
 * versus unknown distinction this whole surface is built on. They are therefore counted in
 * the DEFINED stage, where they genuinely stand, and their absence is stated in words.
 */
function conversionStream(): RevenueStream {
  return {
    key: 'subscription_conversion',
    label: 'Yearly conversion campaigns',
    status: 'unmeasurable' as TileStatus,
    headline: noMoney(
      '3 campaigns, 1 audience we can see',
      'Declared by Ali on 2026-11-16. A conversion becomes revenue as an annual subscription '
      + 'row, where the membership stream already counts it, so this stream reports campaign '
      + 'readiness and never a dollar. Counting it here as well would print the same money '
      + 'twice on one page.',
    ),
    funnel: [
      setupStage(
        'declared', 'Ideas declared', 3,
        'Three conversion motions named: current customers onto a yearly plan, alumni onto a '
        + 'yearly plan, and DA-program students moved onto the AI platform with their existing '
        + 'contract forgiven in exchange for a year paid up front.',
        'conversion_setup',
      ),
      setupStage(
        'defined', 'Given a checkable definition', 1,
        'Only the current-customer campaign has a definition a system could act on: 29 active '
        + 'monthly subscriptions carry a PaySimple payment id, so the audience is both known '
        + 'and reachable. The alumni campaign has no roster in this database (2 rows in '
        + 'alumni_referral_profiles) and the DA campaign has no rows here at all, because '
        + 'those students are on the platform being retired.',
        'conversion_setup',
      ),
      setupStage(
        'wired', 'Wired to a data source', 0,
        'Nothing records that a subscription changed plan because a campaign asked it to. '
        + '`subscriptions` holds the plan and the lifecycle dates but no attribution, so a '
        + 'monthly row becoming an annual row is indistinguishable from a new annual signup.',
        'conversion_setup',
      ),
      setupStage(
        'earning', 'Producing revenue', 0,
        'A conversion has been asked for, accepted, paid, and can be traced back to the ask. '
        + 'Not reached, and not reachable until the attribution above exists.',
        'conversion_setup',
      ),
    ],
    provenance:
      'Declared by Ali on 2026-11-16. The audience counts were measured directly against the '
      + 'production `subscriptions`, `alumni_referral_profiles` and `alumni_referrals` tables '
      + 'on 2026-11-16, read-only. The DA population was not measured because it is not in '
      + 'this database.',
    caveat:
      'Two of the three yearly-conversion campaigns have no audience list in this database: '
      + 'alumni (2 profile rows) and DA-program students (none, they are on the platform being '
      + 'retired, under contracts with TFC, Clasp and IPBC). Those are migration problems '
      + 'before they are revenue problems. A converted member is counted by the membership '
      + 'stream, never here, so this stream cannot report a dollar.',
    // Deliberately no drill-down: the audience that IS countable is 29 active monthly
    // subscriptions, and the subscription roster already has its own page. Minting a second
    // view of the same rows is how two surfaces start disagreeing about who is a member.
    drillDownKey: null,
  };
}

/**
 * Dated events for the bets: judgment dates that have ALREADY ARRIVED.
 *
 * ── WHY FUTURE DEADLINES ARE NOT EVENTS ──────────────────────────────────────────────────
 *
 * The first version of this emitted every bet's target date, and that was wrong in a way
 * worth recording. This timeline looks backward — the window is `DEFAULT_WINDOW_DAYS` of
 * history — and it sorts newest first. Feeding it dates in 2027 would have put the furthest
 * future at the very top of a list of things that happened, which is not a rounding error in
 * presentation: it reads as "this occurred". A deadline that has not arrived is a plan, and a
 * plan on a history is a lie told by sort order.
 *
 * So only a date that has passed becomes an event, and it means something real: this bet
 * reached the day it was supposed to be judged on. Today every one of the five targets is
 * still ahead (the earliest is 2026-12-31), so this correctly returns nothing, and the bets
 * stream contributes no timeline rows at all. An idea where nothing has happened should look
 * like an idea where nothing has happened.
 *
 * The upcoming dates are not lost — they are named in the stream's caveat, where a reader
 * meets them as "what is coming" instead of as "what happened".
 */
function betEvents(windowStart: Date, now: Date): FlowEvent[] {
  const from = windowStart.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  return REVENUE_HYPOTHESES
    .filter((b) => b.target.by >= from && b.target.by <= today)
    .map((b) => ({
      at: b.target.by,
      classification: 'hypothesis_deadline',
      stream: 'hypotheses' as const,
      label: `${b.label} reached its judgment date: ${b.evidenceRequired}`,
      entityKey: b.key,
      // Must stay null: `hypothesis_deadline` declares carriesValue: false and the service
      // rejects a violation rather than rendering it.
      valueCents: null,
    }));
}

/**
 * Build every declared-but-unbuilt revenue source.
 *
 * Synchronous in substance and async in shape, deliberately: it reads no database today, and
 * returning a promise keeps it interchangeable with the two real stream builders in
 * `revenueFlowService`'s `Promise.all`, so wiring one of these to a source later is a change
 * inside this module rather than a change to the assembler.
 *
 * `now` is a REQUIRED parameter and has no default, which is a correction rather than a
 * style choice. The first version of this took only `windowStart` and called
 * `betEvents(windowStart)` against a two-parameter function, so `now` arrived as `undefined`
 * and `now.toISOString()` threw on the first call. Nothing caught it because the module
 * shipped without tests, and because `revenueFlowService` wraps each builder in `.catch()`
 * to keep one bad stream from taking down the page — so in production the whole idea section
 * would have vanished behind a caveat that read like a data problem. A default of
 * `new Date()` would have hidden the same mistake differently, by letting the timeline
 * silently disagree with the `now` the rest of the board was built from. The caller has a
 * `now`; it passes it.
 */
export async function buildIdeaFlows(windowStart: Date, now: Date): Promise<IdeaFlows> {
  return {
    streams: [betsStream(), fdeStream(), conversionStream()],
    events: betEvents(windowStart, now),
  };
}
