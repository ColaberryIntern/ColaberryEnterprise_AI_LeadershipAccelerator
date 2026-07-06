/**
 * kbService unit tests
 *
 * Covers the KB Ops merge-tag resolution and Synthflow export skip logic —
 * the two pieces of non-trivial business logic in the Phase 1 KB Ops system.
 * Model layer is mocked; no DB I/O.
 */

jest.mock('../../models/CoraKbCourse', () => ({ findByPk: jest.fn() }));
jest.mock('../../models/CoraKbCohort', () => ({
  findOne: jest.fn(),
  findByPk: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../../models/CoraKbEntry', () => ({
  findAll: jest.fn(),
  findByPk: jest.fn(),
}));
jest.mock('../../models/ResponsiblePerson', () => ({ findAll: jest.fn() }));

import {
  resolveMergeTags,
  hasUnresolvedTags,
  getActiveCohort,
  listEntries,
  buildSynthflowExport,
} from '../../services/kbService';
import CoraKbCourse from '../../models/CoraKbCourse';
import CoraKbCohort from '../../models/CoraKbCohort';
import CoraKbEntry from '../../models/CoraKbEntry';
import ResponsiblePerson from '../../models/ResponsiblePerson';

const findByPkCourse = CoraKbCourse.findByPk as jest.Mock;
const findOneCohort = CoraKbCohort.findOne as jest.Mock;
const findAllEntries = CoraKbEntry.findAll as jest.Mock;
const findAllPersons = ResponsiblePerson.findAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

const mockCourse: any = { id: 'course-1', name: 'AI Systems Architect Accelerator', slug: 'ai-architect' };
const mockCohort: any = {
  id: 'cohort-1',
  course_id: 'course-1',
  name: 'Founding Cohort',
  cohort_number: 1,
  start_date: 'July 23, 2026',
  end_date: null,
  price_annual: 149,
  price_monthly: null,
  seats_total: 40,
  seats_remaining: null,
  enrollment_url: 'enterprise.colaberry.ai',
};

describe('resolveMergeTags', () => {
  it('happy path: resolves cohort and course tags from a template', () => {
    const template = 'Join {{course.name}} — starts {{cohort.start_date}} at ${{cohort.price_annual}}/mo.';
    const resolved = resolveMergeTags(template, mockCohort, mockCourse);
    expect(resolved).toBe(
      'Join AI Systems Architect Accelerator — starts July 23, 2026 at $149/mo.'
    );
  });

  it('falls back to [TBD] for null cohort fields', () => {
    const resolved = resolveMergeTags('End date: {{cohort.end_date}}', mockCohort, mockCourse);
    expect(resolved).toBe('End date: [TBD]');
  });
});

describe('hasUnresolvedTags', () => {
  it('detects a [TBD] fallback left in resolved text', () => {
    expect(hasUnresolvedTags('End date: [TBD]')).toBe(true);
  });

  it('happy path: fully resolved text has no unresolved tags', () => {
    expect(hasUnresolvedTags('End date: October 15, 2026')).toBe(false);
  });
});

describe('getActiveCohort', () => {
  it('happy path: returns the cohort + course for an active cohort', async () => {
    findByPkCourse.mockResolvedValue(mockCourse);
    findOneCohort.mockResolvedValue(mockCohort);

    const result = await getActiveCohort('course-1');

    expect(result).toEqual({ cohort: mockCohort, course: mockCourse });
    expect(findOneCohort).toHaveBeenCalledWith({
      where: { course_id: 'course-1', is_active: true },
    });
  });

  it('returns null when the course does not exist', async () => {
    findByPkCourse.mockResolvedValue(null);

    const result = await getActiveCohort('missing-course');

    expect(result).toBeNull();
    expect(findOneCohort).not.toHaveBeenCalled();
  });
});

describe('listEntries', () => {
  it('happy path: filtering by course also includes course_id=NULL global entries, not just that course', async () => {
    findAllEntries.mockResolvedValue([]);

    await listEntries({ courseId: 'course-1' });

    const whereArg = findAllEntries.mock.calls[0][0].where;
    // Sequelize Op symbols aren't string keys — assert on the resolved structure instead.
    const opSymbols = Object.getOwnPropertySymbols(whereArg);
    expect(opSymbols.length).toBeGreaterThan(0);
    const andConditions = whereArg[opSymbols[0]];
    const courseCondition = andConditions.find((c: any) => 'course_id' in c);
    const courseOpSymbols = Object.getOwnPropertySymbols(courseCondition.course_id);
    const orValues = courseCondition.course_id[courseOpSymbols[0]];
    expect(orValues).toEqual(['course-1', null]);
  });
});

