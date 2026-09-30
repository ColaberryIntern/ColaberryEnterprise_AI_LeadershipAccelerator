/**
 * Unit tests for the signed unsubscribe token service.
 * Pure logic, no I/O — verifies the token cannot be forged and survives the
 * failure/boundary cases (tampered sig, wrong lead, wrong email, empty input).
 */
import { signUnsubscribe, verifyUnsubscribe, buildUnsubscribeUrl } from '../unsubscribeTokenService';

describe('unsubscribeTokenService', () => {
  const leadId = 5271;
  const email = 'haithamnori@gmail.com';

  it('signs deterministically and verifies its own token (happy path)', () => {
    const sig = signUnsubscribe(leadId, email);
    expect(sig).toMatch(/^[a-f0-9]{64}$/); // hex sha256
    expect(signUnsubscribe(leadId, email)).toBe(sig); // deterministic
    expect(verifyUnsubscribe(leadId, email, sig)).toBe(true);
  });

  it('normalizes email casing/whitespace so the token stays valid', () => {
    const sig = signUnsubscribe(leadId, '  HaithamNori@Gmail.com ');
    expect(verifyUnsubscribe(leadId, email, sig)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const sig = signUnsubscribe(leadId, email);
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyUnsubscribe(leadId, email, tampered)).toBe(false);
  });

  it('rejects a token minted for a different lead id', () => {
    const sig = signUnsubscribe(leadId, email);
    expect(verifyUnsubscribe(leadId + 1, email, sig)).toBe(false);
  });

  it('rejects a token minted for a different email (id guessing does not help)', () => {
    const sig = signUnsubscribe(leadId, email);
    expect(verifyUnsubscribe(leadId, 'someoneelse@gmail.com', sig)).toBe(false);
  });

  it('rejects empty / malformed signatures without throwing', () => {
    expect(verifyUnsubscribe(leadId, email, '')).toBe(false);
    // @ts-expect-error — exercising the runtime guard against non-string input
    expect(verifyUnsubscribe(leadId, email, undefined)).toBe(false);
    expect(verifyUnsubscribe(leadId, email, 'short')).toBe(false);
  });

  it('builds an absolute one-click URL carrying lid + sig', () => {
    const url = new URL(buildUnsubscribeUrl(leadId, email));
    expect(url.pathname).toBe('/api/unsubscribe');
    expect(url.searchParams.get('lid')).toBe(String(leadId));
    const sig = url.searchParams.get('sig') || '';
    expect(verifyUnsubscribe(leadId, email, sig)).toBe(true);
  });
});
