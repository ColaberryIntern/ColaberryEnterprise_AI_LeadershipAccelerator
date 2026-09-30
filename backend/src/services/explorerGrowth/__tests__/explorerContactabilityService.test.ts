const leadFindByPk = jest.fn();
const evalConsent = jest.fn();

jest.mock('../../../models', () => ({ Lead: { findByPk: (...a: unknown[]) => leadFindByPk(...a) } }));
jest.mock('../../consentService', () => ({ evaluateConsent: (...a: unknown[]) => evalConsent(...a) }));

import { resolveContactability } from '../explorerContactabilityService';

const BASE = { enrollmentId: 'e1', leadId: 42, email: 'x@example.com' };

beforeEach(() => {
  leadFindByPk.mockReset();
  evalConsent.mockReset();
  leadFindByPk.mockResolvedValue({ status: 'active' });
  evalConsent.mockResolvedValue({ verdict: 'allow', basis: 'express_written', reason: 'ok' });
});

describe('every ineligible channel carries a machine-readable reason', () => {
  it('never returns a bare false', async () => {
    evalConsent.mockResolvedValue({ verdict: 'block', basis: 'none', reason: 'no_express_consent' });
    const c = await resolveContactability(BASE);
    for (const ch of ['email', 'sms', 'voice'] as const) {
      expect(c[ch]!.eligible).toBe(false);
      expect(c[ch]!.reason).toBeTruthy();
    }
  });

  it('passes the consent engine reason through rather than inventing one', async () => {
    evalConsent.mockResolvedValue({ verdict: 'block', basis: 'none', reason: 'revoked' });
    const c = await resolveContactability(BASE);
    expect(c.email!.reason).toBe('revoked');
  });
});

describe('fails CLOSED', () => {
  it('marks a channel ineligible when the consent lookup throws', async () => {
    // Wrongly withholding an email costs one touch. Wrongly sending one can
    // cost a CAN-SPAM or TCPA violation. The asymmetry decides the default.
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    evalConsent.mockRejectedValue(new Error('db down'));
    const c = await resolveContactability(BASE);
    expect(c.email).toEqual({ eligible: false, reason: 'consent_lookup_failed' });
    expect(c.sms!.eligible).toBe(false);
    expect(c.voice!.eligible).toBe(false);
  });

  it('suppresses everything when the lead row cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    leadFindByPk.mockRejectedValue(new Error('db down'));
    const c = await resolveContactability(BASE);
    expect(c.email).toEqual({ eligible: false, reason: 'suppression_lookup_failed' });
  });
});

describe('lead suppression overrides consent, in the restrictive direction', () => {
  it.each(['unsubscribed', 'dnd', 'bounced', 'complained'])(
    'blocks every outbound channel for a %s lead',
    async (status) => {
      leadFindByPk.mockResolvedValue({ status });
      const c = await resolveContactability(BASE);
      expect(c.email!.eligible).toBe(false);
      expect(c.email!.reason).toBe(`lead_status_${status}`);
      expect(c.sms!.eligible).toBe(false);
      expect(c.voice!.eligible).toBe(false);
    },
  );

  it('does not even consult consent for a suppressed lead', async () => {
    leadFindByPk.mockResolvedValue({ status: 'unsubscribed' });
    await resolveContactability(BASE);
    expect(evalConsent).not.toHaveBeenCalled();
  });

  it('suppresses ALL channels even though the opt-out was global, not per channel', async () => {
    // processOptOut stops everything, so a learner who opted out of SMS is also
    // email-ineligible. Over-suppression is the safe direction.
    leadFindByPk.mockResolvedValue({ status: 'unsubscribed' });
    const c = await resolveContactability(BASE);
    expect([c.email!.eligible, c.sms!.eligible, c.voice!.eligible]).toEqual([false, false, false]);
  });
});

describe('the TCPA gate', () => {
  it('blocks voice and SMS when the consent engine finds no express consent', async () => {
    evalConsent.mockImplementation(({ channel }: any) =>
      channel === 'email'
        ? Promise.resolve({ verdict: 'allow', basis: 'legitimate_interest', reason: 'canspam' })
        : Promise.resolve({ verdict: 'block', basis: 'none', reason: 'no_express_consent' }),
    );
    const c = await resolveContactability(BASE);
    expect(c.email!.eligible).toBe(true);
    expect(c.sms!.eligible).toBe(false);
    expect(c.voice!.eligible).toBe(false);
    expect(c.voice!.reason).toBe('no_express_consent');
  });

  it('delegates the rule to evaluateConsent rather than reimplementing it', async () => {
    // A second copy of the TCPA logic is a second thing to get wrong.
    await resolveContactability(BASE);
    const channels = evalConsent.mock.calls.map((c) => c[0].channel).sort();
    expect(channels).toEqual(['email', 'sms', 'voice']);
  });
});

describe('what this repo genuinely cannot answer', () => {
  it('reports quiet hours as UNKNOWN, never a comfortable false', async () => {
    // There is no per-lead timezone. A `false` would read as "safe to send at
    // 3am", which is worse than admitting we do not know.
    const c = await resolveContactability(BASE);
    expect(c.quiet_hours_active).toBeUndefined();
  });
});

describe('in_app', () => {
  it('stays eligible even when every outbound channel is suppressed', async () => {
    // A surface the learner chose to visit, not an interruption pushed at them —
    // so it is the right fallback for someone we may not email.
    leadFindByPk.mockResolvedValue({ status: 'unsubscribed' });
    const c = await resolveContactability(BASE);
    expect(c.in_app).toEqual({ eligible: true });
  });
});

describe('an unbridged learner', () => {
  it('resolves without a lead id rather than throwing', async () => {
    const c = await resolveContactability({ ...BASE, leadId: null });
    expect(leadFindByPk).not.toHaveBeenCalled();
    expect(c.email!.eligible).toBe(true);
  });
});
