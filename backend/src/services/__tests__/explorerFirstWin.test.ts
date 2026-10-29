import { Op } from 'sequelize';
import { hasFirstWin, FIRST_WIN_EVENT_TYPES } from '../explorerFirstWin';
import { StudentPointsEvent } from '../../models';

jest.mock('../../models', () => ({ StudentPointsEvent: { findOne: jest.fn() } }));

const findOne = StudentPointsEvent.findOne as unknown as jest.Mock;

describe('explorerFirstWin (C91)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is true once any learning completion is in the ledger', async () => {
    findOne.mockResolvedValue({ id: 'p1' });
    await expect(hasFirstWin('enr-1')).resolves.toBe(true);
    const where = findOne.mock.calls[0][0].where;
    expect(where.enrollment_id).toBe('enr-1');
    expect(where.event_type[Op.in]).toEqual([...FIRST_WIN_EVENT_TYPES]);
  });

  it('is false for a brand-new learner with no learning yet', async () => {
    findOne.mockResolvedValue(null);
    await expect(hasFirstWin('enr-2')).resolves.toBe(false);
  });

  it('returns null (unknown), never false, when the read fails, and logs it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    findOne.mockRejectedValue(Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' }));
    await expect(hasFirstWin('enr-3')).resolves.toBeNull();
    const logged = JSON.parse(warn.mock.calls[0][0]);
    expect(logged).toMatchObject({ event: 'explorer_first_win_read_failed', error_class: 'SequelizeConnectionError', outcome: 'failure' });
    warn.mockRestore();
  });

  it('counts every learning type and none of the non-learning ones', () => {
    expect(FIRST_WIN_EVENT_TYPES).toEqual(expect.arrayContaining(['card_complete', 'knowledge_check', 'survey_complete', 'evaluation_passed', 'ambient_learning']));
    for (const notLearning of ['daily_streak', 'open_house_rsvp', 'profile_completed', 'referral_submitted', 'portal_session', 'community_post']) {
      expect(FIRST_WIN_EVENT_TYPES).not.toContain(notLearning);
    }
  });

  it('is idempotent: the same learner reads the same answer twice', async () => {
    findOne.mockResolvedValue({ id: 'p1' });
    const a = await hasFirstWin('enr-4');
    const b = await hasFirstWin('enr-4');
    expect([a, b]).toEqual([true, true]);
  });
});
