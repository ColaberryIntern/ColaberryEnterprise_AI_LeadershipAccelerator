import {
  computeAttendanceStatus,
  resolveJoinedStatus,
  ATTENDANCE_GRACE_MINUTES,
} from '../liveSessionAttendanceService';

// Live Sessions build-out Phase 3 (Session CC-20260721-s7h4).
// Pure logic for self-join attendance capture.

const DATE = '2026-04-09';
const START = '1:00 PM'; // → 13:00 wall-clock

describe('computeAttendanceStatus', () => {
  it('is present when joining before start', () => {
    expect(computeAttendanceStatus(DATE, START, new Date('2026-04-09T12:45:00'))).toBe('present');
  });

  it('is present exactly at start', () => {
    expect(computeAttendanceStatus(DATE, START, new Date('2026-04-09T13:00:00'))).toBe('present');
  });

  it('is present at the grace boundary (start + grace)', () => {
    const at = new Date(`2026-04-09T13:${String(ATTENDANCE_GRACE_MINUTES).padStart(2, '0')}:00`);
    expect(computeAttendanceStatus(DATE, START, at)).toBe('present');
  });

  it('is late one minute past the grace window', () => {
    const past = new Date(`2026-04-09T13:${String(ATTENDANCE_GRACE_MINUTES + 1).padStart(2, '0')}:00`);
    expect(computeAttendanceStatus(DATE, START, past)).toBe('late');
  });

  it('is late for a clearly-late join', () => {
    expect(computeAttendanceStatus(DATE, START, new Date('2026-04-09T13:45:00'))).toBe('late');
  });

  it('handles 24-hour start_time strings too', () => {
    expect(computeAttendanceStatus(DATE, '13:00', new Date('2026-04-09T12:59:00'))).toBe('present');
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
