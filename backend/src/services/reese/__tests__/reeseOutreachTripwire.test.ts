/**
 * reeseOutreachTripwire: the send-time backstop for Reese's autonomous outreach.
 *
 * Incident it exists for: 7 Oct to 12 Nov 2026, 851 timeout-approved DMs to 52 students, one student 37 times.
 * Every test here is about ONE thing: when something upstream lets a repeat or a flood through, the message is
 * blocked, Reese is switched off exactly once, and an admin is told. No test sends anything real.
 */
import ApprovalRequest from '../../../models/ApprovalRequest';
import ReeseOutreach from '../../../models/ReeseOutreach';
import AiAgent from '../../../models/AiAgent';
import { emitAlert } from '../../alertService';
import { deliverAlert } from '../../alertDeliveryService';
import {
  checkOutreachReplay,
  tripReeseOutreach,
  REESE_SWEEP_AGENT,
  TRIPWIRE_DAILY_CEILING,
  TRIPWIRE_STUDENT_WINDOW_DAYS,
} from '../reeseOutreachTripwire';

jest.mock('../../../models/ApprovalRequest', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../../models/ReeseOutreach', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../../models/AiAgent', () => ({ __esModule: true, default: { findOne: jest.fn(), update: jest.fn() } }));
jest.mock('../../alertService', () => ({ emitAlert: jest.fn() }));
jest.mock('../../alertDeliveryService', () => ({ deliverAlert: jest.fn() }));

const approvalCount = ApprovalRequest.count as unknown as jest.Mock;
const outreachCount = ReeseOutreach.count as unknown as jest.Mock;
const agentFind = AiAgent.findOne as unknown as jest.Mock;
const agentUpdate = AiAgent.update as unknown as jest.Mock;
const mockEmit = emitAlert as unknown as jest.Mock;
const mockDeliver = deliverAlert as unknown as jest.Mock;

const NOW = new Date('2026-11-20T19:15:00Z');

/**
 * Counts are asked in a fixed order: per-student (approvals, then direct), then today (approvals, then direct).
 * Each argument is that query's answer.
 */
function counts(studentReplayed: number, studentDirect: number, todayReplayed = 0, todayDirect = 0) {
  approvalCount.mockResolvedValueOnce(studentReplayed).mockResolvedValueOnce(todayReplayed);
  outreachCount.mockResolvedValueOnce(studentDirect).mockResolvedValueOnce(todayDirect);
}

