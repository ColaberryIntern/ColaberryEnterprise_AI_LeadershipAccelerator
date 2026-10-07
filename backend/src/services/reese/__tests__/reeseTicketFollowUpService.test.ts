/**
 * Reese ticket follow-up — the sweep + decision tree. Covers every branch:
 * not eligible (student spoke last / no messages / wrong entity type), too
 * recent (quiet but under threshold), already escalated (never resumes),
 * at attempt cap (escalate), under daily cap (send), at daily cap (defer,
 * checked in both real and dry-run mode), and the authorization-held path
 * for both send and escalate. Dry-run is proven to make zero real writes/sends.
 */
jest.mock('../../../models/Ticket', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/ReeseTicketFollowUp', () => ({ findOne: jest.fn(), findOrCreate: jest.fn(), create: jest.fn(), count: jest.fn() }));
jest.mock('../../ticketService', () => ({ addTicketComment: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseAdminUserId: jest.fn(), getReeseEnrollmentId: jest.fn() }));
jest.mock('../reeseTicketFollowUpMessageService', () => ({ generateTicketFollowUpMessage: jest.fn() }));
jest.mock('../reeseInitiateDmService', () => ({ initiateDm: jest.fn() }));
jest.mock('../reeseAutonomousOutreachService', () => ({ RISK_TIER: 'R3' }));
jest.mock('../../workLedger/agentActionAuthorizationBridge', () => ({ authorizeTicketDispatch: jest.fn() }));
jest.mock('../reeseWorkLedgerEvents', () => ({ emitReeseLedgerEvent: jest.fn() }));
jest.mock('../reeseGovernedActionLog', () => ({ recordHeldAction: jest.fn(), recordSentAction: jest.fn() }));

import Ticket from '../../../models/Ticket';
import RoomMessage from '../../../models/RoomMessage';
import ReeseTicketFollowUp from '../../../models/ReeseTicketFollowUp';
import { addTicketComment } from '../../ticketService';
import { getReeseAdminUserId, getReeseEnrollmentId } from '../reeseIdentitySeed';
import { generateTicketFollowUpMessage } from '../reeseTicketFollowUpMessageService';
import { initiateDm } from '../reeseInitiateDmService';
import { authorizeTicketDispatch } from '../../workLedger/agentActionAuthorizationBridge';
import { emitReeseLedgerEvent } from '../reeseWorkLedgerEvents';
import { recordHeldAction, recordSentAction } from '../reeseGovernedActionLog';
import { processDueReeseTicketFollowUps } from '../reeseTicketFollowUpService';

const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockRoomMessageFindOne = RoomMessage.findOne as unknown as jest.Mock;
const mockFollowUpFindOne = ReeseTicketFollowUp.findOne as unknown as jest.Mock;
const mockFollowUpFindOrCreate = ReeseTicketFollowUp.findOrCreate as unknown as jest.Mock;
const mockFollowUpCreate = ReeseTicketFollowUp.create as unknown as jest.Mock;
const mockFollowUpCount = ReeseTicketFollowUp.count as unknown as jest.Mock;
const mockAddTicketComment = addTicketComment as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;
const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockGenerateMessage = generateTicketFollowUpMessage as unknown as jest.Mock;
const mockInitiateDm = initiateDm as unknown as jest.Mock;
const mockAuthorizeTicketDispatch = authorizeTicketDispatch as unknown as jest.Mock;
const mockEmitReeseLedgerEvent = emitReeseLedgerEvent as unknown as jest.Mock;
const mockRecordHeldAction = recordHeldAction as unknown as jest.Mock;
const mockRecordSentAction = recordSentAction as unknown as jest.Mock;

const REESE_ADMIN_ID = 'reese-admin-1';
const REESE_ID = 'reese-enrollment-1';
const STUDENT_ID = 'student-enrollment-1';
const ROOM_ID = 'room-1';
const TICKET_ID = 'ticket-1';

function makeTicket(overrides: Record<string, any> = {}) {
  return {
    id: TICKET_ID, title: 'Student support — DM conversation (Gwendolyn)',
    type: 'student_support', entity_type: 'community_room', entity_id: ROOM_ID,
    assigned_to_type: 'ai_staff', assigned_to_id: REESE_ADMIN_ID, status: 'backlog',
    ...overrides,
  };
}

const NOW = new Date('2026-10-02T12:00:00Z');
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function makeFollowUpRow(overrides: Record<string, any> = {}) {
  return {
    id: 'followup-1', ticket_id: TICKET_ID, room_id: ROOM_ID, student_enrollment_id: STUDENT_ID,
    attempt_count: 0, status: 'active', last_followup_at: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  jest.clearAllMocks();
  mockGetReeseAdminUserId.mockResolvedValue(REESE_ADMIN_ID);
  mockGetReeseEnrollmentId.mockResolvedValue(REESE_ID);
  mockTicketFindAll.mockResolvedValue([makeTicket()]);
  mockRoomMessageFindOne.mockResolvedValue({ enrollment_id: REESE_ID, created_at: daysAgo(4) });
  mockFollowUpFindOne.mockResolvedValue(null);
  mockFollowUpCount.mockResolvedValue(0);
  mockFollowUpFindOrCreate.mockResolvedValue([makeFollowUpRow(), true]);
  mockFollowUpCreate.mockResolvedValue(makeFollowUpRow());
  mockGenerateMessage.mockResolvedValue('A real, grounded check-in message.');
  mockInitiateDm.mockResolvedValue({ roomId: ROOM_ID, messageId: 'msg-1' });
  mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: null, verdict: 'would_allow', reason: 'ok', allowed: true });
  mockAddTicketComment.mockResolvedValue(undefined);
  mockEmitReeseLedgerEvent.mockResolvedValue(undefined);
  mockRecordHeldAction.mockResolvedValue('written');
  mockRecordSentAction.mockResolvedValue('written');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('processDueReeseTicketFollowUps — eligibility', () => {
  it('eligible: Reese spoke last, quiet >= 3 days -> sends a real, grounded check-in', async () => {
    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'sent' }]);
    expect(mockGenerateMessage).toHaveBeenCalledWith(expect.objectContaining({ roomId: ROOM_ID, studentEnrollmentId: STUDENT_ID, quietDays: 4 }));
    expect(mockInitiateDm).toHaveBeenCalledWith(STUDENT_ID, 'A real, grounded check-in message.');
    expect(mockAddTicketComment).toHaveBeenCalledWith(TICKET_ID, expect.stringContaining('quiet'), 'ai_staff', REESE_ADMIN_ID);
    expect(mockEmitReeseLedgerEvent).toHaveBeenCalledWith(expect.objectContaining({ intent: 'reese.ticket_follow_up', targetId: TICKET_ID }));
    // Approval-correlation fix (2026-10-02) — the ledger event's real eventId
    // (not traceId) matches the authorization check's own eventId exactly —
    // the exact bug this file itself introduced earlier today, now fixed.
    const [authArgs] = mockAuthorizeTicketDispatch.mock.calls[0];
    const [ledgerArgs] = mockEmitReeseLedgerEvent.mock.calls[0];
    expect(ledgerArgs.eventId).toBe(authArgs.eventId);
    expect(ledgerArgs.traceId).not.toBe(authArgs.eventId);
  });

  it('not eligible: the student spoke last -> never sends (Reese already owes a reply via the normal reactive path)', async () => {
    mockRoomMessageFindOne.mockResolvedValue({ enrollment_id: STUDENT_ID, created_at: daysAgo(4) });

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'not_eligible' }]);
    expect(mockGenerateMessage).not.toHaveBeenCalled();
  });

  it('not eligible: no messages at all in the room', async () => {
    mockRoomMessageFindOne.mockResolvedValue(null);

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'not_eligible' }]);
  });

  it('not eligible: ticket is not backed by a community_room (honest skip, never guessed)', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket({ entity_type: 'other', entity_id: 'whatever' })]);

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'not_eligible' }]);
    expect(mockRoomMessageFindOne).not.toHaveBeenCalled();
  });

  it('too recent: Reese spoke last but under the 3-day threshold', async () => {
    mockRoomMessageFindOne.mockResolvedValue({ enrollment_id: REESE_ID, created_at: daysAgo(1) });

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'too_recent' }]);
    expect(mockGenerateMessage).not.toHaveBeenCalled();
  });

  it('boundary: identity not seeded yet -> honest no-op, zero evaluated', async () => {
    mockGetReeseAdminUserId.mockResolvedValue(null);

    const result = await processDueReeseTicketFollowUps(false);

    expect(result).toEqual({ dryRun: false, evaluated: 0, sent: 0, escalated: 0, dailyCapDeferred: 0, heldForApproval: 0, decisions: [] });
    expect(mockTicketFindAll).not.toHaveBeenCalled();
  });
});

