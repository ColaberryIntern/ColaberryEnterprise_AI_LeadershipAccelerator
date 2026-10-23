import React from 'react';
import { Link } from 'react-router-dom';
import type { CampusAudience } from '../campusMap';
import '../campusPanels.css';
import { levelOfRung } from '../../../services/bandLadder';
import NotificationBell from '../../../pages/portal/community/NotificationBell';
import AccountChip from './AccountChip';

/**
 * The campus home's top bar (C11b), the prototype's HUD (.topbar): the Colaberry mark with CAMPUS (HQ in Workplace names), the
 * "Where are you headed?" pill that opens the Wayfinder (with its "/" hint), List, and a stats pill whose contents follow the
 * account, exactly as the prototype's:
 *  - member: level, points, classmates on campus, streak, the bell, you;
 *  - Explorer: an EXPLORER chip, level, points, people on campus, the bell, you;
 *  - business: a BUSINESS chip, people on campus, the bell, you;
 *  - staff: a STAFF chip, people on campus, the bell, you.
 * Every number is real (the campus look, presence, the streak API); an unknown one is left out, never shown as zero. "You" is your
 * uploaded photo, or your initials.
 */
export interface TopBarProps {
  audience: CampusAudience;
  online: number | null;
  points: number | null;
  rung: string | null;
  streak: number | null;
  initials: string;
  photo?: string | null;
  workplace?: boolean;
  onList: () => void;
  /** Opens the Wayfinder. */
  onFind: () => void;
  /** Opens the Me panel (look and campus settings). */
  onMe: () => void;
}

export default function CampusTopBar(p: TopBarProps): React.ReactElement {
  const { audience, online, points, rung, streak, initials } = p;
  const learner = audience === 'member' || audience === 'explorer';
  const level = learner && rung ? levelOfRung(rung) : null;
  return (
    <div className="cm-topbar" data-testid="cm-topbar">
      <Link to="/portal/today?stay=1" className="cm-pill cm-topbar-brand" data-testid="cm-topbar-brand" aria-label="Colaberry, open Today">
        <img src="/colaberry-horizontal.png" alt="" width={102} height={24} />
        <small>{p.workplace ? 'HQ' : 'Campus'}</small>
      </Link>
      <button type="button" className="cm-pill cm-topbar-search" onClick={p.onFind} data-testid="cm-topbar-search" aria-label="Where are you headed? Search buildings, rooms and people" aria-haspopup="dialog">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /></svg>
        <span>Where are you headed?</span><kbd aria-hidden="true">/</kbd>
      </button>
      <button type="button" className="cm-pill cm-topbar-list" onClick={p.onList} data-testid="cm-topbar-list" aria-label="List view of every building and room">
        <span aria-hidden="true">{'☰'}</span><span className="hide-m"> List</span>
      </button>
      <div className="cm-pill cm-stats" data-testid="cm-stats">
        <AccountChip audience={audience} />
        {/* Q5: "Lv N" (the rung's place on the ladder), the rung name in the tooltip and, visually hidden, for screen readers */}
        {learner && rung && <span className="cm-lv" data-testid="cm-stats-level" title={rung}>{level ? <>Lv {level}<span className="cm-sr">, {rung}</span></> : rung}</span>}
        {learner && points !== null && <span className="hide-m" data-testid="cm-stats-points">{'★'} {points.toLocaleString('en-US')} pts</span>}
        {online !== null && (
          <><span className="sep hide-m" aria-hidden="true" />
            <span title={audience === 'member' ? 'Classmates on campus' : 'People on campus'} data-testid="cm-stats-online">
              <span aria-hidden="true">{'👥 '}</span>{online}<span className="cm-sr"> {audience === 'member' ? 'classmates' : 'people'} on campus</span>
            </span></>
        )}
        {audience === 'member' && streak !== null && (
          <><span className="sep hide-m" aria-hidden="true" />
            <span data-testid="cm-stats-streak" title="Day streak"><span aria-hidden="true">{'🔥 '}</span>{streak}<span className="cm-sr"> day streak</span></span></>
        )}
        <span className="cm-stats-bell" data-testid="cm-stats-bell"><NotificationBell /></span>
        <button type="button" className="cm-me" onClick={p.onMe} aria-label="You: your look and campus settings" data-testid="cm-stats-me">
          {p.photo ? <img src={p.photo} alt="" data-testid="cm-stats-photo" /> : initials}
        </button>
      </div>
    </div>
  );
}
