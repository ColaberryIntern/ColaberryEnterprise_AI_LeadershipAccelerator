import * as fs from 'fs';
import * as path from 'path';

const upcomingMock = jest.fn();
const registeredMock = jest.fn();
jest.mock('../../publicEventsService', () => ({
  getUpcomingPublicEvents: (...a: unknown[]) => upcomingMock(...a),
  getRegisteredEventIds: (...a: unknown[]) => registeredMock(...a),
}));

import { getExplorerEventState, UPCOMING_WINDOW_DAYS } from '../explorerEventStateService';
import { classify, DEFERRED_RULES } from '../explorerStateMachine';

/**
 * EPIC 7 — event state.
 *
 * WHAT THIS REPLACES. EPIC 3 wired `event_registered` / `event_attended` end to
 * end: the reader maps them from `student_points_events` rows typed
 * `open_house_rsvp%`, and the state machine derived overlays from them.
 * Production has **ZERO** such rows, so the overlays could never fire. Complete
 * plumbing, no water.
 *
 * The live record is CCPP `EventBrite_EventAttendees` — 4,455 signups in 90 days.
 */

const ev = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));

beforeEach(() => {
  upcomingMock.mockReset().mockResolvedValue(ev(2));
  registeredMock.mockReset().mockResolvedValue(new Set(['e0']));
});

describe('it reads the live registration record', () => {
  it('counts upcoming events the learner registered for', async () => {
    const s = await getExplorerEventState('a@b.com');
    expect(s).toEqual({ registeredUpcomingCount: 1, upcomingEventCount: 2, attendanceAvailable: false });
  });

  it('asks only about a near-term window', async () => {
    // An event two months out is not a reason to nudge someone this week.
    await getExplorerEventState('a@b.com');
    expect(upcomingMock).toHaveBeenCalledWith(UPCOMING_WINDOW_DAYS);
    expect(UPCOMING_WINDOW_DAYS).toBeLessThanOrEqual(45);
  });

  it('REUSES getRegisteredEventIds rather than querying CCPP itself', () => {
    // That function carries the fix without which this returns nothing: 100% of
    // 2026 registration emails are stored as `'someone@example.com',`, so an
    // exact match finds no one. A second query here would reproduce the bug in
    // a second place.
    const src = fs.readFileSync(path.join(__dirname, '..', 'explorerEventStateService.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('getRegisteredEventIds');
    expect(code).not.toContain('EventBrite_EventAttendees');
    expect(code).not.toContain('mssql');
  });
});

describe('it never invents state', () => {
  it('returns nothing known when there is no email', async () => {
    expect(await getExplorerEventState(null)).toMatchObject({ registeredUpcomingCount: 0 });
    expect(upcomingMock).not.toHaveBeenCalled();
  });

  it('fails soft on a CCPP error rather than throwing', async () => {
    // An outage must not invent an overlay — nor remove one by exploding.
    registeredMock.mockRejectedValue(new Error('ccpp down'));
    await expect(getExplorerEventState('a@b.com')).resolves.toMatchObject({
      registeredUpcomingCount: 0,
      upcomingEventCount: 0,
    });
  });

  it('reports no upcoming events as zero, not as an error', async () => {
    upcomingMock.mockResolvedValue([]);
    const s = await getExplorerEventState('a@b.com');
    expect(s.upcomingEventCount).toBe(0);
    expect(registeredMock).not.toHaveBeenCalled();
  });
});

/**
 * THE ASSERTION THAT MATTERS MOST: attendance is never claimed.
 */
describe('attendance is unknowable, and nothing pretends otherwise', () => {
  it('always reports attendanceAvailable false', async () => {
    // Not a placeholder. All 549 events in the last 90 days are online, and
    // `barcode.checked_in` fires only when a ticket is scanned at a door — so
    // zero check-ins have been possible since 2022.
    const s = await getExplorerEventState('a@b.com');
    expect(s.attendanceAvailable).toBe(false);
  });

  it('exposes no attended or no-show field at all', async () => {
    // A consumer must not be able to read `attended: false` and treat it as
    // "did not attend". The fact is UNKNOWN, and the shape says so by omission.
    const s = await getExplorerEventState('a@b.com');
    expect(Object.keys(s).sort()).toEqual(
      ['attendanceAvailable', 'registeredUpcomingCount', 'upcomingEventCount'],
    );
  });

  it('records no-show as BLOCKED, not deferred', () => {
    // A deferred-rules list that says "coming in EPIC 7" for something EPIC 7
    // proved impossible would send the next person hunting for work that cannot
    // be done with this data source.
    const noShow = DEFERRED_RULES.find((r) => r.id === 'O15/O16');
    expect(noShow).toBeDefined();
    expect(noShow!.target).toMatch(/blocked/i);
    expect(noShow!.reason).toMatch(/online|door|Zoom/i);
  });

  it('no longer lists EVENT_READY as deferred, because it is implemented', () => {
    expect(DEFERRED_RULES.find((r) => r.id === 'O9/O10')).toBeUndefined();
  });
});
