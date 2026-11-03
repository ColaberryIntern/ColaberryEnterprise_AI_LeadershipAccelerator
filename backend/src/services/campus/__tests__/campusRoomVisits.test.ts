const query = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a) } }));
jest.mock('../../../db/ensureCampusRoomVisitsSchema', () => ({ ensureCampusRoomVisitsSchema: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../campusRoomVisitRetention', () => ({ pruneCampusRoomVisitsDaily: jest.fn() }));

import { recordRoomVisitIfEntered } from '../campusRoomVisits';
import { pruneCampusRoomVisitsDaily } from '../campusRoomVisitRetention';

/**
 * C101: campus_room_visits is written when a learner ENTERS a building, never per heartbeat, never failing the
 * heartbeat; and every write gives the once-a-day prune its chance (campusRoomVisitRetention.test.ts).
 */
beforeEach(() => { query.mockReset(); (pruneCampusRoomVisitsDaily as jest.Mock).mockClear(); });
const sql = (i = 0) => String(query.mock.calls[i]?.[0] ?? '');
const repl = (i = 0) => (query.mock.calls[i]?.[1] as { replacements: Record<string, unknown> }).replacements;

describe('recordRoomVisitIfEntered', () => {
  it('inserts only when there is no fresh presence row in the same area (an entry, not a heartbeat)', async () => {
    query.mockResolvedValueOnce([{ id: '1' }]);
    await expect(recordRoomVisitIfEntered('enr-1', 'library', 90_000)).resolves.toBe(true);
    expect(sql()).toMatch(/INSERT INTO campus_room_visits \(enrollment_id, area, entered_at\)/);
    expect(sql()).toMatch(/NOT EXISTS \([\s\S]*FROM campus_presence p[\s\S]*p\.area = :area[\s\S]*p\.updated_at > NOW\(\) - make_interval\(secs => :freshSecs\)/);
    expect(repl()).toEqual({ enrollmentId: 'enr-1', area: 'library', freshSecs: 90 });
    expect(pruneCampusRoomVisitsDaily).toHaveBeenCalledTimes(1);
  });

  it('also refuses a second visit to the same area inside the window (narrows the double-heartbeat race)', async () => {
    query.mockResolvedValueOnce([]);
    await expect(recordRoomVisitIfEntered('enr-1', 'library', 90_000)).resolves.toBe(false);
    expect(sql()).toMatch(/NOT EXISTS \([\s\S]*FROM campus_room_visits v[\s\S]*v\.area = :area[\s\S]*v\.entered_at > NOW\(\)/);
  });

  it('a write failure is logged with an error_class and swallowed: the heartbeat must not fail', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockRejectedValueOnce(Object.assign(new Error('relation does not exist'), { name: 'SequelizeDatabaseError' }));
    await expect(recordRoomVisitIfEntered('enr-1', 'library', 90_000)).resolves.toBe(false);
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ event: 'campus_room_visit_write_failed', error_class: 'SequelizeDatabaseError' });
    err.mockRestore();
  });
});
