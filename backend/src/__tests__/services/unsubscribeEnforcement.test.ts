/**
 * Unsubscribe Enforcement Tests (T1 + T2)
 * T1: STOP keyword detection (12 tests)
 * T2: Unsubscribe enforcement lifecycle (8 tests)
 * Uses mocked models — no database dependency.
 */

const mockLeadUpdate = jest.fn().mockResolvedValue([1]);
const mockCampaignLeadUpdate = jest.fn().mockResolvedValue([1]);
const mockScheduledEmailUpdate = jest.fn().mockResolvedValue([3]);
const mockUnsubscribeEventCreate = jest.fn().mockResolvedValue({ id: 'unsub-1' });
const mockLeadFindByPk = jest.fn();
const mockLogActivity = jest.fn().mockResolvedValue({});

jest.mock('../../models', () => ({
  Lead: {
    update: (...args: any[]) => mockLeadUpdate(...args),
    findByPk: (...args: any[]) => mockLeadFindByPk(...args),
  },
  CampaignLead: {
    update: (...args: any[]) => mockCampaignLeadUpdate(...args),
  },
  ScheduledEmail: {
    update: (...args: any[]) => mockScheduledEmailUpdate(...args),
  },
  UnsubscribeEvent: {
    create: (...args: any[]) => mockUnsubscribeEventCreate(...args),
  },
}));

jest.mock('../../services/activityService', () => ({
  logActivity: (...args: any[]) => mockLogActivity(...args),
}));

jest.mock('../../services/ghlService', () => ({
  addContactTag: jest.fn().mockResolvedValue(undefined),
  addContactNote: jest.fn().mockResolvedValue(undefined),
}));

import {
  detectStopKeyword,
  processOptOut,
  cancelPendingActions,
} from '../../services/unsubscribeEnforcementService';

describe('unsubscribeEnforcementService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLeadFindByPk.mockResolvedValue(null);
  });

  // ─── T1: STOP Keyword Detection ──────────────────────────────────────────

  describe('T1: detectStopKeyword', () => {
    test('should detect "STOP"', () => {
      expect(detectStopKeyword('STOP')).toBe(true);
    });

    test('should detect "stop" (case insensitive)', () => {
      expect(detectStopKeyword('stop')).toBe(true);
    });

    test('should detect "UNSUBSCRIBE"', () => {
      expect(detectStopKeyword('UNSUBSCRIBE')).toBe(true);
    });

    test('should detect "OPT OUT" with space', () => {
      expect(detectStopKeyword('OPT OUT')).toBe(true);
    });

    test('should detect "OPTOUT" without space', () => {
      expect(detectStopKeyword('OPTOUT')).toBe(true);
    });

    test('should detect "REMOVE"', () => {
      expect(detectStopKeyword('REMOVE')).toBe(true);
    });

    test('should detect "CANCEL"', () => {
      expect(detectStopKeyword('CANCEL')).toBe(true);
    });

    test('should detect "END"', () => {
      expect(detectStopKeyword('END')).toBe(true);
    });

    test('should detect "QUIT"', () => {
      expect(detectStopKeyword('QUIT')).toBe(true);
    });

    test('should detect with surrounding whitespace', () => {
      expect(detectStopKeyword('  STOP  ')).toBe(true);
    });

    test('should NOT detect STOP embedded in a sentence', () => {
      expect(detectStopKeyword('Please stop sending me emails')).toBe(false);
    });

    test('should NOT detect empty or null input', () => {
      expect(detectStopKeyword('')).toBe(false);
      expect(detectStopKeyword(null as any)).toBe(false);
      expect(detectStopKeyword(undefined as any)).toBe(false);
    });
  });

  // ─── T2: Unsubscribe Enforcement Lifecycle ───────────────────────────────

  describe('T2: processOptOut', () => {
    // THESE TWO TESTS USED TO ASSERT THE BUG.
    //
    // Both called processOptOut(42, 'sms', 'STOP') and then expected the GLOBAL
    // lead status and every CampaignLead to be suppressed — which is precisely
    // the defect §35 D-4 describes: an SMS STOP killing that person's email.
    // The expectation is inverted rather than deleted, because the old
    // behaviour is exactly what must not come back.
    test('an sms opt-out does NOT touch the global lead status', async () => {
      await processOptOut(42, 'sms', 'STOP', 'stop_keyword');
      expect(mockLeadUpdate).not.toHaveBeenCalled();
    });

    test('an sms opt-out does NOT dnd every campaign', async () => {
      await processOptOut(42, 'sms', 'STOP', 'stop_keyword');
      expect(mockCampaignLeadUpdate).not.toHaveBeenCalled();
    });

    test('an EMAIL opt-out still suppresses globally, unchanged', async () => {
      // An email unsubscribe IS the primary meaning of Lead.status
      // 'unsubscribed'. Narrowing that was never the ask.
      await processOptOut(42, 'email', 'unsubscribe link', 'footer');
      expect(mockLeadUpdate).toHaveBeenCalledWith(
        { status: 'unsubscribed' },
        { where: { id: 42 } },
      );
    });

    test('an email opt-out still dnds every campaign, unchanged', async () => {
      await processOptOut(42, 'email', 'unsubscribe link', 'footer');
      expect(mockCampaignLeadUpdate).toHaveBeenCalledWith(
        { lifecycle_status: 'dnd' },
        { where: { lead_id: 42 } },
      );
    });

    test('should cancel pending and processing scheduled actions', async () => {
      mockScheduledEmailUpdate.mockResolvedValueOnce([5]);
      const result = await processOptOut(42, 'sms', 'STOP', 'stop_keyword');
      expect(result.cancelled).toBe(5);
    });

    test('should create an UnsubscribeEvent audit record', async () => {
      await processOptOut(42, 'email', 'Mandrill unsub event', 'mandrill_unsub');
      expect(mockUnsubscribeEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          lead_id: 42,
          channel: 'email',
          reason: 'Mandrill unsub event',
          source: 'mandrill_unsub',
        }),
      );
    });

    test('should log activity', async () => {
      await processOptOut(42, 'sms', 'STOP', 'stop_keyword');
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          lead_id: 42,
          type: 'system',
          subject: expect.stringContaining('opted out via sms'),
        }),
      );
    });

    test('should truncate long reasons to 500 chars', async () => {
      const longReason = 'A'.repeat(600);
      await processOptOut(42, 'email', longReason, 'system');
      expect(mockUnsubscribeEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.any(String),
        }),
      );
      const callArg = mockUnsubscribeEventCreate.mock.calls[0][0];
      expect(callArg.reason.length).toBeLessThanOrEqual(500);
    });

    test('should default source to "system"', async () => {
      await processOptOut(42, 'email', 'Manual opt-out');
      expect(mockUnsubscribeEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'system' }),
      );
    });

    test('should not throw if activity log fails', async () => {
      mockLogActivity.mockRejectedValueOnce(new Error('Log DB down'));
      await expect(processOptOut(42, 'sms', 'STOP', 'stop_keyword')).resolves.toBeDefined();
    });
  });

  // ─── cancelPendingActions ────────────────────────────────────────────────

  describe('cancelPendingActions', () => {
    test('should cancel pending and processing actions', async () => {
      mockScheduledEmailUpdate.mockResolvedValueOnce([7]);
      const count = await cancelPendingActions(42);
      expect(count).toBe(7);
    });

    test('should return 0 when no actions to cancel', async () => {
      mockScheduledEmailUpdate.mockResolvedValueOnce([0]);
      const count = await cancelPendingActions(999);
      expect(count).toBe(0);
    });
  });
});
