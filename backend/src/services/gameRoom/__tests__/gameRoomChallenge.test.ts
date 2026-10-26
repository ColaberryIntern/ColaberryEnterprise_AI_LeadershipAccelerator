// C35 (v8 G4): challenge a friend by DM: the ordinary DM rule, the text with the game link, once per (from, to, game, Central day),
// never to AI staff or yourself. The DM service and the message model are stubbed.
const mockSent: Array<{ room: string; text: string }> = [];
let mockExisting: unknown = null;
let mockFindWhere: Record<string, unknown> | null = null;
jest.mock('../../communityRooms/dmService', () => ({
  openDm: async (me: string, to: string) => { if (to === 'blocked') throw Object.assign(new Error('not allowed'), { name: 'DmError' }); return { roomId: `dm-${me}-${to}` }; },
  sendDmMessage: async (_ctx: unknown, room: string, text: string) => { mockSent.push({ room, text }); },
}));
jest.mock('../../../models/RoomMessage', () => ({ __esModule: true, default: { findOne: async (q: { where: Record<string, unknown> }) => { mockFindWhere = q.where; return mockExisting; } } }));
jest.mock('../../reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: async () => 'reese-1' }));
jest.mock('../../curriculum/daraIdentitySeed', () => ({ getDaraEnrollmentId: async () => 'dara-1' }));

import { inspect } from 'util';
import { memoryGameStore } from '../gameRoomMemoryStore';
import { __setGameRoomStoreForTests } from '../gameRoomService';
import { challenge, challengeText } from '../gameRoomChallenge';

beforeEach(() => {
  mockSent.length = 0; mockExisting = null; mockFindWhere = null;
  const m = memoryGameStore();
  m.profiles.set('me', { display_name: 'Ana Ruiz', avatar_url: null, cohort_name: null });
  __setGameRoomStoreForTests(m.store);
});
afterAll(() => __setGameRoomStoreForTests(null));

it('sends "‹name› challenges you: beat ‹score› in ‹game› →" with the cabinet link, in the pair\'s DM', async () => {
  expect(await challenge('me', 'coh-1', 'friend', 'stack-drop', 5410)).toEqual({ sent: true, reason: 'sent' });
  expect(mockSent).toEqual([{ room: 'dm-me-friend', text: 'Ana Ruiz challenges you: beat 5,410 in Stack Drop → /portal/game-room?game=stack-drop' }]);
  expect(challengeText('X', 7, 'token-trail')).toBe('X challenges you: beat 7 in Token Trail → /portal/game-room?game=token-trail');
});

it('once per friend, game and Central day: a second challenge today sends nothing; the check is scoped to today and that game', async () => {
  mockExisting = { id: 'msg-1' };
  expect(await challenge('me', 'coh-1', 'friend', 'stack-drop', 6000, new Date('2026-10-21T17:00:00Z'))).toEqual({ sent: false, reason: 'already_challenged' });
  expect(mockSent).toHaveLength(0);
  const where = inspect(mockFindWhere, { depth: 6 });
  expect(where).toContain('2026-10-21T05:00:00.000Z'); // midnight Central (CDT) that day
  expect(where).toContain('in Stack Drop → /portal/game-room?game=stack-drop');
});

it('refuses yourself, AI staff, and whoever the DM rule refuses', async () => {
  await expect(challenge('me', null, 'me', 'stack-drop', 1)).rejects.toMatchObject({ name: 'ChallengeError', error_class: 'InvalidChallengeTarget' });
  await expect(challenge('me', null, 'reese-1', 'stack-drop', 1)).rejects.toMatchObject({ error_class: 'ChallengeToAiStaff' });
  await expect(challenge('me', null, 'blocked', 'stack-drop', 1)).rejects.toMatchObject({ name: 'DmError' });
  expect(mockSent).toHaveLength(0);
});
