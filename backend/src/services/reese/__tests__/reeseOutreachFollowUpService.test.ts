/**
 * Reese Phase 2 — follow-up + closure loop. Covers all 4 branches of the
 * decision tree the task brief requires (signal-cleared closes with evidence,
 * reply-detected closes with evidence, under-cap sends one more follow-up,
 * at-cap escalates without a 4th send or an auto-close), plus the daily-cap
 * deferral and idempotent-re-run guarantees.
 */
jest.mock('../../../models/ReeseOutreach', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/RoomMessage', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/CommunityRoom', () => ({ findOne: jest.fn() }));
jest.mock('../../ticketService', () => ({ updateTicketStatus: jest.fn(), addTicketComment: jest.fn() }));
jest.mock('../../evidence/evidenceService', () => ({ recordEvidenceArtifact: jest.fn() }));
jest.mock('../reeseSignalService', () => ({
  evaluateInactivitySignal: jest.fn(),
  evaluateBehaviorAnomalySignal: jest.fn(),
}));
jest.mock('../reeseOutreachMessageService', () => ({ generateOutreachMessage: jest.fn() }));
jest.mock('../reeseInitiateDmService', () => ({ initiateDm: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseAdminUserId: jest.fn(), getReeseEnrollmentId: jest.fn() }));
jest.mock('../reeseAutonomousOutreachService', () => ({
  countAutonomousSendsToday: jest.fn(),
  DAILY_SEND_CAP: 12,
  FOLLOW_UP_DAYS: 7,
}));

import ReeseOutreach from '../../../models/ReeseOutreach';
import RoomMessage from '../../../models/RoomMessage';
import CommunityRoom from '../../../models/CommunityRoom';
import { updateTicketStatus, addTicketComment } from '../../ticketService';
import { recordEvidenceArtifact } from '../../evidence/evidenceService';
import { evaluateInactivitySignal, evaluateBehaviorAnomalySignal } from '../reeseSignalService';
import { generateOutreachMessage } from '../reeseOutreachMessageService';
import { initiateDm } from '../reeseInitiateDmService';
import { getReeseAdminUserId, getReeseEnrollmentId } from '../reeseIdentitySeed';
import { countAutonomousSendsToday } from '../reeseAutonomousOutreachService';
import { processDueReeseOutreachFollowUps } from '../reeseOutreachFollowUpService';

const mockReeseOutreachFindAll = ReeseOutreach.findAll as unknown as jest.Mock;
const mockRoomMessageFindOne = RoomMessage.findOne as unknown as jest.Mock;
const mockCommunityRoomFindOne = CommunityRoom.findOne as unknown as jest.Mock;
const mockUpdateTicketStatus = updateTicketStatus as unknown as jest.Mock;
const mockAddTicketComment = addTicketComment as unknown as jest.Mock;
const mockRecordEvidence = recordEvidenceArtifact as unknown as jest.Mock;
const mockEvaluateInactivity = evaluateInactivitySignal as unknown as jest.Mock;
const mockEvaluateAnomaly = evaluateBehaviorAnomalySignal as unknown as jest.Mock;
const mockGenerateMessage = generateOutreachMessage as unknown as jest.Mock;
const mockInitiateDm = initiateDm as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;
const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockCountAutonomousSendsToday = countAutonomousSendsToday as unknown as jest.Mock;

function makeRow(overrides: Record<string, any> = {}) {
  return {
    id: 'outreach-1',
    enrollment_id: 'student-1',
    ticket_id: 'ticket-1',
    signal_type: 'inactivity',
    signal_snapshot: { daysSinceActive: 9, completionPct: 5 },
    goal: 'Confirm re-engagement within 7 days.',
    status: 'active',
    attempt_count: 1,
    last_contacted_at: new Date('2026-08-01T00:00:00Z'),
    next_follow_up_due_at: new Date('2026-08-08T00:00:00Z'),
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseAdminUserId.mockResolvedValue('reese-admin-1');
  mockGetReeseEnrollmentId.mockResolvedValue('reese-enrollment-1');
  mockCommunityRoomFindOne.mockResolvedValue({ id: 'room-1' });
  mockRoomMessageFindOne.mockResolvedValue(null); // no reply by default
  mockCountAutonomousSendsToday.mockResolvedValue(0);
  mockGenerateMessage.mockResolvedValue('A real unique follow-up message.');
  mockInitiateDm.mockResolvedValue({ roomId: 'room-1', messageId: 'msg-2' });
  mockRecordEvidence.mockResolvedValue({ id: 'evidence-1' });
});

describe('processDueReeseOutreachFollowUps — branch: signal cleared', () => {
  it('closes with real evidence (receipt artifact), sets status signal_cleared, does not send a message', async () => {
    const row = makeRow();
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue(null); // signal no longer fires

    const result = await processDueReeseOutreachFollowUps(false);

    expect(result.signalCleared).toBe(1);
    expect(mockRecordEvidence).toHaveBeenCalledWith(expect.objectContaining({ ticketId: 'ticket-1', artifactType: 'receipt' }));
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith('ticket-1', 'done', 'ai_staff', 'reese-admin-1');
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'signal_cleared' }));
    expect(mockInitiateDm).not.toHaveBeenCalled();
  });
});

