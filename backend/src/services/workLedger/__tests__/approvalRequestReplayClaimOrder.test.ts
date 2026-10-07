/**
 * approvalRequestReplayService — the CLAIM ORDER.
 *
 * The defect this file exists to hold shut: the service used to stamp
 * `replayed_at` BEFORE deciding whether it could perform the action, and the
 * claim predicate is `WHERE replayed_at IS NULL`, so a row that then fell
 * through to the unrecognized-action branch was claimed forever and recorded as
 * replayed having done nothing. 106 production rows were filed that way.
 *
 * The invariant asserted throughout: `ApprovalRequest.update` is called if and
 * only if the service is about to actually perform the send. No performable
 * row, no claim.
 *
 * Hard stop, same as the sibling suite in src/__tests__/services/workLedger/:
 * initiateDm is ALWAYS mocked. No test here may call a real send.
 */
import { ApprovalRequest } from '../../../models';
import { initiateDm } from '../../reese/reeseInitiateDmService';
import {
  replayApprovedAction,
  canReplayAction,
  REPLAYABLE_ACTIONS,
} from '../approvalRequestReplayService';

jest.mock('../../../models', () => ({
  ApprovalRequest: { update: jest.fn() },
}));
jest.mock('../../reese/reeseInitiateDmService', () => ({
  initiateDm: jest.fn(),
}));

const mockUpdate = ApprovalRequest.update as unknown as jest.Mock;
const mockInitiateDm = initiateDm as unknown as jest.Mock;

/** Every side effect, in the order it actually happened. */
let order: string[];
let errorLines: string[];

function row(overrides: Record<string, any> = {}) {
  return {
    id: 'approval-1',
    agent_name: 'Reese',
    action: 'reese_autonomous_outreach',
    prepared_action: { studentEnrollmentId: 'enrollment-1', content: 'Hi!' },
    ...overrides,
  } as any;
}

/** The five action types measured in production on 2026-10-06, all dropped. */
const DROPPED_IN_PRODUCTION = [
  'reese_ticket_followup',
  'reese_outreach_followup',
  'reese_outreach_escalated',
  'reese_welcome_student',
  'reese_welcome_account',
];

beforeEach(() => {
  jest.clearAllMocks();
  order = [];
  errorLines = [];
  jest.spyOn(console, 'error').mockImplementation((line?: any) => {
    errorLines.push(String(line));
  });
  mockUpdate.mockImplementation(async () => {
    order.push('claim');
    return [1];
  });
  mockInitiateDm.mockImplementation(async () => {
    order.push('send');
    return { roomId: 'room-1', messageId: 'msg-1' };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('happy path — a replayable action still replays exactly as before', () => {
  it('claims the row, then sends, with the exact prepared_action params', async () => {
    const result = await replayApprovedAction(row());

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      { replayed_at: expect.any(Date) },
      { where: { id: 'approval-1', replayed_at: null } },
    );
    expect(mockInitiateDm).toHaveBeenCalledWith('enrollment-1', 'Hi!');
    expect(result).toEqual({ replayed: true, reason: 'replayed' });
  });

  it('the claim strictly precedes the send — the compare-and-set is still the last gate', async () => {
    await replayApprovedAction(row());
    expect(order).toEqual(['claim', 'send']);
  });

  it('logs nothing at error level when the row is performable', async () => {
    await replayApprovedAction(row());
    expect(errorLines).toEqual([]);
  });
});

describe('failure path — an action this service cannot perform', () => {
  it('leaves replayed_at NULL: the row is NEVER claimed, so it stays outstanding work', async () => {
    const result = await replayApprovedAction(row({ action: 'reese_ticket_followup' }));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(order).toEqual([]);
    expect(result).toEqual({ replayed: false, reason: 'unrecognized_action_type' });
  });

  it('logs loudly and structurally — action, row id, and an error_class from classifyError', async () => {
    await replayApprovedAction(row({ action: 'reese_welcome_student', id: 'approval-42' }));

    expect(errorLines).toHaveLength(1);
    const logged = JSON.parse(errorLines[0]);
    expect(logged.level).toBe('error');
    expect(logged.service).toBe('approvalRequestReplayService');
    expect(logged.event).toBe('replay_action_unperformable');
    expect(logged.outcome).toBe('failure');
    expect(logged.error_class).toBe('ContractViolation');
    expect(logged.action).toBe('reese_welcome_student');
    expect(logged.approval_request_id).toBe('approval-42');
    expect(logged.reason).toBe('unrecognized_action_type');
  });

  it('does not throw — one unhandled row must never stop a sweep over many rows', async () => {
    await expect(replayApprovedAction(row({ action: 'something_new' }))).resolves.toEqual({
      replayed: false,
      reason: 'unrecognized_action_type',
    });
  });

  it.each(DROPPED_IN_PRODUCTION)(
    'the production type %s is reported unperformable and claims nothing',
    async (action) => {
      const result = await replayApprovedAction(row({ action }));
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(result.reason).toBe('unrecognized_action_type');
    },
  );
});

describe('boundary cases', () => {
  it('a row already claimed by another worker is reported already_replayed and never sends', async () => {
    mockUpdate.mockImplementation(async () => {
      order.push('claim');
      return [0]; // WHERE replayed_at IS NULL matched nothing — someone else won
    });

    const result = await replayApprovedAction(row());

    expect(order).toEqual(['claim']);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result).toEqual({ replayed: false, reason: 'already_replayed' });
  });

  it('a row with no prepared_action claims nothing and fails honestly', async () => {
    const result = await replayApprovedAction(row({ prepared_action: null }));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result).toEqual({ replayed: false, reason: 'no_prepared_action' });
    expect(JSON.parse(errorLines[0]).error_class).toBe('ValidationError');
  });

  it.each([
    ['missing content', { studentEnrollmentId: 'enrollment-1' }],
    ['missing enrollment', { content: 'Hi!' }],
    ['empty content', { studentEnrollmentId: 'enrollment-1', content: '' }],
    ['empty object', {}],
  ])('a malformed prepared_action (%s) claims nothing and sends nothing', async (_label, prepared) => {
    const result = await replayApprovedAction(row({ prepared_action: prepared }));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result.reason).toBe('no_prepared_action');
  });
});

