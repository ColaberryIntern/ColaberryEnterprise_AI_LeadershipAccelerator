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

export default function FlowHeroRow({ headline }: { headline: BoardHeadline }) {
  const h = headline;
  return (
    <>
      <div className="row" data-testid="revenue-flow-headline">
        <HeroTile
          label="Booked, annualized"
          money={h.bookedAnnualized}
          tone="good"
          testId="hero-booked"
          sub="Revenue that exists today"
        />
        <HeroTile
          label="Possible proposal winnings"
          money={h.possibleWinnings}
          tone="info"
          testId="hero-winnings"
          sub={(
            <span data-testid="hero-unpriced">
              {h.unpricedBids > 0
                ? `${h.unpricedBids} flagged bid${h.unpricedBids === 1 ? '' : 's'} not priced, so not counted here`
                : 'Every flagged bid has a confirmed value'}
            </span>
          )}
        />
        <HeroTile
          label="Pipeline per year"
          money={h.possibleWinningsAnnualized}
          tone="info"
          testId="hero-winnings-annual"
          sub="Open pipeline divided by each contract's term"
        />
        <HeroTile
          label="Won"
          money={h.wonValue}
          tone="good"
          testId="hero-won"
          sub={(
            <span data-testid="hero-winrate">
              {h.winRate === null ? 'No win rate yet' : `Win rate ${Math.round(h.winRate * 100)}%`}
            </span>
          )}
        />
      </div>

      <div className="small text-muted mb-4" data-testid="winrate-basis">{h.winRateBasis}</div>
    </>
  );
}
