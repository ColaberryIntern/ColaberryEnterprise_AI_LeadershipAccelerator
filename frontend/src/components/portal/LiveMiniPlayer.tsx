import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import {
  createPlaybackAdapter,
  requestPlaybackGrant,
  GrantResponse,
  PlaybackSnapshot,
  PlaybackAdapter,
} from '../../services/broadcastPlaybackAdapter';
import {
  createPlaybackHeartbeat,
  postPlaybackHeartbeat,
  HeartbeatBody,
} from '../../services/broadcastHeartbeat';
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
  /** Injected in tests. Production posts the real playback heartbeat. */
  postHeartbeat?: (occurrenceId: string, body: HeartbeatBody) => Promise<void>;
}

const INITIAL: PlaybackSnapshot = {
  phase: 'idle', reason: null, offerUpgrade: false,
  previewSecondsRemaining: null, attempt: 0, credentialExpiresAt: null,
  autoplayBlocked: false,
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

export default function LiveMiniPlayer({ fetchGrant, postHeartbeat }: LiveMiniPlayerProps): React.ReactElement | null {
  const { session, close } = useBroadcastPlayer();
  const frameRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Held in a ref, not just a closure, because `resume()` is called from a click handler
  // rendered outside the effect that creates the adapter.
  const adapterRef = useRef<PlaybackAdapter | null>(null);
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
  const heartbeatPoster = postHeartbeat ?? postPlaybackHeartbeat;

  useEffect(() => {
    const media = videoRef.current;
    if (!occurrenceId || !asset || !media) return undefined;

    const adapter = createPlaybackAdapter(occurrenceId, asset, {
      fetchGrant: grantFetcher,
      media,
      onChange: setSnapshot,
    });
    adapterRef.current = adapter;
    adapter.start();
    return () => {
      adapter.stop();
      adapterRef.current = null;
    };
  }, [occurrenceId, asset, grantFetcher]);

  /**
   * Playback telemetry (L4.9). Separate from the adapter effect on purpose: measurement must
   * be able to fail, restart or be absent entirely without touching the thing that plays the
   * video. L4.6 shipped the whole server half of this and nothing ever called it, so a real
   * airing recorded zero viewers while people were demonstrably watching.
   *
   * Driven by the media element's own events rather than by the adapter's phase, because the
   * question being answered is "is a human watching right now", and only the element knows
   * whether pixels are moving.
   */
  useEffect(() => {
    const media = videoRef.current;
    if (!occurrenceId || !media) return undefined;

    const beat = createPlaybackHeartbeat({
      post: (body) => heartbeatPoster(occurrenceId, body),
    });

    const onPlay = () => beat.report('playing');
    const onPause = () => beat.report('paused');
    const onWaiting = () => beat.report('buffering');
    const onEnded = () => beat.report('ended');
    // A backgrounded tab keeps a <video> "playing". Reporting paused on hide stops it being
    // counted as an audience member who is not, in fact, in the room.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') beat.report('paused', 'auto');
      else if (!media.paused) beat.report('playing', 'auto');
    };

    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('waiting', onWaiting);
    media.addEventListener('ended', onEnded);
    document.addEventListener('visibilitychange', onVisibility);
    // Already playing when this mounted (a re-render mid-session) would otherwise go unbeaten
    // until the next transition, which may never come.
    if (!media.paused) beat.report('playing', 'auto');

    return () => {
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('waiting', onWaiting);
      media.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onVisibility);
      beat.stop();
    };
  }, [occurrenceId, heartbeatPoster]);

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
  // No phase check here. The adapter owns the invariant that `autoplayBlocked` is false in
  // every state where a gesture could not help: `deny()`, `giveUp()`, `onEnded()` and the
  // `play` listener all clear it, and each of those is enforced by a named adapter test.
  //
  // AN EARLIER VERSION OF THIS COMMENT WAS WRONG and is corrected rather than deleted. It
  // claimed a `phase !== 'ended'` guard here was "unreachable", on the evidence that removing
  // it broke no test. That evidence supports two readings — unreachable, or reachable and
  // untested — and the second was the true one: nothing cleared the flag on `ended`, and
  // nothing cleared it when the viewer pressed the element's OWN play button, which is the
  // gesture they actually make because `controls` is on the <video>. The fix belongs in the
  // adapter, which is where the flag lives; the guard would only have hidden it on one of the
  // two paths.
  const needsGesture = snapshot.autoplayBlocked;
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
        {/*
          A LABELLED control for denied autoplay, not a silent dead player.

          Chrome and Safari both refuse unmuted autoplay without a user gesture, so a viewer
          who opens a replay sees a loaded, paused video and no explanation. The adapter now
          reports that refusal instead of discarding the rejected promise, and this is the
          gesture it needs: `resume()` is called straight from onClick, because a retry from
          a timer would be refused for exactly the same reason.

          First in the row for the same reason the fullscreen fallback is a sentence rather
          than a hidden button — the thing the viewer has to do next should be the thing
          they reach first.
        */}
        {needsGesture && (
          <button
            type="button"
            className="lmp-btn lmp-btn-primary"
            data-testid="lmp-resume"
            onClick={() => adapterRef.current?.resume()}
          >
            Play
          </button>
        )}
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
        {needsGesture
          ? 'Ready to play — press Play to start. Your browser blocked playback from starting on its own.'
          : (captionsFailed ? 'Captions are unavailable for this broadcast.' : status)}
        {status && snapshot.offerUpgrade && (
          <a className="lmp-upgrade" href="/portal/settings">Upgrade for full access</a>
        )}
      </p>
    </aside>
  );
}
