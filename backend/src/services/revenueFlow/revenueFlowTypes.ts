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
import { ClassificationKey, FlowStreamKey } from './revenueClassifications';

/**
 * A money figure, carried as cents AND as a formatted string.
 *
 * Both, deliberately. `cents` is what arithmetic and tests use; `display` is what the page
 * shows. Letting the frontend format would mean two places deciding whether $72,816 rounds
 * to "$72.8K", and a headline that disagrees with its own drill-down by a rounding step is
 * the kind of thing that costs a reader's trust in everything else on the page.
 *
 * `cents: null` means the figure is genuinely not knowable, and `display` then says why in
 * words rather than printing a zero. A zero and an unknown are different answers.
 */
export interface Money {
  cents: number | null;
  display: string;
  /** Where this figure came from, in one sentence a reader can act on. */
  provenance: string;
}

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

/** One revenue stream: its headline, its funnel, and why it says what it says. */
export interface RevenueStream {
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

export interface RevenueFlowBoard {
  asOf: string;
  headline: FlowHeadline;
  streams: RevenueStream[];
  /** The combined timeline, newest first, across every stream. */
  events: FlowEvent[];
  /** The window `events` covers, in days, so an empty tail reads as out-of-window. */
  windowDays: number;
  /** Everything the reader must know about what this page could not see. */
  caveats: string[];
}

/** Format cents as a figure a reader can quote. Whole dollars: cents are noise at this scale. */
export function formatCents(cents: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/** A knowable figure. */
export function money(cents: number, provenance: string, currency = 'USD'): Money {
  return { cents, display: formatCents(cents, currency), provenance };
}

/**
 * An unknowable figure, which says so in the place a number would have been.
 *
 * The `display` is words, not "—", because a dash on a revenue dashboard gets read as zero
 * by anyone scanning quickly, and the difference between "nobody has priced this" and
 * "this is worth nothing" is the difference between a task and a conclusion.
 */
export function noMoney(display: string, provenance: string): Money {
  return { cents: null, display, provenance };
}
