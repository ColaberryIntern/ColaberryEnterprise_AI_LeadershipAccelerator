jest.mock('../../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai', jwtSecret: 'test-secret' } }));
jest.mock('../../caseStudy/caseStudySurfaceProfiles', () => ({ getCaseStudySurfaceProfile: () => ({ publicBaseUrl: 'https://hire.refactored.ai/' }) }));

import { candidateRoomUrl, roomPageUrl, verifyRoomLink, ROOM_LINK_GRACE_MS } from '../roomLink';
import { SENTINEL_PROVIDER_URL } from './helpers/noRoomUrl';

/** CP8.2b / CP9.1: the two consent-room PAGE links the booking messages carry (never the provider's link). */
const END = new Date('2026-11-23T15:30:00Z');

describe('candidateRoomUrl (the learner, signed in to the portal)', () => {
  it('is the portal interview page for that interview, on the configured frontend', () => {
    expect(candidateRoomUrl('iv-1')).toBe('https://enterprise.colaberry.ai/portal/career/interview/iv-1');
    expect(candidateRoomUrl('iv-1', 'https://staging.example/')).toBe('https://staging.example/portal/career/interview/iv-1');
  });
  it('encodes the id, so a strange id can never change the path', () => {
    expect(candidateRoomUrl('a/../b?x=1')).toBe('https://enterprise.colaberry.ai/portal/career/interview/a%2F..%2Fb%3Fx%3D1');
  });
  it('carries no token and is never the provider link', () => {
    expect(candidateRoomUrl('iv-1')).not.toMatch(/[?&]t=|zoom/);
    expect(candidateRoomUrl('iv-1')).not.toContain(SENTINEL_PROVIDER_URL);
  });
});

describe('roomPageUrl (the employer, no sign-in: a signed link that expires)', () => {
  const url = new URL(roomPageUrl('iv-1', END));
  const q = { i: url.searchParams.get('i') as string, e: url.searchParams.get('e') as string, t: url.searchParams.get('t') as string };
  it('is the hire site room page with the interview, the end time and a signature', () => {
    expect(`${url.origin}${url.pathname}`).toBe('https://hire.refactored.ai/room/');
    expect(q).toMatchObject({ i: 'iv-1', e: String(END.getTime()) });
    expect(q.t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('verifies until 2 hours after the end, then not; a changed id, end or secret never verifies', () => {
    expect(verifyRoomLink({ ...q, now: new Date(END.getTime() + ROOM_LINK_GRACE_MS) })).toBe(true);
    expect(verifyRoomLink({ ...q, now: new Date(END.getTime() + ROOM_LINK_GRACE_MS + 1) })).toBe(false);
    expect(verifyRoomLink({ ...q, i: 'iv-2', now: END })).toBe(false);
    expect(verifyRoomLink({ ...q, e: String(END.getTime() + 60_000), now: END })).toBe(false);
    expect(verifyRoomLink({ ...q, now: END, secret: 'other' })).toBe(false);
  });
});
