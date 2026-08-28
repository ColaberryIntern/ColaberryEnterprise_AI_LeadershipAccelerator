import {
  GENERIC_LINK_INVALID,
  GENERIC_LINK_REQUEST_RESPONSE,
  MAGIC_LINK_TTL_MS,
  MAX_REQUESTS_PER_HOUR,
  checkRateLimit,
  decideRedemption,
  hashToken,
  mintToken,
  normalizeEmail,
} from '../../../modules/delivery/clientMagicLink';

/**
 * The magic-link rules, tested without a database, a mailer or a real clock.
 *
 * Every assertion here is against the rule itself rather than a fixture, which is the
 * lesson from earlier in this feature: a test written from the same assumption as the
 * code cannot check that assumption.
 */

const at = (iso: string) => new Date(iso);

describe('token hashing', () => {
  it('never lets the stored value be the credential', () => {
    const { token, tokenHash } = mintToken();
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toHaveLength(64);
    // The property that matters: someone reading the column cannot reverse it into a
    // working link. Sponsors store the raw UUID, so anyone who can read that column can
    // sign in as the sponsor.
    expect(tokenHash).not.toContain(token);
  });

  it('is deterministic, so redemption can look a token up by hash', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  it('mints a token that expires in an hour, not the sponsor pattern 30 days', () => {
    const before = Date.now();
    const { expiresAt } = mintToken();
    const ttl = expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThan(MAGIC_LINK_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(MAGIC_LINK_TTL_MS + 5_000);
  });

  it('mints a different token every time', () => {
    expect(mintToken().token).not.toBe(mintToken().token);
  });
});

describe('redemption', () => {
  const now = at('2026-08-27T12:00:00Z');

  it('accepts a live, unused token', () => {
    expect(
      decideRedemption(
        { tokenHash: 'h', expiresAt: at('2026-08-27T12:30:00Z'), consumedAt: null },
        now,
      ),
    ).toEqual({ valid: true });
  });

  it('refuses an expired token', () => {
    expect(
      decideRedemption(
        { tokenHash: 'h', expiresAt: at('2026-08-27T11:59:59Z'), consumedAt: null },
        now,
      ),
    ).toEqual({ valid: false, reason: 'expired' });
  });

  it('refuses a token that expires exactly now', () => {
    // The boundary is deliberately closed: at the instant of expiry the link is dead.
    expect(
      decideRedemption({ tokenHash: 'h', expiresAt: now, consumedAt: null }, now),
    ).toEqual({ valid: false, reason: 'expired' });
  });

  it('refuses a token that was already used, even while unexpired', () => {
    // The single-use property. Without it a link stays a live credential in an inbox,
    // and mail archives outlive engagements.
    expect(
      decideRedemption(
        {
          tokenHash: 'h',
          expiresAt: at('2026-08-27T12:30:00Z'),
          consumedAt: at('2026-08-27T11:05:00Z'),
        },
        now,
      ),
    ).toEqual({ valid: false, reason: 'already_used' });
  });

  it('refuses a token that does not exist', () => {
    expect(decideRedemption(null, now)).toEqual({ valid: false, reason: 'not_found' });
  });

  it('reports the three failures separately for the LOG, while the user message is one', () => {
    // The reasons differ internally and must not differ externally: "expired",
    // "already used" and "never existed" each tell someone guessing tokens something
    // different about what they guessed.
    const reasons = [
      decideRedemption(null, now),
      decideRedemption({ tokenHash: 'h', expiresAt: at('2026-01-01T00:00:00Z'), consumedAt: null }, now),
      decideRedemption({ tokenHash: 'h', expiresAt: at('2026-12-01T00:00:00Z'), consumedAt: now }, now),
    ].map((v) => (v.valid ? 'valid' : v.reason));
    expect(new Set(reasons).size).toBe(3);
    expect(GENERIC_LINK_INVALID).not.toMatch(/expired|already|not found/i);
  });
});

describe('rate limiting', () => {
  const now = at('2026-08-27T12:00:00Z');

  it('allows a first request', () => {
    expect(checkRateLimit([], now)).toEqual({ allowed: true });
  });

  it('refuses a second request within a minute', () => {
    expect(
      checkRateLimit([{ createdAt: at('2026-08-27T11:59:30Z') }], now),
    ).toEqual({ allowed: false, reason: 'too_soon' });
  });

  it('allows again once the minute has passed', () => {
    expect(
      checkRateLimit([{ createdAt: at('2026-08-27T11:58:00Z') }], now),
    ).toEqual({ allowed: true });
  });

  it('caps the hour even when each request is spaced out', () => {
    const spaced = Array.from({ length: MAX_REQUESTS_PER_HOUR }, (_, i) => ({
      createdAt: at(`2026-08-27T11:${String(5 + i * 8).padStart(2, '0')}:00Z`),
    }));
    expect(checkRateLimit(spaced, now)).toEqual({ allowed: false, reason: 'hourly_cap' });
  });

  it('ignores requests older than an hour', () => {
    const old = Array.from({ length: 20 }, () => ({ createdAt: at('2026-08-27T10:00:00Z') }));
    expect(checkRateLimit(old, now)).toEqual({ allowed: true });
  });
});

describe('email normalisation', () => {
  it('lower-cases and trims, so capitalisation cannot bypass the rate limit', () => {
    expect(normalizeEmail('  Ali@Example.COM ')).toBe('ali@example.com');
  });

  it('rejects non-strings, empties and oversized values', () => {
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(123)).toBeNull();
    expect(normalizeEmail('   ')).toBeNull();
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(250)}@example.com`)).toBeNull();
  });

  it('stays permissive about shape, because it is a lookup key not a validity claim', () => {
    // A stricter pattern would reject legitimate addresses. An address matching nobody is
    // already handled by the uniform response, so there is nothing to gain by guessing.
    expect(normalizeEmail("o'brien+review@sub.domain.co.uk")).toBe(
      "o'brien+review@sub.domain.co.uk",
    );
  });
});

describe('the uniform responses', () => {
  it('never reveals whether an address has access', () => {
    expect(GENERIC_LINK_REQUEST_RESPONSE).not.toMatch(/no such|not found|unknown|no access/i);
    // It also must not promise a link was sent, since usually one was not.
    expect(GENERIC_LINK_REQUEST_RESPONSE).toMatch(/if that address/i);
  });
});
