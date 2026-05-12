/**
 * CoryHome — THE product home screen.
 *
 * One Brain Consolidation Sprint, 2026-05-09.
 *
 * Calm, focused, premium. Reads ONLY from useUnifiedProjectState — never
 * computes locally. Surfaces:
 *   - greeting + one-line status
 *   - Today's One Priority card (top of queue, with reason + blast + ETA)
 *   - 3-tile row: Readiness · Coverage · Health (each with a delta line)
 *   - Operational Queue (ranked, top 5)
 *   - Critical Blockers (only when present)
 *   - Active Build (only when present)
 *   - Verification Status (compact)
 *
 * Hard rule: there is no "next action" panel anywhere else on the platform
 * that disagrees with this page. This page IS the next-action authority.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  useUnifiedProjectState,
  type ReadinessBand,
  type BlastRadiusBand,
  type QueueEntry,
  type BlockerEntry,
} from '../../hooks/useUnifiedProjectState';
import { useWorkspaceMemory, type DrawerId } from '../../hooks/useWorkspaceMemory';
import { useOperationalMomentum } from '../../hooks/useOperationalMomentum';
import ReadinessDrawer from '../../components/workspace/ReadinessDrawer';
import CoverageDrawer from '../../components/workspace/CoverageDrawer';
import WhyThisNextDrawer from '../../components/workspace/WhyThisNextDrawer';
import RecentlyMovedCard from '../../components/workspace/RecentlyMovedCard';
import OperationalHistoryStrip from '../../components/workspace/OperationalHistoryStrip';

const BAND_COLOR: Record<ReadinessBand, { fg: string; bg: string; label: string }> = {
  red: { fg: 'var(--color-danger)', bg: 'var(--color-danger-bg)', label: 'Needs attention' },
  amber: { fg: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'On track' },
  green: { fg: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'Healthy' },
};

const BLAST_COLOR: Record<BlastRadiusBand, string> = {
  low: 'var(--color-success)',
  medium: 'var(--color-warning)',
  high: 'var(--color-danger)',
};

const SEVERITY_COLOR: Record<BlockerEntry['severity'], string> = {
  low: 'var(--color-info)',
  medium: 'var(--color-warning)',
  high: 'var(--color-danger)',
  critical: 'var(--color-danger)',
};

const CoryHome: React.FC = () => {
  const navigate = useNavigate();
  const { state, loading, error, refresh } = useUnifiedProjectState({ pollMs: 60_000 });
  const { memory, update, recordSnapshot } = useWorkspaceMemory();

  // Freeze the memory state as it was when this session started. Momentum
  // is computed against this frozen snapshot — not the live mutable memory.
  // Without freezing, the recordSnapshot effect below would overwrite
  // memory.lastXxx values on the first state arrival, deltas would zero
  // out within one render, and RecentlyMovedCard / tile chevrons would
  // never appear. The frozen snapshot represents "what you knew at the
  // start of this visit" — the correct comparison for "what's moved".
  const initialMemoryRef = useRef(memory);
  const momentum = useOperationalMomentum(state, initialMemoryRef.current);

  // Contextual drawers — opened by clicking tiles or the priority card.
  // The drawer key is persisted to memory so the next visit can offer
  // "you last opened the X drawer" affordances.
  const [openDrawer, setOpenDrawer] = useState<DrawerId | null>(null);
  const openDrawerWithMemory = (id: DrawerId | null) => {
    setOpenDrawer(id);
    if (id) update({ lastDrawerOpen: id });
  };

  // Detect whether the priority card content is fresh (the source_id we are
  // showing now differs from what the operator last saw). When fresh, we
  // apply the ws-fresh halo for 6s so the card visually announces itself.
  const priorityIsFresh =
    !!state?.next_action?.source_id
    && state.next_action.source_id !== memory.lastSeenNextActionId;

  // Capture this surface as the last-visited so the context bar / next
  // session can show "Last visited Home X min ago".
  useEffect(() => {
    update({ lastVisitedSurface: 'home' });
  }, [update]);

  // Snapshot the current readiness/coverage/queue/health so the NEXT visit
  // can compute "since you were last here" deltas. We deliberately do NOT
  // snapshot on every state poll — that would overwrite the frozen memory
  // before momentum can render. Instead, snapshot when the user *leaves*
  // (visibilitychange to hidden, or beforeunload). The latest state values
  // are held in a ref so the leave handler can read them without
  // re-binding listeners on every poll.
  const latestStateRef = useRef(state);
  useEffect(() => { latestStateRef.current = state; }, [state]);

  useEffect(() => {
    const snapshotNow = () => {
      const s = latestStateRef.current;
      if (!s) return;
      recordSnapshot({
        readinessScore: s.readiness.score,
        coverageScore: s.coverage.score,
        queueSize: s.queue.length,
        healthScore: s.health.score,
        builtAt: s.built_at,
      });
    };
    const onVis = () => { if (document.visibilityState === 'hidden') snapshotNow(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', snapshotNow);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', snapshotNow);
      // Snapshot on unmount (navigation within SPA) as well so the
      // next surface visit has fresh comparison values.
      snapshotNow();
    };
  }, [recordSnapshot]);

  if (loading && !state) {
    return (
      <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading your home…
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="container-narrow" style={{ padding: '2rem 1rem' }}>
        <div className="alert alert-warning">
          <strong>Could not load operational state.</strong>
          <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 4 }}>{error}</div>
          <button className="btn btn-sm btn-outline-primary mt-2" onClick={() => void refresh()}>Try again</button>
        </div>
      </div>
    );
  }

  if (!state) return null;

  const greetingName = shortenOrgName(state.project.organization_name);
  const queueTotal = state.queue.length;
  const blockerCount = state.blockers.length;
  const oneLineStatus = buildOneLineStatus(queueTotal, blockerCount);

  const readinessC = BAND_COLOR[state.readiness.band];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '1.5rem 1rem 3rem' }}>
      {/* Greeting */}
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '-0.01em' }}>
          {greetingFor(new Date())}, <span style={{ color: 'var(--color-primary-light)' }}>{greetingName}</span>.
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)', marginTop: 4 }}>
          {oneLineStatus}
        </div>
      </header>

      {/* Today's one priority */}
      {state.next_action ? (
        <NextActionCard
          action={state.next_action}
          fresh={priorityIsFresh}
          onGo={() => navigate(state.next_action!.target_route)}
          onWhy={() => openDrawerWithMemory('why-this-next')}
        />
      ) : (
        <EmptyPriorityCard />
      )}

      {/* Recently-moved — shows deltas vs last snapshot. Hidden when nothing has moved. */}
      <RecentlyMovedCard momentum={momentum} />

      {/* 3-tile row — Readiness + Coverage are click-through to drawers */}
      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <Tile
            label="Readiness"
            sublabel="how prepared the project is · click for breakdown"
            value={`${state.readiness.score}%`}
            valueColor={readinessC.fg}
            footer={readinessC.label}
            footerColor={readinessC.fg}
            tooltip={state.readiness.reasons[0]}
            onClick={() => openDrawerWithMemory('readiness')}
            highlight={momentum.readinessDelta != null && momentum.readinessDelta > 0}
          />
        </div>
        <div className="col-md-4">
          <Tile
            label="Coverage"
            sublabel="requirements with implementation · click for breakdown"
            value={state.coverage.requirements_total > 0
              ? `${state.coverage.score}%`
              : '—'}
            valueColor="var(--color-primary)"
            footer={state.coverage.requirements_total > 0
              ? `${state.coverage.requirements_matched} of ${state.coverage.requirements_total} requirements matched`
              : 'No requirements extracted yet'}
            footerColor="var(--color-text-light)"
            onClick={() => openDrawerWithMemory('coverage')}
            highlight={momentum.coverageDelta != null && momentum.coverageDelta > 0}
          />
        </div>
        <div className="col-md-4">
          <Tile
            label="Health"
            sublabel="system stability today"
            value={`${state.health.score}%`}
            valueColor={state.health.score >= 80 ? 'var(--color-success)' : state.health.score >= 60 ? 'var(--color-warning)' : 'var(--color-danger)'}
            footer={state.health.regressions_24h === 0 ? 'Stable' : `${state.health.regressions_24h} regression(s) in 24h`}
            footerColor="var(--color-text-light)"
            highlight={momentum.healthDelta != null && momentum.healthDelta > 0}
          />
        </div>
      </div>

      {/* Drawers — anchored at the page level, opened by tiles + priority card */}
      <ReadinessDrawer open={openDrawer === 'readiness'} onClose={() => openDrawerWithMemory(null)} />
      <CoverageDrawer open={openDrawer === 'coverage'} onClose={() => openDrawerWithMemory(null)} />
      <WhyThisNextDrawer open={openDrawer === 'why-this-next'} onClose={() => openDrawerWithMemory(null)} />

      {/* Things to address — only when present (less alarming than "Critical blockers") */}
      {blockerCount > 0 && (
        <section className="mb-3">
          <SectionHeader title="Things to address" badge={`${blockerCount}`} aside="lifted from Cory's signals" />
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {state.blockers.map((b, i) => (
              <div
                key={`${b.source}:${b.source_id || i}`}
                style={{
                  padding: '0.75rem 0.95rem',
                  borderBottom: i < blockerCount - 1 ? '1px solid var(--color-border)' : 'none',
                  borderLeft: `3px solid ${SEVERITY_COLOR[b.severity]}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{b.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 2 }}>{b.reason}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: SEVERITY_COLOR[b.severity],
                  }}
                >
                  {b.severity}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Operational queue */}
      <section className="mb-3">
        <SectionHeader
          title="Operational queue"
          badge={queueTotal > 0 ? `${queueTotal}` : undefined}
          aside="Cory's authority — every surface agrees with this order."
        />
        {queueTotal === 0 ? (
          <div className="ws-breath" style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '1.25rem', textAlign: 'center', color: 'var(--color-text-light)', fontSize: 13 }}>
            <i className="bi bi-check2-circle me-1" style={{ color: 'var(--color-success)' }}></i>
            Nothing in the queue. The platform is caught up.
          </div>
        ) : (
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
            {state.queue.map((q, i) => (
              <QueueRow
                key={`${q.source}:${q.source_id || i}`}
                entry={q}
                first={i === 0}
                last={i === queueTotal - 1}
                onGo={() => navigate(q.target_route)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Active build + verification */}
      <div className="row g-3 mb-3">
        <div className="col-md-7">
          <SectionHeader title="Active build" />
          {state.active_build ? (
            <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.85rem 1rem' }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{state.active_build.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
                Started {new Date(state.active_build.started_at).toLocaleString()} · target <code>{state.active_build.target_ref}</code>
              </div>
              <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-primary mt-2">
                <i className="bi bi-arrow-right me-1"></i>Continue in Blueprint
              </Link>
            </div>
          ) : (
            <div className="ws-breath" style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.85rem 1rem', fontSize: 13, color: 'var(--color-text-light)' }}>
              No active build. Pick a queue item to start.
            </div>
          )}
        </div>
        <div className="col-md-5">
          <SectionHeader title="Verification" />
          <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '0.85rem 1rem' }}>
            <div style={{ display: 'flex', gap: '1.25rem', justifyContent: 'space-around', textAlign: 'center', fontSize: 12 }}>
              <Stat label="Pending" value={state.verification.pending} color="var(--color-warning)" />
              <Stat label="Passing" value={state.verification.passing} color="var(--color-success)" />
              <Stat label="Failing" value={state.verification.failing} color="var(--color-danger)" />
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-light)', textAlign: 'center', marginTop: 8 }}>
              24h pass rate: <strong>{Math.round(state.verification.pass_rate_24h * 100)}%</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Operational history strip — richer than the prior "Synthesized at HH:MM"
          footer. Shows synthesis age, last-touched age, last-critique age, and
          confidence — all sourced from state + memory + sessionStorage. */}
      <OperationalHistoryStrip state={state} memory={memory} />
    </div>
  );
};

// -------------------------- subcomponents -----------------------------------

const NextActionCard: React.FC<{ action: NonNullable<ReturnType<typeof useUnifiedProjectState>['state']>['next_action']; fresh?: boolean; onGo: () => void; onWhy: () => void }> = ({ action, fresh, onGo, onWhy }) => {
  if (!action) return null;
  return (
    <div
      className={fresh ? 'ws-fresh' : undefined}
      style={{
        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
        color: 'white',
        borderRadius: 8,
        padding: '1.1rem 1.25rem',
        marginBottom: '1.25rem',
        boxShadow: '0 4px 12px rgba(26, 54, 93, 0.18)',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85, marginBottom: 4 }}>
        Today's one priority
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, lineHeight: 1.35 }}>{action.title}</div>
      <div style={{ fontSize: 13, opacity: 0.92, marginBottom: 10, lineHeight: 1.55 }}>
        {action.reason}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" style={{ background: 'white', color: 'var(--color-primary)', fontWeight: 600 }} onClick={onGo}>
          <i className="bi bi-arrow-right me-1"></i>Open in {targetLabel(action.target_route)}
        </button>
        <button
          type="button"
          onClick={onWhy}
          style={{
            background: 'transparent', color: 'white',
            border: '1px solid rgba(255,255,255,0.4)',
            padding: '0.25rem 0.7rem', borderRadius: 3,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
          title="See why Cory queued this"
        >
          <i className="bi bi-info-circle me-1"></i>Why this next?
        </button>
        <span style={{
          background: 'rgba(255,255,255,0.18)',
          padding: '0.25rem 0.55rem',
          borderRadius: 3,
          fontSize: 11,
          fontWeight: 600,
        }}>
          {action.time_est_minutes ? `${action.time_est_minutes}m` : 'time unknown'}
        </span>
        <span style={{
          background: 'rgba(255,255,255,0.18)',
          padding: '0.25rem 0.55rem',
          borderRadius: 3,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {action.blast_radius.band} blast
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.85 }}>
          confidence {action.confidence_score}% · priority {action.priority_score}
        </span>
      </div>
    </div>
  );
};

const EmptyPriorityCard: React.FC = () => (
  <div
    className="ws-breath"
    style={{
      background: 'white',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '1.25rem',
      marginBottom: '1.25rem',
      textAlign: 'center',
    }}
  >
    <i className="bi bi-check2-circle" style={{ fontSize: 28, color: 'var(--color-success)' }}></i>
    <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginTop: 8 }}>You're caught up.</div>
    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4 }}>
      Cory has nothing to surface right now. Open Critique to spot improvements, or Blueprint to start a build.
    </div>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
      <Link to="/portal/visual-workspace" className="btn btn-sm btn-outline-primary">
        <i className="bi bi-bullseye me-1"></i>Open Critique
      </Link>
      <Link to="/portal/project/blueprint" className="btn btn-sm btn-outline-secondary">
        <i className="bi bi-map me-1"></i>Open Blueprint
      </Link>
    </div>
  </div>
);

const QueueRow: React.FC<{ entry: QueueEntry; first: boolean; last: boolean; onGo: () => void }> = ({ entry, first, last, onGo }) => (
  <div
    style={{
      padding: '0.65rem 0.95rem',
      borderBottom: last ? 'none' : '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    }}
  >
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: first ? 'var(--color-primary)' : 'var(--color-bg-alt)',
        color: first ? 'white' : 'var(--color-text-light)',
        fontWeight: 600,
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {entry.rank}
    </span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {entry.title}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 2 }}>
        {sourceLabel(entry.source)} · {entry.time_est_minutes ? `~${entry.time_est_minutes}m` : 'time TBD'}
      </div>
    </div>
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: BLAST_COLOR[entry.blast_radius.band],
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {entry.blast_radius.band} blast
    </span>
    <button type="button" className="btn btn-sm btn-outline-primary" onClick={onGo} style={{ fontSize: 11, flexShrink: 0 }}>
      Open
    </button>
  </div>
);

const SectionHeader: React.FC<{ title: string; badge?: string; aside?: string }> = ({ title, badge, aside }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
    <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', margin: 0, fontWeight: 600 }}>
      {title}
    </h6>
    {badge !== undefined && (
      <span style={{ fontSize: 10, background: 'var(--color-bg-alt)', color: 'var(--color-text-light)', padding: '0.1rem 0.45rem', borderRadius: 9999, fontWeight: 600 }}>
        {badge}
      </span>
    )}
    {aside && <span style={{ fontSize: 11, color: 'var(--color-text-light)', marginLeft: 'auto', fontStyle: 'italic' }}>{aside}</span>}
  </div>
);

const Tile: React.FC<{
  label: string;
  sublabel?: string;
  value: string;
  valueColor: string;
  footer: string;
  footerColor: string;
  tooltip?: string;
  onClick?: () => void;
  /** Renders a soft "↗" chevron next to the value to acknowledge forward delta. */
  highlight?: boolean;
}> = ({ label, sublabel, value, valueColor, footer, footerColor, tooltip, onClick, highlight }) => {
  const interactive = !!onClick;
  const baseStyle: React.CSSProperties = {
    background: 'white',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    padding: '0.85rem 1rem',
    height: '100%',
    width: '100%',
    textAlign: 'left',
    cursor: interactive ? 'pointer' : 'default',
    transition: 'border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
  };
  const inner = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
            {label}
          </div>
          {sublabel && (
            <div style={{ fontSize: 10, color: 'var(--color-text-light)', marginTop: 2, fontStyle: 'italic' }}>
              {sublabel}
            </div>
          )}
        </div>
        {interactive && (
          <i className="bi bi-arrow-up-right" style={{ fontSize: 11, color: 'var(--color-text-light)', opacity: 0.5, marginTop: 2 }} aria-hidden="true"></i>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: valueColor, marginTop: 4, lineHeight: 1.1, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span>{value}</span>
        {highlight && (
          <span title="Improved since your last visit" aria-label="improved" style={{ fontSize: 14, color: 'var(--color-accent)', fontWeight: 700 }}>
            ↗
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: footerColor, marginTop: 4 }}>{footer}</div>
    </>
  );
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        style={baseStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-primary-light)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(43,108,176,0.08)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        {inner}
      </button>
    );
  }
  return <div style={baseStyle} title={tooltip}>{inner}</div>;
};

const Stat: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', marginTop: 2 }}>{label}</div>
  </div>
);

// -------------------------- helpers -----------------------------------------

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Trim verbose org names for the greeting line so it doesn't wrap awkwardly.
 * Strategy:
 *   - Falsy → "there"
 *   - Length ≤ 20 → use as-is
 *   - Otherwise → first word if it's standalone-meaningful (≥ 4 chars + not generic),
 *     else first 22 chars + ellipsis
 */
function shortenOrgName(raw: string | null | undefined): string {
  if (!raw) return 'there';
  const trimmed = raw.trim();
  if (trimmed.length <= 20) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  const generic = new Set(['the', 'a', 'an', 'inc', 'inc.', 'llc', 'corp', 'corp.', 'co', 'co.']);
  if (firstWord.length >= 4 && !generic.has(firstWord.toLowerCase())) return firstWord;
  return trimmed.slice(0, 22) + '…';
}

function buildOneLineStatus(queueTotal: number, blockers: number): string {
  if (queueTotal === 0 && blockers === 0) return 'No queue items, no blockers. Good place to start something new.';
  const parts: string[] = [];
  if (queueTotal > 0) parts.push(`${queueTotal} thing${queueTotal === 1 ? '' : 's'} on the queue`);
  if (blockers > 0) parts.push(`${blockers} blocker${blockers === 1 ? '' : 's'}`);
  return parts.join(' · ') + '.';
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'next_action': return 'Cory';
    case 'governance_recommendation': return 'Governance';
    case 'visual_workspace_pending': return 'Critique';
    case 'verification_failure': return 'Verify';
    case 'capability_gap': return 'Capability';
    default: return source;
  }
}

function targetLabel(route: string): string {
  if (route.startsWith('/portal/visual-workspace')) return 'Critique';
  if (route.startsWith('/portal/project/blueprint')) return 'Blueprint';
  if (route.startsWith('/portal/project/system')) return 'System';
  return 'workspace';
}

export default CoryHome;
