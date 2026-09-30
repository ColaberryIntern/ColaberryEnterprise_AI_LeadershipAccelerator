const settings: Record<string, unknown> = {};
const consentFindOne = jest.fn();
const leadFindByPk = jest.fn();

jest.mock('../../models', () => ({
  Lead: { findByPk: (...a: unknown[]) => leadFindByPk(...a) },
  Campaign: { findByPk: async () => ({ id: 'c-1', status: 'active' }) },
  CommunicationLog: { count: async () => 0 },
  UnsubscribeEvent: { findAll: async () => [] },
}));
jest.mock('../../models/ConsentRecord', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => consentFindOne(...a) } }));
jest.mock('../settingsService', () => ({
  getSetting: async (key: string) => settings[key],
  getTestOverrides: async () => ({ enabled: false }),
}));
jest.mock('../aiEventService', () => ({ emitAiEvent: jest.fn() }));
jest.mock('../../modules/communications/brandPreferenceGate', () => ({ checkBrandPreference: async () => ({ allowed: true }) }));
jest.mock('../channelSuppression', () => ({ isSuppressedForChannel: () => ({ suppressed: false }) }));

import { assertConsentForSend } from '../consentService';
import { evaluateSend } from '../communicationSafetyService';

/**
 * T504 — the EXISTING consent gate, proven for SMS and voice.
 *
 * The Phase 5 contract says SMS and voice stay unbuilt until Ali authorises
 * them AND the existing consent/compliance gates are proven. The mode resolver
 * refuses both channels by construction (`channel_not_authorized`); this file
 * is the other half: what the send path itself does with them, with the REAL
 * `consentService` behind it and only its data sources mocked.
 *
 * Production reads `consent_enforcement = "enforce"` (checked 2026-09-18), so
 * these are the live semantics, not a hypothetical mode. Nothing here changes
 * any behaviour — it is a characterization test, and it is what the phase
 * points at when it says the gate is proven.
 */

const granted = (basis: string) => ({ status: 'granted', basis, captured_at: new Date('2026-01-01T00:00:00Z') });
const send = (channel: 'sms' | 'voice' | 'email') =>
  evaluateSend({ leadId: 501, campaignId: 'c-1', channel, toEmail: 'x@example.com', toPhone: '+15125550100' });

beforeEach(() => {
  for (const k of Object.keys(settings)) delete settings[k];
  settings.scheduler_paused = false;
  settings.max_sends_per_minute = 20;
  settings.consent_enforcement = 'enforce';
  settings.test_mode_enabled = false;
  consentFindOne.mockReset().mockResolvedValue(null);
  leadFindByPk.mockReset().mockResolvedValue({ id: 501, status: 'active', source: 'web' });
});

describe('the gate itself, in the mode production actually runs', () => {
  it.each(['sms', 'voice'] as const)('%s with NO consent record is blocked, and the block is enforced', async (channel) => {
    const gate = await assertConsentForSend({ channel, leadId: 501, phone: '+15125550100' });
    expect(gate).toMatchObject({ mode: 'enforce', enforced: true, verdict: 'block', reason: 'no_express_consent' });
  });

  it.each(['sms', 'voice'] as const)('%s with a NON-express basis is still blocked (TCPA needs express written or double opt-in)', async (channel) => {
    consentFindOne.mockResolvedValue(granted('opt_in_form'));
    expect(await assertConsentForSend({ channel, leadId: 501, phone: '+15125550100' }))
      .toMatchObject({ enforced: true, verdict: 'block', reason: 'no_express_consent' });
  });

  it.each([['express_written'], ['double_opt_in']])('%s consent is what unlocks sms', async (basis) => {
    consentFindOne.mockResolvedValue(granted(basis));
    expect(await assertConsentForSend({ channel: 'sms', leadId: 501, phone: '+15125550100' }))
      .toMatchObject({ verdict: 'allow', reason: 'express_consent', basis });
  });

  it('a revoked record blocks whatever the basis was', async () => {
    consentFindOne.mockResolvedValue({ status: 'revoked', basis: 'express_written' });
    expect(await assertConsentForSend({ channel: 'sms', leadId: 501, phone: '+15125550100' }))
      .toMatchObject({ verdict: 'block', reason: 'revoked' });
  });

  it('the control: email without a record is NOT blocked in an unknown jurisdiction, so the gate is not simply refusing everything', async () => {
    expect(await assertConsentForSend({ channel: 'email', leadId: 501, email: 'x@example.com' }))
      .toMatchObject({ verdict: 'allow', reason: 'can_spam_opt_out' });
  });
});

describe('the send path stops on it', () => {
  it.each(['sms', 'voice'] as const)('%s without express consent is refused by evaluateSend, named consent_no_express_consent', async (channel) => {
    const decision = await send(channel);
    expect(decision).toMatchObject({ allowed: false, deliveryMode: 'blocked', blockedReason: 'consent_no_express_consent' });
  });

  it('with express consent the same send is allowed through the gate', async () => {
    consentFindOne.mockResolvedValue(granted('express_written'));
    expect(await send('sms')).toMatchObject({ allowed: true });
  });

  it('in SHADOW mode the same missing consent does NOT block - which is why production sets enforce, and why the journey re-checks consent itself', async () => {
    settings.consent_enforcement = 'shadow';
    expect(await assertConsentForSend({ channel: 'sms', leadId: 501, phone: '+15125550100' }))
      .toMatchObject({ mode: 'shadow', enforced: false, verdict: 'block' });
    expect(await send('sms')).toMatchObject({ allowed: true });
  });
});