beforeEach(() => {
  jest.clearAllMocks();
  approvalCount.mockReset();
  outreachCount.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  agentFind.mockResolvedValue({ id: 'agent-1', enabled: true });
  agentUpdate.mockResolvedValue([1]);
  mockEmit.mockResolvedValue({ id: 'alert-1' });
  mockDeliver.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('happy path', () => {
  it('a first message to a student on a quiet day is allowed, and nothing is switched off', async () => {
    counts(0, 0, 3, 0);
    await expect(checkOutreachReplay('a1', 'e1', NOW)).resolves.toEqual({ allowed: true });
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('the twelfth message of the day is allowed (11 already out)', async () => {
    counts(0, 0, TRIPWIRE_DAILY_CEILING - 1, 0);
    await expect(checkOutreachReplay('a1', 'e1', NOW)).resolves.toEqual({ allowed: true });
  });
});

describe('rule 1: off means off', () => {
  it('blocks every held message while the sweep is switched off, without re-tripping or alerting', async () => {
    agentFind.mockResolvedValue({ id: 'agent-1', enabled: false });
    const v = await checkOutreachReplay('a1', 'e1', NOW);
    expect(v).toMatchObject({ allowed: false, reason: 'sweep_disabled', tripped: false });
    expect(approvalCount).not.toHaveBeenCalled();
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('treats a missing registry row as off', async () => {
    agentFind.mockResolvedValue(null);
    await expect(checkOutreachReplay('a1', 'e1', NOW)).resolves.toMatchObject({ allowed: false, reason: 'sweep_disabled' });
  });
});

describe('rule 2: no repeats to one student', () => {
  it('a previous replayed message in the window blocks the send and switches Reese off', async () => {
    counts(1, 0);
    const v = await checkOutreachReplay('a1', 'e1', NOW);
    expect(v).toMatchObject({ allowed: false, reason: 'student_already_messaged', tripped: true });
    expect(agentUpdate).toHaveBeenCalledWith(
      { enabled: false },
      { where: { agent_name: REESE_SWEEP_AGENT, enabled: true } },
    );
  });

  it('a previous DIRECT send (not a replay) counts too', async () => {
    counts(0, 1);
    await expect(checkOutreachReplay('a1', 'e1', NOW)).resolves.toMatchObject({ reason: 'student_already_messaged' });
  });

  it('looks back exactly the window, and excludes the row being sent', async () => {
    counts(0, 0);
    await checkOutreachReplay('a1', 'e1', NOW);
    const where = approvalCount.mock.calls[0][0].where;
    const since = NOW.getTime() - TRIPWIRE_STUDENT_WINDOW_DAYS * 86400000;
    const sym = Object.getOwnPropertySymbols(where.replayed_at)[0];
    expect((where.replayed_at[sym] as Date).getTime()).toBe(since);
    const neSym = Object.getOwnPropertySymbols(where.id)[0];
    expect(where.id[neSym]).toBe('a1');
  });

  it('the window is shorter than the sweep cadence, so a correct weekly repeat never trips it', () => {
    // Sweep cadence is 7 days measured from hold creation; a replay lands ~4h after its hold.
    expect(TRIPWIRE_STUDENT_WINDOW_DAYS).toBeLessThan(7);
  });
});

describe('rule 3: daily ceiling', () => {
  it('the thirteenth message of the day is blocked and switches Reese off', async () => {
    counts(0, 0, 10, 2);
    const v = await checkOutreachReplay('a1', 'e1', NOW);
    expect(v).toMatchObject({ allowed: false, reason: 'daily_ceiling_reached', tripped: true });
  });

  it('counts from midnight UTC', async () => {
    counts(0, 0, 0, 0);
    await checkOutreachReplay('a1', 'e1', NOW);
    const where = approvalCount.mock.calls[1][0].where;
    const sym = Object.getOwnPropertySymbols(where.replayed_at)[0];
    expect((where.replayed_at[sym] as Date).toISOString()).toBe('2026-11-20T00:00:00.000Z');
  });
});

describe('tripping', () => {
  it('alerts the admins by email exactly when it flips the switch', async () => {
    await expect(tripReeseOutreach('daily_ceiling_reached', { x: 1 })).resolves.toBe(true);
    expect(mockEmit).toHaveBeenCalledWith(expect.objectContaining({ type: 'critical', severity: 5 }));
    expect(mockDeliver).toHaveBeenCalledWith({ id: 'alert-1' }, ['email']);
  });

  it('is idempotent: when the switch was already off, no second alert (a batch of blocked rows = one email)', async () => {
    agentUpdate.mockResolvedValue([0]);
    await expect(tripReeseOutreach('daily_ceiling_reached', {})).resolves.toBe(false);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('a failed alert never undoes the switch-off and never throws', async () => {
    mockEmit.mockRejectedValue(new Error('smtp down'));
    await expect(tripReeseOutreach('student_already_messaged', {})).resolves.toBe(true);
    expect(agentUpdate).toHaveBeenCalled();
  });

  it('never turns Reese back on', async () => {
    counts(0, 0, 0, 0);
    await checkOutreachReplay('a1', 'e1', NOW);
    for (const call of agentUpdate.mock.calls) expect(call[0].enabled).not.toBe(true);
  });
});

describe('failure path', () => {
  it('a database error while checking propagates (the caller must not send)', async () => {
    approvalCount.mockRejectedValueOnce(new Error('db down'));
    outreachCount.mockResolvedValue(0);
    await expect(checkOutreachReplay('a1', 'e1', NOW)).rejects.toThrow('db down');
  });
});
