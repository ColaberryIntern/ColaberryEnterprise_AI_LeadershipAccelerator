/**
 * BPDomainSurface — operational architecture view with causality.
 *
 * Operational Causality Sprint, 2026-05-12.
 *
 * The surface reads like a navigable map of business operations — the
 * operator can trace how operational pressure moves through the system.
 *
 *   1. Editorial overview headline (authored, not "X% complete")
 *   2. Operational flow strip — CLICKABLE: each stop carries a BP count
 *      and navigates to its domain (expand + smooth-scroll + pulse)
 *   3. Domain rows — softer monochrome icons, BP count, lifecycle state,
 *      authored narrative, momentum chip, CLICKABLE relationship chips
 *      (receives from / feeds / supports), and an operational-pressure note
 *   4. Expanded domain — entry/exit role + downstream-effect summary +
 *      the BP list
 *   5. First populated domain auto-expanded
 *   6. Power-user escape hatch: "Show full inventory" reveals the legacy grid
 *
 * Not a graph engine — editorial relationship UX. Clicking any
 * relationship or flow stop expands + scrolls + pulses the target domain.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import {
  classifyBPs,
  buildFlowStops,
  type DomainBucket,
  type BPLike,
  type LifecycleState,
  type DomainKey,
  type DomainRelationship,
} from '../../utils/bpDomainClassifier';
import { useDomainMomentum, type Direction } from '../../hooks/useDomainMomentum';
import BPDetailV2 from './BPDetailV2';
import PortalBusinessProcessesTab from './PortalBusinessProcessesTab';

// Lifecycle state → tone. Softer than completion% — no hot reds.
const LIFECYCLE_TONE: Record<LifecycleState, { fg: string; bg: string }> = {
  Foundational: { fg: 'var(--color-text-light)', bg: 'rgba(113,128,150,0.08)' },
  Emerging:     { fg: '#b45309', bg: 'rgba(245,158,11,0.10)' },
  Coordinated:  { fg: '#1d4ed8', bg: 'rgba(59,130,246,0.10)' },
  Operational:  { fg: '#15803d', bg: 'rgba(56,161,105,0.12)' },
  Scaling:      { fg: '#0e7490', bg: 'rgba(8,145,178,0.12)' },
  Stabilizing:  { fg: '#6d28d9', bg: 'rgba(139,92,246,0.10)' },
};

const MOMENTUM_TONE: Record<Direction, { fg: string; bg: string; symbol: string }> = {
  up:            { fg: '#15803d', bg: 'rgba(56,161,105,0.10)', symbol: '↑' },
  down:          { fg: '#b91c1c', bg: 'rgba(229,62,62,0.08)',  symbol: '↓' },
  flat:          { fg: 'var(--color-text-light)', bg: 'transparent', symbol: '·' },
  'first-visit': { fg: 'var(--color-text-light)', bg: 'transparent', symbol: '·' },
};

// Relationship verb → directional glyph + tone.
const REL_STYLE: Record<DomainRelationship['verb'], { glyph: string; fg: string }> = {
  'receives from': { glyph: '↑', fg: '#0e7490' },  // upstream
  'feeds':         { glyph: '↓', fg: '#1d4ed8' },  // downstream
  'supports':      { glyph: '→', fg: '#15803d' },  // cross-cut out
  'supported by':  { glyph: '←', fg: '#6d28d9' },  // cross-cut in
};

const BPDomainSurface: React.FC = () => {
  const [processes, setProcesses] = useState<BPLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBp, setSelectedBp] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showFullInventory, setShowFullInventory] = useState(false);
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [pulsedKey, setPulsedKey] = useState<DomainKey | null>(null);

  // Refs to each domain row <section> so clicks on the flow strip or a
  // relationship chip can smooth-scroll the target into view.
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

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

  // Navigate to a domain: expand it, smooth-scroll it into view, pulse it.
  // Used by the flow strip stops AND every relationship chip.
  const navigateToDomain = useCallback((key: DomainKey) => {
    setExpanded(e => ({ ...e, [key]: true }));
    setPulsedKey(key);
    // Let the expand paint, then scroll.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    window.setTimeout(() => {
      setPulsedKey(k => (k === key ? null : k));
    }, 1700);
  }, []);

  // Auto-expand the first populated domain on first paint.
  useEffect(() => {
    if (autoExpanded) return;
    if (buckets.length === 0) return;
    setExpanded(prev => ({ ...prev, [buckets[0].key]: true }));
    setAutoExpanded(true);
  }, [buckets, autoExpanded]);

  const overall = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.totalRequirements, 0);
    const matched = buckets.reduce((s, b) => s + b.matchedRequirements, 0);
    return { total, matched, pct: total > 0 ? Math.round((matched / total) * 100) : 0 };
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

      {/* ─── Operational flow strip — CLICKABLE ─── */}
      {flowStops.length >= 2 && (
        <div
          aria-label="Operational flow — click a stop to jump to its domain"
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 0,
            padding: '0.95rem 1.1rem', marginBottom: '0.5rem',
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            overflowX: 'auto',
          }}
        >
          {flowStops.map((stop, i) => {
            const tone = LIFECYCLE_TONE[stop.state];
            return (
              <React.Fragment key={stop.key}>
                <button
                  type="button"
                  onClick={() => navigateToDomain(stop.key)}
                  title={`Jump to ${stop.label}`}
                  style={{
                    minWidth: 0, flex: '0 0 auto', textAlign: 'left',
                    background: 'transparent', border: 'none', padding: '2px 4px',
                    borderRadius: 4, cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-alt)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
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
                  <div style={{
                    fontSize: 10.5, color: 'var(--color-text-light)', marginTop: 1,
                    fontWeight: 500,
                  }}>
                    {stop.bpCount} BP{stop.bpCount === 1 ? '' : 's'}
                  </div>
                </button>
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
      <div style={{
        fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic',
        marginBottom: '1.5rem', paddingLeft: 2,
      }}>
        Click any stop above — or any relationship below — to jump to that domain.
      </div>

      {/* ─── Domain stack ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {buckets.map(b => (
          <DomainRow
            key={b.key}
            bucket={b}
            momentum={momentum[b.key]}
            isExpanded={!!expanded[b.key]}
            isPulsing={pulsedKey === b.key}
            registerRef={(el) => { rowRefs.current[b.key] = el; }}
            onToggle={() => setExpanded(e => ({ ...e, [b.key]: !e[b.key] }))}
            onNavigate={navigateToDomain}
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

      {/* ─── BP detail modal ─── */}
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
            <BPDetailV2
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
  isPulsing: boolean;
  registerRef: (el: HTMLElement | null) => void;
  onToggle: () => void;
  onNavigate: (key: DomainKey) => void;
  onPickBp: (id: string) => void;
}> = ({ bucket, momentum, isExpanded, isPulsing, registerRef, onToggle, onNavigate, onPickBp }) => {
  const tone = LIFECYCLE_TONE[bucket.lifecycleState];
  const mom = momentum || { delta: null, direction: 'first-visit' as Direction, label: 'baseline', minutesSince: null };
  const momTone = MOMENTUM_TONE[mom.direction];

  const downstreamSummary = bucket.downstreamCount === 0
    ? 'No downstream dependencies yet'
    : `${bucket.downstreamCount} operational area${bucket.downstreamCount === 1 ? '' : 's'} depend${bucket.downstreamCount === 1 ? 's' : ''} on this domain`;

  return (
    <section
      ref={registerRef}
      className={isPulsing ? 'ws-domain-pulse' : undefined}
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8, overflow: 'hidden',
      }}
    >
      {/* Header — toggles expand. Contains only non-interactive content. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '1rem 1.15rem 0.7rem', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'flex-start', gap: 14, minWidth: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-alt)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <i
          className={`bi ${bucket.icon}`}
          aria-hidden="true"
          style={{ fontSize: 18, color: 'var(--color-text-light)', opacity: 0.7, flexShrink: 0, width: 22, marginTop: 2 }}
        ></i>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)', letterSpacing: '-0.005em' }}>
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
                  <span style={{ opacity: 0.8, marginLeft: 2 }}>{mom.delta > 0 ? '+' : ''}{mom.delta}</span>
                )}
              </span>
            )}
          </div>

          {/* Narrative */}
          <div style={{ fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.6, maxWidth: 720 }}>
            {bucket.narrative}
          </div>
        </div>

        <i
          className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}
          style={{ fontSize: 12, color: 'var(--color-text-light)', flexShrink: 0, marginTop: 5 }}
        ></i>
      </button>

      {/* Relationship strip — always visible, CLICKABLE chips. Sits outside
          the toggle button so chip clicks navigate instead of toggling. */}
      {(bucket.relationships.length > 0 || bucket.pressureNote) && (
        <div style={{
          padding: '0 1.15rem 0.85rem 3.4rem',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {bucket.relationships.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              {bucket.relationships.map((rel, idx) => {
                const rs = REL_STYLE[rel.verb];
                return (
                  <button
                    key={`${rel.verb}:${rel.targetKey}:${idx}`}
                    type="button"
                    onClick={() => onNavigate(rel.targetKey)}
                    title={`${bucket.label} ${rel.verb} ${rel.targetLabel} — click to jump`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
                      borderRadius: 999, padding: '2px 9px 2px 7px',
                      fontSize: 10.5, color: 'var(--color-text-light)', cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = rs.fg;
                      e.currentTarget.style.color = 'var(--color-text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.color = 'var(--color-text-light)';
                    }}
                  >
                    <span style={{ color: rs.fg, fontWeight: 700, fontSize: 11 }}>{rs.glyph}</span>
                    <span>{rel.verb} <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{rel.targetLabel}</strong></span>
                  </button>
                );
              })}
            </div>
          )}
          {bucket.pressureNote && (
            <div style={{
              fontSize: 11, color: '#92400e', fontStyle: 'italic',
              display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5,
            }}>
              <i className="bi bi-exclamation-circle" style={{ fontSize: 11, marginTop: 2, flexShrink: 0, opacity: 0.8 }}></i>
              <span>{bucket.pressureNote}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — operational role + downstream summary + BP list */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-alt)' }}>
          <div style={{
            padding: '0.8rem 1.4rem 0.7rem 3.4rem',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{
              fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 4,
            }}>
              Operational role
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text)', lineHeight: 1.6, maxWidth: 680 }}>
              {bucket.entryRole}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', marginTop: 5 }}>
              <i className="bi bi-diagram-2 me-1" style={{ fontSize: 11 }}></i>
              {downstreamSummary}.
            </div>
          </div>
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
  const word = usable ? 'usable' : pct >= 50 ? 'forming' : pct > 0 ? 'early' : 'unbuilt';
  const wordColor = usable ? '#15803d' : pct >= 50 ? '#1d4ed8' : 'var(--color-text-light)';
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
