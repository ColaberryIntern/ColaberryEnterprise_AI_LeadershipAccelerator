import type { Request, Response } from 'express';
import { handleGetCurriculumCompletion } from '../acceleratorController';

/**
 * `?view=pace` is a payload contract, not a cosmetic flag.
 *
 * The Class Dashboard renders this panel on the cohort landing view, so it pays whatever
 * this endpoint returns on every open. Measured against the July 2026 cohort the full
 * response is 280.2 KB and the pace half is 8.2 KB — the card tree is 1,293 cards and 97%
 * of the bytes, and the panel reads none of it.
 *
 * The failure this guards is silent in both directions: dropping the param leaves the tree
 * in and nothing breaks visibly (just a quarter-megabyte on the landing view), and dropping
 * `pace`/`students` from the pace response empties the KPI without an error. Neither shows
 * up as a broken screen, so neither would be caught by looking at it.
 */

const COHORT = 'cohort-1';

const fakeCompletion = {
  cohortId: COHORT,
  scheduledWeek: 6,
  deliveredSessions: 12,
  activeStudents: 49,
  weeks: [{ week: 1, cardCount: 2, publishedCardCount: 2, completedPct: 10, studentsCompletedAny: 5, isScheduledWeek: false, sections: [] }],
  pace: { gold: 2, green: 4, yellow: 2, red: 41 },
  students: [{ enrollmentId: 'e1', name: 'A Student', weeksCompleted: 3, cardsCompleted: 30, furthestWeekTouched: 4, delta: -3, band: 'red' }],
};

jest.mock('../../services/curriculumCompletionService', () => ({
  getCurriculumCompletion: jest.fn(async () => fakeCompletion),
}), { virtual: false });

function mockRes() {
  const res: Partial<Response> & { body?: unknown; code?: number } = {
    status(c: number) { (this as { code?: number }).code = c; return this as Response; },
    json(p: unknown) { (this as { body?: unknown }).body = p; return this as Response; },
  };
  return res as Response & { body?: any; code?: number };
}

const reqWith = (view?: string) => ({
  params: { cohortId: COHORT },
  query: view === undefined ? {} : { view },
} as unknown as Request);

describe('GET curriculum-completion', () => {
  it('returns the card tree by default', async () => {
    const res = mockRes();
    await handleGetCurriculumCompletion(reqWith(), res, jest.fn());
    expect(res.body.weeks).toHaveLength(1);
    expect(res.body.pace.red).toBe(41);
  });

  it('drops the card tree for ?view=pace', async () => {
    const res = mockRes();
    await handleGetCurriculumCompletion(reqWith('pace'), res, jest.fn());
    // THE POINT OF THE PARAM. `weeks` is the 97%.
    expect(res.body.weeks).toBeUndefined();
  });

  it('keeps everything the pace panel actually renders', async () => {
    const res = mockRes();
    await handleGetCurriculumCompletion(reqWith('pace'), res, jest.fn());
    expect(res.body.pace).toEqual({ gold: 2, green: 4, yellow: 2, red: 41 });
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0].band).toBe('red');
    // The panel's caption states both of these; without them it claims the class is on
    // "week undefined".
    expect(res.body.scheduledWeek).toBe(6);
    expect(res.body.deliveredSessions).toBe(12);
    expect(res.body.activeStudents).toBe(49);
  });

  it('treats any other view value as the full response', async () => {
    // A typo must not silently serve a half-empty screen to the Curriculum tab.
    for (const v of ['', 'PACE', 'full', 'weeks']) {
      const res = mockRes();
      await handleGetCurriculumCompletion(reqWith(v), res, jest.fn());
      expect(res.body.weeks).toHaveLength(1);
    }
  });
});
