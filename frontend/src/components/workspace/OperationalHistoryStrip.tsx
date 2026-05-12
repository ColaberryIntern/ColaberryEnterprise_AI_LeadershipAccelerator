/**
 * OperationalHistoryStrip — replaces the spartan "Synthesized at HH:MM"
 * footer on Cory Home with a richer ambient history line.
 *
 * Workspace Presence Sprint, 2026-05-12.
 *
 * Shows three pieces of time-context on a single calm line:
 *   - When the state was last synthesized (existing built_at)
 *   - When the operator last touched the workspace (memory.lastSnapshotAt)
 *   - When the last critique session was opened (sessionStorage)
 *
 * Each piece is collapsible to "—" when its source is null. The strip
 * is calm: 11px text, muted color, no badges, no buttons.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { UnifiedProjectState } from '../../hooks/useUnifiedProjectState';
import type { WorkspaceMemory } from '../../hooks/useWorkspaceMemory';
import { formatMinutesAgo } from '../../hooks/useOperationalMomentum';

interface Props {
  state: UnifiedProjectState;
  memory: WorkspaceMemory;
}

const OperationalHistoryStrip: React.FC<Props> = ({ state, memory }) => {
  // sessionStorage read for last critique handoff. Read once on mount + on
  // every refresh of state.built_at (cheap — single read, no listener needed
  // since the user navigating into Critique will trigger their own state poll).
  const [lastCritiqueAt, setLastCritiqueAt] = useState<string | null>(null);
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('visualWorkspace:lastSessionTouchedAt');
      setLastCritiqueAt(t);
    } catch { /* ignore */ }
  }, [state.built_at]);

  const builtMin = useMemo(() => {
    return Math.max(0, Math.floor((Date.now() - new Date(state.built_at).getTime()) / 60_000));
  }, [state.built_at]);

  const visitMin = memory.lastSnapshotAt
    ? Math.max(0, Math.floor((Date.now() - new Date(memory.lastSnapshotAt).getTime()) / 60_000))
    : null;
  const critiqueMin = lastCritiqueAt
    ? Math.max(0, Math.floor((Date.now() - new Date(lastCritiqueAt).getTime()) / 60_000))
    : null;

  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--color-text-light)',
        textAlign: 'center',
        marginTop: '1rem',
        display: 'flex',
        justifyContent: 'center',
        gap: 14,
        flexWrap: 'wrap',
      }}
      aria-label="Operational history"
    >
      <HistoryPiece label="Synthesized" value={formatMinutesAgo(builtMin)} />
      <Sep />
      <HistoryPiece label="You last touched" value={visitMin != null ? formatMinutesAgo(visitMin) : '— first visit'} />
      <Sep />
      <HistoryPiece label="Last critique" value={critiqueMin != null ? formatMinutesAgo(critiqueMin) : '— not opened yet'} />
      <Sep />
      <HistoryPiece label="Confidence" value={`${state.confidence.score}%`} />
    </div>
  );
};

const HistoryPiece: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <span>
    <span style={{ textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.08em', opacity: 0.7 }}>
      {label}
    </span>{' '}
    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
  </span>
);

const Sep: React.FC = () => (
  <span aria-hidden="true" style={{ opacity: 0.35 }}>·</span>
);

export default OperationalHistoryStrip;
