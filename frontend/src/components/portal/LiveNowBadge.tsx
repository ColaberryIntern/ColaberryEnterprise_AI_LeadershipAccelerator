import React, { useCallback, useMemo, useState } from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import { useBroadcastDiscovery, DiscoveryBroadcast, DiscoveryDeps } from '../../hooks/useBroadcastDiscovery';
import './liveNowBadge.css';

/**
 * "Live now" — the portal-wide entry point into a broadcast.
 *
 * It sits beside the player in the layout route, so it survives navigation for the same
 * reason the player does, and so dismissal survives navigation too. That last part is an
 * acceptance criterion rather than a nicety: a dismissal held in page state re-fires on every
 * route change, and a badge that keeps coming back after you closed it is worse than no badge.
 *
 * DISMISSAL IS KEYED PER OCCURRENCE, AND PERSISTED. Dismissing Monday's class must not
 * dismiss Thursday's, and reloading the page must not undo the decision. localStorage is the
 * right store precisely because this is a per-viewer, per-device convenience with no value to
 * anyone else — and every read and write is wrapped, because it throws in a private window
 * and returns null when site data is cleared.
 *
 * NOTHING IS FABRICATED WHEN COLLECTION FAILS. If discovery is unavailable the badge says so
 * rather than rendering "nothing is live", and it keeps showing the last known list rather
 * than blanking. An outage reading as a quiet evening is the fabricated-zero mistake in a
 * different costume.
 */

const DISMISSED_KEY = 'colaberry.broadcast.dismissed';

/** Both directions wrapped: it throws in a private window, and returns null when cleared. */
export function readDismissed(): string[] {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function writeDismissed(ids: string[]): void {
  try {
    // Bounded: a viewer who dismisses every class for a year should not grow this without
    // limit. The newest entries are the ones that matter.
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // A viewer with storage blocked simply gets a badge that returns on reload. Degrading to
    // "slightly annoying" is correct; throwing out of a render is not.
  }
}

export interface LiveNowBadgeProps {
  /** Injected in tests. */
  discoveryDeps?: DiscoveryDeps;
  enabled?: boolean;
}

function label(b: DiscoveryBroadcast): string {
  if (b.access_mode === 'preview' && !b.can_watch) return 'Preview';
  if (!b.can_watch && b.offer_upgrade) return 'Upgrade to watch';
  if (b.editorial_state === 'reconnecting') return 'Reconnecting';
  return 'Live';
}

export default function LiveNowBadge({
  discoveryDeps, enabled = true,
}: LiveNowBadgeProps): React.ReactElement | null {
  const { open, session } = useBroadcastPlayer();
  const { broadcasts, unavailable } = useBroadcastDiscovery(enabled, discoveryDeps ?? {});
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      writeDismissed(next);
      return next;
    });
  }, []);

  const visible = useMemo(
    () => broadcasts.filter((b) => !dismissed.includes(b.id)),
    [broadcasts, dismissed],
  );

  // Nothing airing and nothing to say. Note the ORDER: an unavailable collection still
  // renders, because "we cannot tell" is a thing worth saying.
  if (visible.length === 0 && !unavailable) return null;
  // Already watching something: the badge would be competing with the player it opened.
  if (session) return null;

  return (
    <aside className="lnb" data-testid="live-now-badge" aria-label="Live now">
      {unavailable && (
        <p className="lnb-stale" role="status" data-testid="lnb-unavailable">
          Live status is unavailable right now.
        </p>
      )}

      {visible.length > 1 && (
        <p className="lnb-count" data-testid="lnb-count">{visible.length} airing now</p>
      )}

      <ul className="lnb-list">
        {visible.map((b) => (
          <li key={b.id} className="lnb-item" data-testid={`lnb-item-${b.id}`}>
            <span className={`lnb-dot lnb-dot-${b.editorial_state}`} aria-hidden="true" />
            <span className="lnb-mode">{label(b)}</span>
            <span className="lnb-title" title={b.title}>{b.title}</span>
            <button
              type="button"
              className="lnb-watch"
              data-testid={`lnb-watch-${b.id}`}
              onClick={() => open({ occurrenceId: b.id, asset: 'master.m3u8', title: b.title })}
            >
              {b.can_watch ? 'Watch' : 'Details'}
            </button>
            <button
              type="button"
              className="lnb-dismiss"
              data-testid={`lnb-dismiss-${b.id}`}
              aria-label={`Dismiss ${b.title}`}
              onClick={() => dismiss(b.id)}
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
