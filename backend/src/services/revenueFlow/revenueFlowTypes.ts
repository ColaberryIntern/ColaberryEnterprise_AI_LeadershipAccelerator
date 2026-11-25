/**
 * R16 — the shapes the Revenue Flow dashboard is made of.
 *
 * Separated from both the classification registry and the service so the two stream
 * builders (`membershipFlow`, `govBidFlow`) can depend on the vocabulary without depending
 * on each other, and so `revenueFlowService` can assemble them without either knowing it
 * exists. Three modules importing one small types file is the shape that keeps the
 * dependency graph acyclic, which the repo's composition rule asks for explicitly.
 */
import { TileStatus } from '../commercialization/commercializationTiles';
import { ClassificationKey, FlowStreamKey, FlowTone } from './revenueClassifications';
import type { StreamBrand } from './revenueBrandVocabulary';
// Type-only, so it is erased at compile time and this types module gains no runtime
// dependency on a service that reads the database.
import type { PreProjectTier } from './govPreProjectTier';
import type { Money } from './money';

/**
 * The money vocabulary moved to its own leaf module in R12, when this file crossed the
 * 500-line ceiling and the rule required a split before new code. Re-exported here so every
 * existing caller keeps importing `Money`, `money`, `noMoney` and `formatCents` from the one
 * place it has always imported them from.
 */
export { formatCents, money, noMoney } from './money';
export type { Money } from './money';

/**
 * One dated, classified thing that happened.
 *
 * `at` is when it HAPPENED, never when we recorded it — the same distinction
 * `revenue_evidence_links.observed_at` exists to protect. The R2 diagnosis on 2026-11-03
 * found an explorer-to-paid conversion rate counting backwards because all 13 "conversions"
 * had a paid row created before their explorer row. Conflating the two produced a number
 * that was not merely imprecise but pointed the wrong way down the funnel.
 */
export interface FlowEvent {
  /** ISO date, day precision. The timeline buckets by day. */
  at: string;
  classification: ClassificationKey;
  stream: FlowStreamKey;
  /** What a reader sees on the row. Never a bare id. */
  label: string;
  /**
   * The thing this happened to, for drill-through: a delivery_project_id for a bid, a
   * subscription id for a member. Null when the event is about the stream as a whole.
   */
  entityKey: string | null;
  /**
   * The money this event moved or represents. MUST be null when the classification says
   * `carriesValue: false`; `revenueFlowService` rejects a violation rather than rendering
   * it, so the registry's promise is enforced at the boundary instead of trusted.
   */
  valueCents: number | null;
}

/**
 * One stage of a stream's funnel.
 *
 * `count` is always knowable. `value` often is not, and says so: on 2026-11-12 the
 * government pipeline's "Flagged" stage had 14 rows and no value anywhere in the schema, so
 * its `value.cents` is null and its `display` reads as unpriced rather than as $0.
 */
export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  value: Money;
  /** The classification whose colour this stage wears, so stage and event agree visually. */
  classification: ClassificationKey;
  /** What has to be true for a thing to be AT this stage. */
  definition: string;
}

/**
 * Which half of the path into a revenue number a source sits in.
 *
 * `asked` is what we did: a campaign went out to a list. `arrived` is who turned up and paid.
 * They are two bands rather than one list because NOTHING IN THE SCHEMA JOINS THEM, and a
 * single list would imply it did.
 */
export type DemandBandKey = 'asked' | 'arrived';

/**
 * One campaign or one acquisition channel, as the path in front of a revenue number shows it.
 *
 * ── WHY THERE IS NO MONEY FIELD ON THIS TYPE, AT ALL ─────────────────────────────────────
 *
 * This is the single most important decision in the demand path, and it is structural rather
 * than a matter of taste.
 *
 * A source could plausibly carry the MRR of the members attributable to it. `channelTruth`
 * already computes exactly that. But the stream this band sits in front of prints its own
 * headline figure, derived differently: per PERSON, annualized, over active rows carrying a
 * PaySimple payment id. A per-channel monthly sum and a per-person annualized headline do not
 * reconcile, and two revenue numbers disagreeing by a reconciliation step on one screen is how
 * a reader stops trusting both.
 *
 * So money stays in the one place that owns it, and this type counts PEOPLE and MESSAGES.
 * There is no field here for a figure, which means the band cannot drift into a second opinion
 * about revenue even if someone later wants it to. The absence is load bearing and is asserted
 * in the tests.
 */
