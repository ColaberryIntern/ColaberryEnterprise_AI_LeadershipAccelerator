import {
  decodeState, encodeState, pkceChallenge, pkceVerifier, STATE_TTL_MS, OAuthError,
} from '../oauthState';
import { encodeState as encodeLinkedInState, decodeState as decodeLinkedInState } from '../../linkedInOAuth';

const ENV = { JWT_SECRET: 'test-secret-one' } as NodeJS.ProcessEnv;
const OTHER = { JWT_SECRET: 'test-secret-two' } as NodeJS.ProcessEnv;
const NOW = 1_790_000_000_000;
const INPUT = { connector: 'meta', adminId: 'admin-1', brandId: 'brand-1' };

function errorClassOf(fn: () => unknown): string | null {
  try { fn(); return null; } catch (e) { return (e as OAuthError).errorClass; }
}

describe('the signed state', () => {
  it('round-trips the facts the callback trusts', () => {
    const { state, payload } = encodeState(INPUT, NOW, ENV);
    const back = decodeState(state, 'meta', NOW + 1000, ENV);
    expect(back).toEqual(payload);
    expect(back.connector).toBe('meta');
    expect(back.brandId).toBe('brand-1');
  });

  it('refuses a state whose body was edited - a different brand cannot be written in', () => {
    const { state } = encodeState(INPUT, NOW, ENV);
    const [body, sig] = state.split('.');
    const edited = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    edited.brandId = 'attacker-brand';
    const forged = `${Buffer.from(JSON.stringify(edited)).toString('base64url')}.${sig}`;
    expect(errorClassOf(() => decodeState(forged, 'meta', NOW, ENV))).toBe('StateInvalid');
  });

  it('refuses a state signed with a different secret', () => {
    const { state } = encodeState(INPUT, NOW, OTHER);
    expect(errorClassOf(() => decodeState(state, 'meta', NOW, ENV))).toBe('StateInvalid');
  });

  it('refuses malformed input without throwing anything but an OAuthError', () => {
    for (const bad of ['', 'no-dot', 'a.b.c', 'bad.sig']) {
      expect(errorClassOf(() => decodeState(bad, 'meta', NOW, ENV))).toBe('StateInvalid');
    }
  });

  it('expires after the TTL, and not before', () => {
    const { state } = encodeState(INPUT, NOW, ENV);
    expect(() => decodeState(state, 'meta', NOW + STATE_TTL_MS, ENV)).not.toThrow();
    expect(errorClassOf(() => decodeState(state, 'meta', NOW + STATE_TTL_MS + 1, ENV))).toBe('StateExpired');
  });

  it('refuses a genuine state minted for ANOTHER network - the replay the connector field exists for', () => {
    const { state } = encodeState(INPUT, NOW, ENV);
    expect(errorClassOf(() => decodeState(state, 'x', NOW, ENV))).toBe('StateConnectorMismatch');
  });

  it('two attempts in the same millisecond still differ', () => {
    expect(encodeState(INPUT, NOW, ENV).state).not.toBe(encodeState(INPUT, NOW, ENV).state);
  });

  it('cannot be signed without JWT_SECRET, and says why', () => {
    expect(errorClassOf(() => encodeState(INPUT, NOW, {} as NodeJS.ProcessEnv))).toBe('ConfigMissing');
  });
});

describe('domain separation from the older LinkedIn state', () => {
  // Both flows sign with JWT_SECRET. They must not accept each other's states.
  it('a LinkedIn-flow state does not decode here', () => {
    const li = encodeLinkedInState({ adminId: 'admin-1', brandId: 'brand-1' }, NOW, ENV);
    expect(errorClassOf(() => decodeState(li, 'linkedin', NOW, ENV))).toBe('StateInvalid');
  });

  it('a state from here does not decode in the LinkedIn flow', () => {
    const { state } = encodeState({ ...INPUT, connector: 'linkedin_org' }, NOW, ENV);
    expect(() => decodeLinkedInState(state, NOW, ENV)).toThrow();
  });
});

describe('PKCE', () => {
  it('computes the S256 challenge exactly as RFC 7636 Appendix B does', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('the verifier is 43 unreserved characters - inside RFC 7636\'s 43-128', () => {
    const v = pkceVerifier('nonce-a', ENV);
    expect(v).toHaveLength(43);
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('is recomputable from the nonce, so nothing is stored between redirect and callback', () => {
    expect(pkceVerifier('nonce-a', ENV)).toBe(pkceVerifier('nonce-a', ENV));
    expect(pkceVerifier('nonce-a', ENV)).not.toBe(pkceVerifier('nonce-b', ENV));
  });

  it('cannot be computed without the server secret - what keeps an intercepted code useless', () => {
    expect(pkceVerifier('nonce-a', ENV)).not.toBe(pkceVerifier('nonce-a', OTHER));
  });

  it('never appears in the browser-visible state', () => {
    const { state, payload } = encodeState(INPUT, NOW, ENV);
    const verifier = pkceVerifier(payload.nonce, ENV);
    const decodedBody = Buffer.from(state.split('.')[0], 'base64url').toString('utf8');
    expect(state).not.toContain(verifier);
    expect(decodedBody).not.toContain(verifier);
  });
});
