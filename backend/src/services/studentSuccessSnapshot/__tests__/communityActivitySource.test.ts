const mockMemberFindOne = jest.fn();
jest.mock('../../../models/CommunityMember', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockMemberFindOne(...a) } }));

const mockPostFindAll = jest.fn();
jest.mock('../../../models/CommunityPost', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockPostFindAll(...a) } }));

import { getCommunityActivityField } from '../communityActivitySource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getCommunityActivityField', () => {
  it('happy path: real post counts and real like/comment totals for a real, visible-only post set', async () => {
    mockMemberFindOne.mockResolvedValue({ id: 'member-1', points: 120, level: 3 });
    mockPostFindAll.mockResolvedValue([
      { id: 'p1', like_count: 5, comment_count: 2 },
      { id: 'p2', like_count: 3, comment_count: 0 },
    ]);

    const field = await getCommunityActivityField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ postCount: 2, totalLikesReceived: 8, totalCommentsReceived: 2, communityPoints: 120, communityLevel: 3 });
    expect(mockPostFindAll).toHaveBeenCalledWith({ where: { member_id: 'member-1', status: 'visible' } });
  });

  it('honesty boundary: no CommunityMember row is unknown, never a fabricated zero-engagement student', async () => {
    mockMemberFindOne.mockResolvedValue(null);

    const field = await getCommunityActivityField('enrollment-1');

    expect(field.status).toBe('unknown');
    expect(mockPostFindAll).not.toHaveBeenCalled();
  });

  it('a real member with zero posts is a known zero, not unknown', async () => {
    mockMemberFindOne.mockResolvedValue({ id: 'member-1', points: 0, level: 1 });
    mockPostFindAll.mockResolvedValue([]);

    const field = await getCommunityActivityField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.postCount).toBe(0);
  });
});
