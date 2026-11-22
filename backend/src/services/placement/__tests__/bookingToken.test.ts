import { hashBookingToken, isPlausibleToken, newBookingToken, TOKEN_TTL_MS, tokenStatus } from '../bookingToken';
import { roomPageUrl, verifyRoomLink, ROOM_LINK_GRACE_MS } from '../roomLink';

/** CP8.2 (kit F4 step 3): the booking token (single use, 14 days, hash only) and the employer's signed room-page link. */
const NOW = new Date('2026-11-21T18:00:00Z');
const row = (over: Partial<Parameters<typeof tokenStatus>[0]> = {}) => ({ state: 'new', token_expires_at: new Date(NOW.getTime() + TOKEN_TTL_MS), token_used_at: null, ...over });

describe('tokenStatus', () => {
  it('ok until 14 days exactly; 14 days + 1 s is expired', () => {
    const issued = newBookingToken(NOW);
    const facts = row({ token_expires_at: issued.expiresAt });
    expect(tokenStatus(facts, new Date(NOW.getTime() + TOKEN_TTL_MS))).toBe('ok');
    expect(tokenStatus(facts, new Date(NOW.getTime() + TOKEN_TTL_MS + 1000))).toBe('expired');
    expect(tokenStatus(facts, new Date(NOW.getTime() + TOKEN_TTL_MS + 1))).toBe('expired'); // any moment after is expired
  });
  it('a used token is used (even if also expired); an interview no longer open is closed; no expiry is expired', () => {
    expect(tokenStatus(row({ token_used_at: NOW, token_expires_at: new Date(0) }), NOW)).toBe('used');
    for (const state of ['booked', 'done', 'cancelled']) expect(tokenStatus(row({ state }), NOW)).toBe('closed');
    for (const state of ['new', 'awaiting', 'review']) expect(tokenStatus(row({ state }), NOW)).toBe('ok');
    expect(tokenStatus(row({ token_expires_at: null }), NOW)).toBe('expired');
  });
  it('only the minted shape is plausible (no database read for anything else)', () => {
    const t = newBookingToken(NOW).token;
    expect(isPlausibleToken(t)).toBe(true);
    for (const bad of ['', 'short', `${t}x`, t.replace(/./, '!'), null, 42]) expect(isPlausibleToken(bad)).toBe(false);
    expect(hashBookingToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('roomPageUrl / verifyRoomLink', () => {
  const SECRET = ['room', 'link', 'test'].join('-');
  const END = new Date('2026-11-23T15:30:00Z');
  const parts = (url: string) => Object.fromEntries(new URL(url).searchParams.entries()) as { i: string; e: string; t: string };
  it('is the hire site room PAGE with the id, the end time and a signature; valid until end + 2 h exactly', () => {
    const url = roomPageUrl('iv-1', END, SECRET);
    expect(url).toMatch(/^https:\/\/hire\.refactored\.ai\/room\/\?i=iv-1&e=\d+&t=[A-Za-z0-9_-]{43}$/);
    expect(verifyRoomLink({ ...parts(url), now: new Date(END.getTime() + ROOM_LINK_GRACE_MS), secret: SECRET })).toBe(true);
    expect(verifyRoomLink({ ...parts(url), now: new Date(END.getTime() + ROOM_LINK_GRACE_MS + 1000), secret: SECRET })).toBe(false);
  });
  it('a changed id, a moved end time, another key or a junk signature is refused', () => {
    const p = parts(roomPageUrl('iv-1', END, SECRET));
    expect(verifyRoomLink({ ...p, i: 'iv-2', now: END, secret: SECRET })).toBe(false);
    expect(verifyRoomLink({ ...p, e: String(END.getTime() + 3_600_000), now: END, secret: SECRET })).toBe(false);
    expect(verifyRoomLink({ ...p, now: END, secret: 'another' })).toBe(false);
    expect(verifyRoomLink({ ...p, t: 'x', now: END, secret: SECRET })).toBe(false);
  });
});