/**
 * One rate on a demand source, carried with the two numbers that produced it. R27.
 *
 * `defined: false` means the denominator was zero. That is reported as "no emails sent yet"
 * rather than as 0%, for the same reason the government card reports a null win rate: 0%
 * claims we were read by nobody, when the truth is that nothing was sent to be read.
 */
export interface DemandRate {
  key: string;
  label: string;
  numerator: number;
  denominator: number;
  /** The words to print. A percentage when defined, an explanation when not. */
  display: string;
  /** What the rate is OF, so it cannot be quoted without its basis. */
  basis: string;
  defined: boolean;
}

export interface DemandSource {
  key: string;
  label: string;
  /** The headline count for this source. */
  count: number;
  /**
   * What `count` counts, in words, because the units genuinely differ between sources and
   * between measures. The alumni re-engagement campaign sent 1,200 emails to 557 people: a
   * column headed "sent" beside a column headed "asked" invites the reader to subtract them.
   */
  countLabel: string;
  /** Further measures in reading order. `count: null` means not recorded, never zero. */
  measures: DemandMeasure[];
  /**
   * The two rates a campaign is judged on, where they can be computed. R27.
   *
   * Ali, 25 Nov 2026: "show bottom left and right sub kpi's showing the read and click rates".
   *
   * Each carries its own numerator and denominator, because a rate quoted without its basis is
   * the easiest number on this page to misuse: "14% read" means something different over 8,518
   * emails than over 12. Empty on a source that is not a campaign.
   */
  rates: DemandRate[];
  status: TileStatus;
  /**
   * Whether this source can be tied to a downstream revenue record at all.
   *
   * False for every campaign, and that is a fact about the schema rather than about the
   * campaign: `subscriptions` carries no campaign, source or UTM column, only `enrollment_id`.
   */
  attributable: boolean;
  /** One sentence a reader can act on. Why this number is what it is, or why it is absent. */
  note: string;
  /**
   * The tone this source wears.
   *
   * ── WHY A TONE AND NOT A CLASSIFICATION KEY ──────────────────────────────────────────
   *
   * Every other coloured thing on this board carries a `ClassificationKey` and looks its
   * colour up in the registry shipped alongside. A demand source deliberately does not, for
   * two reasons that point the same way.
   *
   * The registry's job is to let an EVENT carry nothing but a key and still be readable: the
   * label, glyph and meaning live in one place so a pill and the legend cannot disagree. A
   * demand source is not an event and will not become one. Nothing in the schema holds a
   * dated "this campaign asked this person on this day" row that `events[]` could carry, so a
   * classification minted for these sources would appear in the legend explaining a meaning no
   * pill on the timeline ever wears. The registry's own header forbids exactly that kind of
   * aspirational entry.
   *
   * And a source is already self-describing. It ships its own label, its own units, its own
   * note and its own status, so it needs no legend to be read. The tone carries the one thing
   * left, which is how worried to be, and the frontend maps tone to paint as it already does
   * everywhere else. The backend still owns the meaning and the frontend still owns the paint.
   */
  tone: FlowTone;
}

/** One measure under a source. Null is "nobody recorded this", which is not zero. */
export interface DemandMeasure {
  label: string;
  count: number | null;
  note: string;
}

/** One band of the path: everything we asked, or everyone who arrived. */
export interface DemandBand {
  key: DemandBandKey;
  label: string;
  /** What this band may and may not claim, in one sentence. */
  definition: string;
  sources: DemandSource[];
  /**
   * On the `asked` band: why these numbers cannot reach the revenue figure below them.
   * Null on `arrived`, whose numbers can.
   *
   * Rendered as a visible break between the bands rather than a footnote, because the whole
   * question this path answers is "what led to this number", and the honest answer contains a
   * gap. A gap drawn is a finding; a gap omitted is a claim.
   */
  attributionBreak: string | null;
}

