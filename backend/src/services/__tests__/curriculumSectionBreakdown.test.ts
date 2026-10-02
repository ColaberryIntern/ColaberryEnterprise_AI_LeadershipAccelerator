/**
 * Per-student, per-SECTION completion — the read model the Intern Console's training
 * panel needs and the repo did not have.
 *
 * The cohort view has had section-level completion all along (`CurriculumSection`). The
 * per-student view has not: `getStudentWeekBreakdown`'s query groups by `c.week` and never
 * selects `c.bucket`. So "how much of week 3 has this student done" was answerable and
 * "…and which parts of it" was not.
 *
 * What these pin is mostly about ABSENCE. A training strip is read left-to-right as the
 * shape of a week, so a bucket that renders nothing because it was omitted from the payload
 * looks identical to a bucket the student has not started — and they are different facts.
 * Several tests below exist only to stop an empty bucket from disappearing.
 */
const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import {
  getStudentSectionBreakdown, BUCKET_ORDER, WEEK_DONE_THRESHOLD,
} from '../curriculumCompletionService';

const COHORT = 'cohort-1';
const ENR = 'enr-1';

/** The three queries the function makes, in order: who, sessions, cells. */
const respond = (
  who: unknown[],
  sessions: unknown[],
  cells: unknown[],
) => {
  mockQuery.mockReset();
  mockQuery
    .mockResolvedValueOnce([who, {}])
    .mockResolvedValueOnce([sessions, {}])
    .mockResolvedValueOnce([cells, {}]);
};

const WHO = [{ id: ENR, name: 'Quincy Nkwain Ninying' }];
const SESSIONS = [{ title: 'Week 3 · Build Day', status: 'completed' }];
const cell = (week: number, bucket: string, published: number, completed: number) =>
  ({ week, bucket, published, completed });

beforeEach(() => jest.clearAllMocks());

describe('the shape of a week', () => {
  it('returns every ordered bucket, including ones with nothing in them', async () => {
    // Only two buckets have cards. The other five must still appear, or the strip renders
    // five gaps that read as missing data rather than as empty sections.
    respond(WHO, SESSIONS, [cell(1, 'learn', 4, 2), cell(1, 'build', 2, 0)]);

    const out = await getStudentSectionBreakdown(COHORT, ENR);

    expect(out!.rows[0].sections.map((s) => s.bucket)).toEqual([...BUCKET_ORDER]);
  });

  it('reports an empty bucket as published 0, never by omitting it', async () => {
    respond(WHO, SESSIONS, [cell(1, 'learn', 4, 2)]);

    const practice = (await getStudentSectionBreakdown(COHORT, ENR))!
      .rows[0].sections.find((s) => s.bucket === 'practice')!;

    expect(practice).toBeDefined();
    expect(practice.published).toBe(0);
    expect(practice.completed).toBe(0);
    expect(practice.completedPct).toBe(0);
  });

  it('keeps the curriculum order rather than the order the database returned', async () => {
    // Postgres gives no ordering guarantee inside a week, and the strip is read as a
    // sequence. Returning them shuffled would redraw the week wrong.
    respond(WHO, SESSIONS, [
      cell(1, 'advance', 1, 1), cell(1, 'pre_class', 1, 1), cell(1, 'reflect', 1, 0),
    ]);

    const buckets = (await getStudentSectionBreakdown(COHORT, ENR))!.rows[0].sections.map((s) => s.bucket);

    expect(buckets.indexOf('pre_class')).toBeLessThan(buckets.indexOf('reflect'));
    expect(buckets.indexOf('reflect')).toBeLessThan(buckets.indexOf('advance'));
  });

  it('shows a bucket nobody ordered, at the end, instead of dropping it', async () => {
    // A new bucket added to the curriculum must surface as a column somebody has to explain,
    // not disappear from the grid.
    respond(WHO, SESSIONS, [cell(1, 'learn', 2, 1), cell(1, 'capstone', 3, 3)]);

    const buckets = (await getStudentSectionBreakdown(COHORT, ENR))!.rows[0].sections.map((s) => s.bucket);

    expect(buckets).toContain('capstone');
    expect(buckets[buckets.length - 1]).toBe('capstone');
  });

  it('files a card with no bucket rather than losing it', async () => {
    respond(WHO, SESSIONS, [cell(2, 'learn', 1, 1), { week: 2, bucket: null, published: 5, completed: 5 }]);

    const row = (await getStudentSectionBreakdown(COHORT, ENR))!.rows[0];

    expect(row.sections.find((s) => s.bucket === 'unsorted')!.published).toBe(5);
    expect(row.publishedCardCount).toBe(6);
  });
});

