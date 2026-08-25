import {
  evaluateContact,
  safeConsent,
  MAX_CONTACTS_PER_WINDOW,
  MIN_HOURS_BETWEEN_CONTACTS,
} from '../contactPolicy';
import type { Candidate } from '../types';

function candidate(channel: Candidate['channel'] = 'email'): Candidate {
  return {
    action_type: 'SEND_EMAIL',
    campaign_key: 'k',
    priority_tier: 9,
    intra_tier_score: 30,
    channel,
    required_assets: [],
    rationale: [],
  };
}

const ok = {
  channelEligible: true,
  consent: { verdict: 'allow' as const, reason: 'express_consent', hasRecord: true },
  recentContactCount: 0,
  hoursSinceLastContact: null,
};

describe('every rejection carries a reason', () => {
  it('never returns allowed:false without one', () => {
    const cases = [
      { ...ok, channelEligible: false },
      { ...ok, consent: { verdict: 'block' as const, reason: 'revoked', hasRecord: true } },
      { ...ok, recentContactCount: MAX_CONTACTS_PER_WINDOW },
      { ...ok, hoursSinceLastContact: 1 },
    ];
    for (const c of cases) {
      const v = evaluateContact(candidate(), c);
      if (!v.allowed) expect(v.reason).toBeTruthy();
    }
  });

  it('passes the channel reason through rather than inventing one', () => {
    const v = evaluateContact(candidate(), {
      ...ok,
      channelEligible: false,
      channelReason: 'lead_status_unsubscribed',
    });
    expect(v).toEqual({ allowed: false, reason: 'lead_status_unsubscribed' });
  });
});

describe('THE CRITICAL CASE: allow with no evidence is not consent', () => {
  it('distinguishes allowed-with-record from allowed-with-no-evidence', () => {
    // evaluateConsent returns ALLOW / can_spam_opt_out for anyone with no
    // consent record — which is most Explorers. Treating that as consent is
    // exactly how resolveContentPageAccess marked all 153 learners CONVERTED.
    const withRecord = evaluateContact(candidate(), ok);
    const noRecord = evaluateContact(candidate(), {
      ...ok,
      consent: { verdict: 'allow', reason: 'can_spam_opt_out', hasRecord: false },
    });

    expect(withRecord).toEqual({ allowed: true, basis: 'record' });
    expect(noRecord.allowed).toBe(true);
    expect((noRecord as any).basis).toBe('no_evidence');
    expect((noRecord as any).note).toContain('can_spam_opt_out');
  });

  it('surfaces the note so a human can see who we have no evidence for', () => {
    const v = evaluateContact(candidate(), {
      ...ok,
      consent: { verdict: 'allow', reason: 'can_spam_opt_out', hasRecord: false },
    });
    expect((v as any).note).toBeTruthy();
  });
});

describe('fail-closed against BOTH failure shapes', () => {
  // The previous plan tested only throwing; the draft after it tested only
  // fail-open and forbade the throw test. Both are real: assertConsentForSend
  // never throws, but evaluateConsent has no try/catch and evaluateSend guards
  // only its pause check.

  it('SHAPE 1 — a helper that RETURNS ALLOW while unable to tell', async () => {
    const r = await safeConsent(async () => ({
      verdict: 'allow',
      reason: 'can_spam_opt_out',
      hasRecord: false,
    }));
    const v = evaluateContact(candidate(), { ...ok, consent: r });
    expect((v as any).basis).toBe('no_evidence');
  });

  it('SHAPE 2 — a helper that THROWS becomes a block, not a crash', async () => {
    const r = await safeConsent(async () => {
      throw new Error('db down');
    });
    expect(r).toEqual({
      verdict: 'block',
      reason: 'consent_lookup_threw',
      hasRecord: false,
    });
    expect(evaluateContact(candidate(), { ...ok, consent: r }).allowed).toBe(false);
  });

  it('SHAPE 3 — a helper returning a malformed verdict blocks', async () => {
    const r = await safeConsent(async () => ({ verdict: 'maybe', reason: '', hasRecord: false } as any));
    expect(r.verdict).toBe('block');
    expect(r.reason).toBe('consent_unreadable');
  });

  it('treats missing policy input as a rejection', () => {
    expect(evaluateContact(candidate(), undefined as any)).toEqual({
      allowed: false,
      reason: 'policy_input_missing',
    });
  });
});

describe('frequency and cooldown', () => {
  it('rejects at the cap and permits below it', () => {
    expect(
      evaluateContact(candidate(), { ...ok, recentContactCount: MAX_CONTACTS_PER_WINDOW }).allowed,
    ).toBe(false);
    expect(
      evaluateContact(candidate(), { ...ok, recentContactCount: MAX_CONTACTS_PER_WINDOW - 1 }).allowed,
    ).toBe(true);
  });

  it('rejects inside the cooldown and permits at the boundary', () => {
    expect(
      evaluateContact(candidate(), { ...ok, hoursSinceLastContact: MIN_HOURS_BETWEEN_CONTACTS - 1 }).allowed,
    ).toBe(false);
    expect(
      evaluateContact(candidate(), { ...ok, hoursSinceLastContact: MIN_HOURS_BETWEEN_CONTACTS }).allowed,
    ).toBe(true);
  });

  it('treats never-contacted as no cooldown', () => {
    expect(evaluateContact(candidate(), { ...ok, hoursSinceLastContact: null }).allowed).toBe(true);
  });
});

describe('channel-less actions', () => {
  it('lets a human task through without channel or consent checks', () => {
    // There is nobody to protect from a task sitting in a queue.
    const v = evaluateContact(candidate('none'), {
      ...ok,
      channelEligible: false,
      consent: { verdict: 'block', reason: 'revoked', hasRecord: true },
    });
    expect(v.allowed).toBe(true);
  });
});

describe('ordering of reasons', () => {
  it('reports the channel problem before the frequency cap', () => {
    // The most informative reason wins, not whichever check ran first.
    const v = evaluateContact(candidate(), {
      ...ok,
      channelEligible: false,
      channelReason: 'lead_status_bounced',
      recentContactCount: 99,
    });
    expect((v as any).reason).toBe('lead_status_bounced');
  });
});
