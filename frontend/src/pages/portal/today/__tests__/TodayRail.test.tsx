import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The rail's self-loading cards are stubbed: this test is about what TodayRail itself decides to render, and in
// which order, from the values TodayShell passes in (C101 moved that markup out of TodayShell unchanged).
jest.mock('../TodayJourneyNudges', () => () => <div data-stub="nudges" />);
jest.mock('../CommunityPulse', () => () => <div data-stub="pulse" />);
jest.mock('../TodayDayCard', () => () => <div data-stub="daycard" />);
jest.mock('../TodayStreakCard', () => () => <div data-stub="streak" />);
jest.mock('../ExplorerHomeBase', () => ({ ExplorerRailCards: () => <div data-stub="explorer-rail" /> }));
jest.mock('../NextLiveClassCard', () => () => <div data-stub="next-live" />);
jest.mock('../InternshipOpportunityCard', () => () => <div data-stub="intern-opportunity" />);
jest.mock('../InternshipCommandCard', () => () => <div data-stub="intern-command" />);
jest.mock('../GovProjectCard', () => () => <div data-stub="gov" />);

import TodayRail, { type TodayRailProps } from '../TodayRail';

const base: TodayRailProps = {
  redesign: true,
  lvl: { name: 'Explorer', pct: 10, next: null } as unknown as TodayRailProps['lvl'],
  total: 0, setupDone: 1, setupTotal: 4, setupPct: 25, readiness: 0,
  explorerHome: false,
  streak: null, streakCount: 0, streakWeek: [], claimedToday: false, busy: false, doClaimStreak: () => undefined,
  internship: null, onInternshipChanged: () => undefined,
  nextLiveSession: null,
  firstClass: null, fcCd: null,
  oh: null, rsvped: false, doRsvp: () => undefined,
};

const html = (over: Partial<TodayRailProps> = {}) => renderToStaticMarkup(<TodayRail {...base} {...over} />);
const stubs = (m: string) => Array.from(m.matchAll(/data-stub="([^"]+)"/g)).map((x) => x[1]);

describe('TodayRail', () => {
  it('renders the rail in the original order, with the day card only when the redesign is off', () => {
    expect(stubs(html())).toEqual(['nudges', 'pulse', 'streak']);
    expect(stubs(html({ redesign: false, explorerHome: true }))).toEqual(['nudges', 'pulse', 'daycard', 'explorer-rail', 'streak']);
  });

  it('shows the intern command card once active, the opportunity card before that, and the gov card for both', () => {
    const active = { render: true, card_state: 'active' } as unknown as TodayRailProps['internship'];
    const recruiting = { render: true, card_state: 'eligible' } as unknown as TodayRailProps['internship'];
    expect(stubs(html({ internship: active }))).toEqual(['nudges', 'pulse', 'streak', 'intern-command', 'gov']);
    expect(stubs(html({ internship: recruiting }))).toEqual(['nudges', 'pulse', 'streak', 'intern-opportunity', 'gov']);
  });

  it('prefers the next live session over the first-class countdown, and shows the countdown otherwise', () => {
    const firstClass = { cohort_name: 'Cohort 12', core_day: 'Tuesday', core_time: '6 PM', source: 'next_open_cohort' } as unknown as TodayRailProps['firstClass'];
    const fcCd = { d: 3, h: 4, m: 5, s: 6 } as unknown as TodayRailProps['fcCd'];
    const live = { id: 's1' } as unknown as TodayRailProps['nextLiveSession'];
    expect(html({ nextLiveSession: live, firstClass, fcCd })).not.toContain('Countdown to your first class');
    const m = html({ firstClass, fcCd });
    expect(m).toContain('Countdown to your first class');
    expect(m).toContain('Cohort 12 · Tuesdays 6 PM');
    expect(m).toContain('<b>3</b><span>days</span>');
    expect(m).toContain('Next cohort start (join to lock your seat)');
  });

  it('"Coming up" shows the open house with an RSVP button, or the empty line', () => {
    expect(html()).toContain('No open house scheduled yet — check back soon.');
    const oh = { title: 'Open House: AI for leaders', starts_at: '2026-11-05T00:00:00Z' } as unknown as TodayRailProps['oh'];
    expect(html({ oh })).toContain('RSVP for the next event');
    expect(html({ oh, rsvped: true })).toContain("RSVP&#x27;d");
  });
});