describe('processDueReeseOutreachFollowUps — branch: reply detected (goal met)', () => {
  it('closes with real evidence (log artifact referencing the real reply message), sets status goal_met', async () => {
    const row = makeRow();
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 8, completionPct: 5 }); // signal still active
    mockRoomMessageFindOne.mockResolvedValue({ id: 'reply-msg-1', created_at: new Date('2026-08-09T00:00:00Z') });

    const result = await processDueReeseOutreachFollowUps(false);

    expect(result.goalMet).toBe(1);
    expect(mockRecordEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', artifactType: 'log', storageRef: 'reply-msg-1' }),
    );
    expect(mockUpdateTicketStatus).toHaveBeenCalledWith('ticket-1', 'done', 'ai_staff', 'reese-admin-1');
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'goal_met' }));
    expect(mockInitiateDm).not.toHaveBeenCalled();
  });

  it('the reply query is scoped to Reese\'s specific DM room (not any message the student sent anywhere)', async () => {
    const row = makeRow();
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 8, completionPct: 5 });
    mockRoomMessageFindOne.mockResolvedValue({ id: 'reply-msg-1', created_at: new Date() });

    await processDueReeseOutreachFollowUps(false);

    expect(mockCommunityRoomFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: expect.stringContaining('dm-') } }),
    );
    expect(mockRoomMessageFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ room_id: 'room-1', enrollment_id: 'student-1' }) }),
    );
  });
});

describe('processDueReeseOutreachFollowUps — branch: under cap, sends one more follow-up', () => {
  it('sends exactly one more unique message and reschedules, does not escalate or close', async () => {
    const row = makeRow({ attempt_count: 1 }); // 1 of max 3 attempts used
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 14, completionPct: 5 }); // still firing

    const result = await processDueReeseOutreachFollowUps(false);

    expect(result.followUpSent).toBe(1);
    expect(mockInitiateDm).toHaveBeenCalledTimes(1);
    expect(mockInitiateDm).toHaveBeenCalledWith('student-1', 'A real unique follow-up message.');
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ attempt_count: 2 }));
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(mockAddTicketComment).not.toHaveBeenCalled();
  });

  it('the follow-up message generation is told it IS a follow-up, with the correct attempt number', async () => {
    const row = makeRow({ attempt_count: 2 });
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 21, completionPct: 5 });

    await processDueReeseOutreachFollowUps(false);

    expect(mockGenerateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ isFollowUp: true, attemptNumber: 3 }),
    );
  });
});

describe('processDueReeseOutreachFollowUps — branch: at cap, escalates', () => {
  it('reaching the 3-attempt cap escalates to human review WITHOUT sending a 4th message and WITHOUT auto-closing', async () => {
    const row = makeRow({ attempt_count: 3 }); // already at the cap
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 28, completionPct: 5 }); // still firing, no reply

    const result = await processDueReeseOutreachFollowUps(false);

    expect(result.escalated).toBe(1);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled(); // never auto-closed
    expect(mockAddTicketComment).toHaveBeenCalledWith(
      'ticket-1', expect.stringContaining('human review'), 'ai_staff', 'reese-admin-1',
    );
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'escalated', next_follow_up_due_at: null }));
  });
});

describe('processDueReeseOutreachFollowUps — shared daily cap', () => {
  it('daily cap already reached -> the due follow-up is deferred (rescheduled later today), NOT counted as an attempt, NOT escalated', async () => {
    const row = makeRow({ attempt_count: 1 });
    mockReeseOutreachFindAll.mockResolvedValue([row]);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 14, completionPct: 5 });
    mockCountAutonomousSendsToday.mockResolvedValue(12); // at the shared ceiling

    const result = await processDueReeseOutreachFollowUps(false);

    expect(result.dailyCapDeferred).toBe(1);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ next_follow_up_due_at: expect.any(Date) }));
    // attempt_count must NOT have been bumped by the deferral
    const updateArg = row.update.mock.calls[0][0];
    expect(updateArg.attempt_count).toBeUndefined();
  });
});

describe('processDueReeseOutreachFollowUps — query scope (idempotency)', () => {
  it('only queries status=active rows whose next_follow_up_due_at has arrived — an already-resolved row is never reprocessed', async () => {
    mockReeseOutreachFindAll.mockResolvedValue([]);
    await processDueReeseOutreachFollowUps(false);
    expect(mockReeseOutreachFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'active',
          next_follow_up_due_at: expect.anything(),
        }),
      }),
    );
  });
});

describe('processDueReeseOutreachFollowUps — dryRun', () => {
  it('computes all 4 branch outcomes with zero real writes', async () => {
    const rowCleared = makeRow({ id: 'o-1', enrollment_id: 's-1' });
    const rowFollowUp = makeRow({ id: 'o-2', enrollment_id: 's-2', attempt_count: 1 });
    mockReeseOutreachFindAll.mockResolvedValue([rowCleared, rowFollowUp]);
    mockEvaluateInactivity
      .mockResolvedValueOnce(null) // rowCleared: signal cleared
      .mockResolvedValueOnce({ daysSinceActive: 14, completionPct: 5 }); // rowFollowUp: still firing

    const result = await processDueReeseOutreachFollowUps(true);

    expect(result.dryRun).toBe(true);
    expect(result.signalCleared).toBe(1);
    expect(result.followUpSent).toBe(1);
    expect(mockUpdateTicketStatus).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(mockRecordEvidence).not.toHaveBeenCalled();
    expect(rowCleared.update).not.toHaveBeenCalled();
    expect(rowFollowUp.update).not.toHaveBeenCalled();
  });
});
