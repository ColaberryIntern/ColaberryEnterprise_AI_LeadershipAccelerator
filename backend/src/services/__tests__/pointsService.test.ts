import { resolveEventPoints, award, getPointsSummary, hasAwarded, POINT_EVENTS } from '../pointsService';
import { StudentPointsEvent } from '../../models';

jest.mock('../../models', () => ({ StudentPointsEvent: { findOrCreate: jest.fn(), findAll: jest.fn(), findOne: jest.fn() } }));

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

  describe('hasAwarded', () => {
    it('true when a matching event row exists, false otherwise', async () => {
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValueOnce({ id: 'e1' });
      expect(await hasAwarded('enr-1', 'open_house_rsvp:oh-9')).toBe(true);
      (StudentPointsEvent.findOne as jest.Mock).mockResolvedValueOnce(null);
      expect(await hasAwarded('enr-1', 'open_house_rsvp:oh-9')).toBe(false);
    });
  });

  describe('getPointsSummary', () => {
    it('sums points across events and returns newest-first history', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue([
        { event_type: 'open_house_attended', event_key: 'open_house_attended', points: 50, created_at: new Date('2026-07-01'), metadata: null },
        { event_type: 'open_house_rsvp', event_key: 'open_house_rsvp:e1', points: 10, created_at: new Date('2026-06-30'), metadata: null },
      ]);
      const res = await getPointsSummary('enr-1');
      expect(res.total).toBe(60);
      expect(res.events).toHaveLength(2);
    });

    it('a brand-new guest has 0 points and no events', async () => {
      (StudentPointsEvent.findAll as jest.Mock).mockResolvedValue([]);
      const res = await getPointsSummary('enr-guest');
      expect(res).toEqual({ total: 0, events: [] });
    });
  });
});
