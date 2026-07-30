import { resolveEventPoints, award, revoke, getPointsSummary, hasAwarded, sumPointsTodayByEventTypes, POINT_EVENTS } from '../pointsService';
import { centralDateKey } from '../centralDate';
import StudentPointsEvent from '../../models/StudentPointsEvent';

jest.mock('../../models/StudentPointsEvent', () => ({ __esModule: true, default: { findOrCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), destroy: jest.fn() } }));

describe('pointsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('resolveEventPoints (pure)', () => {
    it('uses the explicit override when provided', () => {
      expect(resolveEventPoints('open_house_rsvp', 99)).toBe(99);
    });
    it('falls back to the registry default', () => {
      expect(resolveEventPoints('open_house_attended')).toBe(POINT_EVENTS.open_house_attended);
      expect(resolveEventPoints('open_house_attended')).toBe(50);
    });
    it('unknown events are worth 0', () => {
      expect(resolveEventPoints('totally_unknown_event')).toBe(0);
    });
  });

  describe('award', () => {
    it('awards registry points on first occurrence (created)', async () => {
      (StudentPointsEvent.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'e1' }, true]);
      const res = await award('enr-1', { eventType: 'open_house_attended' });
      expect(res).toEqual({ awarded: true, points: 50 });
      const arg = (StudentPointsEvent.findOrCreate as jest.Mock).mock.calls[0][0];
      expect(arg.where).toEqual({ enrollment_id: 'enr-1', event_key: 'open_house_attended' });
      expect(arg.defaults.points).toBe(50);
    });

    it('is idempotent: re-awarding the same event key is a no-op worth 0', async () => {
      (StudentPointsEvent.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'e1' }, false]);
      const res = await award('enr-1', { eventType: 'open_house_attended' });
      expect(res).toEqual({ awarded: false, points: 0 });
    });

    it('uses a custom event_key for repeatable events', async () => {
      (StudentPointsEvent.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'e2' }, true]);
      await award('enr-1', { eventType: 'open_house_rsvp', eventKey: 'open_house_rsvp:evt-42' });
      const arg = (StudentPointsEvent.findOrCreate as jest.Mock).mock.calls[0][0];
      expect(arg.where.event_key).toBe('open_house_rsvp:evt-42');
    });
  });

  describe('revoke', () => {
    it('removes the matching event and reports it (an undone action, e.g. an unlike)', async () => {
      (StudentPointsEvent.destroy as jest.Mock).mockResolvedValue(1);
      const res = await revoke('enr-1', 'community_like:post:p1:m1');
      expect(res).toEqual({ revoked: true });
      const arg = (StudentPointsEvent.destroy as jest.Mock).mock.calls[0][0];
      expect(arg.where).toEqual({ enrollment_id: 'enr-1', event_key: 'community_like:post:p1:m1' });
    });

    it('is idempotent: revoking an absent event removes nothing and reports revoked:false', async () => {
      (StudentPointsEvent.destroy as jest.Mock).mockResolvedValue(0);
      const res = await revoke('enr-1', 'community_like:post:p1:m1');
      expect(res).toEqual({ revoked: false });
    });
  });

  describe('hasAwarded', () => {
    it('true when a matching event row exists, false otherwise', async () => {
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValueOnce({ id: 'e1' });
      expect(await hasAwarded('enr-1', 'open_house_rsvp:oh-9')).toBe(true);
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValueOnce(null);
      expect(await hasAwarded('enr-1', 'open_house_rsvp:oh-9')).toBe(false);
    });
  });

  describe('getPointsSummary', () => {
    // Mocked rows deliberately expose ONLY `createdAt` (camelCase) and not
    // `created_at` — this is what a real Sequelize model instance actually
    // returns (timestamps: true + underscored: true renames the DB COLUMN
    // to created_at, but the JS attribute stays createdAt). A mock that
    // instead set `created_at` directly would let a `r.created_at` bug in
    // the mapping pass silently, which is exactly how this bug shipped.
    it('sums points across events and returns newest-first history, preserving each event\'s real created_at', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue([
        { event_type: 'open_house_attended', event_key: 'open_house_attended', points: 50, createdAt: new Date('2026-07-01'), metadata: null },
        { event_type: 'open_house_rsvp', event_key: 'open_house_rsvp:e1', points: 10, createdAt: new Date('2026-06-30'), metadata: null },
      ]);
      const res = await getPointsSummary('enr-1');
      expect(res.total).toBe(60);
      expect(res.events).toHaveLength(2);
      // The regression this guards: created_at must carry the real date
      // through, not silently come back undefined (which JSON.stringify
      // would then drop from the API response entirely).
      expect(res.events[0].created_at).toEqual(new Date('2026-07-01'));
      expect(res.events[1].created_at).toEqual(new Date('2026-06-30'));
    });

    it('a brand-new guest has 0 points and no events', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue([]);
      const res = await getPointsSummary('enr-guest');
      expect(res).toEqual({ total: 0, events: [] });
    });
  });

  // No prior test coverage existed for this function at all — its silent
  // failure (every row's date lost to the same createdAt/created_at mismatch
  // as getPointsSummary) meant the daily anti-cheat cap it feeds
  // (progression/dailyCap) could never actually match "today" and so never
  // clamped anything, with no test to catch it.
  describe('sumPointsTodayByEventTypes', () => {
    it('sums only today\'s points for the given event types, ignoring other days and other types', async () => {
      const today = new Date();
      const todayKey = centralDateKey(today.getTime());
      const yesterday = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000); // comfortably a different Central day
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue([
        { points: 10, createdAt: today },
        { points: 15, createdAt: today },
        { points: 100, createdAt: yesterday }, // wrong day — must not count
      ]);
      const sum = await sumPointsTodayByEventTypes('enr-1', ['card_complete'], todayKey);
      expect(sum).toBe(25);
    });

    it('an empty event-type list short-circuits to 0 with no query', async () => {
      const sum = await sumPointsTodayByEventTypes('enr-1', [], '2026-07-01');
      expect(sum).toBe(0);
      expect(StudentPointsEvent.findAll).not.toHaveBeenCalled();
    });
  });
});
