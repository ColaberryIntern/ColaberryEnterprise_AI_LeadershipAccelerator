import React, { useEffect, useRef, useState } from 'react';
import type { CampusAudience } from '../campusMap';
import { trapTab } from '../focusTrap';
import { greetLine, wd } from './conciergeCopy';
import { gateSeen, markGateSeen, centralDay, GATE_SEEN_KEY } from './campusEntrance';
import '../campusGate.css';

/**
 * The entry gate (C11b, decision D7), the prototype's opening screen: dusk behind iron gates, the arch, the Colaberry mark, a
 * greeting by name, your ID card and Enter. Explorers come in by the visitor entrance with a green visitor pass; Workplace names
 * turn the gate into an office lobby. Enter swings the doors open (or, with reduce motion, simply lets you in).
 *
 * Shown once per Central day (localStorage, gateSeen below): it is a welcome, not a wall, so Esc and "Enter" both get you in.
 * WP-4 (decision Q9): walking in claims today's streak, as the prototype's; the gate says what it will award (the server's figure)
 * and the home makes the claim on Enter (useGateStreak), so this component still writes nothing itself. Real data only: the name,
 * level and points come from the profile and the campus look; a fact we do not have is left off the card.
 */
// WP-7: the entrance setting (daily / every time / never) and the day the gate was passed live in campusEntrance; re-exported here.
export { gateSeen, markGateSeen, centralDay, GATE_SEEN_KEY };
/** WP-3, the prototype's enter() timeline: the doors swing (1.5 s); at 1.3 s the gate starts its 0.7 s fade; it is gone at 2 s. */
export const FADE_AT_MS = 1300;
export const OPEN_MS = 2000;


export interface GateProps {
  audience: CampusAudience;
  firstName: string;
  fullName: string;
  initials: string;
  rung: string | null;
  points: number | null;
  streak: number | null;
  /** WP-4 (Q9): what walking in claims today (the server's next_points; 0 or absent once claimed). */
  streakPoints?: number | null;
  online: number | null;
  workplace: boolean;
  hasTour: boolean;
  reduceMotion: boolean;
  now: Date;
  onEnter: (tour: boolean) => void;
  /** WP-1: the doors start to swing (the home starts the camera's fly-out from the gate 900 ms later, as the prototype does). */
  onOpening?: () => void;
  /** WP-6: Colaberry Live is on air (where, and whether this viewer gets a preview): the gate's line says so, as the prototype's. */
  live?: { place: string; preview: boolean } | null;
  /** WP-7: your uploaded photo on the ID card (the prototype's renderGate after a photo); initials without one. */
  photo?: string | null;
  /** C91: an Explorer with no first lesson yet: the main button starts that lesson (called after the doors open), the tour stays second. */
  onFirstLesson?: (() => void) | null;
}

