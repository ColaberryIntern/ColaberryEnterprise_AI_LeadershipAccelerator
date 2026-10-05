import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import {
  createPlaybackAdapter,
  requestPlaybackGrant,
  GrantResponse,
  PlaybackSnapshot,
} from '../../services/broadcastPlaybackAdapter';
import { usePlayerPresentation } from './usePlayerPresentation';
import './liveMiniPlayer.css';

/**
 * The persistent bottom-right mini-player, expandable to theater and fullscreen.
 *
 * WHERE THIS IS MOUNTED, AND WHY IT MATTERS MORE THAN ANYTHING ELSE IN THE FILE. It renders
 * in the portal LAYOUT route in `routes/portalRoutes.tsx`, as a sibling of `<Outlet/>`.
 * React Router keeps a layout element mounted while the outlet's contents change, so the
 * `<video>` here is the SAME DOM NODE across every portal navigation and playback does not
 * stop. `PortalShell` — the obvious-looking home for portal chrome — is rendered
 * independently by 29 page components, so anything inside it remounts on every route change.
 * `__tests__/liveMiniPlayer.persistence.test.tsx` builds both arrangements, and
 * `routes/__tests__/portalRoutesPlayerMount.test.tsx` checks the real tree.
 *
 * THAT MOUNT POINT DICTATES THE STYLING. Being outside `.te-shell` is what makes the player
 * survive navigation — and it also means the portal's dark-mode tokens, which TodayShell.css
 * scopes to `[data-theme="dark"] .te-shell`, never reach it. So the stylesheet uses the
 * Layer-A tokens from `colaberry/tokens/colors.css`, which are declared on `:root` and
 * overridden under a bare `[data-theme="dark"]`. The first version of this component used
 * `--surface` and `--border` with light-mode fallbacks and would have rendered a white player
 * on a dark page.
 *
 * NATIVE CONTROLS ARE KEPT ON PURPOSE. Play, mute, seek and volume come from the browser,
 * which has tested them against more assistive technology than this component ever will.
 * The buttons below add only what the native set has no concept of — captions from a signed
 * URL, theater, fullscreen, close — and they sit AFTER the video so tab order runs
 * play/mute → captions → theater → fullscreen → close.
 *
 * SCOPE. The launch animation is P3-05; discovery surfaces that open a session are P3-04.
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
  const frameRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(INITIAL);
  const [captionsUrl, setCaptionsUrl] = useState<string | null>(null);
  const [captionsFailed, setCaptionsFailed] = useState(false);

  const {
    mode, isFullscreen, supportsFullscreen, prefersReducedMotion, setMode, toggleFullscreen,
  } = usePlayerPresentation(frameRef);

  // Destructured so the dependency lists are honest and exhaustive-deps needs no exception.
  // (Disabling that rule is a CRA build error in this repo, not a warning.)
  const occurrenceId = session?.occurrenceId ?? null;
  const asset = session?.asset ?? null;
  const captionsAsset = session?.captionsAsset ?? null;
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
    return () => adapter.stop();
  }, [occurrenceId, asset, grantFetcher]);

  // A new session starts with captions off and no stale url from the previous one.
  useEffect(() => {
    setCaptionsUrl(null);
    setCaptionsFailed(false);
  }, [occurrenceId, captionsAsset]);

  /**
   * Captions need their OWN signed url: the grant covers one asset, and a `.vtt` is a
   * different asset under the same occurrence. Fetched on demand rather than up front,
   * because most viewers never turn captions on and a credential that is never used is a
   * credential that should never have been minted.
   */
  const toggleCaptions = useCallback(async () => {
    if (captionsUrl) { setCaptionsUrl(null); return; }
    if (!occurrenceId || !captionsAsset) return;
    try {
      const signed = await grantFetcher(occurrenceId, captionsAsset);
      setCaptionsUrl(signed.url);
      setCaptionsFailed(false);
    } catch {
      // Degrade, never block the video. The reason is deliberately not surfaced: a caption
      // track the viewer is not entitled to should read as "unavailable", not as a hint.
      setCaptionsFailed(true);
    }
  }, [captionsUrl, occurrenceId, captionsAsset, grantFetcher]);

  if (!session) return null;

  const status = statusLine(snapshot);
  const preview = previewLabel(snapshot.previewSecondsRemaining);
  const stopped = snapshot.phase === 'denied' || snapshot.phase === 'failed';
  const theater = mode === 'theater';

  const frameClass = [
    'lmp',
    theater ? 'is-theater' : 'is-mini',
    isFullscreen ? 'is-fullscreen' : '',
    prefersReducedMotion ? 'is-still' : '',
  ].filter(Boolean).join(' ');

  return (
    <aside
      ref={frameRef}
      className={frameClass}
      data-testid="live-mini-player"
      data-mode={isFullscreen ? 'fullscreen' : mode}
      aria-label={`Broadcast player${session.title ? `: ${session.title}` : ''}`}
    >
      <div className="lmp-bar">
        <span className="lmp-title" title={session.title ?? undefined}>
          {session.title ?? 'Live'}
        </span>
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
      >
        {captionsUrl && (
          <track kind="captions" srcLang="en" label="English captions" src={captionsUrl} default />
        )}
      </video>

      {/* After the video, so tab order is play/mute → captions → theater → fullscreen → close. */}
      <div className="lmp-controls">
        {captionsAsset && (
          <button
            type="button"
            className="lmp-btn"
            data-testid="lmp-captions"
            aria-pressed={captionsUrl !== null}
            onClick={() => { void toggleCaptions(); }}
          >
            Captions
          </button>
        )}
        <button
          type="button"
          className="lmp-btn"
          data-testid="lmp-theater"
          aria-pressed={theater}
          onClick={() => setMode(theater ? 'mini' : 'theater')}
        >
          {theater ? 'Minimise' : 'Theater'}
        </button>
        {supportsFullscreen ? (
          <button
            type="button"
            className="lmp-btn"
            data-testid="lmp-fullscreen"
            aria-pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        ) : (
          /*
            A LABELLED fallback, not a hidden button. iPhone Safari exposes no element
            fullscreen, so the honest thing is to say so and point at the mode that does
            work, rather than render a control that does nothing when pressed.
          */
          <span className="lmp-note" data-testid="lmp-fullscreen-unavailable">
            Full screen is unavailable on this device — use Theater.
          </span>
        )}
        <button
          type="button"
          className="lmp-btn"
          data-testid="lmp-close"
          onClick={close}
        >
          Close
        </button>
      </div>

      {preview && !stopped && <p className="lmp-preview">{preview}</p>}

      {/*
        One live region for the whole player, present even when empty: a region added to the
        DOM at the same moment it gains text is frequently not announced at all.
      */}
      <p className="lmp-status" role="status" aria-live="polite" data-testid="lmp-status">
        {captionsFailed ? 'Captions are unavailable for this broadcast.' : status}
        {status && snapshot.offerUpgrade && (
          <a className="lmp-upgrade" href="/portal/settings">Upgrade for full access</a>
        )}
      </p>
    </aside>
  );
}
