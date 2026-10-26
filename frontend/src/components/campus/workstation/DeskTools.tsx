import React, { useEffect, useState } from 'react';
import type { CampusAreaPresence, CampusPerson } from '../campusApi';

/**
 * The workstation's desk tools (round 3 §2.3, the prototype's .desktools): Focus 25:00, a local timer that never leaves this tab,
 * and Also here, the people in this building from real presence (anonymous people are counted, never drawn). Heads-down is not
 * here yet: it needs a presence flag on /campus/here so others see 🎧 and DMs queue (a backend change, listed as a follow-up).
 */
export const FOCUS_S = 25 * 60;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function useFocusTimer(): { left: number; running: boolean; toggle: () => void; reset: () => void } {
  const [left, setLeft] = useState(FOCUS_S);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  useEffect(() => { if (left === 0) setRunning(false); }, [left]);
  return {
    left, running,
    toggle: () => { if (left === 0) setLeft(FOCUS_S); setRunning((r) => !r || left === 0); },
    reset: () => { setRunning(false); setLeft(FOCUS_S); },
  };
}

export default function DeskTools({ here }: { here: CampusAreaPresence | null }): React.ReactElement {
  const focus = useFocusTimer();
  const people = (here?.people ?? []).filter((p): p is CampusPerson => 'enrollment_id' in p);
  const anon = here ? Math.max(0, here.count - people.length) : 0;
  return (
    <div className="cm-ws-tools" data-testid="cm-ws-tools">
      <div className="cm-ws-tool">
        <span><span aria-hidden="true">⏱ </span>Focus <b role="timer" aria-live="off" data-testid="cm-ws-focus">{mmss(focus.left)}</b></span>
        <button type="button" onClick={focus.toggle} aria-pressed={focus.running}>{focus.running ? 'Pause' : focus.left === 0 ? 'Again' : 'Start'}</button>
        {focus.left !== FOCUS_S && !focus.running && <button type="button" onClick={focus.reset} aria-label="Reset the focus timer">↺</button>}
        <span className="cm-ws-sr" role="status">{focus.left === 0 ? 'Focus time is up' : ''}</span>
      </div>
      {here && (
        <div className="cm-ws-tool" data-testid="cm-ws-alsohere">
          <span>Also here</span>
          {people.length + anon === 0
            ? <small>Just you</small>
            : <span className="avs">
                {people.slice(0, 4).map((p) => (
                  <i key={p.enrollment_id} title={p.display_name} aria-label={p.display_name}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : initials(p.display_name)}</i>
                ))}
                {people.length + anon > 4 && <small>+{people.length + anon - Math.min(4, people.length)}</small>}
              </span>}
        </div>
      )}
    </div>
  );
}
