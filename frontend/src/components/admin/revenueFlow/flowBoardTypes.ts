import type { TimelineClassification, TimelineEvent } from './FlowTimeline';
import type { FlaggedBid } from './BidPricingPanel';
import type { EnterpriseDealRow } from './DealPricingPanel';

/**
 * The shapes the Revenue Flow board arrives in, as the frontend reads them.
 *
 * Extracted from `RevenueFlowDashboard.tsx` when that file approached the 500-line hard
 * ceiling. They live in their own module rather than beside the component because four
 * components now read them, and a type declared inside the component that renders the whole
 * board would make every extracted piece import the thing it was extracted from.
 *
 * ── WHY THESE ARE HAND-WRITTEN AND NOT IMPORTED FROM THE BACKEND ─────────────────────────
 *
 * The frontend deliberately holds its own narrower reading of the payload. `revenueFlowTypes`
 * on the backend carries `ClassificationKey` and `FlowStreamKey` unions; here those are plain
 * strings, because the page must not stop rendering when the backend adds a stream. A stream
 * key the frontend has never heard of should paint muted and render its label, which is what
 * `streamPaint` and `paintFor` already do for an unknown value. A shared union would turn
 * that graceful case into a build error, and the two halves of the contract would have to ship
 * together forever.
 *
 * What the two halves DO share is enforced elsewhere and is not weakened by this: the backend
 * owns the meaning of a classification (label, glyph, tone) and ships the registry in the
 * payload, so there is still exactly one source of truth for what `never_paid` means.
 */

/**
 * A money figure, carried as cents AND as the words to print.
 *
 * `cents: null` means the figure is genuinely unknowable and `display` then says why. A
 * reader scanning quickly reads a dash as zero, so the backend sends words and the page
 * prints them verbatim rather than substituting a symbol.
 */
export interface Money {
  cents: number | null;
  display: string;
  provenance: string;
}

/** One stage of a stream's funnel. Order is the backend's and is never re-sorted here. */
export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  value: Money;
  classification: string;
  definition: string;
}

/**
 * One measure under a demand source.
 *
 * `count: null` means nobody recorded this, which is NOT zero. The alumni campaigns' own
 * `converted` measure arrives null because `interaction_outcomes.outcome = 'converted'` is a
 * vocabulary nothing in the system writes; rendering that as 0 would turn a missing instrument
 * into a measured failure, and a reader would reasonably conclude the campaigns converted
 * nobody. The page prints words for null and never a digit.
 */
export interface DemandMeasure {
  label: string;
  count: number | null;
  note: string;
}

/**
 * One campaign, or one acquisition channel, in the path in front of a revenue number.
 *
 * There is no money field here, deliberately and structurally. The backend type carries the
 * long reasoning; the short version is that a per-channel monthly sum and this stream's
 * per-person annualized headline do not reconcile, and two revenue figures disagreeing by a
 * reconciliation step on one screen is how a reader stops trusting both. This page therefore
 * cannot print a figure for a source even if someone later wants it to.
 *
 * `status` and `tone` are plain strings for the reason this whole file exists: an unknown value
 * must paint muted and still render, not fail the build.
 */
export interface DemandSource {
  key: string;
  label: string;
  count: number;
  /** What `count` counts, in words. The units genuinely differ between sources. */
  countLabel: string;
  measures: DemandMeasure[];
  status: string;
  /** Whether this source can be tied to a downstream revenue record at all. */
  attributable: boolean;
  note: string;
  tone: string;
}

/**
 * One band of the path: everything we asked, or everyone who arrived.
 *
 * Two bands rather than extra funnel stages, which was Ali's call on 2026-11-23. A funnel is
 * one population whose counts partition; four concurrent campaigns with overlapping audiences
 * are parallel, so filing them under a column headed "Stage" would imply a sequence and a
 * partition that neither holds.
 */
export interface DemandBand {
  key: string;
  label: string;
  definition: string;
  sources: DemandSource[];
  /**
   * On the `asked` band: why these numbers cannot reach the revenue figure below them. Null on
   * `arrived`, whose numbers can. Drawn as a visible break rather than a footnote, because a
   * gap drawn is a finding and a gap omitted is a claim.
   */
  attributionBreak: string | null;
}

export interface Stream {
  key: string;
  label: string;
  /**
   * The brand this stream is filed under. A slug from the `brands` table, or `'unassigned'`.
   *
   * A plain string for the reason this whole file exists: a brand the frontend has never
   * heard of must render under its own heading, not fail the build. The heading's WORDS come
   * from `Board.brands`, never from a frontend table of brand names — the backend reads them
   * from the `brands` table so there is one source of truth for what a brand is called.
   */
  brandKey: string;
  status: string;
  headline: Money;
  funnel: FunnelStage[];
  provenance: string;
  caveat: string | null;
  drillDownKey: string | null;
  /**
   * The path in front of this stream's number. Undefined on every stream but membership
   * today, and undefined rather than empty, so "no measurable demand path exists" can never
   * render as "nobody was asked".
   */
  demand?: DemandBand[];
  /** Populated only for the government stream; see FlaggedBid on the backend. */
  bids?: FlaggedBid[];
  /** Populated only for the enterprise stream; see EnterpriseDeal on the backend. */
  deals?: EnterpriseDealRow[];
}

export interface BoardHeadline {
  bookedAnnualized: Money;
  possibleWinnings: Money;
  possibleWinningsAnnualized: Money;
  wonValue: Money;
  lostValue: Money;
  winRate: number | null;
  winRateBasis: string;
  unpricedBids: number;
}

/**
 * One brand heading, and the streams filed under it. R25.
 *
 * Shipped by the backend as an ORDERED list, and rendered in that order without re-sorting,
 * for the same reason the funnel stages are not re-sorted here: the order is a decision with
 * reasoning behind it (see `streamBrands.ts`), and a page that sorted by revenue would
 * reshuffle itself the first time a brand earned anything.
 */
export interface BrandGroup {
  key: string;
  label: string;
  url: string | null;
  /**
   * Whether `label` came from the `brands` table. False means the table could not be read and
   * the name is a fallback that may be out of date — which the page says, rather than
   * presenting a guess as the brand's name.
   */
  resolved: boolean;
  /** False for the "No brand yet" bucket, which must never be presented as a brand. */
  isBrand: boolean;
  note: string;
  streamKeys: string[];
}

export interface Board {
  asOf: string;
  headline: BoardHeadline;
  streams: Stream[];
  /**
   * The brand headings in reading order. Empty when the grouping could not be built, in
   * which case the board renders UNGROUPED with every stream still present — a brand filter
   * that could not be built must cost the grouping, never the revenue.
   */
  brands: BrandGroup[];
  /** What a brand heading here does and does not mean. Backend-owned copy. */
  brandBasis: string;
  /**
   * For each headline figure, the stream key it was derived from.
   *
   * This is what lets the four tiles across the top respond to the brand filter. Every one of
   * them is a single stream's number under a board-level label, so without this the page
   * would have to hardcode "the booked tile is membership" — true the day it was written and
   * silently wrong the day the backend changed, leaving a real number attributed to the wrong
   * brand. A wrong brand on a real number is worse than no number, because it looks like an
   * answer.
   */
  headlineFigureStreams: Record<string, string>;
  events: TimelineEvent[];
  windowDays: number;
  classifications: Array<TimelineClassification & {
    stream: string;
    carriesValue: boolean;
    means: string;
  }>;
  caveats: string[];
}

/** Classification key to its legend entry, which is how a stage and a pill find their paint. */
export type ClassMap = Record<string, TimelineClassification>;
