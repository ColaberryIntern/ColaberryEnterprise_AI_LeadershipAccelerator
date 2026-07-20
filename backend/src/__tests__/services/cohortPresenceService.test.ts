/**
 * cohortPresenceService unit tests — portal right-rail "Contacts" presence.
 * Model layer is mocked; no DB I/O. Uses the real derivePresence from
 * communityService (pure), so the mock set mirrors communityService.test.ts
 * to keep that import graph hermetic.
 */

jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/CommunityMember', () => ({ findOrCreate: jest.fn(), findAll: jest.fn(), increment: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/CommunityPost', () => ({ create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/CommunityNotification', () => ({ bulkCreate: jest.fn() }));
jest.mock('../../models/CommunityLike', () => ({ findAll: jest.fn() }));
jest.mock('../../models/CommunityPointsEvent', () => ({ create: jest.fn() }));

import { getCohortPresence } from '../../services/cohortPresenceService';
import Enrollment from '../../models/Enrollment';

const findAllEnrollment = Enrollment.findAll as jest.Mock;

const enrollmentId = '11111111-1111-1111-1111-111111111111';
const cohortId = '22222222-2222-2222-2222-222222222222';
const T0 = new Date('2026-07-20T12:00:00.000Z');
const ago = (ms: number) => new Date(T0.getTime() - ms);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCohortPresence', () => {
  it('happy path: maps away->idle, prefers profile avatar, sorts online->idle->offline', async () => {
    findAllEnrollment.mockResolvedValue([
      { id: 'e-off',  full_name: 'Zed Offline', avatar_data_url: null,       communityMember: { avatar_url: null, last_active_at: ago(60 * 60_000) } },
      { id: 'e-on',   full_name: 'Amy Online',  avatar_data_url: 'data:img', communityMember: { avatar_url: 'http://x/a.png', last_active_at: ago(10_000) } },
      { id: 'e-idle', full_name: 'Bob Away',    avatar_data_url: null,       communityMember: { avatar_url: 'http://x/b.png', last_active_at: ago(5 * 60_000) } },
    ]);

    const contacts = await getCohortPresence(enrollmentId, cohortId, T0);

    // sorted online -> idle -> offline, community 'away' surfaced as 'idle'
    expect(contacts.map((c) => [c.name, c.presence])).toEqual([
      ['Amy Online', 'online'],
      ['Bob Away', 'idle'],
      ['Zed Offline', 'offline'],
    ]);
    // avatar precedence: enrollment profile photo wins over community avatar
    expect(contacts.find((c) => c.id === 'e-on')!.avatarUrl).toBe('data:img');
    // falls back to community avatar when no profile photo
    expect(contacts.find((c) => c.id === 'e-idle')!.avatarUrl).toBe('http://x/b.png');
    // null when neither exists
    expect(contacts.find((c) => c.id === 'e-off')!.avatarUrl).toBeNull();
    // query scoped to active co-cohort members, excluding the caller
    const arg = findAllEnrollment.mock.calls[0][0];
    expect(arg.where.cohort_id).toBe(cohortId);
    expect(arg.where.status).toBe('active');
    expect(arg.where.id).toEqual({ [require('sequelize').Op.ne]: enrollmentId });
  });

  it('boundary: a member who never pinged (no community row) reads offline', async () => {
    findAllEnrollment.mockResolvedValue([
      { id: 'e1', full_name: 'No Community', avatar_data_url: null, communityMember: null },
    ]);
    const contacts = await getCohortPresence(enrollmentId, cohortId, T0);
    expect(contacts).toEqual([{ id: 'e1', name: 'No Community', avatarUrl: null, presence: 'offline' }]);
  });

  it('guard: guest/explorer with no cohort gets an empty list and hits no DB', async () => {
    const contacts = await getCohortPresence(enrollmentId, null, T0);
    expect(contacts).toEqual([]);
    expect(findAllEnrollment).not.toHaveBeenCalled();
  });
});
