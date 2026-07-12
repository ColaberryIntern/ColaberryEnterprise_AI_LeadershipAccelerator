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
import { renderMd as md } from '../../utils/renderMd';
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
        background: 'linear-gradient(135deg, #FB2832 0%, #C20E1E 100%)',
        color: 'white',
        borderRadius: 8,
        padding: '1.1rem 1.25rem',
        marginBottom: '1.25rem',
        boxShadow: '0 4px 12px rgba(251, 40, 50, 0.22)',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85, marginBottom: 4 }}>
        Today's one priority
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8, lineHeight: 1.35 }}>{md(action.title)}</div>
      <div style={{ fontSize: 13, opacity: 0.92, marginBottom: 10, lineHeight: 1.55 }}>
        {action.reason}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" style={{ background: 'white', color: '#FB2832', fontWeight: 600 }} onClick={onGo}>
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
    <div style={{ fontWeight: 600, color: '#FB2832', marginTop: 8 }}>You're caught up.</div>
    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginTop: 4 }}>
      Cory has nothing to surface right now. Open Critique to spot improvements, or Blueprint to start a build.
    </div>
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
      <Link to="/portal/visual-workspace" className="btn btn-sm" style={{ borderColor: '#FB2832', color: '#FB2832', border: '1px solid #FB2832' }}>
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
        background: first ? '#FB2832' : 'var(--color-bg-alt)',
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
        {md(entry.title)}
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
    <button type="button" className="btn btn-sm" onClick={onGo} style={{ fontSize: 11, flexShrink: 0, border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}>
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
      {/* Value font intentionally restrained — 22px instead of 28px so the
          editorial band label below reads as peer of the number rather
          than a footnote. Structural Confidence Sprint, 2026-05-15. */}
      <div style={{ fontSize: 22, fontWeight: 600, color: valueColor, marginTop: 4, lineHeight: 1.15, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span>{value}</span>
        {highlight && (
          <span title="Improved since your last visit" aria-label="improved" style={{ fontSize: 12, color: 'var(--color-accent)', fontWeight: 700 }}>
            ↗
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: footerColor, marginTop: 4, fontWeight: 600 }}>{footer}</div>
    </>
  );
  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        style={baseStyle}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#FB2832'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(251,40,50,0.08)'; }}
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

// =============================================================================
// Student CB-System — priority queue + approval workspace + Run My Day
// Adapts the employee ops pattern for students.
// Work source: RequirementsMap rows (native student tasks), not Basecamp todos.
// =============================================================================

export interface StudentQueueItem {
  id: string;
  requirement_key: string;
  requirement_text: string;
  status: string;
  urgency_score: number;
  category: 'build' | 'integrate' | 'deploy' | 'test' | 'design' | 'default';
  claude_code_prompt: string;
  github_file_paths: string[];
  rank: number;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  unmatched:    { label: 'Not started',  color: 'var(--color-danger)' },
  unmapped:     { label: 'Not started',  color: 'var(--color-danger)' },
  partial:      { label: 'In progress',  color: 'var(--color-warning)' },
  matched:      { label: 'Matched',      color: 'var(--color-info, #0369a1)' },
  planned:      { label: 'Planned',      color: 'var(--color-text-light)' },
};

const CAT_ICON: Record<StudentQueueItem['category'], string> = {
  build:     'bi-hammer',
  integrate: 'bi-plug',
  deploy:    'bi-cloud-upload',
  test:      'bi-check2-square',
  design:    'bi-palette',
  default:   'bi-card-list',
};

function urgencyColor(score: number): string {
  if (score >= 70) return 'var(--color-danger)';
  if (score >= 40) return 'var(--color-warning)';
  return 'var(--color-text-light)';
}

// ---------------------------------------------------------------------------
// ApprovalWorkspace — inline action panel expanded below a queue row
// ---------------------------------------------------------------------------

interface ApprovalWorkspaceProps {
  item: StudentQueueItem;
  onDone: (id: string) => void;
  onDefer: (id: string) => void;
  onFlagBlocker: (id: string) => void;
  onCopyPrompt: (prompt: string) => void;
  copied: boolean;
  deciding: boolean;
}

export const ApprovalWorkspace: React.FC<ApprovalWorkspaceProps> = ({
  item, onDone, onDefer, onFlagBlocker, onCopyPrompt, copied, deciding,
}) => (
  <div style={{
    background: 'var(--color-bg-alt, #f8fafc)',
    borderTop: '1px solid var(--color-border)',
    padding: '0.85rem 1rem',
  }}>
    <div style={{ fontSize: 12, color: 'var(--color-text-light)', marginBottom: 8, lineHeight: 1.5 }}>
      {item.requirement_text}
    </div>

    {/* Action bar */}
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
      <button
        type="button"
        className="btn btn-sm btn-success"
        onClick={() => onDone(item.id)}
        disabled={deciding}
        style={{ fontSize: 11 }}
      >
        <i className="bi bi-check-lg me-1"></i>Mark done
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={() => onDefer(item.id)}
        disabled={deciding}
        style={{ fontSize: 11 }}
      >
        <i className="bi bi-arrow-down me-1"></i>Defer
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => onFlagBlocker(item.id)}
        disabled={deciding}
        style={{ fontSize: 11 }}
      >
        <i className="bi bi-flag me-1"></i>Flag blocker
      </button>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => onCopyPrompt(item.claude_code_prompt)}
        style={{ fontSize: 11, marginLeft: 'auto', border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}
      >
        <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'} me-1`}></i>
        {copied ? 'Copied!' : 'Copy Claude Code prompt'}
      </button>
    </div>

    {/* Prompt preview */}
    <pre style={{
      background: '#1A1A1A',
      color: '#e2e8f0',
      fontSize: 11,
      padding: '0.65rem 0.85rem',
      borderRadius: 4,
      margin: 0,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      maxHeight: 120,
      overflowY: 'auto',
      lineHeight: 1.55,
    }}>
      {item.claude_code_prompt}
    </pre>
  </div>
);

// ---------------------------------------------------------------------------
// StudentQueueRow — collapsible row with embedded ApprovalWorkspace
// ---------------------------------------------------------------------------

interface StudentQueueRowProps {
  item: StudentQueueItem;
  expanded: boolean;
  onToggle: (id: string) => void;
  onDone: (id: string) => void;
  onDefer: (id: string) => void;
  onFlagBlocker: (id: string) => void;
  onCopyPrompt: (prompt: string) => void;
  copied: boolean;
  deciding: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export const StudentQueueRow: React.FC<StudentQueueRowProps> = ({
  item, expanded, onToggle, onDone, onDefer, onFlagBlocker, onCopyPrompt,
  copied, deciding, isFirst, isLast,
}) => {
  const statusMeta = STATUS_LABEL[item.status] ?? { label: item.status, color: 'var(--color-text-light)' };
  return (
    <div style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--color-border)' }}>
      {/* Row header — click to expand */}
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          width: '100%', background: 'none', border: 'none',
          padding: '0.65rem 0.95rem', cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={expanded}
      >
        {/* Rank circle */}
        <span style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: isFirst ? '#FB2832' : 'var(--color-bg-alt, #f1f5f9)',
          color: isFirst ? 'white' : 'var(--color-text-light)',
          fontWeight: 600, fontSize: 12,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {item.rank}
        </span>

        {/* Category icon + text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <i className={`bi ${CAT_ICON[item.category]} me-1`} style={{ color: 'var(--color-text-light)', fontSize: 11 }}></i>
            {item.requirement_text.length > 80 ? item.requirement_text.slice(0, 77) + '…' : item.requirement_text}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 2 }}>
            <span style={{ color: statusMeta.color, fontWeight: 600 }}>{statusMeta.label}</span>
            {' · '}urgency {item.urgency_score}
          </div>
        </div>

        {/* Urgency bar */}
        <div style={{ width: 32, height: 4, background: 'var(--color-border)', borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${item.urgency_score}%`, height: '100%', background: urgencyColor(item.urgency_score), borderRadius: 2 }} />
        </div>

        {/* Expand chevron */}
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: 11, color: 'var(--color-text-light)', flexShrink: 0 }}></i>
      </button>

      {expanded && (
        <ApprovalWorkspace
          item={item}
          onDone={onDone}
          onDefer={onDefer}
          onFlagBlocker={onFlagBlocker}
          onCopyPrompt={onCopyPrompt}
          copied={copied}
          deciding={deciding}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// StudentQueueSection — list container with header + Walk My Queue button
// ---------------------------------------------------------------------------

interface StudentQueueSectionProps {
  items: StudentQueueItem[];
  loading: boolean;
  error: string | null;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onDone: (id: string) => void;
  onDefer: (id: string) => void;
  onFlagBlocker: (id: string) => void;
  onCopyPrompt: (prompt: string) => void;
  copiedId: string | null;
  decidingId: string | null;
  onEnterWalkMode: () => void;
}

export const StudentQueueSection: React.FC<StudentQueueSectionProps> = ({
  items, loading, error, expandedId, onToggle, onDone, onDefer, onFlagBlocker,
  onCopyPrompt, copiedId, decidingId, onEnterWalkMode,
}) => (
  <section className="mb-3">
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
      <h6 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', margin: 0, fontWeight: 600 }}>
        Your build queue
      </h6>
      {items.length > 0 && (
        <span style={{ fontSize: 10, background: 'var(--color-bg-alt, #f1f5f9)', color: 'var(--color-text-light)', padding: '0.1rem 0.45rem', borderRadius: 9999, fontWeight: 600 }}>
          {items.length}
        </span>
      )}
      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
        ranked by urgency
      </span>
      {items.length > 0 && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={onEnterWalkMode}
          style={{ fontSize: 11, background: '#FB2832', color: 'white', border: 'none' }}
        >
          <i className="bi bi-play-fill me-1"></i>Walk my queue
        </button>
      )}
    </div>

    {loading && (
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '1.25rem', textAlign: 'center' }}>
        <div className="spinner-border spinner-border-sm text-primary me-2" role="status" />
        <span style={{ fontSize: 12, color: 'var(--color-text-light)' }}>Loading your build queue…</span>
      </div>
    )}

    {!loading && error && (
      <div className="alert alert-warning py-2" style={{ fontSize: 12 }}>
        Could not load build queue. <strong>{error}</strong>
      </div>
    )}

    {!loading && !error && items.length === 0 && (
      <div className="ws-breath" style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, padding: '1.25rem', textAlign: 'center', color: 'var(--color-text-light)', fontSize: 13 }}>
        <i className="bi bi-check2-circle me-1" style={{ color: 'var(--color-success)' }}></i>
        All requirements verified. Set up your GitHub repo to track new work.
      </div>
    )}

    {!loading && !error && items.length > 0 && (
      <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <StudentQueueRow
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggle={onToggle}
            onDone={onDone}
            onDefer={onDefer}
            onFlagBlocker={onFlagBlocker}
            onCopyPrompt={onCopyPrompt}
            copied={copiedId === item.id}
            deciding={decidingId === item.id}
            isFirst={i === 0}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    )}
  </section>
);

// ---------------------------------------------------------------------------
// RunMyDayMode — full-screen walk mode, one item at a time
// ---------------------------------------------------------------------------

interface RunMyDayModeProps {
  items: StudentQueueItem[];
  currentIndex: number;
  onNav: (delta: -1 | 1) => void;
  onExit: () => void;
  onDone: (id: string) => void;
  onDefer: (id: string) => void;
  onCopyPrompt: (prompt: string, id: string) => void;
  copiedId: string | null;
  decidingId: string | null;
}

export const RunMyDayMode: React.FC<RunMyDayModeProps> = ({
  items, currentIndex, onNav, onExit, onDone, onDefer, onCopyPrompt, copiedId, decidingId,
}) => {
  const item = items[currentIndex];
  if (!item) return null;

  const statusMeta = STATUS_LABEL[item.status] ?? { label: item.status, color: 'var(--color-text-light)' };
  const isCopied = copiedId === item.id;
  const isDeciding = decidingId === item.id;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1050,
      background: 'rgba(15, 23, 42, 0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}
      role="dialog"
      aria-modal="true"
      aria-label="Run My Day walk mode"
    >
      <div style={{
        background: 'white', borderRadius: 12, width: '100%', maxWidth: 680,
        boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        {/* Header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.85rem 1.25rem',
          background: '#FB2832', color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="bi bi-play-fill" style={{ fontSize: 14 }}></i>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Run My Day</span>
            <span style={{ fontSize: 11, opacity: 0.75 }}>
              {currentIndex + 1} of {items.length}
            </span>
          </div>
          <button
            type="button"
            onClick={onExit}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', borderRadius: 4, padding: '0.2rem 0.65rem', fontSize: 11, cursor: 'pointer' }}
          >
            Exit
          </button>
        </div>

        {/* Item body */}
        <div style={{ padding: '1.5rem 1.5rem 1rem' }}>
          {/* Category + urgency */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              background: 'var(--color-bg-alt, #f1f5f9)', color: 'var(--color-text-light)',
              borderRadius: 4, padding: '0.2rem 0.55rem', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              <i className={`bi ${CAT_ICON[item.category]} me-1`}></i>
              {item.category}
            </span>
            <span style={{ fontSize: 11, color: urgencyColor(item.urgency_score), fontWeight: 600 }}>
              urgency {item.urgency_score}
            </span>
            <span style={{ fontSize: 11, color: statusMeta.color, marginLeft: 'auto' }}>
              {statusMeta.label}
            </span>
          </div>

          {/* Requirement text */}
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1A1A1A', lineHeight: 1.45, marginBottom: 14 }}>
            {item.requirement_text}
          </p>

          {/* Prompt block */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 6 }}>
              Claude Code prompt
            </div>
            <pre style={{
              background: '#1A1A1A', color: '#e2e8f0',
              fontSize: 11, padding: '0.85rem 1rem', borderRadius: 6,
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              lineHeight: 1.6, maxHeight: 160, overflowY: 'auto',
            }}>
              {item.claude_code_prompt}
            </pre>
          </div>

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => onDone(item.id)}
              disabled={isDeciding}
              style={{ fontSize: 12 }}
            >
              <i className="bi bi-check-lg me-1"></i>Mark done
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => onDefer(item.id)}
              disabled={isDeciding}
              style={{ fontSize: 12 }}
            >
              <i className="bi bi-arrow-down me-1"></i>Defer
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onCopyPrompt(item.claude_code_prompt, item.id)}
              style={{ fontSize: 12, marginLeft: 'auto', background: '#FB2832', color: 'white', border: 'none' }}
            >
              <i className={`bi ${isCopied ? 'bi-check-lg' : 'bi-clipboard'} me-1`}></i>
              {isCopied ? 'Copied!' : 'Copy prompt'}
            </button>
          </div>
        </div>

        {/* Navigation footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg-alt, #f8fafc)',
        }}>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onNav(-1)}
            disabled={currentIndex === 0}
            style={{ fontSize: 11 }}
          >
            <i className="bi bi-arrow-left me-1"></i>Prev
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {items.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i === currentIndex ? '#FB2832' : 'var(--color-border)',
                  transition: 'background 200ms',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onNav(1)}
            disabled={currentIndex === items.length - 1}
            style={{ fontSize: 11 }}
          >
            Next<i className="bi bi-arrow-right ms-1"></i>
          </button>
        </div>
      </div>
    </div>
  );
};
