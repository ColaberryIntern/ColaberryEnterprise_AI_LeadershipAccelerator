import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import FlowSparkline from '../../components/admin/revenueFlow/FlowSparkline';
import FlowTimeline, {
  TimelineClassification,
  TimelineEvent,
} from '../../components/admin/revenueFlow/FlowTimeline';
import FlowTableView from '../../components/admin/revenueFlow/FlowTableView';
import { TONE, paintFor, streamPaint } from '../../components/admin/revenueFlow/flowTokens';

/**
 * R16 Phase 2 — the Revenue Flow dashboard.
 *
 * Ali: "a dashboard at the top so we can see the big picture and all the pieces that went
 * into it. Like a tracking system."
 *
 * ── THE TOP ROW HAS NO TOTAL, AND THAT IS THE DESIGN ─────────────────────────────────────
 *
 * Booked revenue and possible proposal winnings sit side by side and are never added. One
 * is money that exists; the other is contract value that might arrive, over terms that may
 * run five years. The backend's `FlowHeadline` deliberately has no field holding their sum
 * and a test asserts that absence; this page would have to invent one to show a total, and
 * does not.
 *
 * ── WHY THE UNPRICED COUNT IS GLUED TO THE WINNINGS FIGURE ───────────────────────────────
 *
 * "Possible proposal winnings" counts only bids a named human has priced, which is what
 * keeps a row called "Snow College Adult Learner - T8 test" out of Ram's pipeline. But
 * excluding rows SILENTLY would make the pipeline look smaller than it is, so the count of
 * unpriced bids is rendered inside the same tile rather than somewhere a reader might not
 * scroll to.
 */

interface Money { cents: number | null; display: string; provenance: string }

interface FunnelStage {
  key: string;
  label: string;
  count: number;
  value: Money;
  classification: string;
  definition: string;
}

interface Stream {
  key: string;
  label: string;
  status: string;
  headline: Money;
  funnel: FunnelStage[];
  provenance: string;
  caveat: string | null;
  drillDownKey: string | null;
}

interface Board {
  asOf: string;
  headline: {
    bookedAnnualized: Money;
    possibleWinnings: Money;
    possibleWinningsAnnualized: Money;
    wonValue: Money;
    lostValue: Money;
    winRate: number | null;
    winRateBasis: string;
    unpricedBids: number;
  };
  streams: Stream[];
  events: TimelineEvent[];
  windowDays: number;
  classifications: Array<TimelineClassification & { stream: string; carriesValue: boolean; means: string }>;
  caveats: string[];
}

