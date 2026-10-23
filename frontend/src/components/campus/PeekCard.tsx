import React, { useEffect, useRef } from 'react';
import type { CampusPerson, CampusPresenceEntry } from './campusApi';
import type { StaffDesk } from './campusPeopleApi';
import { initialsOf } from './WhoIsHere';
import './campusPeek.css';

/**
 * Who is in a building (WP-3; the prototype's openPeek D:2593-2600), opened from its people chip, at the press: "In <building>",
 * "N classmates (+ staff on duty) right now", the staff on duty, the people you may see by name (a press opens their card), and a
 * row for each person whose name is private to their account; then "Walk to <building>". Real presence only: the prototype's
 * cohort and activity lines are not shown (presence carries neither).
 *
 * A popover, not a modal: focus moves to it, Esc (handled by the map) or a press outside closes it.
 */
export interface PeekProps {
  buildingName: string;
  count: number;
  people: CampusPresenceEntry[];
  desks: StaffDesk[];
  word: 'classmates' | 'people' | 'colleagues';
  x: number;
  y: number;
  onPerson: (p: CampusPerson) => void;
  onWalk: () => void;
  onClose: () => void;
}
const W = 300;
const H = 380;

export default function PeekCard(p: PeekProps): React.ReactElement {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const close = useRef(p.onClose);
  close.current = p.onClose;
  useEffect(() => {
    const out = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) close.current(); };
    const t = window.setTimeout(() => document.addEventListener('mousedown', out), 0); // the opening press is not an outside press
    return () => { window.clearTimeout(t); document.removeEventListener('mousedown', out); };
  }, []);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.max(10, Math.min(vw - W - 10, p.x - W / 2));
  const top = Math.max(76, Math.min(vh - H - 10, p.y + 12));
  const named = p.people.filter((e): e is CampusPerson => 'enrollment_id' in e);
  const anon = p.people.length - named.length;
  return (
    <div className="cm-peek" role="dialog" aria-label={`Who is in ${p.buildingName}`} tabIndex={-1} ref={box} style={{ left, top }} data-testid="cm-peek">
      <button type="button" className="cm-peek-x" onClick={p.onClose} aria-label="Close">×</button>
      <div className="cm-peek-name">In {p.buildingName}</div>
      <div className="cm-peek-sub">{p.count} {p.count === 1 ? p.word.replace(/s$/, '').replace(/^people$/, 'person') : p.word}{p.desks.length ? ' + staff on duty' : ''} right now</div>
      <div className="cm-peek-rows">
        {p.desks.map((d) => (
          <div key={d.id} className="cm-peek-row is-staff">
            <span className="av" aria-hidden="true">{initialsOf(d.name)}</span>
            <div><b>{d.name} <span className="cm-peek-tag">STAFF</span></b><small>{d.title}</small></div>
          </div>
        ))}
        {named.map((n) => (
          <button key={n.enrollment_id} type="button" className="cm-peek-row" onClick={() => p.onPerson(n)} data-testid="cm-peek-person">
            <span className="av" aria-hidden="true">{n.avatar_url ? <img src={n.avatar_url} alt="" /> : initialsOf(n.display_name)}</span>
            <div><b>{n.display_name}</b><small>{n.rung_name || 'On campus'}</small></div>
          </button>
        ))}
        {Array.from({ length: anon }, (_, i) => (
          <div key={`a${i}`} className="cm-peek-row is-anon" data-testid="cm-peek-anon">
            <span className="av" aria-hidden="true" />
            <div><b>Learner</b><small>Name private to their account</small></div>
          </div>
        ))}
        {!p.desks.length && !p.people.length && <div className="cm-peek-note">Nobody here yet.</div>}
      </div>
      <button type="button" className="cm-peek-walk" onClick={p.onWalk} data-testid="cm-peek-walk">🚶 Walk to {p.buildingName}</button>
    </div>
  );
}
