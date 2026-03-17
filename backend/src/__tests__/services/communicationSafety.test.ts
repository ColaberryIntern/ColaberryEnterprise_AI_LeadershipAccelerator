/**
 * Communication Safety Service Tests (T3)
 * T3: Test mode fail-safe, lead/campaign checks, rate limiting, evaluateSend pipeline (12 tests)
 * Uses mocked models — no database dependency.
 */

const mockLeadFindByPk = jest.fn();
const mockCampaignFindByPk = jest.fn();
const mockCommLogCount = jest.fn().mockResolvedValue(0);
const mockUnsubFindOne = jest.fn().mockResolvedValue(null);
const mockGetTestOverrides = jest.fn();
const mockGetSetting = jest.fn().mockResolvedValue(null);

jest.mock('../../models', () => ({
  Lead: { findByPk: (...args: any[]) => mockLeadFindByPk(...args) },
  Campaign: { findByPk: (...args: any[]) => mockCampaignFindByPk(...args) },
  CommunicationLog: { count: (...args: any[]) => mockCommLogCount(...args) },
  UnsubscribeEvent: { findOne: (...args: any[]) => mockUnsubFindOne(...args) },
}));

jest.mock('../../services/settingsService', () => ({
  getTestOverrides: (...args: any[]) => mockGetTestOverrides(...args),
  getSetting: (...args: any[]) => mockGetSetting(...args),
}));

import {
  evaluateSend,
  checkLeadSendable,
  checkCampaignSendable,
  resolveRecipient,
  clearTestOverrideCache,
  getTestOverridesSafe,
  enforceGlobalRateLimit,
} from '../../services/communicationSafetyService';
import type { SendRequest } from '../../services/communicationSafetyService';

