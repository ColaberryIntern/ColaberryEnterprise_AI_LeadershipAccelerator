import React from 'react';
import { paintFor } from './flowTokens';
import type { BoardHeadline, Money } from './flowBoardTypes';

/**
 * The numbers across the top of the Revenue Flow board.
 *
 * ── THE TOP ROW HAS NO TOTAL, AND THAT IS THE DESIGN ─────────────────────────────────────
 *
 * Booked revenue and possible proposal winnings sit side by side and are never added. One is
 * money that exists; the other is contract value that might arrive, over terms that may run
 * five years. The backend's `FlowHeadline` deliberately has no field holding their sum and a
 * test asserts that absence; this component would have to invent one to show a total, and
 * does not. Extracting it did not change that: there is still no arithmetic in this file.
 *
 * ── WHY THE UNPRICED COUNT IS GLUED TO THE WINNINGS FIGURE ───────────────────────────────
 *
 * "Possible proposal winnings" counts only bids a named human has priced, which is what keeps
 * a row called "Snow College Adult Learner - T8 test" out of Ram's pipeline. But excluding
 * rows SILENTLY would make the pipeline look smaller than it is, so the count of unpriced
 * bids renders inside the same tile rather than somewhere a reader might not scroll to.
 *
 * ── R25 PHASE 2: EVERY TILE HERE BELONGS TO EXACTLY ONE BRAND ────────────────────────────
 *
 * This row was the most dangerous part of the page to leave outside the brand filter. Each
 * tile is a SINGLE stream's figure wearing a board-level label: "Booked, annualized" is the
 * membership stream, and the other three are the government pipeline. So a brand filter that
 * scoped the cards below and left this row alone would have put Colaberry Training's $54,900
 * under the heading "Refactored.ai" — the page asserting a number about a brand that has
 * booked nothing. That is not a cosmetic bug; it is the one failure this whole surface exists
 * to prevent, and it looks like an answer.
 *
 * Which stream each figure comes from is NOT decided here. It arrives in the payload
 * (`Board.headlineFigureStreams`, reasoning in the backend's `headlineSources.ts`), because a
 * hardcoded "the booked tile is membership" would be true the day it was written and silently
 * wrong the day the backend changed, with nothing failing.
 *
 * A tile whose stream is out of scope is REMOVED rather than zeroed or dashed. A zero would
 * claim the brand earned nothing; this row genuinely has no figure for it, which is a
 * different statement, and when no tile survives the row says so in words.
 */

