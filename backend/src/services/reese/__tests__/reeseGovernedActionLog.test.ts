/**
 * reeseGovernedActionLog — a held action has to leave a record, and recording it
 * must never be able to break the thing it is describing.
 *
 * The interesting cases are not the happy path. They are: does the row say
 * HELD BY POLICY rather than "errored" or "nothing to do"; does a second
 * evaluation of the same held unit stay one row; and does a log layer that is
 * completely down still let the caller return normally.
 */
jest.mock('../../../models/AiAgentActivityLog', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));
jest.mock('../../agentBlueprint/agentActivityLogService', () => ({ logAgentActivity: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseAgentId: jest.fn() }));

import AiAgentActivityLog from '../../../models/AiAgentActivityLog';
import { logAgentActivity } from '../../agentBlueprint/agentActivityLogService';
import { getReeseAgentId } from '../reeseIdentitySeed';
import { recordHeldAction, recordSentAction, heldActionReason } from '../reeseGovernedActionLog';

const mockFindOne = AiAgentActivityLog.findOne as unknown as jest.Mock;
const mockLog = logAgentActivity as unknown as jest.Mock;
const mockAgentId = getReeseAgentId as unknown as jest.Mock;

const REESE = '99999999-9999-4999-8999-999999999999';
const EVENT = '11111111-1111-4111-8111-111111111111';
const DECISION = '22222222-2222-4222-8222-222222222222';

