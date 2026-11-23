import React, { useEffect, useMemo, useState } from 'react';
import api from '../../../utils/api';
import FlowTimeline from './FlowTimeline';
import FlowTableView from './FlowTableView';
import BidPricingPanel from './BidPricingPanel';
import DealPricingPanel from './DealPricingPanel';
import FlowHeroRow from './FlowHeroRow';
import FlowLegendBar from './FlowLegendBar';
import StreamCard from './StreamCard';
import type { Board, ClassMap } from './flowBoardTypes';

/**
 * R16 - the Revenue Flow dashboard, rendered at the TOP of the Revenue Room.
 *
 * Ali: "a dashboard at the top so we can see the big picture and all the pieces that went
 * into it. Like a tracking system."
 *
 * ── WHY THIS IS A COMPONENT AND NOT A PAGE ───────────────────────────────────────────────
 *
 * It shipped as its own page at `/admin/revenue-flow`, beside the Revenue Room. Ali, on
 * seeing it: "looks good - just not connected to Revenue Room."
 *
 * He was right, and the fix was not a link. Two sidebar entries covering overlapping
 * initiatives is the same duplication he had already told me to collapse once, when
 * Commercialization and the Revenue Room each showed the same annualized figure under a
 * different name. Adding a link would have left both doors open.
 *
 * His original ask said it plainly and I read past it: "THE REVENUE ROOM, I want to be able
 * to create some type of Visual..." and "dashboard AT THE TOP". So this is a component the
 * Room renders above its initiative cards, `/admin/revenue-flow` redirects there so any
 * saved link still resolves, and there is one door into revenue again.
 * `oneDoorIntoRevenue.test.ts` asserts those structural facts, because the regression is a
 * DELETION and a deleted render fails no behavioural test.
 *
 * ── WHAT THIS FILE IS, AFTER THE SPLIT ───────────────────────────────────────────────────
 *
 * Fetch, one piece of filter state, and composition. Nothing else. The board was a single
 * 412-line component until the upstream path and the per-source timeline were specified,
 * which would have carried it past the repo's 500-line hard ceiling; CLAUDE.md requires the
 * split BEFORE the new code rather than after, so it happened on its own and this file's
 * render output is byte-for-byte what it was.
 *
 * The pieces, and where the reasoning for each now lives:
 *   - `FlowHeroRow`     the top numbers, and why they are never summed
 *   - `FlowLegendBar`   the tone legend, and why every colour carries a word
 *   - `StreamCard`      one stream, and why stage order is never re-sorted here
 *   - `flowBoardTypes`  the payload shapes, and why they are not imported from the backend
 *
 * The timeline, the table view and the two pricing panels were already their own components
 * and were not touched.
 *
 * ── THE TIMELINE AT THE BOTTOM IS KEPT, ALONGSIDE THE PER-STREAM ONES ────────────────────
 *
 * Each stream card now drills into its own events, with its legend scoped to the
 * classifications those events carry. This list stays because it is the only CROSS-stream
 * view: it is where a reader sees a government award and a membership payment land in the same
 * week, and it is the only place the table view lives, which the palette's contrast WARN
 * obliges this page to ship. Deleting it as now-redundant would remove both.
 */
export default function RevenueFlowDashboard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<string>('');
  const [showTable, setShowTable] = useState(false);
  // Bumped after a price lands. The headline, the funnel and the unpriced count are all
  // derived server-side, so a local mutation would have to re-derive four numbers; a refetch
  // keeps one source of truth.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/commercialization/revenue-flow')
      .then((r) => { if (alive) setBoard(r.data?.data ?? null); })
      .catch((e) => { if (alive) setError(e?.message || 'Could not load the Revenue Flow board.'); });
    return () => { alive = false; };
  }, [reload]);

  const classMap = useMemo(() => {
    const m: ClassMap = {};
    for (const c of board?.classifications ?? []) m[c.key] = c;
    return m;
  }, [board]);

  const visibleEvents = useMemo(
    () => (board?.events ?? []).filter((e) => !streamFilter || e.stream === streamFilter),
    [board, streamFilter],
  );

  if (error) {
    return (
      <div className="alert alert-danger" data-testid="revenue-flow-error">{error}</div>
    );
  }
  if (!board) {
    return <div className="text-muted" data-testid="revenue-flow-loading">Loading the Revenue Flow board&#8230;</div>;
  }

  const govBids = board.streams.find((s) => s.key === 'gov_pipeline')?.bids ?? [];
  const enterprise = board.streams.find((s) => s.key === 'enterprise_site');

  return (
    <div data-testid="revenue-flow">
      <div className="text-muted small mb-3" data-testid="revenue-flow-asof">
        Where revenue comes from, what stage each piece is at, and every dated event behind
        the numbers. As of {new Date(board.asOf).toLocaleString()}.
      </div>

      {/* ── THE BIG PICTURE ───────────────────────────────────────────────────────────── */}
      <FlowHeroRow headline={board.headline} />

      {/* ── LEGEND. Identity is never colour alone, so every tone carries a word. ─────── */}
      <FlowLegendBar
        streams={board.streams}
        streamFilter={streamFilter}
        onPickStream={setStreamFilter}
      />

      {/* ── THE PIECES THAT WENT INTO IT ─────────────────────────────────────────────── */}
      {board.streams
        .filter((s) => !streamFilter || s.key === streamFilter)
        .map((s) => (
          <StreamCard
            key={s.key}
            stream={s}
            events={board.events.filter((e) => e.stream === s.key)}
            classMap={classMap}
            windowDays={board.windowDays}
          />
        ))}

      {/* ── THE CONTROL THAT MAKES THE PIPELINE REAL ─────────────────────────────────── */}
      {govBids.length > 0 && (
        <BidPricingPanel bids={govBids} onPriced={() => setReload((v) => v + 1)} />
      )}

      {/* ── THE SAME CONTROL FOR ENTERPRISE DEALS (R23 Phase 3) ──────────────────────────
          Rendered whenever the enterprise stream is on the board, INCLUDING when it holds
          no deals - unlike the government panel above, which hides itself when empty.

          Deliberate: enterprise_intakes holds 0 rows in production, so a panel that hid
          itself would be indistinguishable from the state this phase exists to end, where
          there was no write path at all. Its empty state says why there is nothing to price
          and what would make one appear. */}
      {enterprise && (
        <DealPricingPanel
          deals={enterprise.deals ?? []}
          unmeasurable={enterprise.status === 'unmeasurable'}
          onPriced={() => setReload((v) => v + 1)}
        />
      )}

      {/* ── EVERY DATED EVENT ────────────────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h2 className="h6 mb-0">Everything that happened, newest first</h2>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setShowTable((v) => !v)}
              data-testid="toggle-table"
            >
              {showTable ? 'Show timeline' : 'Show as table'}
            </button>
          </div>
          <div className="small text-muted mb-3">
            Covering the last {board.windowDays} days. An empty stretch is drawn as a gap
            rather than closed up, so a quiet month reads as a quiet month.
          </div>
          {showTable
            ? <FlowTableView events={visibleEvents} classifications={classMap} />
            : <FlowTimeline events={visibleEvents} classifications={classMap} />}
        </div>
      </div>

      {board.caveats.length > 0 && (
        <div className="card border-0 shadow-sm mb-4" data-testid="revenue-flow-caveats">
          <div className="card-body p-3">
            <h2 className="h6">What this page could not see</h2>
            <ul className="mb-0" style={{ fontSize: 12 }}>
              {board.caveats.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
