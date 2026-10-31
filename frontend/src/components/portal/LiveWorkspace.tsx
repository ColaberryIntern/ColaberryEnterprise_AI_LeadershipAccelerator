import React from 'react';
import BroadcastWatchButton from './BroadcastWatchButton';
import CompanionDeck from './CompanionDeck';
import SessionChatPanel from './SessionChatPanel';

/**
 * The desktop live workspace — what a viewer on a laptop can do while a class is airing.
 *
 * WHAT THIS CLOSES. DOC 04 asks the desktop surface for persistent video, Prompt, Poll,
 * Chat/Builder Room, build progress and Claude Code controls. Until now it had the video and
 * nothing else: the whole interactive rail was rendered inside `LiveSessionPage`'s `companion`
 * branch, so the laptop — the screen the work is actually done on — got a status card and a
 * button that linked to the page it was already on.
 *
 * THE "WATCH NOW" SELF-LINK DIES HERE, not as a separate patch. `resolveSessionMoment`
 * answers `watchUrl = sessionWorkspaceUrl(sessionId)` and that URL is this very page
 * (`broadcastSessionLinks.ts:111`, `portalRoutes.tsx:131`) — the server is right that it is
 * where you watch, and the page was wrong to render a link to itself. The honest affordance
 * is `BroadcastWatchButton`, which asks whether anything is airing for this room, whether
 * this viewer may watch it, and whether it is already playing, and renders nothing instead of
 * a dead button. `watch_url` stays in the response for a caller that is somewhere else.
 *
 * THE VIDEO IS NOT HERE AND MUST NOT BE. `LiveMiniPlayer` is mounted beside `<Outlet/>` in
 * the layout route precisely so it survives navigation — DOC 04's "no forced video
 * interruption" is implemented as a DOM fact, not a promise. A second `<video>` in this
 * component would break the one requirement the desktop surface already satisfied.
 *
 * TWO COLUMNS, AND THE CHAT IS THE SECOND ONE. On a laptop the prompt is what you act on and
 * the chat is what you glance at, so the prompt column leads and the chat holds its own
 * scroll. Under 900px they stack, because a 420px-wide two-column layout is neither.
 *
 * STILL NOT BUILT, AND NAMED RATHER THAN QUIETLY DROPPED: build progress, which needs a
 * server-side notion of a viewer's position in the lab (nothing in `CompanionState` carries
 * one), and a launch control for Claude / Claude Code, which needs the session builder's
 * tool-mode declaration from requirements §9. `pasteWhere` and `ccMode` now tell the viewer
 * which tool and which mode; nothing pretends to open it for them.
 */

export interface LiveWorkspaceProps {
  sessionId: string;
  /** The only key that joins a session to what is airing. Null until `checkin-info` lands. */
  roomId: string | null;
  /**
   * This route is PUBLIC — it is promoted and printed — so a signed-out viewer is an
   * expected visitor, not an error. The rail needs a participant JWT, so they are told what
   * signing in gets them rather than shown an empty column.
   */
  isAuthenticated: boolean;
}

export default function LiveWorkspace({
  sessionId, roomId, isAuthenticated,
}: LiveWorkspaceProps): React.ReactElement {
  return (
    <section className="lwork" data-testid="live-workspace">
      <style>{LWORK_CSS}</style>

      <BroadcastWatchButton roomId={roomId} className="lwork-watch" label="&#9654; Watch here" />

      {isAuthenticated ? (
        <div className="lwork-cols">
          <div className="lwork-col">
            <CompanionDeck sessionId={sessionId} full />
          </div>
          <div className="lwork-col lwork-col-chat">
            <SessionChatPanel sessionId={sessionId} />
          </div>
        </div>
      ) : (
        <p className="lwork-signin" data-testid="live-workspace-signed-out">
          Sign in to answer polls, copy the class prompts and ask questions.
        </p>
      )}
    </section>
  );
}

const LWORK_CSS = `
.lwork{ width:100%; margin-top:18px; display:flex; flex-direction:column; gap:16px; }

.lwork-watch{
  align-self:center; min-height:48px; padding:0 26px;
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--font-body); font-size:15.5px; font-weight:600;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
  box-shadow:var(--shadow-brand);
  transition:background var(--dur-fast) var(--ease-out);
}
.lwork-watch:hover{ background:var(--action-bg-hover); }
.lwork-watch:active{ background:var(--action-bg-press); }
.lwork-watch:focus-visible{ outline:none; box-shadow:var(--focus-ring); }

/* The prompt column takes the slack; the chat keeps a readable fixed measure. */
.lwork-cols{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:16px; align-items:start; }
.lwork-col{ min-width:0; text-align:left; }
.lwork-col-chat{ display:flex; }

@media (max-width:900px){
  .lwork-cols{ grid-template-columns:minmax(0,1fr); }
}

.lwork-signin{ font-size:14px; line-height:1.55; color:var(--text-muted); margin:0; }
`;
