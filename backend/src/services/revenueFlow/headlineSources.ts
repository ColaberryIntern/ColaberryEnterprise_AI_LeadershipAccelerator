/**
 * R25 Phase 2 — which stream each figure across the top of the board comes from.
 *
 * ── WHY THIS FILE HAD TO EXIST BEFORE THE TOP TILES COULD CARRY A BRAND ──────────────────
 *
 * Ali asked for the whole revenue tab broken down by brand. The four tiles across the top are
 * the first thing anyone reads, and they are the most dangerous part of the page to leave
 * outside the filter: every one of them is a single stream's number wearing a board-level
 * label.
 *
 *   "Booked, annualized"            is the MEMBERSHIP stream, and nothing else
 *   "Possible proposal winnings"    is the GOVERNMENT pipeline, and nothing else
 *   "Pipeline per year"             is the GOVERNMENT pipeline, and nothing else
 *   "Won"                           is the GOVERNMENT pipeline, and nothing else
 *
 * So filtering the board to Refactored.ai while the top still read $54,900 would tell a
 * reader that Refactored.ai has booked $54,900 of annualized revenue. It has booked nothing.
 * That is not a cosmetic bug: it is the page asserting a number about a brand that nobody
 * measured, which is the one failure this entire surface was built to prevent.
 *
 * ── WHY THE DECLARATION IS HERE AND NOT IN THE FRONTEND ──────────────────────────────────
 *
 * The frontend could have hardcoded "the booked tile is membership". It would have worked on
 * the day it was written and then rotted silently: the day someone changes `bookedAnnualized`
 * to come from somewhere else, the page would keep attributing it to the old stream and keep
 * filtering it under the old brand, and nothing would fail. A wrong brand on a real number is
 * worse than a missing number, because it looks like an answer.
 *
 * The figure and its source are therefore declared in the same place the figure is assembled,
 * and shipped in the payload. The frontend owns which tile shows which figure; the backend
 * owns where that figure came from. Neither can take over the other's half.
 *
 * ── WHAT THIS DOES NOT CLAIM ─────────────────────────────────────────────────────────────
 *
 * A declaration here says where a figure WOULD come from, not that the stream built
 * successfully. When the government pipeline fails to build, `possibleWinnings` reads "Cannot
 * be read" and is still declared to `gov_pipeline` — which is correct, and is what lets the
 * page say "the Colaberry Enterprise figures could not be read" instead of quietly dropping
 * the tiles and showing Enterprise as a brand with no numbers at all.
 */
import { FlowStreamKey } from './revenueClassifications';
import { HeadlineFigureKey } from './revenueFlowTypes';

/**
 * Figure to the stream it is derived from.
 *
 * `Record<HeadlineFigureKey, FlowStreamKey>` is doing real work: `HeadlineFigureKey` is
 * derived from `FlowHeadline` itself, so adding a figure to the headline is a compile error
 * here until its stream is named. There is no partial state in which a headline figure exists
 * with no declared source.
 *
 * Every entry below was read off the assembly in `revenueFlowService.getRevenueFlowBoard`,
 * not inferred from the field names. The four government figures come from the same `gov`
 * result object; `bookedAnnualized` is `membership.stream.headline` verbatim.
 */
export const HEADLINE_FIGURE_STREAM: Record<HeadlineFigureKey, FlowStreamKey> = {
  // `membership?.stream.headline` — the annualized membership figure, passed through.
  bookedAnnualized: 'membership',
  // The remaining figures are all derived from the `gov` builder's result.
  possibleWinnings: 'gov_pipeline',
  possibleWinningsAnnualized: 'gov_pipeline',
  wonValue: 'gov_pipeline',
  lostValue: 'gov_pipeline',
  winRate: 'gov_pipeline',
  unpricedBids: 'gov_pipeline',
};

/**
 * Refuse a declared source that is not a real stream.
 *
 * The compiler already types the values as `FlowStreamKey`. This is the runtime half, and it
 * guards a specific silent failure: the frontend decides whether to show a tile by asking
 * whether its declared stream is in the brand currently being viewed. A source naming a
 * stream that does not exist would match no brand, so the tile would vanish under every
 * filter — a real number disappearing off the page with no error anywhere.
 *
 * Called from the board assembly, where a throw costs the board rather than passing a broken
 * declaration to the page. The stream list is passed in rather than imported from the
 * classification registry, so this stays a pure check.
 */
export function assertHeadlineSourcesAreKnownStreams(
  knownStreamKeys: readonly string[],
): void {
  const known = new Set(knownStreamKeys);
  for (const [figure, stream] of Object.entries(HEADLINE_FIGURE_STREAM)) {
    if (!known.has(stream)) {
      throw new Error(
        `Headline figure "${figure}" declares stream "${stream}", which is not a stream this `
        + 'board knows. The tile would be hidden under every brand filter rather than shown '
        + 'under one.',
      );
    }
  }
}
