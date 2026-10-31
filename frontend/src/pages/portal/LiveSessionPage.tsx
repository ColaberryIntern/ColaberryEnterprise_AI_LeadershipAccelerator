import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import BroadcastWatchButton from '../../components/portal/BroadcastWatchButton';
import CompanionDeck from '../../components/portal/CompanionDeck';
import ProducerStrip from '../../components/portal/ProducerStrip';

/**
 * The landing page behind a session's persistent live link (L7.2).
 *
 * WHY IT EXISTS AT ALL. The workspace and companion URLs are generated so a show can be
 * promoted before it airs — which means they will be clicked, printed and scanned long before
 * there is anything to watch. A link that 404s until the moment it works is worse than no link:
 * whoever clicks it early concludes it is broken and does not come back.
 *
 * SO NOT-YET-STARTED IS A FIRST-CLASS STATE, not an error. The server decides the moment; this
 * page only renders it. That split is the point of the ticket — one persistent URL whose
 * meaning changes, rather than a new URL per moment that invalidates everything already shared.
 *
 * BRANDING IS NOT DECORATION HERE. This URL appears in marketing, so it is the first Colaberry
 * surface a prospect sees. It borrows the shell, the tokens and the brand lockup from
 * ClassCheckinPage — its sibling public route — rather than inventing a second look, because two
 * public landings that disagree about what Colaberry looks like is worse than either one alone.
 * No hardcoded hex: semantic tokens only, so light and dark both hold.
 *
 * THE TITLE COMES FROM THE CHECK-IN ENDPOINT, NOT FROM live-moment. live-moment stays
 * deliberately thin — a private broadcast's existence should not be enumerable from it — while
 * `checkin-info` is already public for exactly this purpose on the sibling route, so naming the
 * class here exposes nothing that was not already exposed. If it fails, the page still works;
 * the moment is what matters and the title is a courtesy.
 *
 * THE COMPANION IS THE SAME PAGE (L4.7). `companion` moves the persistent player to the top of
 * the screen and puts the one-thumb deck underneath it, rather than introducing a second page
 * that would have to repeat the moment resolution and get it subtly different.
 */

type Moment = 'not_started' | 'live' | 'ended' | 'unknown';

interface MomentResponse {
  moment: Moment;
  watch_url: string | null;
}

interface SessionInfo {
  title: string;
  /** The only key that joins a session to what is airing. Used to find the broadcast. */
  room_id: string | null;
  session_date: string;
  start_time: string;
  cohort_name: string;
}

/** Poll while waiting. Slow on purpose: this is a waiting room, not a dashboard. */
const POLL_MS = 30_000;

const COPY: Record<Moment, { eyebrow: string; title: string; body: string }> = {
  not_started: {
    eyebrow: 'Not started yet',
    title: 'This class has not started yet',
    body: 'Leave this page open. It will update on its own when the class goes live.',
  },
  live: {
    eyebrow: 'On air',
    title: 'This class is live now',
    body: 'Open the class to watch.',
  },
  ended: {
    eyebrow: 'Finished',
    title: 'This class has ended',
    body: 'A replay will appear here if one is published.',
  },
  unknown: {
    // Deliberately not "something went wrong": the link is fine, we just cannot answer yet.
    eyebrow: 'Unavailable',
    title: 'We cannot check this class right now',
    body: 'This is usually temporary. Try again in a moment.',
  },
};

