import React, { useEffect, useRef, useState } from 'react';
import type { CampusAudience } from '../campusMap';
import { trapTab } from '../focusTrap';
import { greetingFor } from './useHomeFacts';
import '../campusGate.css';

/**
 * The entry gate (C11b, decision D7), the prototype's opening screen: dusk behind iron gates, the arch, the Colaberry mark, a
 * greeting by name, your ID card and Enter. Explorers come in by the visitor entrance with a green visitor pass; Workplace names
 * turn the gate into an office lobby. Enter swings the doors open (or, with reduce motion, simply lets you in).
 *
 * Shown once per Central day (localStorage, gateSeen below): it is a welcome, not a wall, so Esc and "Enter" both get you in, and
 * nothing here writes to the server (the streak line is information only; claiming stays on Today). Real data only: the name,
 * level and points come from the profile and the campus look; a fact we do not have is left off the card.
 */
export const GATE_SEEN_KEY = 'colaberry.campus.gate.seen';
const OPEN_MS = 1500;

/** Today's date in Central time, YYYY-MM-DD (the portal's day boundary). */
export function centralDay(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function gateSeen(now: Date): boolean {
  try { const v = window.localStorage.getItem(GATE_SEEN_KEY); return v === 'always' || v === centralDay(now); } catch { return true; } // no storage: never block
}
export function markGateSeen(now: Date): void {
  try { if (window.localStorage.getItem(GATE_SEEN_KEY) !== 'always') window.localStorage.setItem(GATE_SEEN_KEY, centralDay(now)); } catch { /* no storage */ }
}

export interface GateProps {
  audience: CampusAudience;
  firstName: string;
  fullName: string;
  initials: string;
  rung: string | null;
  points: number | null;
  streak: number | null;
  online: number | null;
  workplace: boolean;
  hasTour: boolean;
  reduceMotion: boolean;
  now: Date;
  onEnter: (tour: boolean) => void;
}

export default function CampusGate(p: GateProps): React.ReactElement {
  const [opening, setOpening] = useState(false);
  const enterBtn = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => { enterBtn.current?.focus(); return () => { if (timer.current !== null) window.clearTimeout(timer.current); }; }, []);
  const explorer = p.audience === 'explorer';
  const go = (tour: boolean) => {
    markGateSeen(p.now);
    if (p.reduceMotion) { p.onEnter(tour); return; }
    setOpening(true);
    timer.current = window.setTimeout(() => p.onEnter(tour), OPEN_MS);
  };
  const greeting = `${greetingFor(p.now.getHours())}${p.firstName ? `, ${p.firstName}` : ''}.`;
  const who = (n: number) => (p.audience === 'member' ? (n === 1 ? 'classmate' : 'classmates') : (n === 1 ? 'person' : 'people'));
  const staff = p.audience === 'staff', partner = p.audience === 'business';
  const here = p.online && p.online > 0 ? p.online : 0;
  // Each entrance's line, as the prototype's renderGate, with only the facts we have (no company, seats or "could use a hand").
  const sub = explorer
    ? 'Your Explorer pass is ready. Wander anywhere: a few buildings are members-only, and you can still peek inside.'
    : staff ? (here ? `${here} ${here === 1 ? 'learner is' : 'learners are'} on campus right now.` : 'The campus is open.')
    : partner ? `See where your team learns and builds.${here ? ` ${here} ${here === 1 ? 'person is' : 'people are'} on campus right now.` : ''}`
    : here ? `The campus is open. ${here} ${who(here)} ${here === 1 ? 'is' : 'are'} already inside.` : 'The campus is open.';
  // The prototype's arch per entrance (renderGate): learners, visitors, staff and partners each have their own; Workplace names say Colaberry Works.
  const house = p.workplace ? 'Colaberry Works' : 'Colaberry';
  const arch = explorer ? `${house} · Visitor entrance` : p.audience === 'staff' ? 'Colaberry · Staff entrance' : p.audience === 'business' ? `${house} · Partner entrance`
    : p.workplace ? 'Colaberry Works · HQ Lobby' : 'Colaberry · AI Systems Architect Accelerator';
  return (
    <div className={`cm-gate${opening ? ' is-opening' : ''}${p.workplace ? ' is-work' : ''}${p.reduceMotion ? ' is-reduced' : ''}`} role="dialog" aria-modal="true"
      aria-labelledby="cm-gate-greeting" data-testid="cm-gate"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); go(false); } else trapTab(e); }}>
      <div className="sun" aria-hidden="true" />
      <div className="ground" aria-hidden="true" />
      <div className="door l" aria-hidden="true" /><div className="door r" aria-hidden="true" />
      <div className="arch" aria-hidden="true" data-testid="cm-gate-arch-text"><span>{arch}</span></div>
      <div className="cm-gate-c">
        <div className="cm-idwrap">
          <img className="cm-gate-logo" src="/colaberry-horizontal.png" alt="Colaberry" width={230} height={54} data-testid="cm-gate-logo" />
          <h1 id="cm-gate-greeting" data-testid="cm-gate-greeting">{greeting}</h1>
          <p data-testid="cm-gate-sub">{sub}</p>
          {p.audience === 'member' && p.streak !== null && p.streak > 0 && (
            <div className="cm-gate-streak" data-testid="cm-gate-streak"><span aria-hidden="true">{'\u{1F525}'}</span><b>Day {p.streak}</b> of your streak</div>
          )}
          <div className={`cm-idcard${explorer ? ' is-explorer' : staff ? ' is-staff' : partner ? ' is-partner' : ''}`} data-testid="cm-gate-id">
            <div className="ph" aria-hidden="true">{p.initials || '·'}</div>
            <div>
              <b>{p.fullName || (explorer ? 'Explorer' : 'Welcome')}</b>
              <small>{explorer ? 'Explorer · visitor pass' : partner ? 'Partner account' : staff ? 'Program staff · Colaberry' : 'AI Systems Architect Accelerator'}</small>
              {explorer && <small>No card needed</small>}
              {staff && <span className="tier">STAFF</span>}
              {partner && <span className="tier">Business partner</span>}
              {!explorer && !staff && !partner && (p.rung || p.points !== null) && <span className="tier">{'★'} {[p.rung, p.points !== null ? `${p.points.toLocaleString('en-US')} pts` : null].filter(Boolean).join(' · ')}</span>}
              {explorer && <span className="tier">Explorer</span>}
            </div>
          </div>
          {/* The partner entrance leads with the partner tour (the prototype's "Start the partner tour"); everyone else enters, with the tour as the alternative. */}
          <button type="button" className="cm-tap" ref={enterBtn} onClick={() => go(partner && p.hasTour)} data-testid="cm-gate-enter">
            {explorer ? 'Pick up your pass and explore →' : staff ? 'Badge in →' : partner && p.hasTour ? 'Start the partner tour →' : p.workplace ? 'Tap your badge to enter HQ →' : 'Tap your ID to enter campus →'}
          </button>
          {p.hasTour && !staff && <button type="button" className="cm-tap-alt" onClick={() => go(!partner)} data-testid="cm-gate-tour">{partner ? 'Or just look around on your own' : explorer ? 'Or take the short tour →' : 'New here? Enter with a guided tour →'}</button>}
        </div>
      </div>
    </div>
  );
}
