import {
  accessTokenExpiry, accountHealth, canPublish, daysUntil, handoffProviders, isLate,
  worstHealth, EXPIRY_WARNING_DAYS, LATE_GRACE_MS, type AccountLike,
} from '../overviewHealth';

const NOW = new Date('2026-09-18T15:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function account(over: Partial<AccountLike> = {}): AccountLike {
  return {
    status: 'connected',
    revoked_at: null,
    last_health_ok: true,
    credentials: [{ credential_type: 'access_token', token_expires_at: inDays(60) }],
    ...over,
  };
}

describe('which credential decides whether we can still publish', () => {
  it('reads the access token, not the refresh token', () => {
    expect(accessTokenExpiry(account({
      credentials: [
        { credential_type: 'refresh_token', token_expires_at: inDays(365) },
        { credential_type: 'access_token', token_expires_at: inDays(3) },
      ],
    }))).toEqual(inDays(3));
  });

  it('a live refresh token does NOT rescue a dead access token', () => {
    // The property this whole module exists for. connectAccount stores a refresh token; as of
    // 2026-09-18 nothing reads it - getAccessToken hands back the access-token row without
    // consulting its expiry and there is no refresh path. So an account in this state looks
    // fine and fails at publish time with a 401 nobody is watching for. If this test ever
    // starts failing because a refresh path was built, that is the moment to change the rule -
    // not before.
    const a = account({
      credentials: [
        { credential_type: 'refresh_token', token_expires_at: inDays(300) },
        { credential_type: 'access_token', token_expires_at: inDays(-1) },
      ],
    });
    expect(accountHealth(a, NOW)).toBe('expired');
    expect(canPublish(accountHealth(a, NOW))).toBe(false);
  });

  it('an account with no access token at all never expires rather than expiring now', () => {
    // Null must not read as "expired in 1970". The account is unhealthy for a different reason
    // and gets classified by the health check instead.
    const a = account({ credentials: [], last_health_ok: null });
    expect(accessTokenExpiry(a)).toBeNull();
    expect(daysUntil(null, NOW)).toBeNull();
    expect(accountHealth(a, NOW)).toBe('ok');
  });

  it('accepts an ISO string as readily as a Date, and refuses an unparseable one', () => {
    expect(accessTokenExpiry(account({
      credentials: [{ credential_type: 'access_token', token_expires_at: '2026-10-01T00:00:00Z' }],
    }))).toEqual(new Date('2026-10-01T00:00:00Z'));
    expect(accessTokenExpiry(account({
      credentials: [{ credential_type: 'access_token', token_expires_at: 'not a date' }],
    }))).toBeNull();
  });
});

describe('what the dot says', () => {
  it('healthy well before expiry', () => {
    expect(accountHealth(account(), NOW)).toBe('ok');
    expect(canPublish('ok')).toBe(true);
  });

  it('warns inside the window, and on its exact boundary', () => {
    expect(accountHealth(account({
      credentials: [{ credential_type: 'access_token', token_expires_at: inDays(EXPIRY_WARNING_DAYS) }],
    }), NOW)).toBe('expiring');
    expect(accountHealth(account({
      credentials: [{ credential_type: 'access_token', token_expires_at: inDays(EXPIRY_WARNING_DAYS + 1) }],
    }), NOW)).toBe('ok');
  });

  it('expiring still publishes - it is a reminder, not a stop', () => {
    expect(canPublish('expiring')).toBe(true);
  });

  it('revoked beats everything, including a perfectly live token', () => {
    expect(accountHealth(account({ status: 'revoked' }), NOW)).toBe('revoked');
    expect(accountHealth(account({ revoked_at: inDays(-2) }), NOW)).toBe('revoked');
  });

  it('an expired token beats a health check that passed before it expired', () => {
    // last_health_ok is a snapshot from whenever the check last ran. A check that passed three
    // days ago says nothing about a token that died yesterday, so expiry must win.
    expect(accountHealth(account({
      last_health_ok: true,
      credentials: [{ credential_type: 'access_token', token_expires_at: inDays(-1) }],
    }), NOW)).toBe('expired');
  });

  it('needs_reconnect and a failed health check both read as unhealthy', () => {
    expect(accountHealth(account({ status: 'needs_reconnect' }), NOW)).toBe('unhealthy');
    expect(accountHealth(account({ last_health_ok: false }), NOW)).toBe('unhealthy');
    expect(canPublish('unhealthy')).toBe(false);
  });

  it('a never-checked account is not held against it', () => {
    // null means "no check has run", which is the normal state right after connecting.
    expect(accountHealth(account({ last_health_ok: null }), NOW)).toBe('ok');
  });
});

describe('summarising several accounts', () => {
  it('reports the worst, not the first or the most common', () => {
    expect(worstHealth(['ok', 'ok', 'expired', 'ok'])).toBe('expired');
    expect(worstHealth(['expiring', 'unhealthy'])).toBe('unhealthy');
    expect(worstHealth(['revoked', 'expired'])).toBe('revoked');
    expect(worstHealth(['ok', 'ok'])).toBe('ok');
  });

  it('says nothing when there are no accounts, rather than "ok"', () => {
    // A brand with no accounts connected is not healthy - it is unconfigured, and the panel
    // renders an empty state for it. A green dot there would be a lie.
    expect(worstHealth([])).toBeNull();
  });
});

describe('late posts', () => {
  it('a post one minute past due is waiting for the next worker tick, not late', () => {
    expect(isLate(new Date(NOW.getTime() - 60 * 1000), NOW)).toBe(false);
  });

  it('past the grace window it is late', () => {
    expect(isLate(new Date(NOW.getTime() - LATE_GRACE_MS - 1000), NOW)).toBe(true);
  });

  it('a future post is never late, and an unscheduled one is never late', () => {
    expect(isLate(inDays(1), NOW)).toBe(false);
    expect(isLate(null, NOW)).toBe(false);
  });
});

describe('which networks you still post by hand', () => {
  it('lists the ones with no usable account', () => {
    expect(handoffProviders(['linkedin_member', 'x', 'meta'], ['linkedin_member']))
      .toEqual(['x', 'meta']);
  });

  it('counts a connected-but-broken account as hand-posting', () => {
    // The caller passes only accounts that canPublish. An expired LinkedIn listed as connected
    // is the reassurance this panel exists to stop giving.
    expect(handoffProviders(['linkedin_member', 'x'], [])).toEqual(['linkedin_member', 'x']);
  });

  it('is empty when everything is connected', () => {
    expect(handoffProviders(['linkedin_member'], ['linkedin_member'])).toEqual([]);
  });
});