/** Friendly date label, e.g. "Friday, October 23". Falls back to the raw string. */
function formatDate(d: string): string {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Accepts "18:30" or "18:30:00" (→ "6:30 PM"), or an already-formatted string. */
function formatTime(t: string): string {
  if (!t) return '';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return t;
  const h = Number(m[1]);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${m[2]} ${period}`;
}

export interface LiveSessionPageProps {
  /**
   * The phone surface (L4.7). Passed by the route rather than sniffed from the URL, so the
   * two routes are distinguishable in a test without faking a location.
   */
  companion?: boolean;
}

export default function LiveSessionPage({ companion = false }: LiveSessionPageProps = {}): React.ReactElement {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const { isAuthenticated } = useParticipantAuth();
  const { session: playing } = useBroadcastPlayer();

  const read = useCallback(async (): Promise<void> => {
    if (!sessionId) { setMoment('unknown'); return; }
    try {
      const res = await portalApi.get<MomentResponse>(`/api/portal/sessions/${sessionId}/live-moment`);
      setMoment(res.data.moment);
      setWatchUrl(res.data.watch_url);
    } catch {
      // A failed check is not a broken link, and saying so would train people to distrust it.
      setMoment('unknown');
      setWatchUrl(null);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    const tick = () => { if (alive) void read(); };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [sessionId, read]);

  useEffect(() => {
    if (!sessionId) return undefined;
    let alive = true;
    portalApi
      .get<SessionInfo>(`/api/portal/sessions/${sessionId}/checkin-info`)
      // Best effort by design: the moment is the point, the class name is a courtesy.
      .then((res) => { if (alive) setInfo(res.data); })
      .catch(() => { /* page renders fine without it */ });
    return () => { alive = false; };
  }, [sessionId]);

  /**
   * Tell the persistent mini-player it is on a phone companion, for as long as this page is
   * mounted.
   *
   * The player pins itself bottom-left-and-right above `.te-tabbar`, which owns the bottom
   * edge inside the portal shell. This route is PUBLIC and has no tab bar, so that offset
   * leaves a floating video over empty space — and a floating video is the wrong shape here
   * anyway, because it covers the deck the viewer is meant to be tapping. The flag moves it to
   * the top of the screen and lets the deck scroll underneath, which is what every phone
   * companion people already use does.
   *
   * A body attribute rather than a prop because the player is mounted in the LAYOUT route, far
   * above this page, and threading a prop down to it would mean the layout knowing which page
   * is open.
   */
  useEffect(() => {
    if (!companion) return undefined;
    // 'playing' vs 'idle' rather than a `:has()` selector in the stylesheet: the page
    // already knows whether anything is open, and a browser without `:has()` would have
    // left a screen-height hole where the video was supposed to be.
    document.body.dataset.liveCompanion = playing ? 'playing' : 'idle';
    return () => { delete document.body.dataset.liveCompanion; };
  }, [companion, playing]);

  const copy = moment ? COPY[moment] : null;
  const when = info
    ? [formatDate(info.session_date), formatTime(info.start_time)].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="clv-root">
      <style>{CLV_CSS}</style>

      <main className="clv-card" data-testid="live-session-page">
        <div className="clv-brand">
          <img src="/colaberry-icon.png" alt="" width={34} height={34} />
          <span className="clv-wordmark" aria-hidden="true">
            <span className="clv-wordmark-c">C</span>olaberry
          </span>
        </div>

        {!copy && (
          <div className="clv-state" aria-live="polite">
            <span className="clv-spin" aria-hidden="true" />
            <p className="clv-text" data-testid="live-session-body">Checking this class&hellip;</p>
          </div>
        )}

        {copy && (
          <div className="clv-state" aria-live="polite">
            {moment === 'live' ? (
              <p className="clv-eyebrow clv-eyebrow-live">
                <span className="clv-dot" aria-hidden="true" />
                {copy.eyebrow}
              </p>
            ) : (
              <p className="clv-eyebrow">{copy.eyebrow}</p>
            )}

            <h1 className="clv-title" data-testid="live-session-title">{copy.title}</h1>

            {info && <p className="clv-class">{info.title}</p>}
            {(when || info?.cohort_name) && (
              <p className="clv-meta">{[info?.cohort_name, when].filter(Boolean).join(' · ')}</p>
            )}

            <p className="clv-text" data-testid="live-session-body">{copy.body}</p>

            {/* The laptop surface sends the viewer to the workspace. The phone does NOT: it is
                already the place to watch, and a link away from it would be a link away from
                the only screen the viewer has. */}
            {!companion && moment === 'live' && watchUrl && (
              <a className="clv-btn" href={watchUrl} data-testid="live-session-watch">Watch now</a>
            )}

            {companion && moment === 'live' && (
              <div className="clv-companion" data-testid="companion-surface">
                {/* Reused, not reimplemented. This component already answers all three
                    questions a watch affordance needs - is anything airing for this room,
                    may this viewer watch it, is it already playing - and renders nothing
                    rather than offering a dead button. */}
                <BroadcastWatchButton
                  roomId={info ? info.room_id : null}
                  className="clv-btn"
                  label="&#9654; Watch here"
                />

                {isAuthenticated ? (
                  <CompanionDeck sessionId={sessionId} />
                ) : (
                  <p className="clv-text clv-text-sub" data-testid="companion-signed-out">
                    Sign in to answer polls and tell your instructor how you are getting on.
                  </p>
                )}
              </div>
            )}

            {/* The producer's control (P4-02), on the laptop surface only — a phone companion
                is a viewer's screen, and a destructive one-way End button does not belong
                under someone's thumb while they are following a class.

                Rendered regardless of `moment`, because a producer needs it BEFORE anything
                is airing: `not_started` is exactly when Go Backstage has to be pressed. It
                self-hides for anyone the server does not call a producer, so this condition
                is about which screen it suits, not about who may use it. Gated on
                authentication only to avoid a guaranteed 401 poll on a public page. */}
            {!companion && isAuthenticated && <ProducerStrip sessionId={sessionId} />}

            {moment === 'unknown' && (
              <button type="button" className="clv-btn clv-btn-ghost" onClick={() => { void read(); }}>
                Try again
              </button>
            )}

            {moment === 'not_started' && (
              <p className="clv-text clv-text-sub">
                You can close this and come back &mdash; the link stays the same for this class.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const CLV_CSS = `
.clv-root{
  min-height:100vh; min-height:100dvh;
  display:flex; align-items:center; justify-content:center;
  padding:20px;
  font-family:var(--font-body); color:var(--text-body);
  background:
    radial-gradient(1100px 460px at 50% -10%, color-mix(in srgb, var(--red-500) 9%, transparent), transparent 70%),
    radial-gradient(900px 420px at 100% 110%, color-mix(in srgb, var(--blue-500) 8%, transparent), transparent 72%),
    var(--surface-subtle);
}
.clv-card{
  width:100%; max-width:440px;
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-xl);
  box-shadow:var(--shadow-xl);
  padding:34px 30px 26px;
  text-align:center;
}
@media (max-width:520px){ .clv-card{ padding:28px 20px 22px; } }

.clv-brand{ display:flex; align-items:center; justify-content:center; gap:9px; margin-bottom:22px; }
.clv-wordmark{ font-family:var(--font-logo); font-weight:700; font-size:23px; letter-spacing:-.01em; color:var(--text-strong); line-height:1; }
.clv-wordmark-c{ color:var(--brand-accent); }

.clv-state{ display:flex; flex-direction:column; align-items:center; }

.clv-eyebrow{
  font-size:12.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  color:var(--text-subtle); margin:0 0 8px;
}
.clv-eyebrow-live{
  display:inline-flex; align-items:center; gap:7px;
  color:var(--status-danger);
}
.clv-dot{
  width:8px; height:8px; border-radius:var(--radius-circle);
  background:var(--status-danger);
  animation:clv-pulse 1.8s var(--ease-out) infinite;
}
@keyframes clv-pulse{ 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:.45; transform:scale(.82); } }

