/**
 * Communication Safety Service Tests (T3)
 * T3: Test mode fail-safe, lead/campaign checks, rate limiting, evaluateSend pipeline (12 tests)
 * Uses mocked models — no database dependency.
 */

const mockLeadFindByPk = jest.fn();
const mockCampaignFindByPk = jest.fn();
const mockCommLogCount = jest.fn().mockResolvedValue(0);
const mockUnsubFindOne = jest.fn().mockResolvedValue(null);
const mockUnsubFindAll = jest.fn().mockResolvedValue([]);
const mockGetTestOverrides = jest.fn();
const mockGetSetting = jest.fn().mockResolvedValue(null);

jest.mock('../../models', () => ({
  Lead: { findByPk: (...args: any[]) => mockLeadFindByPk(...args) },
  Campaign: { findByPk: (...args: any[]) => mockCampaignFindByPk(...args) },
  CommunicationLog: { count: (...args: any[]) => mockCommLogCount(...args) },
  // `findAll` as well as `findOne`. checkLeadSendable reads EVERY unsubscribe
  // row for the lead now: once the channel matters, "the most recent one was
  // sms" must not be able to hide an older global opt-out behind it.
  UnsubscribeEvent: {
    findOne: (...args: any[]) => mockUnsubFindOne(...args),
    findAll: (...args: any[]) => mockUnsubFindAll(...args),
  },
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
    mockUnsubFindAll.mockResolvedValue([]);
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
      mockUnsubFindAll.mockResolvedValue([
        { channel: 'email', created_at: new Date('2099-01-01T00:00:00Z') },
      ]);
      // No channel named — the pre-existing contract, which every current
      // caller relies on: ANY event blocks, whatever its channel.
      const result = await checkLeadSendable(1);
      expect(result.sendable).toBe(false);
      expect(result.reason).toBe('unsubscribe_event_exists');
    });

    test('a NEW sms opt-out no longer blocks email (§35 D-4)', async () => {
      // The behaviour this change exists to create. Someone who texted STOP has
      // not declined email, and under CAN-SPAM email is permitted by default.
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'new', source: 'manual' });
      mockUnsubFindAll.mockResolvedValue([
        { channel: 'sms', created_at: new Date('2099-01-01T00:00:00Z') },
      ]);

      expect((await checkLeadSendable(1, 'email')).sendable).toBe(true);
      expect((await checkLeadSendable(1, 'sms')).sendable).toBe(false);
    });

    test('an OLD sms opt-out still blocks email, and must', async () => {
      // Written under global semantics and enforced that way ever since.
      // Narrowing it retroactively would re-open a door someone closed.
      mockLeadFindByPk.mockResolvedValue({ id: 1, status: 'new', source: 'manual' });
      mockUnsubFindAll.mockResolvedValue([
        { channel: 'sms', created_at: new Date('2026-01-01T00:00:00Z') },
      ]);

      const result = await checkLeadSendable(1, 'email');
      expect(result.sendable).toBe(false);
      expect(result.reason).toContain('legacy');
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
      // Keyed since T602: the kill switch is read first through the same settings service, so "every key is true" would be the switch.
      mockGetSetting.mockImplementation(async (key: string) => (key === 'scheduler_paused' ? 'true' : null));
      const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
      const decision = await evaluateSend(req);
      expect(decision.allowed).toBe(false);
      expect(decision.blockedReason).toBe('scheduler_paused');
    });

    // ── AF12.5: the UNREADABLE pause flag ────────────────────────────────
    //
    // The test above drives the readable path, and it passed before this fix as well as after,
    // so it proves nothing about what happens when the flag cannot be read. These two do, and
    // they are a pair on purpose: one asserts the refusal, the other asserts that the refusal
    // did not become "block everything". A fail-closed change is only safe if BOTH hold.

    test('REFUSES the send when the pause flag cannot be read', async () => {
      const dbDown = Object.assign(new Error('connection terminated unexpectedly'), { code: 'ECONNRESET' });
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === 'scheduler_paused') throw dbDown;
        return null;
      });
      const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
      const decision = await evaluateSend(req);
      expect(decision.allowed).toBe(false);
      expect(decision.deliveryMode).toBe('blocked');
      // A DISTINCT reason from 'scheduler_paused': "we are paused" and "we cannot tell whether
      // we are paused" are different operational facts, and only the second one means somebody
      // has to go and look at the database.
      expect(decision.blockedReason).toBe('scheduler_pause_unreadable');
    });

    test('names a stable error_class in the log when the flag cannot be read', async () => {
      // The ticket's acceptance asks for a NAMED error class, not just a refusal — an
      // unexplained block at the send chokepoint is its own outage to debug.
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        mockGetSetting.mockImplementation(async (key: string) => {
          if (key === 'scheduler_paused') {
            throw Object.assign(new Error('no route to host'), { code: 'ECONNREFUSED' });
          }
          return null;
        });
        const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
        await evaluateSend(req);
        const logged = spy.mock.calls.map((c) => c.join(' ')).join('\n');
        expect(logged).toContain('scheduler_pause_unreadable');
        // ECONNREFUSED classifies as UpstreamUnavailable, which is one of CLAUDE.md's canonical
        // buckets. Asserting the bucket rather than merely "some class" is what stops this
        // regressing to the bare string 'Error' the classifier exists to prevent.
        expect(logged).toContain('UpstreamUnavailable');
      } finally {
        spy.mockRestore();
      }
    });

    test('still SENDS when the pause flag has simply never been set', async () => {
      // The outage guard. `scheduler_paused` is absent from settingsService DEFAULTS, so an
      // untouched flag is a SUCCESSFUL read returning null. If failing closed ever starts
      // treating that as unknown, every outbound send in the system stops, and this is the
      // test that says so instead of production saying it.
      mockGetSetting.mockImplementation(async () => null);
      const req: SendRequest = { leadId: 1, channel: 'email', campaignId: 'c1' };
      const decision = await evaluateSend(req);
      expect(decision.allowed).toBe(true);
      expect(decision.deliveryMode).toBe('live');
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
