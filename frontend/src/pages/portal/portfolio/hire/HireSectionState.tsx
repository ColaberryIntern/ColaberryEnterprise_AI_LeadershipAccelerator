import React from 'react';
import type { Loaded } from './hireStudioModel';

/**
 * The two states every studio section shares before it has data: still loading, or the read
 * failed (said plainly, with a retry; nothing the candidate saved is lost by a failed read).
 * Returns null once there is a value, so a section renders `<HireSectionState …/> ?? body`.
 */
export function sectionState<T>(loaded: Loaded<T>, onRetry: () => void, what: string): React.ReactElement | null {
  if (loaded.failed) {
    return (
      <div className="cp-card" role="alert">
        <p className="cp-muted" style={{ marginBottom: 12 }}>We couldn’t load your {what} just now. Nothing you saved is lost.</p>
        <button type="button" className="cp-btn" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (!loaded.value) return <p className="cp-muted" role="status">Loading…</p>;
  return null;
}
