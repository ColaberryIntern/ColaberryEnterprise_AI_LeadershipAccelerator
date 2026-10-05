import React, { useEffect, useRef, useState } from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import {
  createPlaybackAdapter,
  requestPlaybackGrant,
  GrantResponse,
  PlaybackSnapshot,
} from '../../services/broadcastPlaybackAdapter';
import './liveMiniPlayer.css';

/**
 * The persistent bottom-right mini-player.
 *
 * WHERE THIS IS MOUNTED, AND WHY IT MATTERS MORE THAN ANYTHING ELSE IN THE FILE. It renders
 * in the portal LAYOUT route in `routes/portalRoutes.tsx`, as a sibling of `<Outlet/>`.
 * React Router keeps a layout element mounted while the outlet's contents change, so the
 * `<video>` here is the SAME DOM NODE across every portal navigation and playback simply does
 * not stop.
 *
 * The obvious-looking alternative is fatal: `PortalShell` is rendered independently by 29
 * different page components, so anything inside it unmounts and remounts on every single
 * route change. A player there would restart on every click, which is the bug this component
 * exists to not have. `__tests__/liveMiniPlayer.persistence.test.tsx` builds BOTH
 * arrangements and asserts the node survives one and is destroyed by the other, so the
 * distinction is pinned by a test rather than by this comment.
 *
 * SCOPE. Mini only. Theater, fullscreen, captions, keyboard order, reduced motion and the
 * full WCAG pass are P3-03; the launch animation is P3-05; discovery surfaces that open a
 * session are P3-04. With nothing open this renders null.
 */

export interface LiveMiniPlayerProps {
  /** Injected in tests. Production uses the real signed-grant request. */
  fetchGrant?: (occurrenceId: string, asset: string) => Promise<GrantResponse>;
}

const INITIAL: PlaybackSnapshot = {
  phase: 'idle', reason: null, offerUpgrade: false,
  previewSecondsRemaining: null, attempt: 0, credentialExpiresAt: null,
};

/** Codes to sentences. The adapter never carries wording, so the mapping lives here. */
function statusLine(snapshot: PlaybackSnapshot): string | null {
  switch (snapshot.phase) {
    case 'loading':
      return 'Starting…';
    case 'renewing':
      // Renewal is routine and invisible when it works; say nothing unless it is retrying.
      return snapshot.attempt > 0 ? 'Reconnecting…' : null;
    case 'denied':
      if (snapshot.reason === 'preview_expired') return 'Your preview has ended.';
      if (snapshot.reason === 'not_room_eligible') return 'This broadcast is private.';
      if (snapshot.reason === 'not_watchable') return 'Nothing is airing right now.';
      if (snapshot.reason === 'not_found') return 'This broadcast is no longer available.';
      return 'You do not have access to this broadcast.';
    case 'failed':
      return 'Playback stopped. Close and reopen to try again.';
    case 'ended':
      return 'Finished.';
    default:
      return null;
  }
}

function previewLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  const whole = Math.max(0, Math.ceil(seconds / 60));
  return `Preview — about ${whole} min left`;
}

export default function LiveMiniPlayer({ fetchGrant }: LiveMiniPlayerProps): React.ReactElement | null {
  const { session, close } = useBroadcastPlayer();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(INITIAL);

  // Destructured rather than read off `session` inside the effect, so the dependency list is
  // honest and exhaustive-deps needs no exception. (Disabling that rule is a CRA build error
  // in this repo, not a warning.)
  const occurrenceId = session?.occurrenceId ?? null;
  const asset = session?.asset ?? null;
  const grantFetcher = fetchGrant ?? requestPlaybackGrant;

  useEffect(() => {
    const media = videoRef.current;
    if (!occurrenceId || !asset || !media) return undefined;

    const adapter = createPlaybackAdapter(occurrenceId, asset, {
      fetchGrant: grantFetcher,
      media,
      onChange: setSnapshot,
    });
    adapter.start();
    // Stopping clears the element's source, so no in-flight range request carries a live
    // credential past the moment the viewer closed the player.
    return () => adapter.stop();
  }, [occurrenceId, asset, grantFetcher]);

  if (!session) return null;

  const status = statusLine(snapshot);
  const preview = previewLabel(snapshot.previewSecondsRemaining);
  const stopped = snapshot.phase === 'denied' || snapshot.phase === 'failed';

  return (
    <aside className="lmp" data-testid="live-mini-player" aria-label="Broadcast player">
      <div className="lmp-bar">
        <span className="lmp-title" title={session.title ?? undefined}>
          {session.title ?? 'Live'}
        </span>
        <button type="button" className="lmp-close" onClick={close} aria-label="Close player">
          <i className="ri-close-line" aria-hidden="true" />
        </button>
      </div>

      {/*
        NOT conditionally rendered on phase. The element has to outlive every state change or
        the node identity — the entire point of this component — is lost on the first
        reconnect. It is hidden, never unmounted.
      */}
      <video
        ref={videoRef}
        data-testid="live-mini-player-video"
        className={`lmp-video${stopped ? ' is-hidden' : ''}`}
        controls
        playsInline
        preload="metadata"
      />

      {preview && !stopped && <p className="lmp-preview">{preview}</p>}
      {status && (
        <p className="lmp-status" role="status">
          {status}
          {snapshot.offerUpgrade && (
            <a className="lmp-upgrade" href="/portal/settings">Upgrade for full access</a>
          )}
        </p>
      )}
    </aside>
  );
}
