/**
 * portalLinkTokenService — the mint and the claim.
 *
 * Mocked DB, in the repo's usual convention, so importing never opens a
 * connection. What that lets these tests prove is the SHAPE of what is sent:
 * that the raw token never reaches the database, that the claim is one statement
 * rather than a read followed by a write, and that the statement carries the three
 * conditions it needs. What it cannot prove is that Postgres honours them — a
 * mock accepts any SQL, including SQL the server would reject.
 *
 * The property most worth guarding here is `COALESCE(used_at, NOW())`. Writing
 * NOW() unconditionally would slide the replay grace forward on every attempt, so
 * a token polled once a minute would live forever. That is the exact inverse of
 * single use, it would be invisible in manual testing, and it is one word.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import crypto from 'crypto';
import { sequelize } from '../../config/database';
import {
  mintPortalLinkToken,
  claimPortalLinkToken,
  hashToken,
  PURPOSE_DM_NOTIFICATION,
  DEFAULT_TTL_MS,
} from '../portalLinkTokenService';

const mockQuery = sequelize.query as unknown as jest.Mock;

const ENROLLMENT = '3280b47e-67b7-411a-8926-4f9c3b86c97d';
const SAFE_NEXT = '/portal/messages/6316fb8d-b362-4b02-b180-2cfb4a8ff800';

type QueryCall = [string, { bind?: Record<string, unknown> }?];

const callsMatching = (re: RegExp): QueryCall[] =>
  (mockQuery.mock.calls as QueryCall[]).filter((c) => re.test(String(c[0])));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockResolvedValue([[]]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('mintPortalLinkToken', () => {
  it('returns a token and stores only its hash — the raw value never reaches the database', async () => {
    const raw = await mintPortalLinkToken({
      enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION, nextPath: SAFE_NEXT,
    });

    expect(raw).toBeTruthy();
    const insert = callsMatching(/INSERT INTO portal_link_tokens/)[0];
    expect(insert).toBeDefined();

    const bind = (insert[1]?.bind ?? {}) as Record<string, unknown>;
    expect(bind.hash).toBe(hashToken(raw as string));

    // The real assertion: the token itself appears nowhere in what was sent.
    // Checked across every bind value AND the SQL text, because a future
    // refactor that interpolated it would still pass a check on binds alone.
    const everythingSent = JSON.stringify(mockQuery.mock.calls);
    expect(everythingSent).not.toContain(raw as string);
  });

  it('mints a token with real entropy, and a different one every time', async () => {
    const a = await mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION });
    const b = await mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION });

    expect(a).not.toBe(b);
    // 32 random bytes in base64url is 43 characters. Guards against someone
    // swapping in a short or guessable id, which a "is it truthy" test would miss.
    expect((a as string).length).toBeGreaterThanOrEqual(43);
    expect(a as string).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('refuses to store an unsafe next path, storing null instead of the value', async () => {
    await mintPortalLinkToken({
      enrollmentId: ENROLLMENT,
      purpose: PURPOSE_DM_NOTIFICATION,
      nextPath: 'https://evil.example.com/steal',
    });

    const bind = (callsMatching(/INSERT INTO portal_link_tokens/)[0][1]?.bind ?? {}) as Record<string, unknown>;
    expect(bind.nextPath).toBeNull();
  });

  it('defaults the lifetime to the portal magic link s own, granting nothing longer', async () => {
    const before = Date.now();
    await mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION });

    const bind = (callsMatching(/INSERT INTO portal_link_tokens/)[0][1]?.bind ?? {}) as Record<string, unknown>;
    const expiresAt = bind.expiresAt as Date;
    const ttl = expiresAt.getTime() - before;

    expect(ttl).toBeGreaterThan(DEFAULT_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(DEFAULT_TTL_MS + 5000);
  });

  it('fails SOFT: a write error returns null rather than throwing, so the email still sends', async () => {
    mockQuery.mockRejectedValue(new Error('relation "portal_link_tokens" does not exist'));

    await expect(
      mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION }),
    ).resolves.toBeNull();
  });

  it('never logs the token, even when the write fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockQuery.mockRejectedValue(new Error('boom'));

    await mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION });

    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('portal_link_token_mint_failed');
    expect(logged).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it('tidies expired rows for this enrollment only, so it stays an index seek', async () => {
    await mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION });

    const del = callsMatching(/DELETE FROM portal_link_tokens/)[0];
    expect(del).toBeDefined();
    expect(String(del[0])).toMatch(/enrollment_id = \$enrollmentId/);
  });

  it('a failed tidy still returns the token — housekeeping never costs somebody their link', async () => {
    mockQuery
      .mockResolvedValueOnce([[]])                       // the INSERT succeeds
      .mockRejectedValueOnce(new Error('deadlock'));     // the DELETE does not

    await expect(
      mintPortalLinkToken({ enrollmentId: ENROLLMENT, purpose: PURPOSE_DM_NOTIFICATION }),
    ).resolves.toBeTruthy();
  });
});

describe('claimPortalLinkToken', () => {
  const claimSql = () => String(callsMatching(/UPDATE portal_link_tokens/)[0][0]);

  it('redeems a live token and returns the enrollment and destination', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ENROLLMENT, next_path: SAFE_NEXT }]]);

    await expect(claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION)).resolves.toEqual({
      enrollmentId: ENROLLMENT,
      nextPath: SAFE_NEXT,
    });
  });

  it('looks the token up BY HASH, never by the token itself', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ENROLLMENT, next_path: null }]]);

    await claimPortalLinkToken('a-secret-token', PURPOSE_DM_NOTIFICATION);

    const bind = (callsMatching(/UPDATE portal_link_tokens/)[0][1]?.bind ?? {}) as Record<string, unknown>;
    expect(bind.hash).toBe(crypto.createHash('sha256').update('a-secret-token', 'utf8').digest('hex'));
    expect(JSON.stringify(mockQuery.mock.calls)).not.toContain('a-secret-token');
  });

  it('keeps the FIRST use time — the grace window must not slide forward on replay', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ENROLLMENT, next_path: null }]]);

    await claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION);

    // The one-word bug this guards: `SET used_at = NOW()` would renew the window
    // on every attempt and the token would never actually expire from use.
    expect(claimSql()).toMatch(/SET used_at = COALESCE\(used_at, NOW\(\)\)/);
  });

  it('is a single statement: the test and the write happen together, not read-then-write', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ENROLLMENT, next_path: null }]]);

    await claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION);

    expect(callsMatching(/SELECT .* FROM portal_link_tokens/i)).toHaveLength(0);
    expect(callsMatching(/UPDATE portal_link_tokens/)).toHaveLength(1);
    expect(claimSql()).toMatch(/RETURNING enrollment_id, next_path/);
  });

  it('carries all three conditions: not expired, right purpose, unused or inside the grace', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ENROLLMENT, next_path: null }]]);

    await claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION);
    const sql = claimSql();

    expect(sql).toMatch(/expires_at > NOW\(\)/);
    expect(sql).toMatch(/purpose = \$purpose/);
    expect(sql).toMatch(/used_at IS NULL OR used_at > NOW\(\)/);
  });

  it('returns null when nothing matched — expired, unknown, or replayed too late', async () => {
    mockQuery.mockResolvedValue([[]]);

    await expect(claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION)).resolves.toBeNull();
  });

  it('re-validates next_path on the way out, so a tampered row cannot become a redirect', async () => {
    mockQuery.mockResolvedValue([[{ enrollment_id: ENROLLMENT, next_path: '//evil.example.com' }]]);

    const result = await claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION);
    expect(result).toEqual({ enrollmentId: ENROLLMENT, nextPath: null });
  });

  it('boundary: an empty or non-string token is refused without touching the database', async () => {
    await expect(claimPortalLinkToken('')).resolves.toBeNull();
    await expect(claimPortalLinkToken(undefined as unknown as string)).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('a database error returns null rather than throwing into the verify route', async () => {
    mockQuery.mockRejectedValue(new Error('connection reset'));

    await expect(claimPortalLinkToken('tok', PURPOSE_DM_NOTIFICATION)).resolves.toBeNull();
  });
});

describe('hashToken', () => {
  it('is sha256 hex, and stable', () => {
    expect(hashToken('abc')).toBe(crypto.createHash('sha256').update('abc', 'utf8').digest('hex'));
    expect(hashToken('abc')).toHaveLength(64);
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});