/** A hero figure. `cents: null` prints the words the backend chose, never a dash. */
export function HeroTile({
  label, money, sub, tone = 'muted', testId,
}: {
  label: string;
  money: Money;
  sub?: React.ReactNode;
  tone?: string;
  testId: string;
}) {
  const paint = paintFor(tone);
  return (
    <div className="col-md-4 col-lg-3 mb-3">
      <div className="card border-0 shadow-sm h-100" data-testid={testId}>
        <div className="card-body p-3">
          <div
            className="small text-muted"
            style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}
          >
            {label}
          </div>
          <div
            className="fw-bold"
            style={{ fontSize: money.cents === null ? 18 : 26, color: paint.fg, lineHeight: 1.2 }}
          >
            {money.display}
          </div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
            {money.provenance}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Decide whether a figure belongs to what the reader is currently looking at.
 *
 * Exported so both outcomes are testable directly. `renderToStaticMarkup` runs no effects, so
 * a rule reachable only through the dashboard's own state would be asserted by reading the
 * source rather than by running it.
 *
 * Three outcomes, not two, and the third is the point: `'unattributed'` means the payload
 * carries a figure whose source stream was NOT declared. Hiding it would be a real number
 * leaving the page with nothing logged anywhere, so it is reported instead.
 */
export function figureScope(
  figureKey: string,
  figureStreams: Record<string, string>,
  visibleStreamKeys: string[] | null,
): 'in' | 'out' | 'unattributed' {
  const stream = figureStreams[figureKey];
  if (!stream) return 'unattributed';
  if (visibleStreamKeys === null) return 'in';
  return visibleStreamKeys.includes(stream) ? 'in' : 'out';
}

export default function FlowHeroRow({
  headline, figureStreams, visibleStreamKeys = null, scopeLabel = null,
}: {
  headline: BoardHeadline;
  figureStreams: Record<string, string>;
  /** The streams currently in view, or null for "no filter is applied". */
  visibleStreamKeys?: string[] | null;
  /** What the reader filtered to, for the sentence shown when no figure survives. */
  scopeLabel?: string | null;
}) {
  const h = headline;

  // Each tile names the headline FIELD it shows, so the mapping from tile to stream runs
  // through the payload rather than through a second opinion held here.
  const tiles: Array<{
    figureKey: string; label: string; testId: string; money: Money; tone: string;
    sub: React.ReactNode;
  }> = [
    {
      figureKey: 'bookedAnnualized',
      label: 'Booked, annualized',
      testId: 'hero-booked',
      money: h.bookedAnnualized,
      tone: 'good',
      sub: 'Revenue that exists today',
    },
    {
      figureKey: 'possibleWinnings',
      label: 'Possible proposal winnings',
      testId: 'hero-winnings',
      money: h.possibleWinnings,
      tone: 'info',
      sub: (
        <span data-testid="hero-unpriced">
          {h.unpricedBids > 0
            ? `${h.unpricedBids} flagged bid${h.unpricedBids === 1 ? '' : 's'} not priced, so not counted here`
            : 'Every flagged bid has a confirmed value'}
        </span>
      ),
    },
    {
      figureKey: 'possibleWinningsAnnualized',
      label: 'Pipeline per year',
      testId: 'hero-winnings-annual',
      money: h.possibleWinningsAnnualized,
      tone: 'info',
      sub: 'Open pipeline divided by each contract\'s term',
    },
    {
      figureKey: 'wonValue',
      label: 'Won',
      testId: 'hero-won',
      money: h.wonValue,
      tone: 'good',
      sub: (
        <span data-testid="hero-winrate">
          {h.winRate === null ? 'No win rate yet' : `Win rate ${Math.round(h.winRate * 100)}%`}
        </span>
      ),
    },
  ];

  const scoped = tiles.map((t) => ({
    ...t, scope: figureScope(t.figureKey, figureStreams, visibleStreamKeys),
  }));
  const shown = scoped.filter((t) => t.scope !== 'out');
  const unattributed = scoped.filter((t) => t.scope === 'unattributed');
  const hidden = scoped.filter((t) => t.scope === 'out');

  // Nothing across the top belongs to this brand. Said in words, because an empty row reads
  // as a page that failed to load, and leaving the previous brand's numbers up would be worse
  // than either.
  if (shown.length === 0) {
    return (
      <div className="card border-0 shadow-sm mb-4" data-testid="hero-none-for-scope">
        <div className="card-body p-3">
          <div className="fw-semibold" style={{ fontSize: 14 }}>
            None of the figures across the top of this board belong to
            {scopeLabel ? ` ${scopeLabel}` : ' the brand you are viewing'}.
          </div>
          <div className="small text-muted mt-1">
            All four come from two streams: booked revenue is the membership stream, and the
            three pipeline figures are the government pipeline. Neither is filed under this
            brand, so there is no figure to show here rather than a zero. A zero would say this
            brand earned nothing, which is a measurement nobody has made.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="row" data-testid="revenue-flow-headline">
        {shown.map((t) => (
          <HeroTile
            key={t.testId}
            label={t.label}
            money={t.money}
            tone={t.tone}
            testId={t.testId}
            sub={t.sub}
          />
        ))}
      </div>

      {/*
        The win-rate basis explains the "Won" tile, so it travels with it. Left on screen
        while that tile was filtered away it would read as a statement about whichever brand
        the reader had selected.
      */}
      {shown.some((t) => t.figureKey === 'wonValue') && (
        <div className="small text-muted mb-4" data-testid="winrate-basis">{h.winRateBasis}</div>
      )}

      {hidden.length > 0 && (
        <div className="small text-muted mb-4" data-testid="hero-hidden-note">
          {hidden.length === 1
            ? '1 figure from the top of this board belongs to another brand and is not shown.'
            : `${hidden.length} figures from the top of this board belong to other brands and are not shown.`}
        </div>
      )}

      {/*
        Loud rather than silent. A figure the payload did not attribute to a stream cannot be
        placed under a brand, and dropping it quietly is how a real number leaves the page with
        no trace. It is shown, and its lack of attribution is stated.
      */}
      {unattributed.length > 0 && (
        <div className="small mb-4" style={{ color: 'var(--status-warning)' }} data-testid="hero-unattributed">
          {unattributed.length === 1
            ? '1 figure above is not attributed to any stream, so it cannot be filed under a '
              + 'brand. It is shown under every brand rather than hidden from all of them.'
            : `${unattributed.length} figures above are not attributed to any stream, so they `
              + 'cannot be filed under a brand. They are shown under every brand rather than '
              + 'hidden from all of them.'}
        </div>
      )}
    </>
  );
}
