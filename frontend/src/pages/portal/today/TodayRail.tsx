import React from 'react';
import { levelFor, OnboardingSchedule, StreakView } from '../../../services/onboardingApi';
import { InternshipStatus } from '../../../services/internshipApi';
import { countdown, fmtCentralDateTime } from './shellUtils';
import CommunityPulse from './CommunityPulse';
import TodayStreakCard from './TodayStreakCard';
import TodayDayCard from './TodayDayCard';
import { ExplorerRailCards } from './ExplorerHomeBase';
import TodayJourneyNudges from './TodayJourneyNudges';
import NextLiveClassCard from './NextLiveClassCard';
import InternshipOpportunityCard from './InternshipOpportunityCard';
import InternshipCommandCard from './InternshipCommandCard';
import GovProjectCard from './GovProjectCard';
import { useNextLiveSession } from './useNextLiveSession';

/**
 * The Today page's right-hand rail. Moved out of TodayShell (C101: the shell was 657 lines against a 500-line
 * ceiling); the markup and its order are unchanged. Every value is computed by TodayShell and passed in, so this
 * file owns layout only, no state.
 */
export interface TodayRailProps {
  redesign: boolean;
  lvl: ReturnType<typeof levelFor>;
  total: number;
  setupDone: number;
  setupTotal: number;
  setupPct: number;
  readiness: number;
  explorerHome: boolean;
  streak: StreakView | null;
  streakCount: number;
  streakWeek: StreakView['week'];
  claimedToday: boolean;
  busy: boolean;
  doClaimStreak: () => void;
  internship: InternshipStatus | null;
  onInternshipChanged: () => void;
  nextLiveSession: ReturnType<typeof useNextLiveSession>['session'];
  firstClass: OnboardingSchedule['first_class'] | null | undefined;
  fcCd: ReturnType<typeof countdown>;
  /** The open house the viewer may be shown (TodayShell's promotable(...) result). */
  oh: NonNullable<OnboardingSchedule['next_open_house']> | null;
  rsvped: boolean;
  doRsvp: () => void;
}

const TodayRail: React.FC<TodayRailProps> = (p) => (
  <aside className="te-side">
    {/* Growth Journey nudges (Phase 5) — its own read; renders nothing until a rollout writes a row */}
    <TodayJourneyNudges />
    {/* Live community pulse — surfaces rooms people are in + live/next sessions */}
    <CommunityPulse />
    {/* Your day — meters fold into the command band when the redesign flag is on */}
    {!p.redesign && <TodayDayCard lvl={p.lvl} total={p.total} setupDone={p.setupDone} setupTotal={p.setupTotal} setupPct={p.setupPct} readiness={p.readiness} />}
    {p.explorerHome && <ExplorerRailCards />}

    {/* Daily streak */}
    <TodayStreakCard streak={p.streak} streakCount={p.streakCount} streakWeek={p.streakWeek} claimedToday={p.claimedToday} busy={p.busy} doClaimStreak={p.doClaimStreak} />

    {/* Next live class — when the student has an upcoming/live session
        (from live_sessions) show the live-session card; otherwise fall
        back to the first-class cohort countdown UNCHANGED. The Open House
        "Coming up" card below is unaffected in either case. */}
    {/* Once someone is an intern the recruiting card is replaced by the
        command card — "after activation, replace the recruiting card with a
        compact Internship Command Card". Same slot, different job. */}
    {p.internship?.render && p.internship.card_state === 'active' && <InternshipCommandCard />}
    {p.internship?.render && p.internship.card_state !== 'active' && (
      <InternshipOpportunityCard
        status={p.internship}
        onChanged={p.onInternshipChanged}
      />
    )}
    {/* P6: the "on your profile" entry to an assigned government project. Self-hides when the intern has
        none, so it only appears for someone actually on a gov pursuit. */}
    {p.internship?.render && <GovProjectCard />}
    {p.nextLiveSession ? (
      <NextLiveClassCard session={p.nextLiveSession} />
    ) : p.firstClass ? (
      <div className="te-card te-scard">
        <h3>Countdown to your first class</h3>
        <div className="te-muted">{p.firstClass.cohort_name || 'Your cohort'}{p.firstClass.core_day ? ` · ${p.firstClass.core_day}s ${p.firstClass.core_time || ''}` : ''}</div>
        {p.fcCd && (
          <div className="te-count">
            <div className="seg"><b>{p.fcCd.d}</b><span>days</span></div>
            <div className="seg"><b>{p.fcCd.h}</b><span>hrs</span></div>
            <div className="seg"><b>{p.fcCd.m}</b><span>min</span></div>
          </div>
        )}
        {p.firstClass.source === 'next_open_cohort' && <div className="te-muted" style={{ marginTop: 8 }}>Next cohort start (join to lock your seat)</div>}
      </div>
    ) : null}

    <div className="te-card te-scard">
      <h3>Coming up</h3>
      {p.oh ? (
        <>
          <div className="te-stat"><span className="lab">{p.oh.title}</span></div>
          <div className="te-muted">{fmtCentralDateTime(p.oh.starts_at)}</div>
          <button className="te-btn berry sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={p.doRsvp} disabled={p.busy || p.rsvped}>{p.rsvped ? "RSVP'd" : 'RSVP for the next event'}</button>
        </>
      ) : <div className="te-muted">No open house scheduled yet — check back soon.</div>}
    </div>
  </aside>
);

export default TodayRail;
