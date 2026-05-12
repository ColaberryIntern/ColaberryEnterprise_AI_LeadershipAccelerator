/**
 * RecentlyMovedCard — ambient "what changed since you were last here".
 *
 * Workspace Presence Sprint, 2026-05-12.
 *
 * Sits below the priority card on Home. Hidden when the operator has no
 * meaningful deltas (first visit, or stable since last visit). When
 * shown, gives the workspace a sense of operational history without
 * needing a dedicated activity log.
 *
 * Three categories of motion (each renders only when non-zero):
 *   - Readiness moved        (current vs lastReadinessScore)
 *   - Coverage moved         (current vs lastCoverageScore)
 *   - Queue moved            (current vs lastQueueSize — negative = good)
 *   - Health moved           (current vs lastHealthScore)
 *
 * Each chip carries a colored arrow (↑ forward, ↓ backward), a numeric
 * delta, and a one-line caption. The card uses ws-delta-rise for entrance.
 *
 * Hard rules:
 *   - Reads only from the supplied momentum object (no new fetches)
 *   - No backend dependency
 *   - Hidden when momentum.hasMomentum === false
 *   - Static — does not animate beyond the entrance fade
 */
import React from 'react';
import type { OperationalMomentum } from '../../hooks/useOperationalMomentum';
import { formatMinutesAgo } from '../../hooks/useOperationalMomentum';

interface Props {
  momentum: OperationalMomentum;
}

type Direction = 'forward' | 'back' | 'flat';

interface Chip {
  label: string;
  delta: number;
  display: string;
  direction: Direction;
  caption: string;
}

const RecentlyMovedCard: React.FC<Props> = ({ momentum }) => {
  if (!momentum.hasMomentum) return null;

  const chips: Chip[] = [];

  if (momentum.readinessDelta != null && momentum.readinessDelta !== 0) {
    chips.push({
      label: 'Readiness',
      delta: momentum.readinessDelta,
      display: signed(momentum.readinessDelta) + '%',
      direction: momentum.readinessDelta > 0 ? 'forward' : 'back',
      caption: momentum.readinessDelta > 0
        ? 'project is more prepared'
        : 'lost ground — check Readiness drawer',
    });
  }

  if (momentum.coverageDelta != null && momentum.coverageDelta !== 0) {
    chips.push({
      label: 'Coverage',
      delta: momentum.coverageDelta,
      display: signed(momentum.coverageDelta) + '%',
      direction: momentum.coverageDelta > 0 ? 'forward' : 'back',
      caption: momentum.coverageDelta > 0
        ? 'more requirements matched'
        : 'requirements drift — re-run extraction?',
    });
  }

  if (momentum.queueDelta != null && momentum.queueDelta !== 0) {
    // Queue decreasing is good — sign is reversed for the direction signal.
    const forward = momentum.queueDelta < 0;
    chips.push({
      label: 'Queue',
      delta: momentum.queueDelta,
      display: signed(momentum.queueDelta),
      direction: forward ? 'forward' : 'back',
      caption: forward
        ? 'items shipped or no longer needed'
        : 'new items surfaced — check Cory',
    });
  }

  if (momentum.healthDelta != null && momentum.healthDelta !== 0) {
    chips.push({
      label: 'Health',
      delta: momentum.healthDelta,
      display: signed(momentum.healthDelta) + '%',
      direction: momentum.healthDelta > 0 ? 'forward' : 'back',
      caption: momentum.healthDelta > 0
        ? 'system more stable'
        : 'regression(s) since last visit',
    });
  }

  if (chips.length === 0) return null;

  const visitLine = momentum.minutesSinceVisit != null
    ? `Last visit ${formatMinutesAgo(momentum.minutesSinceVisit)}`
    : 'Since your last visit';

  return (
    <section
      className="ws-delta-rise"
      aria-label="Recently moved"
      style={{
        background: 'white',
        border: '1px solid var(--color-border)',
        borderLeft: '3px solid var(--color-accent)',
        borderRadius: 6,
        padding: '0.75rem 0.95rem',
        marginBottom: '1.25rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)', fontWeight: 600 }}>
          Recently moved
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          {visitLine}
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {chips.map(c => (
          <DeltaChip key={c.label} chip={c} />
        ))}
      </div>
    </section>
  );
};

const DeltaChip: React.FC<{ chip: Chip }> = ({ chip }) => {
  const fg = chip.direction === 'forward'
    ? 'var(--color-accent)'
    : chip.direction === 'back'
      ? 'var(--color-secondary)'
      : 'var(--color-text-light)';
  const bg = chip.direction === 'forward'
    ? 'rgba(56, 161, 105, 0.07)'
    : chip.direction === 'back'
      ? 'rgba(229, 62, 62, 0.06)'
      : 'var(--color-bg-alt)';
  const arrow = chip.direction === 'forward' ? '↑' : '↓';
  return (
    <div
      title={chip.caption}
      style={{
        background: bg,
        border: `1px solid ${fg === 'var(--color-text-light)' ? 'var(--color-border)' : 'transparent'}`,
        padding: '0.35rem 0.7rem',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 0,
      }}
    >
      <span style={{ color: fg, fontWeight: 700, fontSize: 13 }}>{arrow}</span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          {chip.label} <span style={{ color: fg, marginLeft: 4 }}>{chip.display}</span>
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          {chip.caption}
        </span>
      </div>
    </div>
  );
};

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

export default RecentlyMovedCard;