describe('buildSynthflowExport', () => {
  it('happy path: resolves merge tags and includes fully-resolved entries', async () => {
    findAllEntries.mockResolvedValue([
      {
        id: 'entry-1',
        course_id: 'course-1',
        main_category: 'Pricing & Enrollment',
        sub_category: 'Enrollment',
        question_pattern: 'How do I enroll?',
        answer_template: 'Go to {{cohort.enrollment_url}} to enroll.',
        primary_person_id: 'person-1',
        team_person_ids: [],
        priority: 'High',
        automation_potential: 'High',
        updated_at: new Date('2026-07-06T00:00:00Z'),
      },
    ]);
    findAllPersons.mockResolvedValue([{ id: 'person-1', name: 'Roselen', email: 'admissions@colaberry.com', calendar_link: null }]);
    findByPkCourse.mockResolvedValue(mockCourse);
    findOneCohort.mockResolvedValue(mockCohort);

    const { rows, skipped } = await buildSynthflowExport('course-1');

    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe('Go to enterprise.colaberry.ai to enroll.');
    expect(rows[0].responsible_person_email).toBe('Roselen <admissions@colaberry.com>');
    expect(rows[0].full_category).toBe('Pricing & Enrollment > Enrollment');
    expect(rows[0].generated_date).toBe('2026-07-06');
  });

  it('skips entries whose merge tags cannot be resolved to a real value', async () => {
    findAllEntries.mockResolvedValue([
      {
        id: 'entry-2',
        course_id: 'course-1',
        main_category: 'Schedule & Sessions',
        sub_category: 'End date',
        question_pattern: 'When does the cohort end?',
        answer_template: 'The cohort ends {{cohort.end_date}}.',
        primary_person_id: null,
        team_person_ids: [],
        priority: 'Medium',
        automation_potential: 'Medium',
        updated_at: new Date('2026-07-06T00:00:00Z'),
      },
    ]);
    findAllPersons.mockResolvedValue([]);
    findByPkCourse.mockResolvedValue(mockCourse);
    findOneCohort.mockResolvedValue(mockCohort); // mockCohort.end_date is null -> [TBD]

    const { rows, skipped } = await buildSynthflowExport('course-1');

    expect(skipped).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it('force_include_unresolved: includes unresolved entries with [TBD] left visible instead of skipping', async () => {
    findAllEntries.mockResolvedValue([
      {
        id: 'entry-2',
        course_id: 'course-1',
        main_category: 'Schedule & Sessions',
        sub_category: 'End date',
        question_pattern: 'When does the cohort end?',
        answer_template: 'The cohort ends {{cohort.end_date}}.',
        primary_person_id: null,
        team_person_ids: [],
        priority: 'Medium',
        automation_potential: 'Medium',
        updated_at: new Date('2026-07-06T00:00:00Z'),
      },
    ]);
    findAllPersons.mockResolvedValue([]);
    findByPkCourse.mockResolvedValue(mockCourse);
    findOneCohort.mockResolvedValue(mockCohort);

    const { rows, skipped } = await buildSynthflowExport('course-1', true);

    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].answer).toBe('The cohort ends [TBD].');
  });

  it('resolves course-agnostic (course_id null) entries against the most recently active cohort across all courses', async () => {
    findAllEntries.mockResolvedValue([
      {
        id: 'entry-3',
        course_id: null,
        main_category: 'Administrative',
        sub_category: null,
        question_pattern: 'I need employment verification.',
        answer_template: 'Contact everify@colaberry.com. Founding rate is {{cohort.price_annual}}/mo.',
        primary_person_id: null,
        team_person_ids: [],
        priority: 'Medium',
        automation_potential: 'High',
        updated_at: new Date('2026-07-06T00:00:00Z'),
      },
    ]);
    findAllPersons.mockResolvedValue([]);
    findByPkCourse.mockResolvedValue(mockCourse);
    findOneCohort.mockResolvedValue(mockCohort);

    const { rows, skipped } = await buildSynthflowExport();

    expect(skipped).toBe(0);
    expect(rows[0].answer).toBe('Contact everify@colaberry.com. Founding rate is 149/mo.');
    expect(rows[0].full_category).toBe('Administrative');
  });
});
