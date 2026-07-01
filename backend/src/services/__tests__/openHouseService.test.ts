import { selectNextOpenHouse, rsvpToOpenHouse } from '../openHouseService';
import { OpenHouseEvent } from '../../models';
import { award } from '../pointsService';

jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findOne: jest.fn() },
  OpenHouseEvent: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../pointsService', () => ({
  award: jest.fn(),
  hasAwarded: jest.fn(),
}));

const NOW = new Date('2026-07-01T12:00:00Z');

describe('openHouseService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('selectNextOpenHouse (pure)', () => {
    const ev = (id: string, starts_at: string, status = 'scheduled') => ({ id, starts_at, status });

    it('picks the soonest still-upcoming scheduled event', () => {
      const events = [
        ev('c', '2026-07-20T18:00:00Z'),
        ev('a', '2026-07-05T18:00:00Z'),
        ev('b', '2026-07-10T18:00:00Z'),
      ];
      expect(selectNextOpenHouse(events, NOW)!.id).toBe('a');
    });

    it('ignores past events and non-scheduled (cancelled/completed) events', () => {
      const events = [
        ev('past', '2026-06-01T18:00:00Z'),
        ev('cancelled', '2026-07-05T18:00:00Z', 'cancelled'),
        ev('good', '2026-07-08T18:00:00Z'),
      ];
      expect(selectNextOpenHouse(events, NOW)!.id).toBe('good');
    });

    it('returns null when there is no upcoming scheduled event', () => {
      expect(selectNextOpenHouse([ev('past', '2026-06-01T18:00:00Z')], NOW)).toBeNull();
      expect(selectNextOpenHouse([], NOW)).toBeNull();
    });
  });

  describe('rsvpToOpenHouse', () => {
    it('returns not_found when the event does not exist', async () => {
      (OpenHouseEvent.findByPk as jest.Mock).mockResolvedValue(null);
      const res = await rsvpToOpenHouse('enr-1', 'missing');
      expect(res).toEqual({ ok: false, reason: 'not_found' });
      expect(award).not.toHaveBeenCalled();
    });

    it('awards open_house_rsvp keyed on the event id (idempotent) when the event exists', async () => {
      (OpenHouseEvent.findByPk as jest.Mock).mockResolvedValue({ id: 'oh-9' });
      (award as jest.Mock).mockResolvedValue({ awarded: true, points: 10 });

      const res = await rsvpToOpenHouse('enr-1', 'oh-9');

      expect(res).toEqual({ ok: true, awarded: true, points: 10 });
      const arg = (award as jest.Mock).mock.calls[0][1];
      expect(arg.eventType).toBe('open_house_rsvp');
      expect(arg.eventKey).toBe('open_house_rsvp:oh-9');
    });
  });
});