describe('processDueReeseTicketFollowUps — attempt cap + escalation', () => {
  it('already escalated: never resumes messaging on its own', async () => {
    mockFollowUpFindOne.mockResolvedValue(makeFollowUpRow({ status: 'escalated', attempt_count: 3 }));

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'already_escalated' }]);
    expect(mockGenerateMessage).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
  });

  it('at cap (attempt_count >= 3): escalates to a human instead of sending a 4th message', async () => {
    const row = makeFollowUpRow({ attempt_count: 3 });
    mockFollowUpFindOne.mockResolvedValue(row);

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'escalated' }]);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'escalated' }));
    expect(mockAddTicketComment).toHaveBeenCalledWith(TICKET_ID, expect.stringContaining('3-attempt follow-up cap'), 'ai_staff', REESE_ADMIN_ID);
    // Approval-correlation fix (2026-10-02) — same correlation check on the
    // escalation path's own ledger write.
    const [authArgs] = mockAuthorizeTicketDispatch.mock.calls[0];
    const [ledgerArgs] = mockEmitReeseLedgerEvent.mock.calls[0];
    expect(ledgerArgs.eventId).toBe(authArgs.eventId);
    expect(ledgerArgs.traceId).not.toBe(authArgs.eventId);
  });

  it('escalation held by authorization: never falsely reports escalated', async () => {
    mockFollowUpFindOne.mockResolvedValue(makeFollowUpRow({ attempt_count: 3 }));
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'd1', verdict: 'would_require_approval', reason: 'held', allowed: false });

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'held_for_approval' }]);
    expect(mockAddTicketComment).not.toHaveBeenCalled();
  });

  it('records a held escalation too — the path that previously left no record at all', async () => {
    mockFollowUpFindOne.mockResolvedValue(makeFollowUpRow({ attempt_count: 3 }));
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'd1', verdict: 'would_require_approval', reason: 'held', allowed: false });

    await processDueReeseTicketFollowUps(false);

    expect(mockRecordHeldAction).toHaveBeenCalledTimes(1);
    expect(mockRecordHeldAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'reese_ticket_followup_escalated',
      riskTier: 'R3',
      verdict: 'would_require_approval',
      unitKey: 'ticket_follow_up:followup-1:escalate',
    }));
  });

  it('a real escalation is still recorded as success', async () => {
    mockFollowUpFindOne.mockResolvedValue(makeFollowUpRow({ attempt_count: 3 }));

    await processDueReeseTicketFollowUps(false);

    expect(mockRecordHeldAction).not.toHaveBeenCalled();
    expect(mockRecordSentAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'reese_ticket_followup_escalated',
    }));
  });
});