describe('the week totals, and the one rule they share with the week view', () => {
  it('sums the sections rather than counting separately', async () => {
    respond(WHO, SESSIONS, [cell(1, 'learn', 4, 3), cell(1, 'build', 6, 1)]);

    const row = (await getStudentSectionBreakdown(COHORT, ENR))!.rows[0];

    expect(row.publishedCardCount).toBe(10);
    expect(row.completed).toBe(4);
    expect(row.completedPct).toBe(40);
  });

  it('uses the SAME done threshold as the week view, from the same constant', async () => {
    // Exactly at the threshold counts as done. The 50% guess this constant replaced put 47
    // of 49 students in red and reported nothing; the number is not re-derived here.
    const atThreshold = Math.round(10 * WEEK_DONE_THRESHOLD);
    respond(WHO, SESSIONS, [cell(1, 'learn', 10, atThreshold)]);
    expect((await getStudentSectionBreakdown(COHORT, ENR))!.rows[0].weekDone).toBe(true);

    respond(WHO, SESSIONS, [cell(1, 'learn', 10, atThreshold - 1)]);
    expect((await getStudentSectionBreakdown(COHORT, ENR))!.rows[0].weekDone).toBe(false);
  });

  it('never calls a week with no published cards done', async () => {
    // 0/0 is not 100%. A week that has not been published yet must not read as cleared —
    // the weeks 1–3 project gate is judged on exactly this field.
    respond(WHO, SESSIONS, [cell(4, 'learn', 0, 0)]);

    const row = (await getStudentSectionBreakdown(COHORT, ENR))!.rows[0];

    expect(row.weekDone).toBe(false);
    expect(row.completedPct).toBe(0);
  });

  it('counts only published cards, so a draft cannot dilute the denominator', async () => {
    // `published` comes from the FILTER on status = 'active'; an unpublished card arrives
    // counted out already. This pins that the function trusts that count rather than
    // recomputing from a raw total.
    respond(WHO, SESSIONS, [cell(1, 'learn', 2, 2)]);

    const row = (await getStudentSectionBreakdown(COHORT, ENR))!.rows[0];

    expect(row.publishedCardCount).toBe(2);
    expect(row.completedPct).toBe(100);
  });
});

describe('ordering and identity', () => {
  it('orders weeks ascending and sinks the unscheduled bucket to the end', async () => {
    respond(WHO, SESSIONS, [
      cell(3, 'learn', 1, 0), { week: null, bucket: 'learn', published: 2, completed: 1 }, cell(1, 'learn', 1, 1),
    ]);

    expect((await getStudentSectionBreakdown(COHORT, ENR))!.rows.map((r) => r.week)).toEqual([1, 3, null]);
  });

  it('reads the scheduled week off the session title, not a session number', async () => {
    respond(WHO, [
      { title: 'Week 6 · Build Day', status: 'completed' },
      { title: 'Week 9 · Architecture Day', status: 'scheduled' },
    ], [cell(1, 'learn', 1, 1)]);

    // Week 9 has not happened, so the cohort is on 6.
    expect((await getStudentSectionBreakdown(COHORT, ENR))!.scheduledWeek).toBe(6);
  });

  it('answers null for someone who is not in this cohort, rather than an empty week grid', async () => {
    // An empty grid would render as "this student has done nothing", which is a claim.
    // Null is the honest answer to "no such student here".
    respond([], SESSIONS, []);

    expect(await getStudentSectionBreakdown(COHORT, 'someone-else')).toBeNull();
  });
});