/** One revenue stream: its headline, its funnel, and why it says what it says. */
export interface BuiltStream {
  key: FlowStreamKey;
  label: string;
  status: TileStatus;
  /** The one number this stream is about, or an honest absence. */
  headline: Money;
  funnel: FunnelStage[];
  provenance: string;
  caveat: string | null;
  /** The existing Revenue Room drill-down this stream opens into. */
  drillDownKey: string | null;
  /**
   * The path in front of this stream's number: what we asked, then who arrived.
   *
   * Undefined where no demand path can be built, which is most streams today. Undefined
   * rather than an empty array, so "this stream has no measurable demand path" cannot be
   * rendered as "nobody was asked".
   */
  demand?: DemandBand[];
  /**
   * The individual bids behind the government stream, so the page can offer a price control
   * next to the count of unpriced ones.
   *
   * Populated ONLY for `gov_pipeline`; undefined elsewhere. A stream-shaped union would have
   * been tidier in the abstract and worse here: membership has no equivalent list (a
   * subscription roster already exists on its own page), so a mandatory field would have
   * forced an empty array that reads as "no members".
   */
  bids?: FlaggedBid[];
  /**
   * The individual enterprise deals behind the enterprise stream, so the page can offer the
   * same price control the government stream has.
   *
   * Populated ONLY for `enterprise_site`; undefined elsewhere, for the reason `bids` above
   * states. Deliberately a SECOND field rather than a shared `rows`: a bid and an enterprise
   * deal are priced against different tables, with different basis vocabularies and different
   * engagement shapes, and one union would have made the panel decide at runtime which kind of
   * thing it was holding.
   */
  deals?: EnterpriseDeal[];
  /**
   * The stage behind the pipeline: opportunities still being assessed. R12.
   *
   * Populated ONLY for `gov_pipeline`, and undefined rather than a zero-count object when the
   * qualification table is absent — a count of 0 would read as "every opportunity has been
   * assessed", which is the opposite of "the instrument is missing".
   *
   * Deliberately NOT a funnel stage. The funnel describes the flagged bids and its counts
   * partition; these are a different population of opportunities, most of which will never be
   * flagged. See `govPreProjectTier` for the diagnosis that produced it and for why nothing
   * here is backfilled.
   */
  preProject?: PreProjectTier;
}

/**
 * A stream as it reaches the page: everything a builder produced, plus its brand.
 *
 * ── WHY THE BRAND IS ADDED HERE AND NOT BY THE BUILDERS ──────────────────────────────────
 *
 * A stream builder knows about subscriptions or bids; it has no business knowing which
 * public identity sells them, and if each builder set its own brand the mapping would be
 * spread across five files with nothing checking they agreed. `streamBrands` holds the whole
 * map in one place and `revenueFlowService` applies it as the streams are assembled.
 *
 * The split is enforced by the compiler rather than by discipline: builders return
 * `BuiltStream`, which has no brand, and only the assembly step can produce a
 * `RevenueStream`. There is no way to ship a stream to the page without giving it a brand,
 * and no way for a builder to invent one.
 */
export interface RevenueStream extends BuiltStream {
  /**
   * The brand this stream's business belongs to, as a key into the board's `brands` list.
   *
   * `'unassigned'` for a stream that belongs to no brand, which is a different statement
   * from a brand that earns nothing.
   */
  brandKey: string;
}

/**
 * One enterprise intake, as the deal-pricing control needs it.
 *
 * ── WHY `shape` TRAVELS WITH THE ROW ─────────────────────────────────────────────────────
 *
 * It is the whole reason Phase 2's retainer foot-gun stays closed at the UI.
 *
 * `enterprise_deal_values.deal_value_cents` always holds the TOTAL. Plan A is a monthly
 * retainer (Ali, 2026-11-21, on Middlesex: "we are looking at a retainer, a monthly fee"), so
 * the figure a person actually negotiated for a Plan A deal is the MONTHLY one. A form that
 * asked for "contract value" and got $4,500 would file a twelve-month engagement as $4,500
 * instead of $54,000.
 *
 * So the plan's `EngagementShape` rides along and the form opens on the matching entry mode:
 * a retainer deal asks for a monthly fee and a required term, and the total is computed. The
 * person can still override the mode, because a Plan A deal genuinely sold as a fixed project
 * exists; what they cannot do is meet a field whose meaning is ambiguous.
 */
