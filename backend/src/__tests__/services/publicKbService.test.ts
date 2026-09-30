/**
 * publicKbService unit tests
 *
 * Covers the public-safe projection of cora_kb_entries used by the Phase 2
 * sales KB page: category slugging, merge-tag resolution, and the
 * confidence flag flip for unresolved-tag entries. Model layer is mocked
 * via kbService's own dependencies; no DB I/O.
 */

jest.mock('../../models/CoraKbCourse', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/CoraKbCohort', () => ({ findOne: jest.fn(), findByPk: jest.fn() }));
jest.mock('../../models/CoraKbEntry', () => ({ findAll: jest.fn() }));
jest.mock('../../models/ResponsiblePerson', () => ({ findAll: jest.fn() }));

import { getPublicSalesKb } from '../../services/publicKbService';
import CoraKbCourse from '../../models/CoraKbCourse';
import CoraKbCohort from '../../models/CoraKbCohort';
import CoraKbEntry from '../../models/CoraKbEntry';

const findOneCourse = CoraKbCourse.findOne as jest.Mock;
const findByPkCourse = CoraKbCourse.findByPk as jest.Mock;
const findOneCohort = CoraKbCohort.findOne as jest.Mock;
const findAllEntries = CoraKbEntry.findAll as jest.Mock;

const mockCourse: any = { id: 'course-1', name: 'AI Systems Architect Accelerator', slug: 'ai-architect' };
const mockCohort: any = {
  id: 'cohort-1', course_id: 'course-1', name: 'Founding Cohort', cohort_number: 1,
  start_date: 'July 23, 2026', end_date: null, price_annual: 149, price_monthly: 199,
  seats_total: 40, seats_remaining: 32, enrollment_url: 'enterprise.colaberry.ai',
};

beforeEach(() => {
  jest.clearAllMocks();
  findOneCourse.mockResolvedValue(mockCourse);
  findByPkCourse.mockResolvedValue(mockCourse);
  findOneCohort.mockResolvedValue(mockCohort);
});

describe('getPublicSalesKb', () => {
  it('happy path: slugs categories, resolves merge tags, and marks fully-resolved entries "grounded"', async () => {
    findAllEntries.mockResolvedValue([
      {
        main_category: 'Pricing & Enrollment',
        question_pattern: 'How much does the program cost?',
        answer_template: 'The annual plan is ${{cohort.price_annual}}/mo.',
        keywords: 'price, cost, pricing',
      },
    ]);

    const result = await getPublicSalesKb();

    expect(result.categories).toEqual([{ key: 'pricing-enrollment', title: 'Pricing & Enrollment' }]);
    expect(result.qa).toHaveLength(1);
    expect(result.qa[0]).toMatchObject({
      category: 'pricing-enrollment',
      q: 'How much does the program cost?',
      a: 'The annual plan is $149/mo.',
      tags: ['price', 'cost', 'pricing'],
      confidence: 'grounded',
    });
  });

  it('flags entries with unresolved merge tags as "drafted-verify" rather than dropping them', async () => {
    findAllEntries.mockResolvedValue([
      {
        main_category: 'Schedule & Sessions',
        question_pattern: 'When does the cohort end?',
        answer_template: 'The cohort ends {{cohort.end_date}}.',
        keywords: '',
      },
    ]);

    const result = await getPublicSalesKb();

    expect(result.qa[0].confidence).toBe('drafted-verify');
    expect(result.qa[0].a).toBe('The cohort ends [TBD].');
  });

  it('returns an empty payload (never throws) when the configured course does not exist', async () => {
    findOneCourse.mockResolvedValue(null);

    const result = await getPublicSalesKb();

    expect(result).toEqual({ categories: [], qa: [] });
    expect(findAllEntries).not.toHaveBeenCalled();
  });
});
