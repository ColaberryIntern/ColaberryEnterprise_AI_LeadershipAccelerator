/**
 * Reese Phase 2 — the decision + orchestration sweep. Covers every named,
 * non-negotiable boundary from execution-contract.md: pilot-cohort gating,
 * duplicate-prevention, cadence cap, cross-signal-type separation, the shared
 * daily cap, governance tagging on every real send, and the dryRun contract.
 */
jest.mock('../../../models/ReeseOutreach', () => ({
  count: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../ticketService', () => ({ createTicket: jest.fn() }));
jest.mock('../../workLedger/agentActionAuthorizationBridge', () => ({ authorizeTicketDispatch: jest.fn() }));
jest.mock('../reeseIdentitySeed', () => ({ getReeseAdminUserId: jest.fn() }));
jest.mock('../reeseEligibilityService', () => ({ isEligibleForAutonomousOutreach: jest.fn() }));
jest.mock('../reeseSignalService', () => ({
  getPilotCohortStudentEnrollmentIds: jest.fn(),
  evaluateInactivitySignal: jest.fn(),
  evaluateBehaviorAnomalySignal: jest.fn(),
}));
jest.mock('../reeseOutreachMessageService', () => ({ generateOutreachMessage: jest.fn() }));
jest.mock('../reeseInitiateDmService', () => ({ initiateDm: jest.fn() }));
jest.mock('../resolveStudentDisplayName', () => ({ resolveStudentDisplayName: jest.fn() }));

import ReeseOutreach from '../../../models/ReeseOutreach';
import { createTicket } from '../../ticketService';
import { authorizeTicketDispatch } from '../../workLedger/agentActionAuthorizationBridge';
import { getReeseAdminUserId } from '../reeseIdentitySeed';
import { isEligibleForAutonomousOutreach } from '../reeseEligibilityService';
import {
  getPilotCohortStudentEnrollmentIds,
  evaluateInactivitySignal,
  evaluateBehaviorAnomalySignal,
} from '../reeseSignalService';
import { generateOutreachMessage } from '../reeseOutreachMessageService';
import { initiateDm } from '../reeseInitiateDmService';
import { resolveStudentDisplayName } from '../resolveStudentDisplayName';
import { runReeseAutonomousOutreachSweep, countAutonomousSendsToday, DAILY_SEND_CAP } from '../reeseAutonomousOutreachService';

const mockReeseOutreachCount = ReeseOutreach.count as unknown as jest.Mock;
const mockReeseOutreachFindOne = ReeseOutreach.findOne as unknown as jest.Mock;
const mockReeseOutreachCreate = ReeseOutreach.create as unknown as jest.Mock;
const mockCreateTicket = createTicket as unknown as jest.Mock;
const mockAuthorizeTicketDispatch = authorizeTicketDispatch as unknown as jest.Mock;
const mockGetReeseAdminUserId = getReeseAdminUserId as unknown as jest.Mock;
const mockIsEligible = isEligibleForAutonomousOutreach as unknown as jest.Mock;
const mockGetPilotCohortStudentIds = getPilotCohortStudentEnrollmentIds as unknown as jest.Mock;
const mockEvaluateInactivity = evaluateInactivitySignal as unknown as jest.Mock;
const mockEvaluateAnomaly = evaluateBehaviorAnomalySignal as unknown as jest.Mock;
const mockGenerateMessage = generateOutreachMessage as unknown as jest.Mock;
const mockInitiateDm = initiateDm as unknown as jest.Mock;
const mockResolveStudentDisplayName = resolveStudentDisplayName as unknown as jest.Mock;

const STUDENT_ID = 'd6a4b017-6716-4673-96b5-ab3074b70191'; // real-shaped UUID — the exact defect Ali flagged live
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TICKET = { id: 'ticket-1', update: jest.fn().mockResolvedValue(undefined) };

beforeEach(() => {
  jest.clearAllMocks();
  mockReeseOutreachCount.mockResolvedValue(0);
  mockReeseOutreachFindOne.mockResolvedValue(null); // no existing open outreach, no recent contact, by default
  mockReeseOutreachCreate.mockResolvedValue({ id: 'outreach-1' });
  mockCreateTicket.mockResolvedValue({ ...TICKET, update: jest.fn().mockResolvedValue(undefined) });
  mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_allow', reason: 'ok' });
  mockGetReeseAdminUserId.mockResolvedValue('reese-admin-1');
  mockIsEligible.mockResolvedValue({ eligible: true, reason: 'in_pilot_cohort_and_active' });
  mockGetPilotCohortStudentIds.mockResolvedValue([STUDENT_ID]);
  mockEvaluateInactivity.mockResolvedValue(null);
  mockEvaluateAnomaly.mockResolvedValue(null);
  mockGenerateMessage.mockResolvedValue('Real, unique outreach message.');
  mockInitiateDm.mockResolvedValue({ roomId: 'room-1', messageId: 'msg-1' });
  mockResolveStudentDisplayName.mockResolvedValue('Jordan Rivera');
});

describe('runReeseAutonomousOutreachSweep — happy path', () => {
  it('eligible student + real inactivity signal -> ticket created, DM sent, governance tagged R3, ReeseOutreach row created', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['No activity in 9 days'] });

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(1);
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'reese_autonomous_outreach',
        entity_type: 'reese_outreach_signal',
        entity_id: `${STUDENT_ID}:inactivity`,
        metadata: expect.objectContaining({
          signal_type: 'inactivity',
          signal_snapshot: expect.objectContaining({ daysSinceActive: 9 }),
        }),
      }),
    );
    expect(mockInitiateDm).toHaveBeenCalledWith(STUDENT_ID, 'Real, unique outreach message.');
    expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', riskTier: 'R3', action: 'reese_autonomous_outreach' }),
    );
    expect(mockReeseOutreachCreate).toHaveBeenCalledWith(
      expect.objectContaining({ enrollment_id: STUDENT_ID, signal_type: 'inactivity', status: 'active', attempt_count: 1 }),
    );
  });

  it('never sends a fixed/templated string — the message passed to initiateDm is whatever generateOutreachMessage produced', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 10, completionPct: 3, totalCards: 2, reasons: ['x'] });
    mockGenerateMessage.mockResolvedValue('A completely different, specifically-generated message this time.');

    await runReeseAutonomousOutreachSweep(false);

    expect(mockInitiateDm).toHaveBeenCalledWith(STUDENT_ID, 'A completely different, specifically-generated message this time.');
  });
});

