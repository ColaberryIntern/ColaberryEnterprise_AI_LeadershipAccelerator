import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * "Run it here": the slide's prompt runs on the class page itself, and the answer appears under it.
 *
 * Ali, 2026-11-23: on a phone, Open in Claude leaves the class page and the attendee has to find
 * their way back. "These prompts have to be run on the same screen." So the prompt is sent to the
 * class's own assistant (backend liveGuestRun.ts) and the conversation stays on this page, with a
 * reply box for prompts that go back and forth (the five-question interview).
 *
 * The conversation belongs to one prompt: when the slide moves to a different prompt, it starts
 * fresh. Answers are rendered as text (pre-wrap), never as HTML.
 *
 * House style for new frontend files: no emoji and no dashes in the copy written here.
 */

export type RunTurn = { role: 'user' | 'assistant'; content: string };
export type RunFn = (messages: RunTurn[]) => Promise<string>;

interface Props {
  prompt: string;
  run: RunFn;
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || 'That did not go through. Press Run again.';
}

export default function CheckinRunHere({ prompt, run }: Props): React.ReactElement {
  const [turns, setTurns] = useState<RunTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const inFlight = useRef(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  // A new prompt on screen starts a new conversation.
  useEffect(() => { setTurns([]); setError(''); setReply(''); }, [prompt]);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [turns, busy]);

  const send = useCallback((next: RunTurn[]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setTurns(next);
    run(next)
      .then((answer) => { setTurns([...next, { role: 'assistant', content: answer }]); setReply(''); })
      .catch((err) => { setTurns(next.slice(0, -1)); setError(errorText(err)); })
      .finally(() => { inFlight.current = false; setBusy(false); });
  }, [run]);

  const start = () => send([{ role: 'user', content: prompt }]);
  const sendReply = () => {
    const text = reply.trim();
    if (!text) return;
    send([...turns, { role: 'user', content: text }]);
  };

  const started = turns.length > 0;
  const answered = turns.some((t) => t.role === 'assistant');

  return (
    <div className="cbrun" data-testid="run-here">
      {!started && (
        <button type="button" className="cbck-btn cbrun-go" onClick={start} disabled={busy} data-testid="run-start">
          Run it here
        </button>
      )}
      {started && (
        <div className="cbrun-chat" aria-live="polite">
          {turns.map((t, k) => (k === 0 ? null : (
            <div key={k} className={`cbrun-turn ${t.role === 'assistant' ? 'is-ai' : 'is-you'}`} data-testid={t.role === 'assistant' ? 'run-answer' : 'run-you'}>
              <p className="cbrun-who">{t.role === 'assistant' ? 'Answer' : 'You'}</p>
              <div className="cbrun-text">{t.content}</div>
            </div>
          )))}
          {busy && <p className="cbrun-wait" data-testid="run-wait">Thinking…</p>}
          <div ref={endRef} />
        </div>
      )}
      {error && <p className="cbrun-error" role="alert" data-testid="run-error">{error}</p>}
      {answered && (
        <div className="cbrun-reply">
          <textarea
            className="cbrun-input"
            rows={2}
            placeholder="Reply here, for example your answer to the question"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2000}
            aria-label="Reply"
            data-testid="run-reply-input"
          />
          <div className="cbrun-actions">
            <button type="button" className="cbck-btn cbrun-send" onClick={sendReply} disabled={busy || !reply.trim()} data-testid="run-reply-send">Send</button>
            <button type="button" className="cbck-btn cbck-btn-ghost cbrun-reset" onClick={() => { setTurns([]); setError(''); setReply(''); }} disabled={busy} data-testid="run-reset">Start over</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const CBRUN_CSS = `
.cbrun{ width:100%; margin-top:12px; text-align:left; }
.cbrun-go{ width:100%; }
.cbrun-chat{ margin-top:4px; display:flex; flex-direction:column; gap:10px; max-height:60vh; overflow:auto; }
.cbrun-turn{ border-radius:14px; padding:10px 12px; border:1px solid var(--border-subtle); }
.cbrun-turn.is-ai{ background:var(--surface-card); }
.cbrun-turn.is-you{ background:var(--surface-subtle); }
.cbrun-who{ margin:0 0 4px; font-size:11px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); }
.cbrun-text{ white-space:pre-wrap; overflow-wrap:anywhere; font-size:14.5px; line-height:1.5; color:var(--text-body); font-family:ui-monospace,"Cascadia Mono",Consolas,monospace; overflow-x:auto; }
.cbrun-wait{ margin:4px 0; color:var(--text-muted); font-size:14px; }
.cbrun-error{ margin:8px 0 0; color:var(--status-danger, #C20E1E); font-size:14px; font-weight:600; }
.cbrun-reply{ margin-top:10px; }
.cbrun-input{ width:100%; box-sizing:border-box; border-radius:12px; border:1px solid var(--border-subtle); padding:10px 12px; font:inherit; font-size:15px; resize:vertical; }
.cbrun-actions{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
`;
