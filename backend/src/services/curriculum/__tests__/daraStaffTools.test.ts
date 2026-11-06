jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../curriculumCompletionService', () => ({
  ...jest.requireActual('../../curriculumCompletionService'),
  getCurriculumCompletion: jest.fn(),
}));

import { sequelize } from '../../../config/database';
import { getCurriculumCompletion } from '../../curriculumCompletionService';
import { executeDaraStaffTool, resolveCohort, isDaraStaffTool, DARA_STAFF_TOOLS, MIN_STUDENTS } from '../daraStaffTools';

const query = sequelize.query as unknown as jest.Mock;
const completion = getCurriculumCompletion as jest.Mock;

const COHORTS = [
  { id: 'c-nov', name: 'November 2026 Batch', start_date: '2026-11-01', active: 2 },
  { id: 'c-oct', name: 'October 2026 Batch', start_date: '2026-10-01', active: 12 },
  { id: 'c-jul', name: 'Cohort - July 2026', start_date: '2026-07-23', active: 51 },
];

const card = (title: string, completedPct: number, published = true) =>
  ({ id: title, title, type: 'lesson', bucket: 'learn', order: 1, published, completedCount: Math.round(completedPct / 10), completedPct });

const DATA = (activeStudents: number) => ({
  cohortId: 'c-oct', scheduledWeek: 3, deliveredSessions: 6, activeStudents,
  weeks: [
    { week: 1, cardCount: 1, publishedCardCount: 1, completedPct: 80, studentsCompletedAny: 10, isScheduledWeek: false, sections: [{ bucket: 'learn', cardCount: 1, completedPct: 80, cards: [card('Week 1 card', 80)] }] },
    { week: 2, cardCount: 2, publishedCardCount: 2, completedPct: 45, studentsCompletedAny: 9, isScheduledWeek: false, sections: [{ bucket: 'learn', cardCount: 2, completedPct: 45, cards: [card('Agents intro', 60), card('Draft card', 0, false)] }] },
    { week: 3, cardCount: 2, publishedCardCount: 2, completedPct: 20, studentsCompletedAny: 5, isScheduledWeek: true, sections: [{ bucket: 'build', cardCount: 2, completedPct: 20, cards: [card('Build lab', 10), card('Quiz', 30)] }] },
  ],
  pace: { gold: 1, green: 2, yellow: 3, red: 6 },
  students: [
    { enrollmentId: 'e1', name: 'Ada', weeksCompleted: 0, cardsCompleted: 1, furthestWeekTouched: 1, delta: -3, band: 'red' },
    { enrollmentId: 'e2', name: 'Bo', weeksCompleted: 2, cardsCompleted: 30, furthestWeekTouched: 3, delta: -1, band: 'yellow' },
    { enrollmentId: 'e3', name: 'Cy', weeksCompleted: 5, cardsCompleted: 90, furthestWeekTouched: 5, delta: 2, band: 'gold' },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  query.mockResolvedValue([COHORTS, undefined]);
});

describe('daraStaffTools (C88)', () => {
  it('declares exactly the two read-only staff tools, neither taking an id', () => {
    expect(DARA_STAFF_TOOLS.map((t) => (t.type === 'function' ? t.function.name : ''))).toEqual(['curriculum_health', 'student_pacing']);
    expect(isDaraStaffTool('curriculum_health')).toBe(true);
    expect(isDaraStaffTool('escalate_to_human')).toBe(false);
    expect(JSON.stringify(DARA_STAFF_TOOLS)).not.toMatch(/_id"|enrollment/i);
  });

  it('defaults to the newest started cohort with enough students, skipping a tiny brand-new batch', async () => {
    const r = await resolveCohort();
    expect(r.cohort?.id).toBe('c-oct');
    expect(r.available).toEqual(COHORTS.map((c) => c.name));
  });

  it('matches a cohort NAME only against the server list (case-insensitive); an unknown name falls back and says so', async () => {
    expect((await resolveCohort('cohort - july 2026')).cohort?.id).toBe('c-jul');
    const r = await resolveCohort("'; DROP TABLE cohorts; --");
    expect(r.cohort?.id).toBe('c-oct');
    expect(r.note).toMatch(/No started cohort is named/);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every((c) => c.length === 1)).toBe(true); // no model text is ever bound into SQL
  });

  it('curriculum_health: lowest-completion published cards in the scheduled week and the one before, lowest first', async () => {
    completion.mockResolvedValue(DATA(12));
    const out = JSON.parse(await executeDaraStaffTool('curriculum_health', {}));
    expect(completion).toHaveBeenCalledWith('c-oct');
    expect(out.cohort).toBe('October 2026 Batch');
    expect(out.scheduledWeek).toBe(3);
    expect(out.weeks.map((w: any) => w.week)).toEqual([2, 3]);
    expect(out.lowestCompletionCards.map((c: any) => c.title)).toEqual(['Build lab', 'Quiz', 'Agents intro']);
    expect(out.caution).toMatch(/not by itself evidence/);
  });

  it('curriculum_health: under 5 active students gives no card-level stall claims', async () => {
    expect(MIN_STUDENTS).toBe(5);
    completion.mockResolvedValue(DATA(4));
    const out = JSON.parse(await executeDaraStaffTool('curriculum_health', { cohort: 'October 2026 Batch' }));
    expect(out.lowestCompletionCards).toEqual([]);
    expect(out.caution).toMatch(/too few for card-level conclusions/);
  });

  it('student_pacing: band counts and the students behind, most behind first, ahead students not listed', async () => {
    completion.mockResolvedValue(DATA(12));
    const out = JSON.parse(await executeDaraStaffTool('student_pacing', {}));
    expect(out.pace).toEqual({ gold: 1, green: 2, yellow: 3, red: 6 });
    expect(out.behind.map((s: any) => [s.name, s.weeksBehind])).toEqual([['Ada', 3], ['Bo', 1]]);
    expect(out.definition).toMatch(/30%/);
  });

  it('no started cohort: an honest no-data answer, no aggregation call', async () => {
    query.mockResolvedValue([[], undefined]);
    const out = JSON.parse(await executeDaraStaffTool('student_pacing', {}));
    expect(out.status).toBe('no_data');
    expect(completion).not.toHaveBeenCalled();
  });

  it('never throws: a database failure becomes an error payload with no raw message', async () => {
    query.mockRejectedValue(Object.assign(new Error('password authentication failed for user x'), { name: 'SequelizeConnectionError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = JSON.parse(await executeDaraStaffTool('curriculum_health', {}));
    expect(out.error).toBe('Tool execution failed');
    expect(JSON.stringify(out)).not.toMatch(/password/);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unknown tool name: an error payload', async () => {
    expect(JSON.parse(await executeDaraStaffTool('drop_tables', {})).error).toMatch(/Unknown tool/);
  });
});
