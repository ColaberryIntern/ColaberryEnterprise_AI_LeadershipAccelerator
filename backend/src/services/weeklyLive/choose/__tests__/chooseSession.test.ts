/**
 * Choose -> session (WL4.1), the parts that need no database: the session title, the room, and the
 * order of checks in planService.choose (a month with no batch is refused before anything is written).
 * The SQL rules (one row per plan, adopt never retitles, rollback) are proven in
 * chooseSession.integration.test.ts against real Postgres.
 */
jest.mock('../../batchResolver', () => ({ resolveBatch: jest.fn() }));
jest.mock('../../plans/planStore', () => ({ getPlan: jest.fn(), setChosen: jest.fn(), STAGES: ['queued'] }));
jest.mock('../../../../models/WeeklyLive', () => ({ WeeklyLiveTopic: { findOne: jest.fn() }, WeeklyLiveSignal: {} }));
jest.mock('../chooseSession', () => ({ ...jest.requireActual('../chooseSession'), chooseWithSession: jest.fn() }));

import { resolveBatch } from '../../batchResolver';
import { getPlan } from '../../plans/planStore';
import { WeeklyLiveTopic } from '../../../../models/WeeklyLive';
import { chooseWithSession, roomLink, ROOM_ID, sessionTitle, shortTheme } from '../chooseSession';
import { choose, PlanError } from '../../plans/planService';

const PLAN = { id: 'p1', air_date: '2027-01-04', status: 'ready' };
const TOPIC = { id: 't1', factors: [1, 2, 3], topic_score: 90 };

describe('session title and room', () => {
  it.each([
    ['Agent Skills (build 3 skills)', 'Agent Skills'],
    ['Claude Code Workflows + Automation', 'Claude Code Workflows'],
    ['Capstone + Architect Expo', 'Capstone'],
    ['Governance', 'Governance'],
  ])('short theme of %s', (theme, short) => expect(shortTheme(theme)).toBe(short));

  it('matches the batch\'s existing title format', () => {
    expect(sessionTitle('Your Know-How Is Now a Product', 2)).toBe('Your Know-How Is Now a Product (Week 2 · Agent Skills)');
    expect(sessionTitle('  Stop Doing It Nightly ', 8)).toBe('Stop Doing It Nightly (Week 8 · Claude Code Workflows)');
  });

  it.each([0, 13, 2.5])('refuses week %s', (w) => expect(() => sessionTitle('T', w)).toThrow(RangeError));

  it('uses Ali\'s personal room by default', () => {
    expect(ROOM_ID).toBe('8563379136');
    expect(roomLink()).toBe('https://colaberry.zoom.us/j/8563379136');
  });
});

describe('planService.choose', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (getPlan as jest.Mock).mockResolvedValue(PLAN);
    (WeeklyLiveTopic.findOne as jest.Mock).mockResolvedValue(TOPIC);
  });

  it('refuses a month with no batch before writing anything', async () => {
    (resolveBatch as jest.Mock).mockResolvedValue({ ok: false, status: 409, error: 'No cohort named "Cohort - January 2027".', cohortName: 'Cohort - January 2027' });
    await expect(choose('p1', 't1', false)).rejects.toMatchObject({ status: 409, code: 'no_batch' });
    expect(chooseWithSession).not.toHaveBeenCalled();
  });

  it('returns the session and passes the batch of the air month', async () => {
    (resolveBatch as jest.Mock).mockResolvedValue({ ok: true, cohortId: 'c-jan', cohortName: 'Cohort - January 2027' });
    (chooseWithSession as jest.Mock).mockResolvedValue({ sessionId: 's1', title: 'T (Week 3 · Claude API)', origin: 'created', created: true });
    await expect(choose('p1', 't1', false)).resolves.toMatchObject({ sessionId: 's1', created: true });
    expect(resolveBatch).toHaveBeenCalledWith('2027-01-04');
    expect((chooseWithSession as jest.Mock).mock.calls[0].slice(0, 3)).toEqual(['p1', 't1', 'c-jan']);
  });

  it('reports a plan that moved on as a 409', async () => {
    (resolveBatch as jest.Mock).mockResolvedValue({ ok: true, cohortId: 'c-jan', cohortName: 'Cohort - January 2027' });
    (chooseWithSession as jest.Mock).mockResolvedValue(null);
    const err = await choose('p1', 't1', false).catch((e) => e);
    expect(err).toBeInstanceOf(PlanError);
    expect(err).toMatchObject({ status: 409, code: 'changed' });
  });

  it('keeps the gate: a topic under 85 needs the override', async () => {
    (WeeklyLiveTopic.findOne as jest.Mock).mockResolvedValue({ ...TOPIC, topic_score: 80 });
    await expect(choose('p1', 't1', false)).rejects.toMatchObject({ code: 'needs_override' });
    expect(resolveBatch).not.toHaveBeenCalled();
  });
});
