/**
 * certAvailabilityService — Week 7 fence.
 *
 * The pure week derivation is tested directly (no DB). The resolver is tested with
 * the models and sequelize mocked, matching this repo's service-test convention
 * (see evidenceService.test.ts / ensureCapeSchema.test.ts).
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/Cohort', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));

import { sequelize } from '../../../config/database';
import Enrollment from '../../../models/Enrollment';
import Cohort from '../../../models/Cohort';
import {
  deriveProgramWeek,
  isWeekAtOrAfter,
  getCertAvailability,
  assertCertAvailable,
} from '../certAvailabilityService';

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockEnrollment = Enrollment.findByPk as unknown as jest.Mock;
const mockCohort = Cohort.findByPk as unknown as jest.Mock;

/** Default wiring: a current track starting at week 7, an enrolled student. */
function wire(startDate: string | null, opts: { startWeek?: number; noTrack?: boolean; noCohortId?: boolean } = {}) {
  mockQuery.mockResolvedValue([
    opts.noTrack ? [] : [{ track_id: 'ccar-f', availability_start_week: opts.startWeek ?? 7 }],
  ]);
  mockEnrollment.mockResolvedValue(opts.noCohortId ? { id: 'e1', cohort_id: null } : { id: 'e1', cohort_id: 'c1' });
  mockCohort.mockResolvedValue(startDate === null ? null : { id: 'c1', start_date: startDate });
}

beforeEach(() => jest.clearAllMocks());

describe('deriveProgramWeek', () => {
  it('happy path: day 0 is week 1, day 6 is still week 1, day 7 is week 2', () => {
    expect(deriveProgramWeek('2026-07-06', new Date('2026-07-06T12:00:00Z'))).toBe(1);
    expect(deriveProgramWeek('2026-07-06', new Date('2026-07-12T23:59:00Z'))).toBe(1);
    expect(deriveProgramWeek('2026-07-06', new Date('2026-07-13T00:01:00Z'))).toBe(2);
  });

  it('boundary: the last day of week 6 and the first day of week 7', () => {
    // week 7 begins on day 42
    expect(deriveProgramWeek('2026-07-06', new Date('2026-08-16T23:00:00Z'))).toBe(6);
    expect(deriveProgramWeek('2026-07-06', new Date('2026-08-17T00:00:00Z'))).toBe(7);
  });

  it('boundary: a cohort that has not started yet is week 0, never week 1', () => {
    expect(deriveProgramWeek('2026-09-01', new Date('2026-08-30T12:00:00Z'))).toBe(0);
  });

  it('a daylight-saving transition does not shift the week', () => {
    // US DST ends 2026-11-01; whole-day UTC math must be unaffected across it.
    expect(deriveProgramWeek('2026-10-26', new Date('2026-11-01T06:30:00Z'))).toBe(1);
    expect(deriveProgramWeek('2026-10-26', new Date('2026-11-02T00:00:00Z'))).toBe(2);
  });

  it('failure path: missing or unparseable dates return null, never a default week', () => {
    expect(deriveProgramWeek(null, new Date())).toBeNull();
    expect(deriveProgramWeek(undefined, new Date())).toBeNull();
    expect(deriveProgramWeek('', new Date())).toBeNull();
    expect(deriveProgramWeek('not-a-date', new Date())).toBeNull();
  });

  it('accepts a full ISO timestamp as well as a bare date', () => {
    expect(deriveProgramWeek('2026-07-06T00:00:00.000Z', new Date('2026-07-13T00:00:00Z'))).toBe(2);
  });
});

describe('isWeekAtOrAfter', () => {
  it('is false whenever either side is unknown — an unknown week never opens the fence', () => {
    expect(isWeekAtOrAfter(null, 7)).toBe(false);
    expect(isWeekAtOrAfter(9, null)).toBe(false);
  });
  it('is inclusive of the start week', () => {
    expect(isWeekAtOrAfter(7, 7)).toBe(true);
    expect(isWeekAtOrAfter(6, 7)).toBe(false);
  });
});

