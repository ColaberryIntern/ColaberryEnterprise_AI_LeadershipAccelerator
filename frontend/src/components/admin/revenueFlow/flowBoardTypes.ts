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

export interface Stream {
  key: string;
  label: string;
  status: string;
  headline: Money;
  funnel: FunnelStage[];
  provenance: string;
  caveat: string | null;
  drillDownKey: string | null;
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

export interface Board {
  asOf: string;
  headline: BoardHeadline;
  streams: Stream[];
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
