/**
 * Which student projects a Case Study is about, when nobody said. The three
 * reads are mocked; what is pinned is the resolution: a stored project_id on
 * the repository row counts, a connected repository counts, anything else
 * resolves to nothing, and the answer is distinct and stable.
 */
const mockCollectionFindOne = jest.fn();
const mockRepoFindAll = jest.fn();
const mockConnectionFindAll = jest.fn();
jest.mock('../../../models/CaseStudyRepoCollection', () => ({
  __esModule: true, default: { findOne: (...a: any[]) => mockCollectionFindOne(...a) },
}));
jest.mock('../../../models/CaseStudyRepository', () => ({
  __esModule: true, default: { findAll: (...a: any[]) => mockRepoFindAll(...a) },
}));
jest.mock('../../../models/GitHubConnection', () => ({
  __esModule: true, default: { findAll: (...a: any[]) => mockConnectionFindAll(...a) },
}));

import { Op } from 'sequelize';
import { resolveProjectsThroughRepositories } from '../caseStudyProjectResolution';

const CS = '11111111-0000-4000-8000-000000000001';
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'bbbbbbbb-0000-4000-8000-000000000002';

beforeEach(() => {
  jest.clearAllMocks();
  mockCollectionFindOne.mockResolvedValue({ id: 'coll-1' });
  mockConnectionFindAll.mockResolvedValue([]);
});

describe('resolveProjectsThroughRepositories', () => {
  it('a record with no repository collection is about no project', async () => {
    mockCollectionFindOne.mockResolvedValue(null);
    expect(await resolveProjectsThroughRepositories(CS)).toEqual([]);
    expect(mockRepoFindAll).not.toHaveBeenCalled();
  });

  it('a repository row that already carries a project_id resolves without asking GitHub connections', async () => {
    mockRepoFindAll.mockResolvedValue([{ repo_owner: 'student', repo_name: 'workspace', project_id: P1 }]);
    expect(await resolveProjectsThroughRepositories(CS)).toEqual([P1]);
    expect(mockConnectionFindAll).not.toHaveBeenCalled();
  });

  it('a repository connected to a student project resolves through the connection, case-insensitively', async () => {
    // The live record on 2026-09-14: repository row unlinked, connection linked.
    mockRepoFindAll.mockResolvedValue([{ repo_owner: 'QNinying', repo_name: 'AI-Operations-Center', project_id: null }]);
    mockConnectionFindAll.mockResolvedValue([{ project_id: P2 }]);
    expect(await resolveProjectsThroughRepositories(CS)).toEqual([P2]);
    // The comparison values are lower-cased; the column side is LOWER() in
    // SQL. Read the Op.and clauses structurally: Symbol keys do not survive
    // JSON.stringify, and a string assertion would pass on "{}".
    const clauses = (mockConnectionFindAll.mock.calls[0][0] as { where: Record<symbol, unknown[]> }).where[Op.and];
    const values = clauses.map((c: any) => c?.logic ?? c?.comparator ?? c);
    expect(values).toEqual(expect.arrayContaining(['qninying', 'ai-operations-center']));
    expect(values).not.toEqual(expect.arrayContaining(['QNinying']));
  });

  it('a repository that belongs to no student project resolves to nothing: the enterprise repo stays a library record', async () => {
    mockRepoFindAll.mockResolvedValue([{ repo_owner: 'ColaberryIntern', repo_name: 'ColaberryEnterprise_AI_LeadershipAccelerator', project_id: null }]);
    mockConnectionFindAll.mockResolvedValue([]);
    expect(await resolveProjectsThroughRepositories(CS)).toEqual([]);
  });

  it('is distinct and stable across several repositories', async () => {
    mockRepoFindAll.mockResolvedValue([
      { repo_owner: 'a', repo_name: 'one', project_id: P2 },
      { repo_owner: 'b', repo_name: 'two', project_id: null },
      { repo_owner: 'c', repo_name: 'three', project_id: P2 },
      { repo_owner: '', repo_name: 'blank-owner', project_id: null },
    ]);
    mockConnectionFindAll.mockResolvedValue([{ project_id: P1 }, { project_id: P2 }, { project_id: null }]);
    expect(await resolveProjectsThroughRepositories(CS)).toEqual([P1, P2]);
    // The blank-owner row never reaches the connections table.
    expect(mockConnectionFindAll).toHaveBeenCalledTimes(1);
  });
});