describe('runReeseAutonomousOutreachSweep — human-readable ticket text (Ali\'s live feedback: "reporting the id of the user is not helpful")', () => {
  it('happy path: ticket title/description contain the resolved student name, never the raw enrollment UUID', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    await runReeseAutonomousOutreachSweep(false);

    expect(mockResolveStudentDisplayName).toHaveBeenCalledWith(STUDENT_ID);
    const call = mockCreateTicket.mock.calls[0][0];
    expect(call.title).toContain('Jordan Rivera');
    expect(call.description).toContain('Jordan Rivera');
    expect(call.title).not.toMatch(UUID_PATTERN);
    expect(call.description).not.toMatch(UUID_PATTERN);
    // entity_id/metadata still carry the real UUID — only human-facing text changed.
    expect(call.entity_id).toBe(`${STUDENT_ID}:inactivity`);
    expect(call.metadata.signal_snapshot).toBeDefined();
  });

  it('failure path: an unresolvable enrollment falls back to a generic, non-UUID phrase rather than throwing or printing the raw id', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });
    mockResolveStudentDisplayName.mockResolvedValue('a student'); // resolveStudentDisplayName's own fallback

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(1);
    const call = mockCreateTicket.mock.calls[0][0];
    expect(call.title).toContain('a student');
    expect(call.title).not.toMatch(UUID_PATTERN);
    expect(call.description).not.toMatch(UUID_PATTERN);
  });
});

