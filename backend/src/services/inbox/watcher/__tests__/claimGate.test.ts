import { verifyClaims, ClaimBundle, Evidence, Claim } from '../claimGate';

/**
 * A reply claiming a fix that was not verified is worse than no reply. These
 * tests pin the shapes that failure actually takes: a fix claim backed only by
 * the read that diagnosed it, a "verification" timestamped before the change,
 * a verified claim that never made it into the email, and an email that
 * promises a repair no claim supports.
 */

const BEFORE = '2026-08-17T03:00:00.000Z';
const ACTION = '2026-08-17T03:00:05.000Z';
const AFTER = '2026-08-17T03:00:09.000Z';

const preRead: Evidence = {
  id: 'pre', what: 'enrollments row', result: 'portal_token_expires_at=2026-08-15T20:41:59Z', at: BEFORE,
};
const postRead: Evidence = {
  id: 'post', what: 'enrollments row re-read', result: 'portal_token_expires_at=2026-08-18T03:00:09Z',
  at: AFTER, postChange: true,
};

const checkedClaim: Claim = {
  id: 'c1', kind: 'checked',
  text: 'I checked your account and it resolves to exactly one active enrollment.',
  evidenceIds: ['pre'],
};
const fixedClaim: Claim = {
  id: 'c2', kind: 'fixed',
  text: 'I have just sent you a fresh sign in link, and I confirmed it is live.',
  evidenceIds: ['post'],
};

const bodyWith = (...claims: Claim[]) =>
  ['Hi Liza,', '', ...claims.map((c) => c.text), '', 'Ali'].join('\n');

describe('a well-formed reply passes', () => {
  it('accepts a checked claim plus a fix confirmed after the change', () => {
    const bundle: ClaimBundle = {
      claims: [checkedClaim, fixedClaim], evidence: [preRead, postRead], actionAt: ACTION,
    };
    expect(verifyClaims(bundle, bodyWith(checkedClaim, fixedClaim))).toEqual({ ok: true });
  });

  it('accepts a diagnosis-only reply with no fix claim at all', () => {
    const bundle: ClaimBundle = { claims: [checkedClaim], evidence: [preRead] };
    expect(verifyClaims(bundle, bodyWith(checkedClaim))).toEqual({ ok: true });
  });
});

describe('a claimed fix that was not verified is refused', () => {
  it('refuses a fix claim backed only by the read that diagnosed it', () => {
    const claim: Claim = { ...fixedClaim, evidenceIds: ['pre'] };
    const bundle: ClaimBundle = { claims: [claim], evidence: [preRead], actionAt: ACTION };
    const verdict = verifyClaims(bundle, bodyWith(claim));
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('unverified_fix');
  });

  it('refuses a fix claim whose confirmation is timestamped BEFORE the change', () => {
    // The subtle one: evidence flagged postChange, but gathered before the write.
    const staleConfirmation: Evidence = { ...postRead, at: BEFORE, postChange: true };
    const bundle: ClaimBundle = {
      claims: [fixedClaim], evidence: [staleConfirmation], actionAt: ACTION,
    };
    const verdict = verifyClaims(bundle, bodyWith(fixedClaim));
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('stale_verification');
  });

  it('refuses a fix claim when the bundle records no moment of change', () => {
    const bundle: ClaimBundle = { claims: [fixedClaim], evidence: [postRead] };
    const verdict = verifyClaims(bundle, bodyWith(fixedClaim));
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('stale_verification');
  });

  it('refuses a claim citing evidence that does not exist', () => {
    const claim: Claim = { ...checkedClaim, evidenceIds: ['nope'] };
    const bundle: ClaimBundle = { claims: [claim], evidence: [preRead] };
    expect(verifyClaims(bundle, bodyWith(claim)).rejection).toBe('unknown_evidence');
  });

  it('refuses a claim citing no evidence at all', () => {
    const claim: Claim = { ...checkedClaim, evidenceIds: [] };
    const bundle: ClaimBundle = { claims: [claim], evidence: [preRead] };
    expect(verifyClaims(bundle, bodyWith(claim)).rejection).toBe('unbacked_claim');
  });

  it('refuses a reply with no claims', () => {
    expect(verifyClaims({ claims: [], evidence: [] }, 'Hi Liza, all sorted.').rejection).toBe('no_claims');
  });
});

describe('the gate checks the email, not just the list', () => {
  it('refuses when a verified claim does not appear in the body being sent', () => {
    const bundle: ClaimBundle = {
      claims: [checkedClaim, fixedClaim], evidence: [preRead, postRead], actionAt: ACTION,
    };
    // Body contains only the checked claim; the fix claim was verified but dropped.
    const verdict = verifyClaims(bundle, bodyWith(checkedClaim));
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('claim_absent_from_body');
  });

  it('refuses a body that promises a repair no claim supports', () => {
    const bundle: ClaimBundle = { claims: [checkedClaim], evidence: [preRead] };
    const body = `${bodyWith(checkedClaim)}\n\nYour account is now working, try again.`;
    const verdict = verifyClaims(bundle, body);
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('unbacked_fix_language');
  });

  it('refuses "I have fixed it" with no fix claim', () => {
    const bundle: ClaimBundle = { claims: [checkedClaim], evidence: [preRead] };
    const verdict = verifyClaims(bundle, `${bodyWith(checkedClaim)}\n\nI have fixed it on my side.`);
    expect(verdict.rejection).toBe('unbacked_fix_language');
  });

  it('refuses "you can now sign in" with no fix claim', () => {
    const bundle: ClaimBundle = { claims: [checkedClaim], evidence: [preRead] };
    const verdict = verifyClaims(bundle, `${bodyWith(checkedClaim)}\n\nYou can now sign in.`);
    expect(verdict.rejection).toBe('unbacked_fix_language');
  });

  it('allows assertive language once a verified fix claim backs it', () => {
    const bundle: ClaimBundle = {
      claims: [checkedClaim, fixedClaim], evidence: [preRead, postRead], actionAt: ACTION,
    };
    const body = `${bodyWith(checkedClaim, fixedClaim)}\n\nYou can now sign in.`;
    expect(verifyClaims(bundle, body)).toEqual({ ok: true });
  });
});
