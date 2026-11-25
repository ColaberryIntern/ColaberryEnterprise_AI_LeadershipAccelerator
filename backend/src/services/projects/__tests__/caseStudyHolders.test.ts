/** A project that only holds case studies is not shown as a build; a real build always is. */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { caseStudyHolderIds, withoutHolders } from '../caseStudyHolders';

beforeEach(() => mockQuery.mockReset());

describe('caseStudyHolderIds', () => {
  it('returns the ids, scoped to the enrollment', async () => {
    mockQuery.mockResolvedValue([{ id: 'h1' }, { id: 'h2' }]);
    expect(await caseStudyHolderIds('enr')).toEqual(new Set(['h1', 'h2']));
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({ enrollmentId: 'enr' });
  });

  it('asks about every kind of build evidence, so no real build can be a holder', async () => {
    mockQuery.mockResolvedValue([]);
    await caseStudyHolderIds('enr');
    const sql = String(mockQuery.mock.calls[0][0]);
    for (const t of ['student_tasks', 'student_task_lists', 'build_intake', 'build_plans', 'github_connections']) {
      expect(sql).toMatch(new RegExp(`NOT EXISTS \\(SELECT 1 FROM ${t} `));
    }
    expect(sql).toContain('requirements_document');
  });

  it('never hides the platform record', async () => {
    mockQuery.mockResolvedValue([{ id: 'fcce50ef-fe01-471d-a3ff-cd6948d092c2' }, { id: 'h1' }]);
    expect(await caseStudyHolderIds('enr')).toEqual(new Set(['h1']));
  });

  it('hides nothing when the lookup fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockQuery.mockRejectedValue(new Error('db down'));
    expect(await caseStudyHolderIds('enr')).toEqual(new Set());
  });
});

describe('withoutHolders', () => {
  const list = [{ id: 'build' }, { id: 'holder' }];
  it('drops holders and keeps builds', () => {
    expect(withoutHolders(list, new Set(['holder']), 'build')).toEqual([{ id: 'build' }]);
  });
  it('keeps a holder that is the active project', () => {
    expect(withoutHolders(list, new Set(['holder']), 'holder')).toEqual(list);
  });
  it('handles empty input and no holders', () => {
    expect(withoutHolders([], new Set(['x']), null)).toEqual([]);
    expect(withoutHolders(list, new Set(), null)).toEqual(list);
  });
});
