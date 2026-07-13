import {
  selectNextOpenHouse, isDemoCohortName, getOnboardingSchedule, rsvpToOpenHouse,
} from '../openHouseService';
import { Enrollment, Cohort, OpenHouseEvent } from '../../models';
import { award, hasAwarded } from '../pointsService';
import { getNextPublicEvent, isKnownPublicEvent } from '../publicEventsService';

jest.mock('../../models', () => ({
  Enrollment: { findByPk: jest.fn() },
  Cohort: { findOne: jest.fn(), findAll: jest.fn() },
  OpenHouseEvent: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../pointsService', () => ({ award: jest.fn(), hasAwarded: jest.fn() }));
jest.mock('../publicEventsService', () => ({
  getNextPublicEvent: jest.fn(),
  isKnownPublicEvent: jest.fn(),
}));

const NOW = new Date('2026-07-01T12:00:00Z');
const ohView = (id: string) => ({
  id, title: 'Accelerator Open House', description: null,
  starts_at: new Date('2026-07-16T18:30:00Z'), timezone: 'America/Chicago',
  registration_url: 'https://ev/x', meeting_link: null,
});

describe('openHouseService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('selectNextOpenHouse (pure)', () => {
    const ev = (id: string, starts_at: string, status = 'scheduled') => ({ id, starts_at, status });

    it('picks the soonest still-upcoming scheduled event', () => {
      const events = [ev('c', '2026-07-20T18:00:00Z'), ev('a', '2026-07-05T18:00:00Z'), ev('b', '2026-07-10T18:00:00Z')];
      expect(selectNextOpenHouse(events, NOW)!.id).toBe('a');
    });

    it('ignores past events and non-scheduled (cancelled/completed) events', () => {
      const events = [ev('past', '2026-06-01T18:00:00Z'), ev('cancelled', '2026-07-05T18:00:00Z', 'cancelled'), ev('good', '2026-07-08T18:00:00Z')];
      expect(selectNextOpenHouse(events, NOW)!.id).toBe('good');
    });

    it('returns null when there is no upcoming scheduled event', () => {
      expect(selectNextOpenHouse([ev('past', '2026-06-01T18:00:00Z')], NOW)).toBeNull();
      expect(selectNextOpenHouse([], NOW)).toBeNull();
    });
  });

  describe('isDemoCohortName (pure)', () => {
    it('flags demo / test / sandbox fixtures', () => {
      expect(isDemoCohortName('Timeline Demo Cohort')).toBe(true);
      expect(isDemoCohortName('QA Test Cohort')).toBe(true);
      expect(isDemoCohortName('Sandbox')).toBe(true);
    });
    it('passes real cohorts through', () => {
      expect(isDemoCohortName('Cohort - July 2026')).toBe(false);
      expect(isDemoCohortName(null)).toBe(false);
    });
  });

  describe('getOnboardingSchedule', () => {
    it('guest: skips demo cohorts and returns the next real open cohort + CCPP next event', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({ get: () => null }); // no cohort
      (Cohort.findAll as jest.Mock).mockResolvedValue([
        { name: 'Timeline Demo Cohort', start_date: '2026-07-13', core_day: 'Mon', core_time: null, timezone: 'America/Chicago' },
        { name: 'Cohort - July 2026', start_date: '2026-07-23', core_day: 'Thu', core_time: '1-3 PM', timezone: 'America/Chicago' },
      ]);
      (getNextPublicEvent as jest.Mock).mockResolvedValue(ohView('ev-1'));
      (hasAwarded as jest.Mock).mockResolvedValue(false);

      const sched = await getOnboardingSchedule('enr-1');

      expect(sched.first_class!.cohort_name).toBe('Cohort - July 2026');
      expect(sched.first_class!.source).toBe('next_open_cohort');
      expect(sched.next_open_house!.id).toBe('ev-1');
      expect(sched.my_rsvp).toBe(false);
    });

    it('member: uses their own cohort and tolerates no upcoming public event', async () => {
      (Enrollment.findByPk as jest.Mock).mockResolvedValue({
        get: (k: string) => (k === 'cohort' ? { name: 'Cohort - July 2026', start_date: '2026-07-23', core_day: 'Thu', core_time: '1-3 PM', timezone: 'America/Chicago' } : null),
      });
      (getNextPublicEvent as jest.Mock).mockResolvedValue(null);

      const sched = await getOnboardingSchedule('enr-2');

      expect(sched.first_class!.source).toBe('my_cohort');
      expect(sched.next_open_house).toBeNull();
      expect(Cohort.findAll).not.toHaveBeenCalled();
    });
  });

  describe('rsvpToOpenHouse', () => {
    it('returns not_found for an unknown id (not in Postgres nor CCPP)', async () => {
      (OpenHouseEvent.findByPk as jest.Mock).mockResolvedValue(null);
      (isKnownPublicEvent as jest.Mock).mockResolvedValue(false);
      const res = await rsvpToOpenHouse('enr-1', 'missing');
      expect(res).toEqual({ ok: false, reason: 'not_found' });
      expect(award).not.toHaveBeenCalled();
    });

    it('awards for a seeded Postgres event, keyed on the id (idempotent)', async () => {
      (OpenHouseEvent.findByPk as jest.Mock).mockResolvedValue({ id: 'oh-9' });
      (award as jest.Mock).mockResolvedValue({ awarded: true, points: 10 });
      const res = await rsvpToOpenHouse('enr-1', 'oh-9');
      expect(res).toEqual({ ok: true, awarded: true, points: 10 });
      const arg = (award as jest.Mock).mock.calls[0][1];
      expect(arg.eventType).toBe('open_house_rsvp');
      expect(arg.eventKey).toBe('open_house_rsvp:oh-9');
      expect(isKnownPublicEvent).not.toHaveBeenCalled();
    });

    it('awards for a CCPP-sourced event id when it is not in Postgres', async () => {
      (OpenHouseEvent.findByPk as jest.Mock).mockResolvedValue(null);
      (isKnownPublicEvent as jest.Mock).mockResolvedValue(true);
      (award as jest.Mock).mockResolvedValue({ awarded: true, points: 10 });
      const res = await rsvpToOpenHouse('enr-1', '1992498063344');
      expect(res.ok).toBe(true);
      expect((award as jest.Mock).mock.calls[0][1].eventKey).toBe('open_house_rsvp:1992498063344');
    });
  });
});
