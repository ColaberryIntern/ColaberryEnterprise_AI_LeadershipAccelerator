import React, { useEffect, useRef, useState } from 'react';
import { layerOpen } from './useEscapeLayer';
import { OptionCards, type OptionCard } from './OptionCards';

/**
 * Career Prep v27 (CP3.2): the Cora column. The log holds Cora's bubbles, the student's bubbles,
 * option-card sets and blocks (an insight, a tip). Only the NEWEST unanswered card set is live; when
 * a newer set arrives, older unanswered ones go quiet. A picked card echoes as the student's bubble.
 * Below: four suggestion chips and the ask box. The log itself is state owned by the caller
 * (useCareerPrep), so this component only draws it and reports what the student did.
 */
export type ChatItem =
  | { id: string; kind: 'cora'; text: string }
  | { id: string; kind: 'me'; text: string }
  | { id: string; kind: 'cards'; label: string; cards: OptionCard[]; answered?: boolean }
  | { id: string; kind: 'block'; title: string; lines: string[] };

export const SUGGESTIONS = ['Suggest a plan', 'What should I work on?', 'I have 10 minutes', 'Add an interview'] as const;

/** The id of the newest unanswered card set: the only live one. */
export function liveCardsId(log: readonly ChatItem[]): string | null {
  for (let i = log.length - 1; i >= 0; i--) {
    const it = log[i];
    if (it.kind === 'cards') return it.answered ? null : it.id;
  }
  return null;
}

export interface CoraChatProps {
  log: ChatItem[];
  busy?: boolean;
  onPick: (setId: string, card: OptionCard) => void;
  onAsk: (text: string) => void;
  /** Drawn at the end of the log, above the ask box (the add-interview form, as in the design). */
  children?: React.ReactNode;
}

export function CoraChat({ log, busy = false, onPick, onAsk, children }: CoraChatProps): React.ReactElement {
  const [text, setText] = useState('');
  const latest = useRef<HTMLDivElement>(null);
  const live = liveCardsId(log);
  const lastCoraId = [...log].reverse().find((i) => i.kind === 'cora')?.id;
  // A new Cora message takes focus, unless a sheet or the jump bar is open over the room (it keeps focus).
  useEffect(() => { if (!layerOpen()) latest.current?.focus(); }, [lastCoraId]);
  const send = (t: string) => { const v = t.trim(); if (!v || busy) return; onAsk(v); setText(''); };

  return (
    <div className="cp-chat">
      <div className="cp-chat-head"><span className="cp-av" aria-hidden="true">CO</span>
        <span><b>Cora · your interview coach</b>
          <small><span className="cp-dot" aria-hidden="true" />Reads your videos, interviews, training and projects</small></span></div>
      <div className="cp-log" aria-live="polite" data-testid="cp-log">
        {log.map((it) => {
          if (it.kind === 'cora') return <div key={it.id} className="cp-m"><span className="cp-av" aria-hidden="true">CO</span><div className="cp-msg cora" tabIndex={-1} ref={it.id === lastCoraId ? latest : undefined}>{it.text}</div></div>;
          if (it.kind === 'me') return <div key={it.id} className="cp-msg me">{it.text}</div>;
          if (it.kind === 'block') return <div key={it.id} className="cp-block"><b>{it.title}</b><ul>{it.lines.map((l) => <li key={l}>{l}</li>)}</ul></div>;
          return <OptionCards key={it.id} label={it.label} cards={it.cards} live={it.id === live && !busy} onPick={(c) => onPick(it.id, c)} />;
        })}
        {children}
        {busy && <div className="cp-m"><span className="cp-av" aria-hidden="true">CO</span><div className="cp-msg cora is-busy">Cora is thinking...</div></div>}
      </div>
      <form className="cp-ask" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <div className="cp-chips" aria-label="Suggestions">
          {SUGGESTIONS.map((s) => <button key={s} type="button" className="cp-chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}
        </div>
        <div className="cp-askrow">
          <label className="visually-hidden" htmlFor="cp-ask-input">Ask Cora</label>
          <textarea id="cp-ask-input" rows={1} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Cora anything, or ask for a plan"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <button type="submit" className="cp-send" disabled={busy || !text.trim()}>Send</button>
        </div>
      </form>
    </div>
  );
}