describe('getCertAvailability', () => {
  it('week 6 is closed', async () => {
    wire('2026-07-06');
    const r = await getCertAvailability('e1', new Date('2026-08-16T12:00:00Z'));
    expect(r.available).toBe(false);
    expect(r.reason).toBe('before_start_week');
    expect(r.programWeek).toBe(6);
    expect(r.startWeek).toBe(7);
  });

  it('week 7 is open', async () => {
    wire('2026-07-06');
    const r = await getCertAvailability('e1', new Date('2026-08-17T12:00:00Z'));
    expect(r.available).toBe(true);
    expect(r.reason).toBe('available');
    expect(r.programWeek).toBe(7);
    expect(r.trackId).toBe('ccar-f');
  });

  it('week 9 is open', async () => {
    wire('2026-07-06');
    const r = await getCertAvailability('e1', new Date('2026-08-31T12:00:00Z'));
    expect(r.available).toBe(true);
    expect(r.programWeek).toBe(9);
  });

  it('honours a track configured to start at a different week', async () => {
    wire('2026-07-06', { startWeek: 4 });
    const r = await getCertAvailability('e1', new Date('2026-07-27T12:00:00Z'));
    expect(r.programWeek).toBe(4);
    expect(r.available).toBe(true);
  });

  it('never accepts a week from the caller — the signature has no week parameter', () => {
    // Guards the design: if someone adds a `week` argument, this fails to compile
    // in review and the assertion below documents why that must not happen.
    expect(getCertAvailability.length).toBeLessThanOrEqual(3); // (enrollmentId, now, trackId)
  });

  it('closed when the cohort has not started', async () => {
    wire('2026-12-01');
    const r = await getCertAvailability('e1', new Date('2026-08-17T12:00:00Z'));
    expect(r.available).toBe(false);
    expect(r.reason).toBe('not_started');
    expect(r.programWeek).toBe(0);
  });

  it('closed when the enrollment has no cohort', async () => {
    wire('2026-07-06', { noCohortId: true });
    const r = await getCertAvailability('e1', new Date('2026-08-17T12:00:00Z'));
    expect(r.available).toBe(false);
    expect(r.reason).toBe('no_cohort_start');
  });

  it('closed when the cohort row is missing or has no start date', async () => {
    wire(null);
    const r = await getCertAvailability('e1', new Date('2026-08-17T12:00:00Z'));
    expect(r.available).toBe(false);
    expect(r.reason).toBe('no_cohort_start');
  });

  it('closed when no current track is configured', async () => {
    wire('2026-07-06', { noTrack: true });
    const r = await getCertAvailability('e1', new Date('2026-08-17T12:00:00Z'));
    expect(r.available).toBe(false);
    expect(r.reason).toBe('no_active_track');
  });

  it('FAILS CLOSED on a database error — a week 9 student is denied rather than a week 3 student admitted', async () => {
    mockQuery.mockRejectedValue(new Error('connection lost'));
    const r = await getCertAvailability('e1', new Date('2026-08-31T12:00:00Z'));
    expect(r.available).toBe(false);
    expect(r.reason).toBe('error');
  });
});

describe('assertCertAvailable', () => {
  it('throws a 403-shaped error carrying the availability detail when closed', async () => {
    wire('2026-07-06');
    await expect(assertCertAvailable('e1', new Date('2026-08-16T12:00:00Z'))).rejects.toMatchObject({
      status: 403,
      code: 'CERT_PREP_NOT_AVAILABLE',
      availability: { reason: 'before_start_week', programWeek: 6 },
    });
  });

  it('resolves with the availability when open', async () => {
    wire('2026-07-06');
    await expect(assertCertAvailable('e1', new Date('2026-08-17T12:00:00Z'))).resolves.toMatchObject({
      available: true,
      programWeek: 7,
    });
  });
});
