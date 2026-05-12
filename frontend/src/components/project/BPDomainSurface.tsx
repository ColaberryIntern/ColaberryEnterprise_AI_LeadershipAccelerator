/**
 * BPDomainSurface — operational architecture view.
 *
 * BP V2 Operational Architecture Sprint, 2026-05-12.
 *
 * The surface reads like a map of business operations, not a list of
 * categorized processes. Sequence:
 *
 *   1. Editorial overview headline (authored, not "X% complete")
 *   2. Operational flow strip — Intake → Lead → Marketing → Execution → Reporting,
 *      with the lifecycle state of each stop visible above the line
 *   3. Domain rows — softer monochrome icons, BP count, lifecycle state badge,
 *      authored narrative, momentum chip, relationship hint
 *   4. First populated domain auto-expanded so the operator immediately sees
 *      actual BP substance, not just category wrappers
 *   5. Expanded BPs: name + req count + tone word (no metric-bar grids)
 *   6. Power-user escape hatch: "Show full inventory" reveals the legacy grid
 *
 * Reuses the existing PortalBusinessProcessDetail modal unchanged.
 */
import React, { useEffect, useMemo, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import {
  classifyBPs,
  buildFlowStops,
  type DomainBucket,
  type BPLike,
  type LifecycleState,
} from '../../utils/bpDomainClassifier';
import { useDomainMomentum, type Direction } from '../../hooks/useDomainMomentum';
import PortalBusinessProcessDetail from './PortalBusinessProcessDetail';
import PortalBusinessProcessesTab from './PortalBusinessProcessesTab';

// Lifecycle state → tone. Softer than completion% — no hot reds.
const LIFECYCLE_TONE: Record<LifecycleState, { fg: string; bg: string }> = {
  Foundational: { fg: 'var(--color-text-light)', bg: 'rgba(113,128,150,0.08)' },
  Emerging:     { fg: '#b45309', bg: 'rgba(245,158,11,0.10)' },     // muted amber
  Coordinated:  { fg: '#1d4ed8', bg: 'rgba(59,130,246,0.10)' },     // muted blue
  Operational:  { fg: '#15803d', bg: 'rgba(56,161,105,0.12)' },     // muted green
  Scaling:      { fg: '#0e7490', bg: 'rgba(8,145,178,0.12)' },      // muted teal
  Stabilizing:  { fg: '#6d28d9', bg: 'rgba(139,92,246,0.10)' },     // muted purple
};

const MOMENTUM_TONE: Record<Direction, { fg: string; bg: string; symbol: string }> = {
  up:            { fg: '#15803d', bg: 'rgba(56,161,105,0.10)', symbol: '↑' },
  down:          { fg: '#b91c1c', bg: 'rgba(229,62,62,0.08)',  symbol: '↓' },
  flat:          { fg: 'var(--color-text-light)', bg: 'transparent', symbol: '·' },
  'first-visit': { fg: 'var(--color-text-light)', bg: 'transparent', symbol: '·' },
};

const BPDomainSurface: React.FC = () => {
  const [processes, setProcesses] = useState<BPLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBp, setSelectedBp] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showFullInventory, setShowFullInventory] = useState(false);
  const [autoExpanded, setAutoExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    bpApi.getProcesses()
      .then(r => setProcesses(r.data || []))
      .catch(() => setProcesses([]))
      .finally(() => setLoading(false));
  }, []);

  const buckets = useMemo(() => classifyBPs(processes), [processes]);
  const momentum = useDomainMomentum(buckets);
  const flowStops = useMemo(() => buildFlowStops(buckets), [buckets]);

  // Auto-expand the first populated domain on first paint. Only runs once
  // per mount; subsequent re-renders honor the operator's explicit choices.
  useEffect(() => {
    if (autoExpanded) return;
    if (buckets.length === 0) return;
    setExpanded(prev => ({ ...prev, [buckets[0].key]: true }));
    setAutoExpanded(true);
  }, [buckets, autoExpanded]);

  const overall = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.totalRequirements, 0);
    const matched = buckets.reduce((s, b) => s + b.matchedRequirements, 0);
    return {
      total, matched,
      pct: total > 0 ? Math.round((matched / total) * 100) : 0,
    };
  }, [buckets]);

  if (loading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading operational architecture…
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <i className="bi bi-diagram-3 d-block mb-2" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
        <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>No operational domains detected yet</div>
        <div className="small text-muted">
          Upload requirements + extract business processes to see your operational architecture.
        </div>
      </div>
    );
  }

  if (showFullInventory) {
    return (
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.7rem 0.95rem', marginBottom: '1rem',
          background: 'var(--color-bg-alt)', borderRadius: 6,
          fontSize: 12, color: 'var(--color-text-light)',
        }}>
          <span>Showing the full flat inventory — every BP in a single grid.</span>
          <button type="button" className="btn btn-sm btn-link p-0" onClick={() => setShowFullInventory(false)} style={{ fontSize: 12 }}>
            ← Back to operational architecture
          </button>
        </div>
        <PortalBusinessProcessesTab />
      </div>
    );
  }

  return (
    <div>
      {/* ─── Editorial overview headline ─── */}
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{
          fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
          color: 'var(--color-text-light)', fontWeight: 600,
        }}>
          Operational architecture
        </div>
        <h3 style={{
          fontSize: 20, fontWeight: 600, color: 'var(--color-primary)',
          margin: '8px 0 8px', letterSpacing: '-0.012em', lineHeight: 1.35,
          maxWidth: 760,
        }}>
          {buildArchitectureHeadline(buckets, overall.pct)}
        </h3>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.6, maxWidth: 720 }}>
          {buckets.length} operational domain{buckets.length === 1 ? '' : 's'} ·{' '}
          <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{processes.length}</strong> business processes ·{' '}
          <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{overall.matched} of {overall.total}</strong> requirements matched
        </div>
      </header>

      {/* ─── Operational flow strip ─── */}
      {flowStops.length >= 2 && (
        <div
          aria-label="Operational flow"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 0,
            padding: '0.95rem 1.1rem', marginBottom: '1.5rem',
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            overflowX: 'auto',
          }}
        >
          {flowStops.map((stop, i) => {
            const tone = LIFECYCLE_TONE[stop.state];
            return (
              <React.Fragment key={stop.label}>
                <div style={{ minWidth: 0, flex: '0 0 auto', textAlign: 'left' }}>
                  <div style={{
                    fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em',
                    color: tone.fg, fontWeight: 600, marginBottom: 3,
                  }}>
                    {stop.state}
                  </div>
                  <div style={{
                    fontSize: 12.5, color: 'var(--color-primary)', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>
                    {stop.label}
                  </div>
                </div>
                {i < flowStops.length - 1 && (
                  <div
                    aria-hidden="true"
                    style={{
                      flex: 1, minWidth: 28, alignSelf: 'center',
                      marginTop: 14, padding: '0 6px',
                      display: 'flex', alignItems: 'center', gap: 4,
                      color: 'var(--color-text-light)', opacity: 0.55,
                    }}
                  >
                    <span style={{ flex: 1, height: 1, background: 'currentColor' }}></span>
                    <i className="bi bi-chevron-right" style={{ fontSize: 10, lineHeight: 1 }}></i>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ─── Domain stack ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {buckets.map(b => (
          <DomainRow
            key={b.key}
            bucket={b}
            momentum={momentum[b.key]}
            isExpanded={!!expanded[b.key]}
            onToggle={() => setExpanded(e => ({ ...e, [b.key]: !e[b.key] }))}
            onPickBp={setSelectedBp}
          />
        ))}
      </div>

      {/* ─── Power-user escape hatch ─── */}
      <div style={{
        marginTop: '1.75rem', paddingTop: '1rem',
        borderTop: '1px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          Need every BP at once? The full inventory is available, but it's denser.
        </div>
        <button
          type="button"
          onClick={() => setShowFullInventory(true)}
          style={{
            background: 'transparent', border: '1px solid var(--color-border)',
            padding: '0.4rem 0.85rem', borderRadius: 4,
            fontSize: 12, color: 'var(--color-text-light)', cursor: 'pointer',
          }}
        >
          <i className="bi bi-grid-3x3-gap me-1"></i>Show full inventory
        </button>
      </div>

      {/* ─── BP detail modal (reuses existing component) ─── */}
      {selectedBp && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '3rem 1rem 1rem', overflowY: 'auto', zIndex: 1050,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedBp(null); }}
        >
          <div style={{
            background: 'white', borderRadius: 8, width: '100%', maxWidth: 960,
            padding: '1.25rem 1.4rem', boxShadow: '0 20px 60px rgba(15,23,42,0.4)',
          }}>
            <PortalBusinessProcessDetail
              processId={selectedBp}
              onClose={() => setSelectedBp(null)}
              onUpdate={() => {
                bpApi.getProcesses().then(r => setProcesses(r.data || [])).catch(() => {});
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────

const DomainRow: React.FC<{
  bucket: DomainBucket;
  momentum: { delta: number | null; direction: Direction; label: string; minutesSince: number | null } | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  onPickBp: (id: string) => void;
}> = ({ bucket, momentum, isExpanded, onToggle, onPickBp }) => {
  const tone = LIFECYCLE_TONE[bucket.lifecycleState];
  const mom = momentum || { delta: null, direction: 'first-visit' as Direction, label: 'baseline', minutesSince: null };
  const momTone = MOMENTUM_TONE[mom.direction];

  return (
    <section
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8, overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '1rem 1.15rem', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-alt)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Icon — softer, monochrome */}
        <i
          className={`bi ${bucket.icon}`}
          aria-hidden="true"
          style={{
            fontSize: 18,
            color: 'var(--color-text-light)',
            opacity: 0.7,
            flexShrink: 0, width: 22, marginTop: 2,
          }}
        ></i>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row — name · count · lifecycle pill · momentum chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 15, fontWeight: 600, color: 'var(--color-primary)',
              letterSpacing: '-0.005em',
            }}>
              {bucket.label}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontWeight: 500 }}>
              · {bucket.processes.length} BP{bucket.processes.length === 1 ? '' : 's'}
            </span>
            <span style={{
              fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: tone.fg, background: tone.bg, padding: '2px 7px',
              borderRadius: 3, fontWeight: 600,
            }}>
              {bucket.lifecycleState}
            </span>
            {mom.direction !== 'first-visit' && mom.direction !== 'flat' && (
              <span title={mom.minutesSince != null ? `since ${mom.minutesSince}m ago` : undefined} style={{
                fontSize: 10.5, color: momTone.fg, background: momTone.bg,
                padding: '2px 6px', borderRadius: 3, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{momTone.symbol}</span>
                {mom.label}
                {mom.delta != null && Math.abs(mom.delta) >= 1 && (
                  <span style={{ opacity: 0.8, marginLeft: 2 }}>
                    {mom.delta > 0 ? '+' : ''}{mom.delta}
                  </span>
                )}
              </span>
            )}
          </div>

          {/* Narrative */}
          <div style={{
            fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.6,
            maxWidth: 720,
          }}>
            {bucket.narrative}
          </div>

          {/* Relationship hint */}
          {bucket.relationshipHint && (
            <div style={{
              fontSize: 11, color: 'var(--color-text-light)',
              marginTop: 6, fontStyle: 'italic', opacity: 0.85,
            }}>
              <i className="bi bi-arrow-right-short me-1" style={{ fontSize: 12 }}></i>
              {bucket.relationshipHint}
            </div>
          )}
        </div>

        {/* Chevron */}
        <i
          className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}
          style={{ fontSize: 12, color: 'var(--color-text-light)', flexShrink: 0, marginTop: 5 }}
        ></i>
      </button>

      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-alt)' }}>
          <div style={{
            padding: '0.55rem 1.4rem 0.4rem 3.4rem',
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--color-text-light)', fontWeight: 600,
          }}>
            Processes in this domain
          </div>
          {bucket.processes.map(p => (
            <BPLine key={p.id} bp={p} onPick={() => onPickBp(p.id)} />
          ))}
        </div>
      )}
    </section>
  );
};

const BPLine: React.FC<{ bp: BPLike; onPick: () => void }> = ({ bp, onPick }) => {
  const matched = bp.matched_requirements || 0;
  const total = bp.total_requirements || 0;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  const usable = bp.usability?.usable === true;
  // Soft per-row word — never red. Calmer than the metric-bar grid.
  const word = usable ? 'usable' : pct >= 50 ? 'forming' : pct > 0 ? 'early' : 'unbuilt';
  const wordColor = usable
    ? '#15803d'
    : pct >= 50
      ? '#1d4ed8'
      : 'var(--color-text-light)';
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        width: '100%', background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.6rem 1.4rem 0.6rem 3.4rem',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13, color: 'var(--color-text)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bp.name}
      </span>
      {total > 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {matched}/{total}
        </span>
      )}
      <span style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: wordColor, fontWeight: 600, flexShrink: 0,
        minWidth: 62, textAlign: 'right',
      }}>
        {word}
      </span>
      <i className="bi bi-chevron-right" style={{ fontSize: 10, color: 'var(--color-text-light)', flexShrink: 0, opacity: 0.6 }}></i>
    </button>
  );
};

function buildArchitectureHeadline(buckets: DomainBucket[], overallPct: number): string {
  // Lead with a lifecycle-aware sentence that names a stand-out domain when
  // one exists, otherwise an overall framing.
  const sorted = [...buckets].sort((a, b) => b.completionPercent - a.completionPercent);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  if (top && bottom && top !== bottom && top.completionPercent - bottom.completionPercent >= 30) {
    return `${top.label} leads the architecture in maturity; ${bottom.label} is still being scaffolded.`;
  }
  if (overallPct >= 70) return 'Your operational architecture is mature and reading as a connected system.';
  if (overallPct >= 40) return 'Your operational architecture is taking shape — domains exist and the through-line is forming.';
  if (overallPct > 0) return 'Your operational architecture has its first pieces in place; the path between domains is still emerging.';
  return 'Your operational architecture is mapped out; the work to fill it in is just beginning.';
}

export default BPDomainSurface;
