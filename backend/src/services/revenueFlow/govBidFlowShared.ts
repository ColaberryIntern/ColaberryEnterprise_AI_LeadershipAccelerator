/**
 * R16 — the pieces `govBidFlow` is assembled from: its row shapes, its small helpers, and
 * the honest empty result it falls back to.
 *
 * ── WHY THESE MOVED OUT ──────────────────────────────────────────────────────────────────
 *
 * `govBidFlow.ts` stood at 548 lines, past this repo's 500-line hard ceiling. CLAUDE.md's rule
 * for an oversize file is that the NEXT change to it splits it before adding new code, and
 * R12 is that change: it adds the pre-project tier that sits behind the flagged pipeline.
 *
 * So this is a mechanical extraction and nothing here is new. Every line was moved verbatim
 * from `govBidFlow.ts`, which is what makes it reviewable: the funnel's behaviour cannot have
 * changed in a diff that only moves declarations.
 *
 * It is NOT a tidy-up of the real problem. `buildGovFlow` is still a single ~400-line
 * function, which is four times the repo's function ceiling. Breaking that up is a rewrite of
 * the gov pipeline's core and belongs in a ticket of its own rather than riding in on a
 * display change, so it is named here rather than quietly attempted.
 */
import { TileStatus } from '../commercialization/commercializationTiles';
import { FlowEvent, BuiltStream, noMoney } from './revenueFlowTypes';

// Moved to its own leaf module in R12, so `govPreProjectTier` can reach it without this file
// and that one importing each other. Re-exported, so existing callers are unaffected.
export { tableExists } from './tableExists';

export interface FlaggedRow {
  delivery_project_id: string | null;
  canonical_opportunity_id: string | null;
  project_name: string | null;
  flagged_at: string;
}

export interface SubmissionRow {
  delivery_project_id: string;
  status: string;
  outcome: string;
  exported_at: string | null;
  externally_submitted_at: string | null;
  acknowledged_at: string | null;
  outcome_recorded_at: string | null;
  /** M5: the solicitation close date carried onto the submitted bid (nullable); so a potential-win shows when it closes. */
  close_date: string | null;
}

export interface DocRow {
  delivery_project_id: string;
  title: string | null;
  observed_at: string;
}

/** Day precision. The timeline buckets by day, and a time-of-day would be false detail. */
export function day(iso: string | null): string | null {
  return iso ? String(iso).slice(0, 10) : null;
}

export interface GovFlow {
  stream: BuiltStream;
  events: FlowEvent[];
  /** Pulled up for the page headline, which reports winnings across streams. */
  openPricedCents: number;
  openPricedAnnualizedCents: number | null;
  wonCents: number;
  lostCents: number;
  decidedWon: number;
  decidedLost: number;
  unpricedBids: number;
}

/**
 * An empty-but-honest stream, for when the tables this reads are not in the database.
 *
 * Returned rather than thrown so one missing table costs this section and not the page.
 * A dashboard that disappears under partial failure teaches people not to open it, which
 * costs more than the missing section — the rule `revenueRoomService` already follows.
 */
export function absentFlow(reason: string): GovFlow {
  return {
    stream: {
      key: 'gov_pipeline',
      label: 'Government bids in pursuit',
      status: 'unmeasurable' as TileStatus,
      headline: noMoney('Cannot be read', reason),
      funnel: [],
      provenance: reason,
      caveat: reason,
      drillDownKey: 'gov_bid_pursuit',
    },
    events: [],
    openPricedCents: 0,
    openPricedAnnualizedCents: null,
    wonCents: 0,
    lostCents: 0,
    decidedWon: 0,
    decidedLost: 0,
    unpricedBids: 0,
  };
}

/**
 * Flags derived from the row itself, never from a judgment about the opportunity.
 *
 * Each of these was really present on 2026-11-12, which is why they are computed rather
 * than assumed absent. `govBidFlow` emits a `bid_suspect` event for any row that trips one,
 * so a reader scanning the timeline sees the cleanup work as work.
 */
export function suspectReasons(
  row: FlaggedRow,
  titleCounts: Map<string, number>,
): string[] {
  const title = (row.project_name ?? '').trim();
  const out: string[] = [];
  if (!row.delivery_project_id) out.push('no delivery project, so it cannot be named or priced');
  if (/\btest\b/i.test(title)) out.push('looks like a test row');
  if (title && (titleCounts.get(title.toLowerCase()) ?? 0) > 1) out.push('duplicate title');
  return out;
}