describe('runReeseAutonomousOutreachSweep — the required boundaries', () => {
  it('OUT-of-cohort student with an identical signal -> not eligible, no ticket, no message', async () => {
    mockIsEligible.mockResolvedValue({ eligible: false, reason: 'not_in_pilot_cohort' });
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(0);
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result.decisions[0]).toEqual({ enrollmentId: STUDENT_ID, action: 'skipped', reason: 'not_in_pilot_cohort' });
  });

  it('duplicate-prevention: an already-open outreach for the SAME signal type -> no second ticket/message', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });
    mockReeseOutreachFindOne.mockResolvedValue({ id: 'existing-outreach' }); // hasOpenOutreachForSignal -> true

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(0);
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(result.decisions.some((d) => d.reason === 'duplicate_open_outreach')).toBe(true);
  });

  it('cross-signal-type separation: a DIFFERENT signal firing for a student who already has an open ticket for the FIRST signal type still gets evaluated as its own case (not silently absorbed) — duplicate check is scoped per signal_type', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });
    mockEvaluateAnomaly.mockResolvedValue({ idleCount: 5, lessonId: 'l1', lessonTitle: 'Lesson', windowHours: 24 });
    // Only the inactivity signal has an existing open row; behavior_anomaly does not.
    mockReeseOutreachFindOne.mockImplementation(async (opts: any) => {
      if (opts?.where?.signal_type === 'inactivity') return { id: 'existing-inactivity-outreach' };
      return null; // no open row, no recent-cadence row for behavior_anomaly's own check
    });

    const result = await runReeseAutonomousOutreachSweep(false);

    const inactivityDecision = result.decisions.find((d) => d.signalType === 'inactivity');
    expect(inactivityDecision?.action).toBe('skipped');
    expect(inactivityDecision?.reason).toBe('duplicate_open_outreach');
    // The behavior_anomaly signal is a distinct case — it gets its own ticket
    // with a composite entity_id, not silently merged into the inactivity ticket.
    expect(mockCreateTicket).toHaveBeenCalledWith(
      expect.objectContaining({ entity_id: `${STUDENT_ID}:behavior_anomaly` }),
    );
  });

  it('cadence cap: student was contacted within the last 7 days -> skipped, no send, even with a fresh signal', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });
    mockReeseOutreachFindOne.mockImplementation(async (opts: any) => {
      // hasOpenOutreachForSignal check (status:'active') -> none; but the
      // cadence check (last_contacted_at within window) -> a hit.
      if (opts?.where?.status === 'active') return null;
      return { id: 'recent-contact-row' };
    });

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(0);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result.decisions.some((d) => d.reason === 'cadence_cap_active')).toBe(true);
  });

  it('daily cap: 12 already sent today -> remaining candidates skipped, logged, cap never exceeded', async () => {
    mockReeseOutreachCount.mockResolvedValue(DAILY_SEND_CAP); // already at the ceiling before this run
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(0);
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(result.decisions.some((d) => d.reason === 'daily_cap_reached')).toBe(true);
  });

  it('daily cap boundary: exactly 1 slot remaining -> exactly 1 send happens, the rest are skipped', async () => {
    mockReeseOutreachCount.mockResolvedValue(DAILY_SEND_CAP - 1);
    mockGetPilotCohortStudentIds.mockResolvedValue(['s1', 's2']);
    mockIsEligible.mockResolvedValue({ eligible: true, reason: 'in_pilot_cohort_and_active' });
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    const result = await runReeseAutonomousOutreachSweep(false);

    expect(result.sent).toBe(1);
    expect(mockInitiateDm).toHaveBeenCalledTimes(1);
    expect(result.decisions.some((d) => d.reason === 'daily_cap_reached')).toBe(true);
  });

  it('governance call fires for every real send with riskTier R3 and NEVER blocks regardless of its verdict (shadow mode)', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });
    mockAuthorizeTicketDispatch.mockResolvedValue({ decisionId: 'auth-1', verdict: 'would_block', reason: 'high_risk_tier' });

    const result = await runReeseAutonomousOutreachSweep(false);

    // The send still fully completed even though the shadow verdict was would_block.
    expect(result.sent).toBe(1);
    expect(mockInitiateDm).toHaveBeenCalled();
    expect(mockAuthorizeTicketDispatch).toHaveBeenCalledWith(expect.objectContaining({ riskTier: 'R3' }));
  });

  it('no signal fires for an eligible student -> skipped, no send, no error', async () => {
    const result = await runReeseAutonomousOutreachSweep(false);
    expect(result.sent).toBe(0);
    expect(result.decisions.some((d) => d.reason === 'no_signal')).toBe(true);
  });
});

describe('runReeseAutonomousOutreachSweep — dryRun', () => {
  it('dryRun:true reports the same decisions with ZERO real writes/sends', async () => {
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    const result = await runReeseAutonomousOutreachSweep(true);

    expect(result.dryRun).toBe(true);
    expect(result.sent).toBe(1);
    expect(mockCreateTicket).not.toHaveBeenCalled();
    expect(mockInitiateDm).not.toHaveBeenCalled();
    expect(mockAuthorizeTicketDispatch).not.toHaveBeenCalled();
    expect(mockReeseOutreachCreate).not.toHaveBeenCalled();
  });

  it('dryRun:true is honest about the daily cap — a candidate beyond the real remaining slots is reported as "would skip", not "would send"', async () => {
    // Real count already at the ceiling before this dry run — a genuine
    // production-verification scenario (see T009): the sweep must not
    // over-report "would send" for candidates the real cap would reject.
    mockReeseOutreachCount.mockResolvedValue(DAILY_SEND_CAP);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    const result = await runReeseAutonomousOutreachSweep(true);

    expect(result.dryRun).toBe(true);
    expect(result.sent).toBe(0);
    expect(result.decisions.some((d) => d.reason === 'daily_cap_reached')).toBe(true);
    expect(mockCreateTicket).not.toHaveBeenCalled();
  });

  it('dryRun:true correctly simulates the cap running out mid-pass across multiple candidates', async () => {
    mockReeseOutreachCount.mockResolvedValue(DAILY_SEND_CAP - 1); // exactly 1 real slot left
    mockGetPilotCohortStudentIds.mockResolvedValue(['s1', 's2']);
    mockEvaluateInactivity.mockResolvedValue({ daysSinceActive: 9, completionPct: 5, totalCards: 4, reasons: ['x'] });

    const result = await runReeseAutonomousOutreachSweep(true);

    expect(result.sent).toBe(1); // only the first candidate consumes the last real slot
    expect(result.decisions.some((d) => d.reason === 'daily_cap_reached')).toBe(true);
    expect(mockInitiateDm).not.toHaveBeenCalled(); // still zero real sends — this is dryRun
  });
});

describe('countAutonomousSendsToday', () => {
  it('counts ReeseOutreach rows contacted today (shared ceiling with follow-up sends)', async () => {
    mockReeseOutreachCount.mockResolvedValue(4);
    const count = await countAutonomousSendsToday();
    expect(count).toBe(4);
    expect(mockReeseOutreachCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ last_contacted_at: expect.anything() }) }),
    );
  });
});