describe('processDueReeseTicketFollowUps — daily cap', () => {
  it('under cap: sends normally', async () => {
    mockFollowUpCount.mockResolvedValue(9);

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'sent' }]);
  });

  it('at cap: defers rather than sending, even though otherwise eligible', async () => {
    mockFollowUpCount.mockResolvedValue(10);

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'daily_cap_deferred' }]);
    expect(mockGenerateMessage).not.toHaveBeenCalled();
  });

  it('dry-run honestly reports a cap deferral too — not a false "would send"', async () => {
    mockFollowUpCount.mockResolvedValue(10);

    const result = await processDueReeseTicketFollowUps(true);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'daily_cap_deferred' }]);
  });
});

describe('processDueReeseTicketFollowUps — send held by authorization', () => {
  it('held verdict: never sends, never falsely reports success', async () => {
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'd1', verdict: 'would_require_approval', reason: 'held', allowed: false });

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'held_for_approval' }]);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(mockAddTicketComment).not.toHaveBeenCalled();
  });

  it('records the hold as a skipped activity row instead of leaving no trace', async () => {
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'd1', verdict: 'would_require_approval', reason: 'held', allowed: false });

    await processDueReeseTicketFollowUps(false);

    expect(mockRecordHeldAction).toHaveBeenCalledTimes(1);
    expect(mockRecordHeldAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'reese_ticket_followup',
      riskTier: 'R3',
      verdict: 'would_require_approval',
      reasonCode: 'held',
      decisionId: 'd1',
      // Keyed on the attempt that was held, which a hold leaves unbumped.
      unitKey: 'ticket_follow_up:followup-1:attempt:1',
    }));
    // Never recorded as a send.
    expect(mockRecordSentAction).not.toHaveBeenCalled();
  });

  it('correlates the held row to the same authorization decision it logs', async () => {
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'd1', verdict: 'would_require_approval', reason: 'held', allowed: false });

    await processDueReeseTicketFollowUps(false);

    const [authArgs] = mockAuthorizeTicketDispatch.mock.calls[0];
    expect(mockRecordHeldAction.mock.calls[0][0].eventId).toBe(authArgs.eventId);
  });

  it('a log layer that is down still leaves the hold a clean hold', async () => {
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'd1', verdict: 'would_require_approval', reason: 'held', allowed: false });
    mockRecordHeldAction.mockResolvedValue('log_unavailable');

    const result = await processDueReeseTicketFollowUps(false);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'held_for_approval' }]);
    expect(mockInitiateDm).not.toHaveBeenCalled();
  });

  it('a real send is still recorded as success, never as skipped', async () => {
    await processDueReeseTicketFollowUps(false);

    expect(mockRecordHeldAction).not.toHaveBeenCalled();
    expect(mockRecordSentAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'reese_ticket_followup',
      reason: 'follow_up_attempt_1_sent',
    }));
  });
});