/** A hero figure. `cents: null` prints the words the backend chose, never a dash. */
function HeroTile({
  label, money, sub, tone = 'muted', testId,
}: { label: string; money: Money; sub?: React.ReactNode; tone?: string; testId: string }) {
  const paint = paintFor(tone);
  return (
    <div className="col-md-4 col-lg-3 mb-3">
      <div className="card border-0 shadow-sm h-100" data-testid={testId}>
        <div className="card-body p-3">
          <div className="small text-muted" style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>
            {label}
          </div>
          <div
            className="fw-bold"
            style={{ fontSize: money.cents === null ? 18 : 26, color: paint.fg, lineHeight: 1.2 }}
          >
            {money.display}
          </div>
          {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{money.provenance}</div>
        </div>
      </div>
    </div>
  );
}

export default function AdminRevenueFlowPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<string>('');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/commercialization/revenue-flow')
      .then((r) => { if (alive) setBoard(r.data?.data ?? null); })
      .catch((e) => { if (alive) setError(e?.message || 'Could not load the Revenue Flow board.'); });
    return () => { alive = false; };
  }, []);

  const classMap = useMemo(() => {
    const m: Record<string, TimelineClassification> = {};
    for (const c of board?.classifications ?? []) m[c.key] = c;
    return m;
  }, [board]);

  const visibleEvents = useMemo(
    () => (board?.events ?? []).filter((e) => !streamFilter || e.stream === streamFilter),
    [board, streamFilter],
  );

  if (error) {
    return (
      <div className="container py-4">
        <div className="alert alert-danger" data-testid="revenue-flow-error">{error}</div>
      </div>
    );
  }
  if (!board) {
    return <div className="container py-4 text-muted" data-testid="revenue-flow-loading">Loading the Revenue Flow board…</div>;
  }

  const h = board.headline;

  return (
    <div className="container py-4" data-testid="revenue-flow">
      <div className="d-flex align-items-start justify-content-between flex-wrap mb-3">
        <div>
          <h1 className="h4 mb-1">Revenue Flow</h1>
          <div className="text-muted small">
            Where revenue comes from, what stage each piece is at, and every dated event
            behind the numbers. As of {new Date(board.asOf).toLocaleString()}.
          </div>
        </div>
        <Link className="btn btn-outline-secondary btn-sm" to="/admin/revenue-room">
          Revenue Room cards
        </Link>
      </div>

      {/* ── THE BIG PICTURE ───────────────────────────────────────────────────────────── */}
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
          sub={
            <span data-testid="hero-unpriced">
              {h.unpricedBids > 0
                ? `${h.unpricedBids} flagged bid${h.unpricedBids === 1 ? '' : 's'} not priced, so not counted here`
                : 'Every flagged bid has a confirmed value'}
            </span>
          }
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
          sub={
            <span data-testid="hero-winrate">
              {h.winRate === null ? 'No win rate yet' : `Win rate ${Math.round(h.winRate * 100)}%`}
            </span>
          }
        />
      </div>

      <div className="small text-muted mb-4" data-testid="winrate-basis">{h.winRateBasis}</div>

      {/* ── LEGEND. Identity is never colour alone, so every tone carries a word. ─────── */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="d-flex flex-wrap align-items-center gap-3">
            <strong style={{ fontSize: 12 }}>How to read the colours</strong>
            {Object.entries(TONE).map(([tone, paint]) => (
              <span key={tone} style={{ fontSize: 12 }} data-testid={`legend-${tone}`}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                    background: paint.fg, marginRight: 5,
                  }}
                />
                {paint.name}
              </span>
            ))}
            <span className="ms-auto d-flex gap-2">
              <button
                type="button"
                className={`btn btn-sm ${streamFilter === '' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => setStreamFilter('')}
              >
                All streams
              </button>
              {board.streams.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`btn btn-sm ${streamFilter === s.key ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setStreamFilter(s.key)}
                  data-testid={`filter-${s.key}`}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                      background: streamPaint(s.key).fg, marginRight: 5,
                    }}
                  />
                  {s.label}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* ── THE PIECES THAT WENT INTO IT ─────────────────────────────────────────────── */}
      {board.streams
        .filter((s) => !streamFilter || s.key === streamFilter)
        .map((s) => (
          <div className="card border-0 shadow-sm mb-4" key={s.key} data-testid={`stream-${s.key}`}>
            <div className="card-body p-3">
              <div className="d-flex justify-content-between align-items-start flex-wrap mb-2">
                <div>
                  <h2 className="h6 mb-1">
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                        background: streamPaint(s.key).fg, marginRight: 6,
                      }}
                    />
                    {s.label}
                  </h2>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{s.headline.display}</div>
                </div>
                <div style={{ minWidth: 220 }}>
                  <FlowSparkline
                    events={board.events.filter((e) => e.stream === s.key)}
                    classifications={classMap}
                    data-testid={`spark-${s.key}`}
                  />
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-sm mb-2" style={{ fontSize: 12 }}>
                  <thead className="table-light">
                    <tr>
                      <th scope="col">Stage</th>
                      <th scope="col" className="text-end">Count</th>
                      <th scope="col" className="text-end">Value</th>
                      <th scope="col">What it means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.funnel.map((stage) => {
                      const paint = paintFor(classMap[stage.classification]?.tone ?? 'muted');
                      return (
                        <tr key={stage.key} data-testid={`stage-${s.key}-${stage.key}`}>
                          <td style={{ whiteSpace: 'nowrap', color: paint.fg, fontWeight: 600 }}>
                            <span aria-hidden="true">{classMap[stage.classification]?.glyph ?? '•'}</span>{' '}
                            {stage.label}
                          </td>
                          <td className="text-end fw-bold">{stage.count}</td>
                          <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                            {stage.value.cents === null
                              ? <span className="text-muted">{stage.value.display}</span>
                              : stage.value.display}
                          </td>
                          <td className="text-muted">{stage.definition}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.provenance}</div>
              {s.caveat && (
                <div
                  className="mt-2 p-2"
                  data-testid={`caveat-${s.key}`}
                  style={{
                    fontSize: 11,
                    background: 'var(--status-warning-bg)',
                    borderLeft: '3px solid var(--status-warning)',
                    borderRadius: 4,
                  }}
                >
                  {s.caveat}
                </div>
              )}
              {s.drillDownKey && (
                <Link
                  className="btn btn-outline-primary btn-sm mt-2"
                  to={`/admin/revenue-room/${s.drillDownKey}`}
                  data-testid={`drill-${s.key}`}
                >
                  Drill into {s.label}
                </Link>
              )}
            </div>
          </div>
        ))}

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
