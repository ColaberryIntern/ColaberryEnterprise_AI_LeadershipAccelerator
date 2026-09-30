import {
  computeAttendanceStatus,
  resolveJoinedStatus,
  ATTENDANCE_GRACE_MINUTES,
} from '../liveSessionAttendanceService';
import { centralWallClockToInstant } from '../centralDate';

// Live Sessions build-out Phase 3 (Session CC-20260721-s7h4).
// Pure logic for self-join attendance capture.

const DATE = '2026-04-09';
const START = '1:00 PM'; // → 13:00 wall-clock

/**
 * The join instant, expressed as a CENTRAL wall-clock time.
 *
 * These used to be built as `new Date('2026-04-09T13:45:00')` — no zone, so the
 * runner's local zone. The service anchors the session's start to Central via
 * classInstant, so the comparison only lined up on a machine already in Central.
 * On a UTC runner 13:45 UTC is 08:45 Central, i.e. BEFORE a 13:00 Central start,
 * and "clearly late" evaluated to 'present'.
 *
 * It never showed up because this suite had never run in CI: the gate was an
 * allow-list of three other files. Building the instant through the same helper
 * the product uses keeps the test correct in any timezone and across DST,
 * instead of hardcoding a -05:00 offset that would silently rot in November.
 */
const centralAt = (hhmmss: string) =>
  centralWallClockToInstant(new Date(`${DATE}T${hhmmss}Z`));

describe('computeAttendanceStatus', () => {
  it('is present when joining before start', () => {
    expect(computeAttendanceStatus(DATE, START, centralAt('12:45:00'))).toBe('present');
  });

  it('is present exactly at start', () => {
    expect(computeAttendanceStatus(DATE, START, centralAt('13:00:00'))).toBe('present');
  });

  it('is present at the grace boundary (start + grace)', () => {
    const at = centralAt(`13:${String(ATTENDANCE_GRACE_MINUTES).padStart(2, '0')}:00`);
    expect(computeAttendanceStatus(DATE, START, at)).toBe('present');
  });

  it('is late one minute past the grace window', () => {
    const past = centralAt(`13:${String(ATTENDANCE_GRACE_MINUTES + 1).padStart(2, '0')}:00`);
    expect(computeAttendanceStatus(DATE, START, past)).toBe('late');
  });

  it('is late for a clearly-late join', () => {
    expect(computeAttendanceStatus(DATE, START, centralAt('13:45:00'))).toBe('late');
  });

  it('handles 24-hour start_time strings too', () => {
    expect(computeAttendanceStatus(DATE, '13:00', centralAt('12:59:00'))).toBe('present');
  });
});

describe('resolveJoinedStatus', () => {
  it('uses the computed status for a brand-new row', () => {
    expect(resolveJoinedStatus(null, 'present')).toBe('present');
    expect(resolveJoinedStatus(undefined, 'late')).toBe('late');
  });

  it('upgrades a system-marked absent to the computed status', () => {
    expect(resolveJoinedStatus('absent', 'late')).toBe('late');
    expect(resolveJoinedStatus('absent', 'present')).toBe('present');
  });

  it('never downgrades an admin-set present', () => {
    expect(resolveJoinedStatus('present', 'late')).toBe('present');
  });

  it('never downgrades an excused', () => {
    expect(resolveJoinedStatus('excused', 'late')).toBe('excused');
    expect(resolveJoinedStatus('excused', 'present')).toBe('excused');
  });

  it('lets a late row be upgraded (late is not protected)', () => {
    expect(resolveJoinedStatus('late', 'present')).toBe('present');
    expect(resolveJoinedStatus('late', 'late')).toBe('late');
  });
});