describe('processDueReeseTicketFollowUps — dry run makes ZERO real writes/sends', () => {
  it('an otherwise-eligible, under-cap ticket is reported as "sent" without ever calling the real send/write functions', async () => {
    const result = await processDueReeseTicketFollowUps(true);

    expect(result.dryRun).toBe(true);
    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'sent' }]);
    expect(mockGenerateMessage).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(mockAddTicketComment).not.toHaveBeenCalled();
    expect(mockFollowUpCreate).not.toHaveBeenCalled();
    expect(mockFollowUpFindOrCreate).not.toHaveBeenCalled();
    // Dry run must not write activity rows either — a simulated send is not a
    // send and a simulated hold is not a hold.
    expect(mockRecordSentAction).not.toHaveBeenCalled();
    expect(mockRecordHeldAction).not.toHaveBeenCalled();
  });

  it('an at-cap ticket is reported as "escalated" in dry-run without ever writing the real escalation', async () => {
    mockFollowUpFindOne.mockResolvedValue(makeFollowUpRow({ attempt_count: 3 }));

    const result = await processDueReeseTicketFollowUps(true);

    expect(result.decisions).toEqual([{ ticketId: TICKET_ID, branch: 'escalated' }]);
    expect(mockAddTicketComment).not.toHaveBeenCalled();
    expect(mockAuthorizeTicketDispatch).not.toHaveBeenCalled();
  });
});