const held = (over: Record<string, any> = {}) => ({
  action: 'reese_ticket_followup',
  riskTier: 'R3',
  verdict: 'would_require_approval',
  reasonCode: 'risk_tier_requires_approval',
  unitKey: 'ticket_follow_up:abc:attempt:1',
  eventId: EVENT,
  decisionId: DECISION,
  details: { ticket_id: 'tkt-1' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockAgentId.mockResolvedValue(REESE);
  mockFindOne.mockResolvedValue(null);
  mockLog.mockResolvedValue(undefined);
});

afterEach(() => {
  (console.warn as unknown as jest.Mock).mockRestore?.();
});

describe('a held action is recorded as held', () => {
  it('writes exactly one skipped row naming the verdict, the action and the risk tier', async () => {
    const outcome = await recordHeldAction(held());

    expect(outcome).toBe('written');
    expect(mockLog).toHaveBeenCalledTimes(1);

    const row = mockLog.mock.calls[0][0];
    expect(row.result).toBe('skipped');
    expect(row.action).toBe('reese_ticket_followup');
    // The three facts the reason must carry, so a reader of the table alone
    // can tell policy from error.
    expect(row.reason).toContain('verdict=would_require_approval');
    expect(row.reason).toContain('action=reese_ticket_followup');
    expect(row.reason).toContain('risk_tier=R3');
  });

  it('distinguishes held-by-policy from errored and from nothing-to-do', async () => {
    await recordHeldAction(held());
    const row = mockLog.mock.calls[0][0];

    // Not 'failed' — nothing errored. Not absent — something DID happen.
    expect(row.result).toBe('skipped');
    expect(row.reason.startsWith('held_by_policy')).toBe(true);
    expect(row.details.held_by).toBe('authorization');
  });

  it('carries the approval correlation so the row joins to its approval_requests row', async () => {
    await recordHeldAction(held());
    const row = mockLog.mock.calls[0][0];

    expect(row.traceId).toBe(EVENT);
    expect(row.details.event_id).toBe(EVENT);
    expect(row.details.authorization_decision_id).toBe(DECISION);
  });

  it('keeps domain context but never lets it shadow the governance verdict', async () => {
    await recordHeldAction(held({ details: { ticket_id: 'tkt-1', verdict: 'spoofed', held_by: 'spoofed' } }));
    const row = mockLog.mock.calls[0][0];

    expect(row.details.ticket_id).toBe('tkt-1');
    expect(row.details.verdict).toBe('would_require_approval');
    expect(row.details.held_by).toBe('authorization');
  });

  it('records a hold even when no approval row was created', async () => {
    const outcome = await recordHeldAction(held({ decisionId: null }));

    expect(outcome).toBe('written');
    expect(mockLog.mock.calls[0][0].details.authorization_decision_id).toBeNull();
  });
});

describe('the same held unit does not pile up rows', () => {
  it('writes once for one unit of work and dedupes the second evaluation', async () => {
    // First sweep: nothing on file yet.
    expect(await recordHeldAction(held())).toBe('written');
    expect(mockLog).toHaveBeenCalledTimes(1);

    // Second sweep, same held unit — the row written above is now on file.
    mockFindOne.mockResolvedValue({ id: 'existing-row' });
    expect(await recordHeldAction(held())).toBe('deduped');
    expect(mockLog).toHaveBeenCalledTimes(1);
  });

  it('looks the existing row up by the held unit, not merely by action', async () => {
    await recordHeldAction(held());

    const where = mockFindOne.mock.calls[0][0].where;
    expect(where.agent_id).toBe(REESE);
    expect(where.action).toBe('reese_ticket_followup');
    expect(where.result).toBe('skipped');
    expect(where.reason).toContain('unit=ticket_follow_up:abc:attempt:1');
  });

  it('treats a genuinely new attempt as its own unit', async () => {
    const attempt1 = heldActionReason(held({ unitKey: 'ticket_follow_up:abc:attempt:1' }));
    const attempt2 = heldActionReason(held({ unitKey: 'ticket_follow_up:abc:attempt:2' }));

    expect(attempt1).not.toEqual(attempt2);
  });

  it('derives the dedup key purely from the unit, so two runs agree', async () => {
    // Same unit, different correlation ids (a fresh eventId is generated per
    // evaluation) — the dedup key must not drift with them.
    expect(heldActionReason(held({ eventId: 'a' }))).toEqual(heldActionReason(held({ eventId: 'b' })));
  });
});

describe('a successful action is still recorded as success', () => {
  it('writes success and never skipped', async () => {
    const outcome = await recordSentAction({
      action: 'reese_welcome_student', riskTier: 'R3', reason: 'welcome_sent', eventId: EVENT,
    });

    expect(outcome).toBe('written');
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls[0][0].result).toBe('success');
    expect(mockLog.mock.calls[0][0].reason).not.toContain('held_by_policy');
  });

  it('does not dedupe real sends — each one is its own event', async () => {
    const input = { action: 'reese_outreach_followup', riskTier: 'R3', reason: 'sent', eventId: EVENT };
    await recordSentAction(input);
    await recordSentAction(input);

    expect(mockLog).toHaveBeenCalledTimes(2);
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});

describe('a log layer that is down cannot break the caller', () => {
  it('resolves instead of throwing when the dedup read fails', async () => {
    mockFindOne.mockRejectedValue(Object.assign(new Error('db gone'), { code: 'ECONNREFUSED' }));

    await expect(recordHeldAction(held())).resolves.toBe('log_unavailable');
  });

  it('resolves instead of throwing when the write itself fails', async () => {
    mockLog.mockRejectedValue(new Error('insert failed'));

    await expect(recordHeldAction(held())).resolves.toBe('log_unavailable');
  });

  it('resolves instead of throwing when the agent identity lookup fails', async () => {
    mockAgentId.mockRejectedValue(new Error('no db'));

    await expect(recordHeldAction(held())).resolves.toBe('log_unavailable');
    await expect(recordSentAction({ action: 'a', riskTier: 'R3', reason: 'r', eventId: EVENT }))
      .resolves.toBe('log_unavailable');
  });

  it('says so out loud rather than swallowing the failure', async () => {
    mockFindOne.mockRejectedValue(Object.assign(new Error('db gone'), { code: 'ECONNREFUSED' }));
    await recordHeldAction(held());

    const line = JSON.parse((console.warn as unknown as jest.Mock).mock.calls[0][0]);
    expect(line.event).toBe('held_action_log_failed');
    // A real classification, never the bare string 'Error'.
    expect(line.error_class).toBe('UpstreamUnavailable');
  });

  it('NEVER REJECTS, even if reading the input itself throws', async () => {
    // An adversarial grader proved the original shape could reject: heldActionReason(input) sat
    // OUTSIDE the try, so a property whose getter throws escaped the function entirely. That
    // matters because of what is built on top of it - processDueReeseTicketFollowUps loops over
    // tickets with no per-iteration catch, so one throw here abandons every remaining ticket in
    // the sweep, and the welcome path awaits this inside a try whose catch records
    // outcome: 'failed', so a throw would mark a SENT welcome as failed.
    //
    // Not reachable from today's five call sites, which all pass plain primitives. Pinned anyway,
    // because "unreachable as long as every caller stays careful" is not a contract.
    const hostile = held();
    Object.defineProperty(hostile, 'verdict', {
      get() { throw new Error('exploding getter'); },
      enumerable: true,
    });

    await expect(recordHeldAction(hostile)).resolves.toBe('log_unavailable');
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('reports an unseeded agent row rather than pretending it wrote', async () => {
    mockAgentId.mockResolvedValue(null);

    await expect(recordHeldAction(held())).resolves.toBe('no_agent');
    expect(mockLog).not.toHaveBeenCalled();
  });
});
