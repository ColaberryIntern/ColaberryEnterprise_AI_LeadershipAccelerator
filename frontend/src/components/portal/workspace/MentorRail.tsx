import React from 'react';
import {
  useAgentAttachments, AttachButton, AttachmentTray, DropOverlay, SentAttachments, type SentAttachment,
} from '../AgentAttachments';

/**
 * Cory's rail, shared by the lesson workspace (RuntimeWorkspace) and the build workspace (ProjectWorkspacePage). Each page owns
 * its own conversation and endpoint; this only draws it, so the two rails cannot drift. Lifted out of both pages when they passed
 * the 500-line ceiling (Campus C19), markup unchanged: the classic layout renders exactly what it did.
 *
 * The whole rail takes a drop: a student dragging a screenshot aims at the conversation, not at the 34px text box.
 */
export interface MentorMsg { role: 'user' | 'assistant'; content: string; attachments?: SentAttachment[] }
export type MentorMode = 'ask' | 'hint' | 'explain' | 'review';

export interface MentorRailProps {
  msgs: MentorMsg[];
  busy: boolean;
  attach: ReturnType<typeof useAgentAttachments>;
  input: string;
  onInput: (v: string) => void;
  canSend: boolean;
  onAsk: (mode: MentorMode, message: string) => void;
  /** The message each shortcut sends ("Give me a hint for this story."). */
  shortcut: (mode: 'hint' | 'explain' | 'review') => string;
  endRef: React.RefObject<HTMLDivElement>;
  /** The workstation's "Your mentor for ‹card›" line; absent in the classic layout. */
  subtitle?: string;
  /** Above the thread (the runtime's completion prompts), between thread and shortcuts (the nudge), and at the foot (comments). */
  top?: React.ReactNode;
  beforeModes?: React.ReactNode;
  after?: React.ReactNode;
}

export default function MentorRail(p: MentorRailProps): React.ReactElement {
  const send = () => p.onAsk('ask', p.input || 'Take a look at this.');
  return (
    <aside className="rt-mentor" style={{ position: 'relative' }} data-testid="cm-ws-cory" {...p.attach.dropProps}>
      <DropOverlay active={p.attach.dragging} label="Drop to show Cory" />
      <div className="rt-mentor-h">
        <span className="rt-dot" /> Cory
        {p.subtitle && <small className="rt-mentor-sub">{p.subtitle}</small>}
      </div>
      {p.top}
      <div className="rt-thread">
        {p.msgs.map((m, i) => (
          <div key={i} className={`rt-msg ${m.role}`}>
            {m.content}
            <SentAttachments items={m.attachments} />
          </div>
        ))}
        <div ref={p.endRef} />
      </div>
      {p.beforeModes}
      <div className="rt-modes">
        {(['hint', 'explain', 'review'] as const).map((mo) => (
          <button key={mo} className="rt-chip" disabled={p.busy} onClick={() => p.onAsk(mo, p.shortcut(mo))}>{mo}</button>
        ))}
      </div>
      <AttachmentTray items={p.attach.items} notice={p.attach.notice} onRemove={p.attach.remove} />
      <div className="rt-ask">
        <AttachButton onFiles={p.attach.addFiles} disabled={p.busy} />
        <input
          className="rt-in"
          value={p.input}
          onChange={(e) => p.onInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && p.canSend && send()}
          placeholder="Ask your mentor, or paste a screenshot…"
          {...p.attach.pasteProps}
        />
        <button className="rt-btn pri" disabled={p.busy || !p.canSend} onClick={send}>Send</button>
      </div>
      {p.after}
    </aside>
  );
}
