/**
 * CoryHomeParts — presentational subcomponents + helpers for CoryHome.
 *
 * Extracted from CoryHome.tsx in the Operator Orientation Sprint, 2026-05-14,
 * to bring CoryHome back under the module size ceiling before adding the
 * operator-orientation surface. Pure presentation — no hooks, no state, no
 * data fetching. CoryHome owns all of that and passes values down.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import type {
  UnifiedProjectState,
  ReadinessBand,
  BlastRadiusBand,
  QueueEntry,
} from '../../hooks/useUnifiedProjectState';

export const BAND_COLOR: Record<ReadinessBand, { fg: string; bg: string; label: string }> = {
  red: { fg: 'var(--color-danger)', bg: 'var(--color-danger-bg)', label: 'Needs attention' },
  amber: { fg: 'var(--color-warning)', bg: 'var(--color-warning-bg)', label: 'On track' },
  green: { fg: 'var(--color-success)', bg: 'var(--color-success-bg)', label: 'Healthy' },
};

export const BLAST_COLOR: Record<BlastRadiusBand, string> = {
  low: 'var(--color-success)',
  medium: 'var(--color-warning)',
  high: 'var(--color-danger)',
};

// -------------------------- subcomponents -----------------------------------

export const NextActionCard: React.FC<{
  action: UnifiedProjectState['next_action'];
  fresh?: boolean;
  onGo: () => void;
  onWhy: () => void;
}> = ({ action, fresh, onGo, onWhy }) => {
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

export const EmptyPriorityCard: React.FC = () => (
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

export const QueueRow: React.FC<{ entry: QueueEntry; first: boolean; last: boolean; onGo: () => void }> = ({ entry, first, last, onGo }) => (
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

export const SectionHeader: React.FC<{ title: string; badge?: string; aside?: string }> = ({ title, badge, aside }) => (
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

export const Tile: React.FC<{
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

export const Stat: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 600, color, lineHeight: 1.1 }}>{value}</div>
    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', marginTop: 2 }}>{label}</div>
  </div>
);

// -------------------------- helpers -----------------------------------------

export function greetingFor(d: Date): string {
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
export function shortenOrgName(raw: string | null | undefined): string {
  if (!raw) return 'there';
  const trimmed = raw.trim();
  if (trimmed.length <= 20) return trimmed;
  const firstWord = trimmed.split(/\s+/)[0];
  const generic = new Set(['the', 'a', 'an', 'inc', 'inc.', 'llc', 'corp', 'corp.', 'co', 'co.']);
  if (firstWord.length >= 4 && !generic.has(firstWord.toLowerCase())) return firstWord;
  return trimmed.slice(0, 22) + '…';
}

export function buildOneLineStatus(queueTotal: number, blockers: number): string {
  if (queueTotal === 0 && blockers === 0) return 'No queue items, no blockers. Good place to start something new.';
  const parts: string[] = [];
  if (queueTotal > 0) parts.push(`${queueTotal} thing${queueTotal === 1 ? '' : 's'} on the queue`);
  if (blockers > 0) parts.push(`${blockers} blocker${blockers === 1 ? '' : 's'}`);
  return parts.join(' · ') + '.';
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'next_action': return 'Cory';
    case 'governance_recommendation': return 'Governance';
    case 'visual_workspace_pending': return 'Critique';
    case 'verification_failure': return 'Verify';
    case 'capability_gap': return 'Capability';
    default: return source;
  }
}

export function targetLabel(route: string): string {
  if (route.startsWith('/portal/visual-workspace')) return 'Critique';
  if (route.startsWith('/portal/project/blueprint')) return 'Blueprint';
  if (route.startsWith('/portal/project/system')) return 'System';
  return 'workspace';
}