describe('communicationSafetyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearTestOverrideCache();
    // Default: test mode off, live sends allowed
    mockGetTestOverrides.mockResolvedValue({ enabled: false, email: '', phone: '' });
    mockGetSetting.mockResolvedValue(null);
    mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'new', source: 'manual' });
    mockCampaignFindByPk.mockResolvedValue({ id: 'c1', status: 'active' });
    mockCommLogCount.mockResolvedValue(0);
    mockUnsubFindOne.mockResolvedValue(null);
  });

  // ─── Test Mode Fail-Safe ─────────────────────────────────────────────────

  describe('getTestOverridesSafe — fail-closed', () => {
    test('should return overrides when DB is available', async () => {
      mockGetTestOverrides.mockResolvedValue({ enabled: true, email: 'test@test.com', phone: '555-0000' });
      const result = await getTestOverridesSafe();
      expect(result.enabled).toBe(true);
      expect(result.email).toBe('test@test.com');
      expect(result.dbError).toBe(false);
    });

    test('should fail closed when DB throws — enabled=true, dbError=true', async () => {
      mockGetTestOverrides.mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await getTestOverridesSafe();
      expect(result.enabled).toBe(true);
      expect(result.dbError).toBe(true);
      expect(result.email).toBe('');
    });

    test('should cache results for 30 seconds', async () => {
      mockGetTestOverrides.mockResolvedValue({ enabled: false, email: '', phone: '' });
      await getTestOverridesSafe();
      await getTestOverridesSafe();
      await getTestOverridesSafe();
      expect(mockGetTestOverrides).toHaveBeenCalledTimes(1);
    });
  });

  // ─── resolveRecipient ────────────────────────────────────────────────────

  describe('resolveRecipient', () => {
    test('should block when DB error (fail-closed)', async () => {
      mockGetTestOverrides.mockRejectedValue(new Error('DB down'));
      const req: SendRequest = { leadId: 1, channel: 'email' };
      const decision = await resolveRecipient(req);
      expect(decision.allowed).toBe(false);
      expect(decision.blockedReason).toBe('settings_db_unavailable');
      expect(decision.deliveryMode).toBe('blocked');
    });

    test('should block voice when test mode on but no test phone', async () => {
      mockGetTestOverrides.mockResolvedValue({ enabled: true, email: 'test@t.com', phone: '' });
      clearTestOverrideCache();
      const req: SendRequest = { leadId: 1, channel: 'voice' };
      const decision = await resolveRecipient(req);
      expect(decision.allowed).toBe(false);
      expect(decision.blockedReason).toBe('test_mode_no_test_phone');
    });

    test('should block email when test mode on but no test email', async () => {
      mockGetTestOverrides.mockResolvedValue({ enabled: true, email: '', phone: '555-0000' });
      clearTestOverrideCache();
      const req: SendRequest = { leadId: 1, channel: 'email' };
      const decision = await resolveRecipient(req);
      expect(decision.allowed).toBe(false);
      expect(decision.blockedReason).toBe('test_mode_no_test_email');
    });

    test('should redirect when test mode on with valid test addresses', async () => {
      mockGetTestOverrides.mockResolvedValue({ enabled: true, email: 'test@t.com', phone: '555-0000' });
      clearTestOverrideCache();
      const req: SendRequest = { leadId: 1, channel: 'email' };
      const decision = await resolveRecipient(req);
      expect(decision.allowed).toBe(true);
      expect(decision.deliveryMode).toBe('test_redirect');
      expect(decision.redirect?.email).toBe('test@t.com');
    });

    test('should allow live send when test mode disabled', async () => {
      const req: SendRequest = { leadId: 1, channel: 'email' };
      const decision = await resolveRecipient(req);
      expect(decision.allowed).toBe(true);
      expect(decision.deliveryMode).toBe('live');
      expect(decision.testMode).toBe(false);
    });
  });

  // ─── checkLeadSendable ──────────────────────────────────────────────────

  describe('checkLeadSendable', () => {
    test('should block unsubscribed leads', async () => {
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'unsubscribed', source: 'manual' });
      const result = await checkLeadSendable(1);
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('lead_unsubscribed');
    });

    test('should block DND leads', async () => {
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'dnd', source: 'manual' });
      const result = await checkLeadSendable(1);
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('lead_dnd');
    });

    test('should block leads with unsubscribe events even if status is still active', async () => {
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'new', source: 'manual' });
      mockUnsubFindOne.mockResolvedValue({ id: 'unsub-1', lead_id: 1 });
      const result = await checkLeadSendable(1);
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('unsubscribe_event_exists');
    });

    test('should allow leads with good status and no unsub events', async () => {
      const result = await checkLeadSendable(1);
      expect(result.sendable).toBe(true);
    });

    test('should block when lead not found', async () => {
      mockLeadFindByPk.mockResolvedValue(null);
      const result = await checkLeadSendable(999);
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('lead_not_found');
    });

    test('should fail closed on DB error', async () => {
      mockLeadFindByPk.mockRejectedValue(new Error('DB down'));
      const result = await checkLeadSendable(1);
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('lead_check_failed');
    });
  });

  // ─── checkCampaignSendable ───────────────────────────────────────────────

  describe('checkCampaignSendable', () => {
    test('should pass when campaignId is null', async () => {
      const result = await checkCampaignSendable(null);
      expect(result.sendable).toBe(true);
    });

    test('should block paused campaigns', async () => {
      mockCampaignFindByPk.mockResolvedValue({ id: 'c1', status: 'paused' });
      const result = await checkCampaignSendable('c1');
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('campaign_paused');
    });
  });

  // ─── enforceGlobalRateLimit ──────────────────────────────────────────────

  describe('enforceGlobalRateLimit', () => {
    test('should allow when under limit', async () => {
      mockCommLogCount.mockResolvedValue(5);
      const result = await enforceGlobalRateLimit();
      expect(result.allowed).toBe(true);
    });

    test('should block when at limit', async () => {
      mockGetSetting.mockResolvedValue(10);
      mockCommLogCount.mockResolvedValue(10);
      const result = await enforceGlobalRateLimit();
      expect(result.allowed).toBe(false);
      expect(result.retryAfterMs).toBe(60_000);
    });
  });

  // ─── evaluateSend (full pipeline) ────────────────────────────────────────

  describe('evaluateSend — full pipeline', () => {
    test('should block when scheduler is paused', async () => {
      mockGetSetting.mockResolvedValue('true');
      const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
      const decision = await evaluateSend(req);
      expect(decision.allowed).toBe(false);
      expect(decision.blockedReason).toBe('scheduler_paused');
    });

    test('should allow full pipeline when everything is good', async () => {
      const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
      const decision = await evaluateSend(req);
      expect(decision.allowed).toBe(true);
      expect(decision.deliveryMode).toBe('live');
    });

    test('should skip lead check for simulation sends', async () => {
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'unsubscribed', source: 'campaign_test' });
      const req: SendRequest = { leadId: 1, channel: 'email', simulationId: 'sim-1' };
      const decision = await evaluateSend(req);
      // Should pass because simulationId skips lead check
      expect(decision.allowed).toBe(true);
    });

    test('should block unsubscribed leads in non-simulation sends', async () => {
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'unsubscribed', source: 'manual' });
      const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
      const decision = await evaluateSend(req);
      expect(decision.allowed).toBe(false);
      expect(decision.blockedReason).toBe('lead_unsubscribed');
    });
  });
});
