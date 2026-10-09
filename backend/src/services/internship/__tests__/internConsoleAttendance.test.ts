/**
 * Attendance for the Intern Console — and the percentage that must never appear.
 *
 * The design asks for "9/12 · 75%". The 12 does not exist: the table records joins, and
 * nothing records a scheduled-and-missed occurrence. A denominator built from the weekly
 * `required_meetings` pattern would invent holidays, pre-join weeks, cancellations and the
 * intern's own paused weeks, and would then be shown to a manager as fact.
 *
 * So the central test here is a NEGATIVE one, asserted across every fixture including a
 * heavily-attended one: no input produces a percentage. It is written as `it.each` on purpose
 * — a single happy-path fixture would pass against a function that computes a rate whenever
 * it has enough data.
 */
const mockFindAll = jest.fn();
jest.mock('../../../models/InternshipMeetingAttendance', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockFindAll(...a) },
}));

import {
  toConsoleAttendance, consoleAttendance, summarizeAttendance, type AttendanceRow,
} from '../internshipAttendanceService';

const join = (meeting: string, date: string): AttendanceRow =>
  ({ meeting_key: meeting, session_date: date, joined_at: `${date}T14:00:00.000Z` });

/** A full quarter of a diligent intern: four meetings a week for ten weeks. */
const MANY: AttendanceRow[] = Array.from({ length: 10 }, (_, w) =>
  ['Monday', 'Tuesday', 'Wednesday', 'Friday'].map((m, i) =>
    join(m, `2026-0${w < 3 ? 7 : 8}-${String(1 + w * 2 + i).padStart(2, '0')}`)))
  .flat();

const FIXTURES: ReadonlyArray<readonly [string, AttendanceRow[]]> = [
  ['never joined anything', []],
  ['joined once', [join('Monday', '2026-09-14')]],
  ['joined a handful', [join('Monday', '2026-09-14'), join('Friday', '2026-09-11'), join('Monday', '2026-09-07')]],
  ['joined forty times', MANY],
];

beforeEach(() => jest.clearAllMocks());

describe('no input produces a percentage', () => {
  it.each(FIXTURES)('%s: expected and pct are null, basis says why', (_label, rows) => {
    const out = toConsoleAttendance(summarizeAttendance(rows));

    expect(out.expected).toBeNull();
    expect(out.pct).toBeNull();
    expect(out.basis).toBe('joins_only');
  });

  it('is not merely absent of a rate — the keys are present and null', () => {
    // An omitted key invites `attended / (expected ?? 12)` downstream, which is the exact
    // fabrication this guarantee exists to prevent. The null has to be visible.
    const out = toConsoleAttendance(summarizeAttendance(MANY));

    expect(Object.keys(out)).toContain('expected');
    expect(Object.keys(out)).toContain('pct');
    expect(out).toMatchObject({ expected: null, pct: null });
  });

  it('reports the count it actually has, for all forty of them', () => {
    expect(toConsoleAttendance(summarizeAttendance(MANY)).attended).toBe(40);
  });
});

describe('what it does report', () => {
  it('carries the per-meeting breakdown through unchanged', () => {
    const rows = [join('Monday', '2026-09-14'), join('Monday', '2026-09-07'), join('Friday', '2026-09-11')];

    expect(toConsoleAttendance(summarizeAttendance(rows)).by_meeting).toEqual({ Monday: 2, Friday: 1 });
  });

  it('reports never-attended as null rather than a zero date', () => {
    const out = toConsoleAttendance(summarizeAttendance([]));

    expect(out.attended).toBe(0);
    expect(out.last_attended_at).toBeNull();
  });

  it('reports the most recent join', () => {
    const rows = [join('Monday', '2026-09-07'), join('Friday', '2026-09-25'), join('Monday', '2026-09-14')];

    expect(toConsoleAttendance(summarizeAttendance(rows)).last_attended_at).toBe('2026-09-25T14:00:00.000Z');
  });
});

describe('consoleAttendance, against the model', () => {
  it('reads only this enrollment\'s rows and answers in console shape', async () => {
    mockFindAll.mockResolvedValue([
      { meeting_key: 'Monday', session_date: '2026-09-14', joined_at: '2026-09-14T14:00:00.000Z' },
      { meeting_key: 'Friday', session_date: '2026-09-11', joined_at: '2026-09-11T14:00:00.000Z' },
    ]);

    const out = await consoleAttendance('enr-1');

    expect(mockFindAll.mock.calls[0][0].where).toEqual({ enrollment_id: 'enr-1' });
    expect(out).toEqual({
      attended: 2,
      by_meeting: { Monday: 1, Friday: 1 },
      last_attended_at: '2026-09-14T14:00:00.000Z',
      expected: null,
      pct: null,
      basis: 'joins_only',
    });
  });

  it('answers for an intern with no rows instead of throwing', async () => {
    mockFindAll.mockResolvedValue([]);

    expect(await consoleAttendance('enr-2')).toEqual({
      attended: 0, by_meeting: {}, last_attended_at: null, expected: null, pct: null, basis: 'joins_only',
    });
  });
});