.clv-title{
  font-family:var(--font-display); font-weight:700; font-size:24px; line-height:1.2;
  letter-spacing:-.01em; color:var(--text-strong); margin:0 0 8px;
}
.clv-class{ font-size:15.5px; font-weight:600; color:var(--text-body); margin:0 0 4px; }
.clv-meta{ font-size:13.5px; color:var(--text-muted); margin:0 0 14px; }
.clv-text{ font-size:14.5px; line-height:1.55; color:var(--text-muted); margin:0; }
.clv-text-sub{ margin-top:16px; font-size:13px; color:var(--text-subtle); }

.clv-companion{ width:100%; margin-top:18px; display:flex; flex-direction:column; gap:14px; }
/* The deck is the reading order on a phone, so it is left-aligned even though the card above
   it is centred. */
.clv-companion{ text-align:left; }

.clv-btn{
  width:100%; min-height:54px; margin-top:20px; padding:0 18px;
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--font-body); font-size:16px; font-weight:600; text-decoration:none;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
  box-shadow:var(--shadow-brand);
  transition:background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.clv-btn:hover{ background:var(--action-bg-hover); transform:translateY(-1px); }
.clv-btn:active{ background:var(--action-bg-press); transform:translateY(0); }
.clv-btn:focus-visible{ outline:none; box-shadow:var(--focus-ring); }
.clv-btn-ghost{
  color:var(--text-link); background:transparent; box-shadow:none;
  border:1px solid var(--border-default);
}
.clv-btn-ghost:hover{ background:var(--surface-subtle); }

.clv-spin{
  width:30px; height:30px; margin-bottom:14px;
  border:3px solid var(--border-subtle); border-top-color:var(--brand-accent);
  border-radius:var(--radius-circle);
  animation:clv-spin .9s linear infinite;
}
@keyframes clv-spin{ to{ transform:rotate(360deg); } }

/* Someone who has asked for less motion still needs to know it is live, so the dot stays
   visible and simply stops moving. */
@media (prefers-reduced-motion:reduce){
  .clv-dot, .clv-spin{ animation:none; }
  .clv-btn:hover{ transform:none; }
}
`;