export interface EnterpriseDeal {
  enterpriseIntakeId: string;
  /** The company name, or an honest stand-in. Never blank: a blank row cannot be chosen. */
  company: string;
  /** Which of the three plans, where the open-text service field could be read. Null when not. */
  planKey: string | null;
  planLabel: string | null;
  /** 'monthly_retainer' | 'guided_project' | 'training_program', or null with no plan. */
  shape: string | null;
  /** How far this prospect got, as the funnel's own stage key. */
  stage: string;
  /**
   * Whether this deal is SIGNED, which is what decides whether its value reaches the
   * headline. Sent explicitly rather than inferred from `stage` so the panel can say plainly
   * that pricing a proposal-stage deal records a forecast and does not touch revenue.
   */
  signed: boolean;
  /**
   * Why this row may not be a real inquiry, derived from the row itself. Empty when it is clean.
   *
   * On the same footing as `FlaggedBid.flags`: the panel shows these BEFORE the save, because
   * the person who can tell a test row from a real one is the person about to price it, and
   * nothing downstream can tell them apart once a value exists. See `enterpriseSuspect`.
   */
  flags: string[];
  /** The live value, or null when nobody has recorded one. */
  priced: {
    cents: number;
    display: string;
    periodMonths: number | null;
    /** The monthly fee behind the total, where a term exists. Null otherwise. */
    monthlyCents: number | null;
    basisSource: string;
    valueBasis: string;
    confirmedBy: string;
    confirmedAt: string;
  } | null;
}

/**
 * One bid carrying the pursuit flag, as the pricing control needs it.
 *
 * ── WHY BOTH IDS TRAVEL ──────────────────────────────────────────────────────────────────
 *
 * `deliveryProjectId` is what `gov_bid_values` is keyed on, so it is what a price is written
 * against. `canonicalOpportunityId` is what the EXISTING, tested outcome route is keyed on
 * (`POST /api/admin/factory/qualification/:canonicalOpportunityId/outcome`).
 *
 * The page needs both because it does two different things with them, and it does not
 * duplicate the second: recording a win or a loss stays on the route that already owns it,
 * behind its own `requireSection('program')` gate, and this surface links there. Pricing is
 * revenue work and is written here; outcome is program work and is not. Re-implementing a
 * tested write path to save a click is how two code paths start disagreeing about whether
 * something was submitted.
 */
export interface FlaggedBid {
  deliveryProjectId: string;
  /** Null when the qualification row has no canonical id, which makes the outcome link unavailable. */
  canonicalOpportunityId: string | null;
  name: string;
  /** Derived from the row itself: a test row, a duplicate title, no delivery project. */
  flags: string[];
  /** The live price, or null when nobody has set one. */
  priced: {
    cents: number;
    display: string;
    periodMonths: number | null;
    basisSource: string;
    valueBasis: string;
    confirmedBy: string;
    confirmedAt: string;
  } | null;
  /** The recorded outcome, straight from gov_submission. 'pending' when no row exists. */
  outcome: string;
}

/**
 * The numbers across the top of the page.
 *
 * Shaped around the question Ali actually asked — "we have this much of possible proposal
 * winnings" — while keeping the two kinds of money apart. `bookedAnnualized` is revenue
 * that exists. `possibleWinnings` is revenue that might. A dashboard that adds them into
 * one hero number would be the single most misleading thing it could do, so there is
 * deliberately no field here that holds their sum.
 */
