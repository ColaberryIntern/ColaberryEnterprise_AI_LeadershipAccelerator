import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getParticipantToken } from '../../utils/participantToken';
import { fetchCareerPrepFlag } from '../careerPrep/careerPrepFlag';
import { CAREER_PREP_ROOM_PATH, isPrepAudience } from './hq/careerPrepDoors';
import { useCampusView } from './useCampusView';

/**
 * One click from any portal page into Career Prep (Ali, 2026-11-25: the tester guide must show how to get there from the
 * portal). In the left menu on a wide screen, in the bottom bar on a phone. Students only, and only when the server says
 * Career Prep is on for them; otherwise (or on any failure) it renders nothing, so nobody else's menu changes. The menu and
 * the bar are both on a page and remount as you move around, so the answer is shared for a minute, per session token.
 */
const TTL_MS = 60_000;
let cached: { at: number; token: string | null; on: Promise<boolean> } | null = null;

function careerPrepOn(now = Date.now()): Promise<boolean> {
  const token = getParticipantToken();
  if (!cached || cached.token !== token || now - cached.at > TTL_MS) cached = { at: now, token, on: fetchCareerPrepFlag() };
  return cached.on;
}

/** Tests only. */
export function resetCareerPrepMenu(): void { cached = null; }

function useOn(): boolean {
  const { audience } = useCampusView();
  const student = isPrepAudience(audience);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!student) { setOn(false); return undefined; }
    let live = true;
    careerPrepOn().then((v) => { if (live) setOn(v); }, () => undefined);
    return () => { live = false; };
  }, [student]);
  return student && on;
}

export function CareerPrepMenuLink(): React.ReactElement | null {
  if (!useOn()) return null;
  return (
    <ul className="cm-nav-list">
      <li><Link className="cm-nav-item cm-nav-prep" to={CAREER_PREP_ROOM_PATH} data-testid="cm-nav-prep">
        <i className="ri-focus-3-line" aria-hidden="true" /><span className="lb">Career Prep</span></Link></li>
    </ul>
  );
}

export function CareerPrepTab(): React.ReactElement | null {
  if (!useOn()) return null;
  return (
    <Link to={CAREER_PREP_ROOM_PATH} className="cm-tab" data-testid="cm-tab-prep" aria-label="Career Prep">
      <span className="cm-tab-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
      </span>
      <span className="lb">Prep</span>
    </Link>
  );
}