export default function CampusGate(p: GateProps): React.ReactElement {
  const [opening, setOpening] = useState(false);
  const [done, setDone] = useState(false);
  const enterBtn = useRef<HTMLButtonElement | null>(null);
  const timer = useRef<number | null>(null);
  const fade = useRef<number | null>(null);
  useEffect(() => {
    enterBtn.current?.focus();
    return () => { if (timer.current !== null) window.clearTimeout(timer.current); if (fade.current !== null) window.clearTimeout(fade.current); };
  }, []);
  const explorer = p.audience === 'explorer';
  const firstLesson = explorer && p.onFirstLesson ? p.onFirstLesson : null;
  const go = (tour: boolean, lesson = false) => {
    markGateSeen(p.now);
    const after = () => (lesson && firstLesson ? firstLesson() : p.onEnter(tour));
    if (p.reduceMotion) { after(); return; }
    setOpening(true);
    p.onOpening?.();
    fade.current = window.setTimeout(() => setDone(true), FADE_AT_MS);
    timer.current = window.setTimeout(after, OPEN_MS);
  };
  const greeting = greetLine(p.audience, p.firstName, p.now.getHours(), false);
  const who = (n: number) => (p.audience === 'member' ? (n === 1 ? 'classmate' : 'classmates') : (n === 1 ? 'person' : 'people'));
  const staff = p.audience === 'staff', partner = p.audience === 'business';
  const here = p.online && p.online > 0 ? p.online : 0;
  // Each entrance's line, as the prototype's renderGate, with only the facts we have (no company, seats or "could use a hand").
  const liveLine = p.live && (p.audience === 'member' || explorer)
    ? (explorer ? (p.live.preview ? 'Colaberry Live is on: you can watch a preview. Come on in.' : 'Colaberry Live is on air. Come on in.')
      : wd(`Colaberry Live is on air. Your cohort is heading to the ${p.live.place}.`, p.workplace))
    : null;
  const sub = liveLine ?? (explorer
    ? (firstLesson ? 'Your Explorer pass is ready. Start with your first lesson, then wander anywhere on campus.'
      : 'Your Explorer pass is ready. Wander anywhere: a few buildings are members-only, and you can still peek inside.')
    : staff ? (here ? `${here} ${here === 1 ? 'learner is' : 'learners are'} on campus right now.` : 'The campus is open.')
    : partner ? `See where your team learns and builds.${here ? ` ${here} ${here === 1 ? 'person is' : 'people are'} on campus right now.` : ''}`
    : here ? `The campus is open. ${here} ${who(here)} ${here === 1 ? 'is' : 'are'} already inside.` : 'The campus is open.');
  // The prototype's arch per entrance (renderGate): learners, visitors, staff and partners each have their own; Workplace names say Colaberry Works.
  const house = p.workplace ? 'Colaberry Works' : 'Colaberry';
  const arch = explorer ? `${house} · Visitor entrance` : p.audience === 'staff' ? 'Colaberry · Staff entrance' : p.audience === 'business' ? `${house} · Partner entrance`
    : p.workplace ? 'Colaberry Works · HQ Lobby' : 'Colaberry · AI Systems Architect Accelerator';
  return (
    <div className={`cm-gate${opening ? ' is-opening' : ''}${done ? ' is-done' : ''}${p.workplace ? ' is-work' : ''}${p.reduceMotion ? ' is-reduced' : ''}`} role="dialog" aria-modal="true"
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
          {p.audience === 'member' && p.streak !== null && (p.streakPoints ? (
            <div className="cm-gate-streak" data-testid="cm-gate-streak"><span aria-hidden="true">{'\u{1F525}'}</span>{p.streak > 0 ? <><b>{p.streak}-day streak</b> — tap in to keep it going</> : 'Tap in to start a streak'} (+{p.streakPoints} pts)</div>
          ) : p.streak > 0 && (
            <div className="cm-gate-streak" data-testid="cm-gate-streak"><span aria-hidden="true">{'\u{1F525}'}</span><b>{p.streak}-day streak</b></div>
          ))}
          <div className={`cm-idcard${explorer ? ' is-explorer' : staff ? ' is-staff' : partner ? ' is-partner' : ''}`} data-testid="cm-gate-id">
            <div className="ph" aria-hidden="true">{p.photo ? <img src={p.photo} alt="" data-testid="cm-gate-photo" /> : (p.initials || '·')}</div>
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
          {/* C91: an Explorer with no first lesson yet is led to that lesson; "explore" is the reward after it, not the first job */}
          <button type="button" className="cm-tap" ref={enterBtn} onClick={() => go(partner && p.hasTour, !!firstLesson)} data-testid="cm-gate-enter">
            {firstLesson ? 'Start your first lesson →' : explorer ? 'Pick up your pass and explore →' : staff ? 'Badge in →' : partner && p.hasTour ? 'Start the partner tour →' : p.workplace ? 'Tap your badge to enter HQ →' : 'Tap your ID to enter campus →'}
          </button>
          {p.hasTour && !staff && <button type="button" className="cm-tap-alt" onClick={() => go(!partner)} data-testid="cm-gate-tour">{partner ? 'Or just look around on your own' : explorer ? 'Or take the short tour →' : 'New here? Enter with a guided tour →'}</button>}
        </div>
      </div>
    </div>
  );
}
