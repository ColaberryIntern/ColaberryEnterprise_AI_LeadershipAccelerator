const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
// eslint-disable-next-line import/first
import { recordTourStep, recordAdmissionsBooking, recordAdmissionsCancel } from '../campusActivityService';
// eslint-disable-next-line import/first
import { __resetCampusActivitySchemaForTests, CAMPUS_ACTIVITY_STATEMENTS } from '../../../db/ensureCampusActivitySchema';

/**
 * The campus activity writers are idempotent by construction: the furthest stop only grows, finished is set once, a booking writes
 * once per calendar event, a cancel only marks. These assert the SQL carries those guarantees (the integration tier runs them).
 */
const sqlOf = (i: number): string => String(mockQuery.mock.calls[i][0]);
beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue([[], 0]); __resetCampusActivitySchemaForTests(); });

it('creates both tables once (IF NOT EXISTS), then writes', async () => {
  await recordTourStep('e1', { tour: 'explorer', stop: 2, total: 8, finished: false });
  await recordTourStep('e1', { tour: 'explorer', stop: 3, total: 8, finished: false });
  const ddl = mockQuery.mock.calls.map((c) => String(c[0])).filter((s) => /CREATE (TABLE|INDEX)/.test(s));
  expect(ddl).toHaveLength(CAMPUS_ACTIVITY_STATEMENTS.length);
  expect(ddl.every((s) => /IF NOT EXISTS/.test(s))).toBe(true);
});

it('a tour step keeps the furthest stop and the first finish', async () => {
  await recordTourStep('e1', { tour: 'explorer', stop: 5, total: 8, finished: true });
  const sql = sqlOf(mockQuery.mock.calls.length - 1);
  expect(sql).toMatch(/ON CONFLICT \(enrollment_id, tour\)/);
  expect(sql).toMatch(/GREATEST\(campus_tour_progress\.furthest_stop, EXCLUDED\.furthest_stop\)/);
  expect(sql).toMatch(/COALESCE\(campus_tour_progress\.finished_at, EXCLUDED\.finished_at\)/);
  expect(mockQuery.mock.calls[mockQuery.mock.calls.length - 1][1]).toEqual({ replacements: { enrollmentId: 'e1', tour: 'explorer', stop: 5, total: 8, finished: true } });
});

it('a booking writes once per calendar event; a cancel only marks it', async () => {
  await recordAdmissionsBooking({ eventId: 'ev1', enrollmentId: 'e1', startsAt: '2026-10-28T15:00:00Z', topic: 'enroll' });
  expect(sqlOf(mockQuery.mock.calls.length - 1)).toMatch(/ON CONFLICT \(calendar_event_id\) DO NOTHING/);
  await recordAdmissionsCancel('ev1');
  const sql = sqlOf(mockQuery.mock.calls.length - 1);
  expect(sql).toMatch(/^\s*UPDATE campus_admissions_bookings SET status = 'cancelled'/);
  expect(sql).not.toMatch(/DELETE/);
});

it('a database error reaches the caller (the routes decide what it means)', async () => {
  mockQuery.mockRejectedValue(new Error('db down'));
  await expect(recordTourStep('e1', { tour: 'explorer', stop: 1, total: 8, finished: false })).rejects.toThrow('db down');
});