describe('idempotency — the sweep run twice', () => {
  it('does not double-perform a replayable row: the second pass loses the claim', async () => {
    let claims = 0;
    mockUpdate.mockImplementation(async () => {
      claims += 1;
      order.push('claim');
      return [claims === 1 ? 1 : 0]; // the real conditional UPDATE's behaviour
    });

    const first = await replayApprovedAction(row());
    const second = await replayApprovedAction(row());

    expect(first).toEqual({ replayed: true, reason: 'replayed' });
    expect(second).toEqual({ replayed: false, reason: 'already_replayed' });
    expect(mockInitiateDm).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['claim', 'send', 'claim']);
  });

  it('does not flip an unclaimed row: two passes over an unperformable action still claim nothing', async () => {
    const unperformable = row({ action: 'reese_outreach_followup' });

    const first = await replayApprovedAction(unperformable);
    const second = await replayApprovedAction(unperformable);

    expect(first).toEqual(second);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(errorLines).toHaveLength(2); // reported every pass, never filed as done
  });
});

describe('a real send failure stays loud, and the claim stays claimed', () => {
  it('propagates an initiateDm throw rather than swallowing it into a reason code', async () => {
    mockInitiateDm.mockImplementation(async () => {
      order.push('send');
      throw Object.assign(new Error('reese identity not seeded'), { name: 'ReeseOutreachError' });
    });

    await expect(replayApprovedAction(row())).rejects.toThrow('reese identity not seeded');
  });

  it('does not un-claim the row after a failed send — an unknown outcome must never be retried', async () => {
    mockInitiateDm.mockRejectedValue(new Error('upstream down'));

    await expect(replayApprovedAction(row())).rejects.toThrow('upstream down');

    // Exactly one write, and it is the claim. Nothing resets replayed_at, because
    // a send that threw may still have landed; a retry could double-send.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      { replayed_at: expect.any(Date) },
      { where: { id: 'approval-1', replayed_at: null } },
    );
  });
});

describe('the replayable-action list is the single source of truth', () => {
  it('canReplayAction agrees with REPLAYABLE_ACTIONS', () => {
    for (const action of REPLAYABLE_ACTIONS) {
      expect(canReplayAction(action)).toBe(true);
    }
    expect(canReplayAction('reese_ticket_followup')).toBe(false);
  });

  // A tripwire, not a tautology. Adding any of these five to REPLAYABLE_ACTIONS
  // would make 106 timer-approved R3 actions performable, and every one of them
  // was approved by `system:auto_approve_timeout` with no human in the loop.
  // Whoever adds a handler has to delete this assertion, which is the point: the
  // "is an auto-approve timeout a human in the loop?" decision gets made on
  // purpose rather than arrived at by accident.
  it.each(DROPPED_IN_PRODUCTION)('%s is NOT replayable without a deliberate policy decision', (action) => {
    expect(REPLAYABLE_ACTIONS as readonly string[]).not.toContain(action);
  });
});
