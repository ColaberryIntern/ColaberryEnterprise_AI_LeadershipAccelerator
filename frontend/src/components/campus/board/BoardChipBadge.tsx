import React from 'react';
import { badgeLabel, useBoardBadge } from './useBoardBadge';

/** The side panel's "📌 Ask the community" chip count (Campus v14 B5, C70): the same number as the map sign, nothing when zero. */
export function BoardChipBadge(): React.ReactElement | null {
  const n = useBoardBadge();
  if (n <= 0) return null;
  return <span className="cb-chip-badge" data-testid="cb-chip-badge" aria-label={`${n} new on the board`}>{badgeLabel(n)}</span>;
}
