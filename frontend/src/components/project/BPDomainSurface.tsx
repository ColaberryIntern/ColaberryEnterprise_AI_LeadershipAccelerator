/**
 * BPDomainSurface — editorial replacement for the flat BP grid.
 *
 * System Surface Maturity Sprint, 2026-05-12.
 *
 * The old BPs tab showed ~45 cards in a 3-column grid. Each card carried
 * 5 metric bars (matched / readiness / quality / completion / etc.), all
 * the same visual weight. Result: "engineering inventory" energy. The
 * operator couldn't form an architectural mental model from it.
 *
 * This surface presents the same data as:
 *   - 6 named operational domains (Intake & Registration, Lead
 *     Intelligence, Marketing Operations, Student Lifecycle, Execution
 *     Systems, Reporting & Analytics — plus "Other" only when populated)
 *   - One narrative line per domain ("Lead orchestration is partially
 *     connected — 8 processes, 47% complete")
 *   - Progressive reveal: each domain is collapsed by default; click to
 *     expand into a compact list of BPs (NOT a metric-bar grid)
 *   - Click a BP → reuses the existing PortalBusinessProcessDetail modal
 *
 * The flat grid is preserved behind a "Show full inventory" toggle for
 * power users. Default state is the editorial surface.
 */
import React, { useEffect, useMemo, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import { classifyBPs, type DomainBucket, type BPLike } from '../../utils/bpDomainClassifier';
import PortalBusinessProcessDetail from './PortalBusinessProcessDetail';
import PortalBusinessProcessesTab from './PortalBusinessProcessesTab';

function completionTone(pct: number, total: number): { fg: string; word: string } {
  if (total === 0) return { fg: 'var(--color-text-light)', word: 'awaiting setup' };
  if (pct >= 80) return { fg: 'var(--color-accent)', word: 'healthy' };
  if (pct >= 40) return { fg: 'var(--color-warning)', word: 'partial' };
  return { fg: 'var(--color-secondary)', word: 'early stage' };
}

const BPDomainSurface: React.FC = () => {
  const [processes, setProcesses] = useState<BPLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBp, setSelectedBp] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showFullInventory, setShowFullInventory] = useState(false);

  useEffect(() => {
    setLoading(true);
    bpApi.getProcesses()
      .then(r => setProcesses(r.data || []))
      .catch(() => setProcesses([]))
      .finally(() => setLoading(false));
  }, []);

  const buckets = useMemo(() => classifyBPs(processes), [processes]);
  const overall = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.totalRequirements, 0);
    const matched = buckets.reduce((s, b) => s + b.matchedRequirements, 0);
    return {
      total,
      matched,
      pct: total > 0 ? Math.round((matched / total) * 100) : 0,
    };
  }, [buckets]);

  if (loading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading operational domains…
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
            ← Back to operational domains
          </button>
        </div>
        <PortalBusinessProcessesTab />
      </div>
    );
  }

  return (
    <div>
      {/* ─── Overall narrative headline ─── */}
      <div style={{
        padding: '1.1rem 1.25rem 1.25rem',
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        marginBottom: '1.25rem',
      }}>
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--color-text-light)', fontWeight: 600,
        }}>
          Operational architecture
        </div>
        <h3 style={{
          fontSize: 19, fontWeight: 600, color: 'var(--color-primary)',
          margin: '6px 0 6px', letterSpacing: '-0.01em', lineHeight: 1.3,
        }}>
          {buildOverallHeadline(buckets, overall.pct)}
        </h3>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.55 }}>
          {buckets.length} operational domain{buckets.length === 1 ? '' : 's'} ·{' '}
          <strong style={{ color: 'var(--color-text)' }}>{processes.length}</strong> business processes ·{' '}
          <strong style={{ color: 'var(--color-text)' }}>{overall.matched} of {overall.total}</strong> requirements matched ({overall.pct}%)
        </div>
      </div>

      {/* ─── Domain stack ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {buckets.map(b => (
          <DomainRow
            key={b.spec.key}
            bucket={b}
            isExpanded={!!expanded[b.spec.key]}
            onToggle={() => setExpanded(e => ({ ...e, [b.spec.key]: !e[b.spec.key] }))}
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
            background: 'transparent',
            border: '1px solid var(--color-border)',
            padding: '0.4rem 0.85rem',
            borderRadius: 4,
            fontSize: 12,
            color: 'var(--color-text-light)',
            cursor: 'pointer',
          }}
        >
          <i className="bi bi-grid-3x3-gap me-1"></i>Show full inventory
        </button>
      </div>

      {/* ─── BP detail modal (re-uses the existing component) ─── */}
      {selectedBp && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          padding: '3rem 1rem 1rem', overflowY: 'auto', zIndex: 1050,
        }} onClick={(e) => { if (e.target === e.currentTarget) setSelectedBp(null); }}>
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
  isExpanded: boolean;
  onToggle: () => void;
  onPickBp: (id: string) => void;
}> = ({ bucket, isExpanded, onToggle, onPickBp }) => {
  const tone = completionTone(bucket.completionPercent, bucket.totalRequirements);

  return (
    <section
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        overflow: 'hidden',
        transition: 'border-color 200ms ease, box-shadow 200ms ease',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '0.9rem 1.15rem', textAlign: 'left', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 14, minWidth: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-alt)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <i className={`bi ${bucket.spec.icon}`} style={{ fontSize: 22, color: tone.fg, flexShrink: 0, width: 28 }} aria-hidden="true"></i>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: 'var(--color-primary)',
            letterSpacing: '-0.005em',
          }}>
            {bucket.spec.label}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--color-text-light)', marginTop: 2, lineHeight: 1.5 }}>
            {bucket.narrative}
          </div>
        </div>
        <div style={{
          flexShrink: 0, textAlign: 'right',
          color: tone.fg, fontWeight: 600,
        }}>
          <div style={{ fontSize: 18 }}>{bucket.completionPercent}%</div>
          <div style={{
            fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--color-text-light)', fontWeight: 600, marginTop: 1,
          }}>
            {tone.word}
          </div>
        </div>
        <i className={`bi ${isExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}`}
           style={{ fontSize: 12, color: 'var(--color-text-light)', flexShrink: 0, width: 16, textAlign: 'right' }}></i>
      </button>

      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-alt)' }}>
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
  const tone = completionTone(pct, total);
  const usable = bp.usability?.usable === true;
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        width: '100%', background: 'transparent', border: 'none',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.55rem 1.4rem 0.55rem 3.2rem',
        textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, color: 'var(--color-text)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'white'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {bp.name}
      </span>
      {total > 0 && (
        <span style={{ fontSize: 11.5, color: 'var(--color-text-light)', flexShrink: 0 }}>
          {matched}/{total} reqs
        </span>
      )}
      <span style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em',
        color: tone.fg, fontWeight: 600, flexShrink: 0, minWidth: 70, textAlign: 'right',
      }}>
        {usable ? 'usable' : tone.word}
      </span>
      <i className="bi bi-chevron-right" style={{ fontSize: 10, color: 'var(--color-text-light)', flexShrink: 0 }}></i>
    </button>
  );
};

function buildOverallHeadline(buckets: DomainBucket[], pct: number): string {
  // Lead with the most-mature domain if there's a clear leader, else use
  // an overall framing.
  const sorted = [...buckets].sort((a, b) => b.completionPercent - a.completionPercent);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (top && bottom && top !== bottom && top.completionPercent - bottom.completionPercent >= 30) {
    return `${top.spec.label} leads at ${top.completionPercent}%; ${bottom.spec.label} is still early at ${bottom.completionPercent}%.`;
  }
  if (pct >= 70) return `Your operational architecture is in good shape — ${pct}% of requirements implemented.`;
  if (pct >= 40) return `Your operational architecture is taking shape — ${pct}% of requirements implemented.`;
  return `Your operational architecture is early-stage — ${pct}% of requirements implemented.`;
}

export default BPDomainSurface;
