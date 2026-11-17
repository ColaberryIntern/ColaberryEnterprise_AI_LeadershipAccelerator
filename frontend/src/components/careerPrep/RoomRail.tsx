import React from 'react';
import type { PrepDashboard, PrepInterview } from './careerPrepApi';
import type { RoomTab } from './CareerPrepRoom';
import type { Sheet } from './logic/askRouter';
import { SHEETS } from './logic/sheets';
import { SKILLS_FOR_READINESS } from './ProgressDashboard';

/**
 * Career Prep R1.1 (Ali, 2026-11-16: "Make the left side more for something else like navigation or seeing your
 * scores"). The room's left rail:
 *   Go to     Your progress, Your plan, Session (in step with the tabs), then the getting-hired pages, which open as
 *             sheets over the room (the same sheets as the jump bar and the URL hash).
 *   Scores    readiness for the anchored interview (or how far from a first score), then every scored skill as a
 *             mini bar, lowest first; skills without a score are counted, never given a number. A skill opens
 *             Your progress at that skill (it does NOT build a plan).
 * Every number is the dashboard the room already loaded: no new request.
 */
const TAB_ITEMS: ReadonlyArray<{ key: RoomTab; label: string; icon: string }> = [
  { key: 'progress', label: 'Your progress', icon: 'ri-line-chart-line' },
  { key: 'plan', label: 'Your plan', icon: 'ri-calendar-check-line' },
  { key: 'session', label: 'Session', icon: 'ri-play-circle-line' },
];
const SHEET_ICON: Record<Sheet, string> = {
  interviews: 'ri-calendar-event-line', inbox: 'ri-mail-line', offers: 'ri-hand-coin-line', applications: 'ri-file-list-3-line', resume: 'ri-profile-line',
};

export interface RoomRailProps {
  tab: RoomTab;
  onTab: (t: RoomTab) => void;
  onSheet: (s: Sheet) => void;
  dashboard: PrepDashboard | null;
  anchor: PrepInterview | null;
  onSkill: (key: string) => void;
}

function Scores({ d, anchor, onSkill }: { d: PrepDashboard; anchor: PrepInterview | null; onSkill: (key: string) => void }): React.ReactElement {
  const scored = d.skills.filter((s) => s.score !== undefined).sort((a, b) => (a.score as number) - (b.score as number));
  const unscored = d.skills.length - scored.length;
  const r = d.readiness;
  return (
    <div className="cp-rail-scores" data-testid="cp-rail-scores">
      <div className="cp-rail-h">Your scores</div>
      {r ? (
        <div className="cp-rail-ready" data-testid="cp-rail-readiness">
          <b>{r.value}</b><small>readiness{anchor ? ` for ${anchor.company}` : ''}{r.target !== undefined ? ` · ${r.target} is ready` : ''}</small>
        </div>
      ) : (
        <div className="cp-rail-ready is-empty" data-testid="cp-rail-readiness-empty">
          <small>Readiness: {Math.min(scored.length, SKILLS_FOR_READINESS)} of {SKILLS_FOR_READINESS} skills scored for a first score</small>
        </div>
      )}
      {scored.length > 3 && <p className="cp-rail-lowest">Your 3 lowest. Every skill is in Your progress.</p>}
      {scored.length > 0 && (
        <ul className="cp-rail-skills">{scored.map((s) => (
          <li key={s.key}>
            <button type="button" className="cp-rail-skill" onClick={() => onSkill(s.key)} aria-label={`${s.label}: ${s.score}. Show it in Your progress`} data-testid={`cp-rail-skill-${s.key}`}>
              <span className="cp-rail-skill-name">{s.label}</span>
              <span className="cp-rail-skill-v">{s.score}</span>
              <span className="cp-bar" aria-hidden="true"><span className="cp-bar-fill" style={{ width: `${s.score}%` }} /></span>
            </button>
          </li>
        ))}</ul>
      )}
      {unscored > 0 && <p className="cp-rail-note" data-testid="cp-rail-unscored">{unscored} {unscored === 1 ? 'skill needs' : 'skills need'} more practice for a score</p>}
    </div>
  );
}

export function RoomRail({ tab, onTab, onSheet, dashboard, anchor, onSkill }: RoomRailProps): React.ReactElement {
  return (
    <div className="cp-rail">
      <div className="cp-rail-h">Go to</div>
      <ul className="cp-rail-nav">
        {TAB_ITEMS.map((t) => (
          <li key={t.key}><button type="button" className={`cp-rail-link${tab === t.key ? ' is-on' : ''}`} aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => onTab(t.key)} data-testid={`cp-rail-tab-${t.key}`}><i className={t.icon} aria-hidden="true" />{t.label}</button></li>
        ))}
      </ul>
      <ul className="cp-rail-nav is-sheets">
        {SHEETS.map((s) => (
          <li key={s.key}><button type="button" className="cp-rail-link" onClick={() => onSheet(s.key)} data-testid={`cp-rail-sheet-${s.key}`}>
            <i className={SHEET_ICON[s.key]} aria-hidden="true" />{s.title}</button></li>
        ))}
      </ul>
      {dashboard ? <Scores d={dashboard} anchor={anchor} onSkill={onSkill} /> : <p className="cp-rail-note">Loading your scores...</p>}
    </div>
  );
}
