import {
  ROOM_JOIN_PATH_PREFIX,
  ROOM_JOIN_TOKEN_KEY,
  generateJoinToken,
  isJoinTokenShape,
  joinUrlForToken,
  readJoinToken,
  resolveRoomJoin,
  type JoinableRoom,
} from '../roomJoinToken';

const TOKEN = 'a'.repeat(32);
const OTHER = 'b'.repeat(32);

function room(over: Partial<JoinableRoom> = {}): JoinableRoom {
  return {
    status: 'active',
    meeting_link: 'https://example.zoom.us/j/01234567890',
    metadata: { [ROOM_JOIN_TOKEN_KEY]: TOKEN },
    ...over,
  };
}

describe('generateJoinToken', () => {
  it('is 32 lowercase hex characters', () => {
    expect(generateJoinToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('does not repeat across many mints', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateJoinToken()));
    expect(seen.size).toBe(500);
  });

  it('produces a token its own shape check accepts', () => {
    expect(isJoinTokenShape(generateJoinToken())).toBe(true);
  });
});

describe('isJoinTokenShape', () => {
  it('accepts exactly 32 lowercase hex characters', () => {
    expect(isJoinTokenShape(TOKEN)).toBe(true);
  });

  it.each([
    ['too short', 'a'.repeat(31)],
    ['too long', 'a'.repeat(33)],
    ['uppercase hex', 'A'.repeat(32)],
    ['non-hex letter', `${'a'.repeat(31)}z`],
    ['empty', ''],
    ['a path traversal', '../'.repeat(10) + 'aa'],
    ['sql-ish', "' OR 1=1 --".padEnd(32, 'a')],
  ])('rejects %s', (_label, value) => {
    expect(isJoinTokenShape(value)).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a number', 1234],
    ['an object', { token: TOKEN }],
    ['an array', [TOKEN]],
  ])('rejects %s without throwing', (_label, value) => {
    expect(isJoinTokenShape(value)).toBe(false);
  });
});

describe('readJoinToken', () => {
  it('returns the stored token', () => {
    expect(readJoinToken({ [ROOM_JOIN_TOKEN_KEY]: TOKEN })).toBe(TOKEN);
  });

  it('returns null when there is no token', () => {
    expect(readJoinToken({})).toBeNull();
    expect(readJoinToken(null)).toBeNull();
    expect(readJoinToken(undefined)).toBeNull();
  });

  it('returns null for a stored value that is not a token, rather than handing it back', () => {
    expect(readJoinToken({ [ROOM_JOIN_TOKEN_KEY]: 'nope' })).toBeNull();
    expect(readJoinToken({ [ROOM_JOIN_TOKEN_KEY]: 12345 })).toBeNull();
  });
});

describe('joinUrlForToken', () => {
  it('builds the address under the mounted prefix', () => {
    expect(joinUrlForToken('https://portal.example.com', TOKEN))
      .toBe(`https://portal.example.com${ROOM_JOIN_PATH_PREFIX}/${TOKEN}`);
  });

  it('does not double the slash when the origin has a trailing one', () => {
    expect(joinUrlForToken('https://portal.example.com/', TOKEN))
      .toBe(`https://portal.example.com${ROOM_JOIN_PATH_PREFIX}/${TOKEN}`);
    expect(joinUrlForToken('https://portal.example.com///', TOKEN)).not.toContain('//api');
  });

  // The prefix cannot collide with /api/public/portfolio/:token, where a token
  // would happily match a slug - a collision resolved by mount order and
  // maddening to debug. publicCareerPortfolioRoutes.ts carries the same warning.
  it('is not mounted under a prefix that an existing :token route would shadow', () => {
    expect(ROOM_JOIN_PATH_PREFIX).toBe('/api/public/rooms/join');
    expect(ROOM_JOIN_PATH_PREFIX.startsWith('/api/public/portfolio')).toBe(false);
  });
});

describe('resolveRoomJoin', () => {
  it('resolves to the room current link', () => {
    expect(resolveRoomJoin(room(), TOKEN)).toEqual({
      ok: true,
      joinUrl: 'https://example.zoom.us/j/01234567890',
    });
  });

  it('follows the link as it is now, which is the entire point', () => {
    const reminted = room({ meeting_link: 'https://example.zoom.us/j/99999999999' });
    expect(resolveRoomJoin(reminted, TOKEN)).toEqual({
      ok: true,
      joinUrl: 'https://example.zoom.us/j/99999999999',
    });
  });

  it('keeps a passcode in the query string intact', () => {
    const withPwd = room({ meeting_link: 'https://example.zoom.us/j/8477?pwd=secret' });
    const out = resolveRoomJoin(withPwd, TOKEN);
    expect(out).toEqual({ ok: true, joinUrl: 'https://example.zoom.us/j/8477?pwd=secret' });
  });

  it('refuses a malformed token before anything else', () => {
    expect(resolveRoomJoin(room(), 'nope')).toEqual({ ok: false, reason: 'bad_token_shape' });
    expect(resolveRoomJoin(null, 'nope')).toEqual({ ok: false, reason: 'bad_token_shape' });
  });

  it('refuses when the lookup found nothing', () => {
    expect(resolveRoomJoin(null, TOKEN)).toEqual({ ok: false, reason: 'no_such_token' });
    expect(resolveRoomJoin(undefined, TOKEN)).toEqual({ ok: false, reason: 'no_such_token' });
  });

  it('refuses a room that carries no token', () => {
    expect(resolveRoomJoin(room({ metadata: {} }), TOKEN)).toEqual({ ok: false, reason: 'no_such_token' });
  });

  // A lookup that queried on the token cannot return the wrong room - which is
  // exactly why this is checked. Without it, a lookup bug would redirect someone
  // into a room they hold no token for and still look like a working redirect.
  it('refuses when the room token is not the token presented', () => {
    expect(resolveRoomJoin(room({ metadata: { [ROOM_JOIN_TOKEN_KEY]: OTHER } }), TOKEN))
      .toEqual({ ok: false, reason: 'token_mismatch' });
  });

  it.each(['archived', 'locked', 'removed'])('refuses a %s room', (status) => {
    expect(resolveRoomJoin(room({ status }), TOKEN)).toEqual({ ok: false, reason: 'room_not_active' });
  });

  it('refuses a room whose status is missing rather than assuming it is live', () => {
    expect(resolveRoomJoin(room({ status: null }), TOKEN)).toEqual({ ok: false, reason: 'room_not_active' });
    expect(resolveRoomJoin(room({ status: undefined }), TOKEN)).toEqual({ ok: false, reason: 'room_not_active' });
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('refuses a room whose meeting_link is %s', (_label, link) => {
    expect(resolveRoomJoin(room({ meeting_link: link }), TOKEN))
      .toEqual({ ok: false, reason: 'no_meeting_link' });
  });

  // Privacy is deliberately NOT consulted: the redirect has to work for a
  // calendar attendee who is not logged in, and the token is the authorization.
  it.each(['public', 'cohort', 'invite_only', 'private'])('resolves regardless of privacy=%s', (privacy) => {
    const r = { ...room(), privacy } as JoinableRoom;
    expect(resolveRoomJoin(r, TOKEN).ok).toBe(true);
  });
});
