import { summarizeAttendance, centralDateKey, type AttendanceRow } from '../internshipAttendanceService';

// summarizeAttendance is the pure fold of attendance rows into a manager summary.
// No database.
const rows: AttendanceRow[] = [
  { meeting_key: 'Monday', session_date: '2026-09-14', joined_at: '2026-09-14T14:00:00.000Z' },
  { meeting_key: 'Monday', session_date: '2026-09-07', joined_at: '2026-09-07T14:00:00.000Z' },
  { meeting_key: 'Friday', session_date: '2026-09-11', joined_at: '2026-09-11T14:00:00.000Z' },
];

describe('summarizeAttendance', () => {
  it('counts total occurrences attended', () => {
    expect(summarizeAttendance(rows).total).toBe(3);
  });

  it('counts occurrences per meeting', () => {
    expect(summarizeAttendance(rows).by_meeting).toEqual({ Monday: 2, Friday: 1 });
  });

  it('reports the most recent join', () => {
    expect(summarizeAttendance(rows).last_attended_at).toBe('2026-09-14T14:00:00.000Z');
  });

  it('is empty-safe', () => {
    expect(summarizeAttendance([])).toEqual({ total: 0, by_meeting: {}, last_attended_at: null });
  });
});

describe('centralDateKey', () => {
  it('formats a Central calendar day as YYYY-MM-DD', () => {
    // 2026-09-15T02:00:00Z is still 2026-09-14 in Central (UTC-5 CDT).
    expect(centralDateKey(new Date('2026-09-15T02:00:00.000Z'))).toBe('2026-09-14');
  });
});
