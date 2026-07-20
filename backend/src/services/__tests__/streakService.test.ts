import { streakPointsFor, centralDateKey, getStreak, claimStreak } from '../streakService';
import { StudentPointsEvent } from '../../models';

jest.mock('../../models', () => ({ StudentPointsEvent: { findOrCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn() } }));

// 2026-07-15 12:00 Central (CDT, UTC-5) → 17:00 UTC.
const NOW = Date.UTC(2026, 6, 15, 17, 0, 0);
const claims = (...keys: string[]) =>
  keys.map((k) => ({ event_key: `daily_streak:${k}`, points: 0 }));

describe('streakService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('streakPointsFor (pure)', () => {
    it('escalates with consecutive days', () => {
      expect(streakPointsFor(1)).toBe(5);
      expect(streakPointsFor(2)).toBe(8);
      expect(streakPointsFor(3)).toBe(11);
    });
    it('caps at 30', () => {
      expect(streakPointsFor(9)).toBe(29);
      expect(streakPointsFor(10)).toBe(30);
      expect(streakPointsFor(50)).toBe(30);
    });
  });

  describe('centralDateKey (pure)', () => {
    it('formats an instant as its Central calendar date', () => {
      expect(centralDateKey(Date.UTC(2026, 6, 15, 17))).toBe('2026-07-15');
    });
    it('respects the Central day boundary (late-night UTC is the prior Central day)', () => {
      expect(centralDateKey(Date.UTC(2026, 6, 15, 4))).toBe('2026-07-14');
    });
  });

  describe('getStreak', () => {
    it('counts consecutive days ending yesterday when not yet claimed today', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue(claims('2026-07-13', '2026-07-14'));
      const s = await getStreak('enr-1', NOW);
      expect(s.claimed_today).toBe(false);
      expect(s.count).toBe(2);
      expect(s.next_points).toBe(streakPointsFor(3)); // claiming today would be day 3
      expect(s.week).toHaveLength(7);
      expect(s.week[s.week.length - 1]).toMatchObject({ date: '2026-07-15', is_today: true, hit: false });
      expect(s.week.find((d) => d.date === '2026-07-14')?.hit).toBe(true);
    });

    it('a gap breaks the run (only today-adjacent days count)', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue(claims('2026-07-10', '2026-07-11'));
      const s = await getStreak('enr-1', NOW);
      expect(s.count).toBe(0); // last claim was 4 days ago → run is dead
      expect(s.next_points).toBe(streakPointsFor(1));
    });

    it('includes today when already claimed', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue(claims('2026-07-14', '2026-07-15'));
      const s = await getStreak('enr-1', NOW);
      expect(s.claimed_today).toBe(true);
      expect(s.count).toBe(2);
      expect(s.next_points).toBe(0);
    });
  });

  describe('claimStreak', () => {
    it('is idempotent — a second claim the same day awards nothing', async () => {
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValue({ id: 'x' }); // already claimed today
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue(claims('2026-07-15'));
      const r = await claimStreak('enr-1', NOW);
      expect(r.awarded).toBe(false);
      expect(r.points).toBe(0);
      expect(StudentPointsEvent.findOrCreate).not.toHaveBeenCalled();
    });

    it('a fresh claim awards escalating points for the new consecutive day', async () => {
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValue(null); // not claimed today
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue(claims('2026-07-13', '2026-07-14'));
      (StudentPointsEvent.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'e' }, true]);
      const r = await claimStreak('enr-1', NOW);
      expect(r.awarded).toBe(true);
      expect(r.points).toBe(streakPointsFor(3)); // day 3 of the run
      const arg = (StudentPointsEvent.findOrCreate as jest.Mock).mock.calls[0][0];
      expect(arg.where.event_key).toBe('daily_streak:2026-07-15');
      expect(arg.defaults.points).toBe(streakPointsFor(3));
    });

    it('a fresh claim after a gap resets to day 1', async () => {
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValue(null);
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue(claims('2026-07-01'));
      (StudentPointsEvent.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'e' }, true]);
      const r = await claimStreak('enr-1', NOW);
      expect(r.points).toBe(streakPointsFor(1)); // run was dead → day 1
    });
  });
});
