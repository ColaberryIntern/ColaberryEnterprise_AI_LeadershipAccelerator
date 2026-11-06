/**
 * caseStudyLinkedPerson - the reverse link, case study -> person.
 *
 * The database is mocked at the query boundary and the shared reverse query
 * (`queryProjectIdsForCaseStudy`, over the ONE link relation the listing also uses) at its
 * module boundary, so these assert the composition: the shared relation is what is asked,
 * the answer is deduplicated and deterministic, and a failure on `hire` reads as NOBODY.
 * That the relation is the same one the listing reads is pinned in
 * portfolioCaseStudyLinks.test.ts ("one relation, both directions").
 */
jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([[]]) },
}));
jest.mock('../portfolioCaseStudyLinks', () => ({
  queryProjectIdsForCaseStudy: jest.fn().mockResolvedValue([]),
}));

import { sequelize } from '../../../config/database';
import { queryProjectIdsForCaseStudy } from '../portfolioCaseStudyLinks';
import {
  hireGateFacts, linkedPeopleForCaseStudy, projectIdsForCaseStudy, toLinkedPersonPages,
} from '../caseStudyLinkedPerson';

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockRepoProjects = queryProjectIdsForCaseStudy as unknown as jest.Mock;

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const page = (enrollment_id: string, slug: string, status = 'published', visibility = 'public') =>
  ({ enrollment_id, slug, status, visibility });

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue([[]]);
  mockRepoProjects.mockReset().mockResolvedValue([]);
});

describe('projectIdsForCaseStudy - the shared relation, read in reverse', () => {
  it('asks the shared relation by case study id, whatever project_id the record carries', async () => {
    mockRepoProjects.mockResolvedValue([P1]);
    expect(await projectIdsForCaseStudy({ id: 'cs1', project_id: P1 })).toEqual([P1]);
    expect(mockRepoProjects).toHaveBeenCalledWith('cs1');
  });

  it('adds nothing of its own: a record project_id the relation did not return is not a link', async () => {
    // The relation covers case_studies.project_id itself; trusting the record's field here
    // as well would be a second rule, which is the disagreement this module exists without.
    mockRepoProjects.mockResolvedValue([]);
    expect(await projectIdsForCaseStudy({ id: 'cs1', project_id: P1 })).toEqual([]);
  });

  it('deduplicates and sorts, so the answer does not depend on row order', async () => {
    mockRepoProjects.mockResolvedValue([P2, P1, P2]);
    expect(await projectIdsForCaseStudy({ id: 'cs1', project_id: null })).toEqual([P1, P2]);
  });
});

describe('toLinkedPersonPages - raw rows are not trusted', () => {
  it('drops rows missing an enrollment or a slug, and non-array input', () => {
    expect(toLinkedPersonPages(null)).toEqual([]);
    expect(toLinkedPersonPages([{ slug: 'a' }, { enrollment_id: 'e1' }])).toEqual([]);
  });

  it('keeps one page per enrollment', () => {
    const out = toLinkedPersonPages([page('e1', 'ann'), page('e1', 'ann-again')]);
    expect(out).toEqual([{ enrollmentId: 'e1', portfolioSlug: 'ann', status: 'published', visibility: 'public' }]);
  });
});

describe('linkedPeopleForCaseStudy', () => {
  it('does not query when the record resolves to no project', async () => {
    expect(await linkedPeopleForCaseStudy({ id: 'cs1', project_id: null })).toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns every linked page whatever its visibility - identity, not permission', async () => {
    mockRepoProjects.mockResolvedValue([P1]);
    mockQuery.mockResolvedValue([[page('e1', 'ann', 'draft', 'private')]]);
    const out = await linkedPeopleForCaseStudy({ id: 'cs1', project_id: P1 });
    expect(out).toHaveLength(1);
    expect(out[0].visibility).toBe('private');
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/archived_at IS NULL/);
    expect(opts).toEqual({ bind: [[P1]] });
  });
});

describe('hireGateFacts - what the publish gate is told', () => {
  it('is null on every surface but hire, and runs no query', async () => {
    for (const surface of ['enterprise', 'training', 'ai-flotation', 'refactored']) {
      // eslint-disable-next-line no-await-in-loop
      expect(await hireGateFacts({ id: 'cs1', project_id: P1 }, surface)).toBeNull();
    }
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockRepoProjects).not.toHaveBeenCalled();
  });

  it('counts the linked people on hire', async () => {
    mockRepoProjects.mockResolvedValue([P1]);
    mockQuery.mockResolvedValue([[page('e1', 'ann'), page('e2', 'bo')]]);
    expect(await hireGateFacts({ id: 'cs1', project_id: P1 }, 'hire')).toEqual({ linkedPeople: 2 });
  });

  it('answers ZERO, and logs, when the lookup throws - a failure is not a person found', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockRepoProjects.mockRejectedValue(Object.assign(new Error('db down'), { name: 'ConnectionError' }));
    expect(await hireGateFacts({ id: 'cs1', project_id: null }, 'hire')).toEqual({ linkedPeople: 0 });
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line.event).toBe('case_study_hire_person_read_failed');
    expect(line.error_class).toBe('ConnectionError');
    warn.mockRestore();
  });
});