export interface FlowHeadline {
  /** Membership revenue, annualized. The only money that currently exists. */
  bookedAnnualized: Money;
  /** Total contract value of priced, still-open bids. Not revenue, and labelled as such. */
  possibleWinnings: Money;
  /** The same open pipeline expressed per year, where the term was recorded. */
  possibleWinningsAnnualized: Money;
  /** Total contract value of bids recorded as won. */
  wonValue: Money;
  /** Total contract value of bids recorded as lost. */
  lostValue: Money;
  /**
   * Won over decided, as a fraction, or null when nothing has been decided.
   *
   * Null rather than zero, and this matters: `gov_submission` held zero rows on 2026-11-12,
   * so nothing has ever been submitted or decided. A 0% win rate would be a claim that we
   * lose; the truth is that we have not yet played.
   */
  winRate: number | null;
  winRateBasis: string;
  /**
   * Flagged bids with no confirmed value. Reported BESIDE the winnings total, always, so
   * the gap between what is in the pipeline and what has been priced is visible rather
   * than quietly excluded from the sum.
   */
  unpricedBids: number;
}

/**
 * Every figure the headline carries, as a key.
 *
 * DERIVED from `FlowHeadline` rather than written out, and that is the whole point. R25
 * Phase 2 made the top tiles respond to the brand filter, which they can only do honestly if
 * something declares which stream each figure comes from. Deriving the key union means adding
 * a figure to `FlowHeadline` breaks the build until its stream is declared too — so a new
 * number cannot arrive at the top of the page with no brand and silently survive every
 * filter, which is the exact failure the brand breakdown exists to prevent.
 *
 * `winRateBasis` is excluded because it is the sentence explaining `winRate`, not a figure of
 * its own; it travels with the tile its rate is on.
 */
export type HeadlineFigureKey = Exclude<keyof FlowHeadline, 'winRateBasis'>;

/**
 * A brand heading is shipped as an ordered list rather than derived in the frontend, so the
 * heading order, the wording and the membership of each group have exactly one owner. The
 * shape lives in `revenueBrandVocabulary` beside the resolver that produces it, and the
 * mapping's reasoning lives in `streamBrands`. Re-exported here so the board's consumers
 * still read every shape of the payload from one module.
 */
export type { StreamBrand } from './revenueBrandVocabulary';

export interface RevenueFlowBoard {
  asOf: string;
  headline: FlowHeadline;
  streams: RevenueStream[];
  /**
   * The brand headings, in reading order. Every stream on the board appears under exactly
   * one of these, and a brand with no streams is omitted rather than rendered empty.
   */
  brands: StreamBrand[];
  /**
   * What a brand heading on this board does and does not mean, in one sentence for the
   * reader. Backend-owned, like every other piece of copy that states what a number is.
   */
  brandBasis: string;
  /**
   * For each figure in `headline`, the stream it is derived from.
   *
   * Shipped so the four tiles across the top can respond to the brand filter without the
   * frontend hardcoding which stream each number came from. Every one of those tiles is a
   * single stream's figure under a board-level label, so a brand filter that left them
   * untouched would show one brand's revenue beneath another brand's heading. The reasoning
   * and the map live in `headlineSources.ts`.
   */
  headlineFigureStreams: Record<HeadlineFigureKey, FlowStreamKey>;
  /** The combined timeline, newest first, across every stream. */
  events: FlowEvent[];
  /** The window `events` covers, in days, so an empty tail reads as out-of-window. */
  windowDays: number;
  /**
   * The classification registry itself, shipped with the data.
   *
   * WHY THIS TRAVELS IN THE PAYLOAD rather than being duplicated in the frontend. An event
   * carries only a classification KEY; the label, glyph and tone that make it readable live
   * in `revenueClassifications.ts`. A frontend copy of that table would be a second source
   * of truth for what `never_paid` means and what colour it wears, and the first anyone
   * would know of the drift is a legend that disagrees with a chip on the same screen.
   *
   * The split stays exactly where the registry's header puts it: the backend owns the
   * MEANING (key, label, glyph, tone, direction), the frontend owns the PAINT (which CSS
   * custom property each tone resolves to). Neither can quietly take over the other's half.
   */
  classifications: ClassificationLegendEntry[];
  /** Everything the reader must know about what this page could not see. */
  caveats: string[];
}

/**
 * One classification as the page needs it. A projection of the registry rather than the
 * registry type itself, so adding an internal field there is not automatically an API change.
 */
export interface ClassificationLegendEntry {
  key: ClassificationKey;
  label: string;
  stream: FlowStreamKey;
  tone: string;
  glyph: string;
  direction: string;
  carriesValue: boolean;
  means: string;
}

