import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { useBroadcastDiscovery, DiscoveryBroadcast, DiscoveryDeps } from '../../hooks/useBroadcastDiscovery';
import {
  readCued, markCued, uncued, readSoundOptIn, writeSoundOptIn, playChime, ChimeOutcome,
} from './broadcastLaunchCue';
import { usePlayerPresentation } from './usePlayerPresentation';
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
 *
 * AND NOTHING IS FABRICATED WHEN THE FEATURE IS SIMPLY OFF. This component is mounted in the
 * layout route that also wraps `/portal/login`, `/portal/signup` and `/portal/verify`, so it
 * renders for signed-OUT visitors too. It therefore polls only for an authenticated
 * participant, and treats 404 (feature off) and 401 (not signed in) as "render nothing, stop
 * asking" rather than as an outage. Without that, the flag being dark — the documented
 * default — put a permanent "Live status is unavailable" panel on the login page, and with
 * the flag on, a signed-out visitor's 401 drove `portalApi`'s interceptor to redirect
 * `/portal/login` to itself in a loop.
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
  const { isAuthenticated } = useParticipantAuth();
  // `isAuthenticated` is only `!!token` and does not inspect expiry, so a stale token still
  // reaches the endpoint — which is why the 401 branch in the hook is terminal as well.
  const { broadcasts, unavailable, disabled } = useBroadcastDiscovery(
    enabled && isAuthenticated,
    discoveryDeps ?? {},
  );
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [cued, setCued] = useState<string[]>(readCued);
  const [soundOn, setSoundOn] = useState<boolean>(readSoundOptIn);
  const [soundState, setSoundState] = useState<ChimeOutcome | null>(null);
  /**
   * Ids announced during THIS mount. There is deliberately no timer clearing them: the
   * flourish is a one-shot CSS animation, which plays once when the class is applied and
   * does nothing while it lingers. And since the cue is once-per-occurrence-ever, the class
   * never needs re-applying — so a timer would only add an arbitrary duration and something
   * else to get wrong. An earlier version had one, and it made the behaviour depend on wall
   * clock in a way no test could pin.
   */
  const [announced, setAnnounced] = useState<string[]>([]);
  const frameRef = useRef<HTMLElement | null>(null);
  const { prefersReducedMotion } = usePlayerPresentation(frameRef);

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

  const visibleIds = useMemo(() => visible.map((b) => b.id).join(','), [visible]);

  /**
   * The cue fires ONCE per occurrence, ever. The seen-set is persisted, so a route change —
   * which re-runs effects but not storage — cannot re-interrupt, and neither can a reload.
   */
  useEffect(() => {
    const fresh = uncued(visibleIds ? visibleIds.split(',') : [], cued);
    if (fresh.length === 0) return;

    setAnnounced((prev) => [...prev, ...fresh]);
    const next = [...cued, ...fresh];
    markCued(next);
    setCued(next);

    if (soundOn) {
      void playChime().then(setSoundState);
    }
  }, [visibleIds, cued, soundOn]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      writeSoundOptIn(next);
      // Turning it ON is itself the gesture a browser requires, so this is the one moment a
      // chime is permitted to be tried without a broadcast having just appeared.
      if (next) void playChime().then(setSoundState);
      else setSoundState(null);
      return next;
    });
  }, []);

  // Off, or signed out: nothing to show and nothing to say about it.
  if (disabled) return null;
  // Nothing airing and nothing to say. Note the ORDER: an unavailable collection still
  // renders, because "we cannot tell" is a thing worth saying.
  if (visible.length === 0 && !unavailable) return null;
  // Already watching something: the badge would be competing with the player it opened.
  if (session) return null;

  return (
    <aside ref={frameRef} className="lnb" data-testid="live-now-badge" aria-label="Live now">
      {unavailable && (
        <p className="lnb-stale" role="status" data-testid="lnb-unavailable">
          Live status is unavailable right now.
        </p>
      )}

      {visible.length > 1 && (
        <p className="lnb-count" data-testid="lnb-count">{visible.length} airing now</p>
      )}

      <div className="lnb-sound">
        <button
          type="button"
          className="lnb-soundbtn"
          data-testid="lnb-sound"
          aria-pressed={soundOn}
          onClick={toggleSound}
        >
          {soundOn ? 'Sound on' : 'Sound off'}
        </button>
        {/*
          A refusal is SAID, not swallowed. "unsupported" and "refused" are different facts —
          no Web Audio at all, versus a policy or a webview declining — and neither may be
          reported as if the chime played.
        */}
        {soundOn && soundState === 'refused' && (
          <span className="lnb-note" role="status" data-testid="lnb-sound-refused">
            Your browser blocked the sound. The badge will still appear.
          </span>
        )}
        {soundOn && soundState === 'unsupported' && (
          <span className="lnb-note" role="status" data-testid="lnb-sound-unsupported">
            This device cannot play the alert sound. The badge will still appear.
          </span>
        )}
      </div>

      <ul className="lnb-list">
        {visible.map((b) => (
          <li
            key={b.id}
            className={`lnb-item${
              announced.includes(b.id) && !prefersReducedMotion ? ' is-new' : ''
            }`}
            data-testid={`lnb-item-${b.id}`}
          >
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
