jest.mock('../../models', () => ({
  FriendReferral: { bulkCreate: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../pointsService', () => ({ award: jest.fn() }));

import { submitReferrals, hasReferral } from '../friendReferralService';
import { FriendReferral } from '../../models';
import { award } from '../pointsService';

const bulkCreate = FriendReferral.bulkCreate as jest.Mock;
const findOne = FriendReferral.findOne as jest.Mock;
const awardMock = award as jest.Mock;

describe('submitReferrals', () => {
  beforeEach(() => jest.clearAllMocks());

  it('happy path: records every friend and awards the one-time points', async () => {
    bulkCreate.mockResolvedValue([]);
    awardMock.mockResolvedValue({ awarded: true, points: 25 });

    const result = await submitReferrals('e1', [
      { name: '  Jane Doe  ', email: '  Jane@Example.com  ' },
      { name: 'John Smith', email: 'john@example.com' },
    ]);

    expect(bulkCreate).toHaveBeenCalledWith(
      [
        { enrollment_id: 'e1', friend_name: 'Jane Doe', friend_email: 'jane@example.com' },
        { enrollment_id: 'e1', friend_name: 'John Smith', friend_email: 'john@example.com' },
      ],
      { ignoreDuplicates: true },
    );
    expect(awardMock).toHaveBeenCalledWith('e1', { eventType: 'referral_submitted' });
    expect(result).toEqual({ count: 2, points_awarded: 25 });
  });

  it('idempotency: bulkCreate is called with ignoreDuplicates so re-recommending the same friend is a no-op against the (enrollment_id, friend_email) unique index', async () => {
    bulkCreate.mockResolvedValue([]);
    awardMock.mockResolvedValue({ awarded: false, points: 0 });

    await submitReferrals('e1', [{ name: 'Jane Doe', email: 'jane@example.com' }]);

    expect(bulkCreate).toHaveBeenCalledWith(expect.any(Array), { ignoreDuplicates: true });
  });

  it('idempotent: a second submission still records friends but awards zero points', async () => {
    bulkCreate.mockResolvedValue([]);
    awardMock.mockResolvedValue({ awarded: false, points: 0 }); // already awarded once for this enrollment

    const result = await submitReferrals('e1', [{ name: 'Another Friend', email: 'another@example.com' }]);

    expect(result.points_awarded).toBe(0);
    expect(result.count).toBe(1);
  });
});

describe('hasReferral', () => {
  beforeEach(() => jest.clearAllMocks());

  it('true when at least one referral row exists', async () => {
    findOne.mockResolvedValue({ id: 'r1' });
    expect(await hasReferral('e1')).toBe(true);
  });

  it('false when no referral row exists', async () => {
    findOne.mockResolvedValue(null);
    expect(await hasReferral('e1')).toBe(false);
  });

  it('fails open (false) on a DB error instead of throwing, so a transient hiccup never 500s the onboarding-profile endpoint', async () => {
    findOne.mockRejectedValue(new Error('connection reset'));
    await expect(hasReferral('e1')).resolves.toBe(false);
  });
});
