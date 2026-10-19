/**
 * A stale browser copy must not overwrite a PROVISIONED AGENT-DOMAIN project.
 *
 * THE INCIDENT, measured. On 19 Oct 2026 the `product_experience` domain project was repaired
 * by hand and corrupted again at 18:43:00Z, minutes after the intern's portal was opened:
 * three duplicate `student_task_lists` appeared carrying the ORIGINAL list's UUID in the
 * `cluster` column, and six task `build` fields reverted from roughly 3,500 characters to the
 * 418-character text they had held before that morning's backfill. Two independent symptoms,
 * one cause.
 *
 * WHY THE EXISTING GUARD MISSED IT. `importProject` already refuses a client snapshot when
 * `hasPublishedBuild` is true, added after the 2026-08-13 incident in this suite's sibling
 * where a stale tab rewrote all 18 tasks of a freshly published plan. That sibling's own
 * docblock names the limit: the guard "only covers projects that have PUBLISHED". The ten
 * agent-domain projects are written by `agentDomainProvisioner`, which creates no `build_plans`
 * row at all. Measured in production: 10 of 10 had zero, while ordinary student projects
 * (Alveara Dental, CoreOps) had one or two. So the guard protected every project except the
 * ones this initiative created.
 *
 * WHAT IS TESTED. That the refusal happens for a domain project, that it happens BEFORE any
 * write rather than being undone afterwards, that the published-plan path still short-circuits
 * without a second query, and -- the control that makes the rest mean anything -- that an
 * ordinary client-only project is still importable.
 */
const mockTransaction = jest.fn();
const mockListFindOrCreate = jest.fn();
const mockTaskFindOrCreate = jest.fn();
const mockGetOwnedProjectTree = jest.fn();
const mockCreateProjectForEnrollment = jest.fn();
const mockProjectFindOne = jest.fn();
const mockQuery = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: {
    transaction: (...args: any[]) => mockTransaction(...args),
    query: (...args: any[]) => mockQuery(...args),
  },
}));
jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: (...a: any[]) => mockProjectFindOne(...a) },
}));
jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true,
  default: { findOrCreate: (...a: any[]) => mockListFindOrCreate(...a) },
}));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: {
    findOrCreate: (...a: any[]) => mockTaskFindOrCreate(...a),
    create: jest.fn(), findOne: jest.fn(), update: jest.fn(),
  },
}));
jest.mock('../../projectService', () => ({
  createProjectForEnrollment: (...a: any[]) => mockCreateProjectForEnrollment(...a),
  getProjectByEnrollment: jest.fn(),
}));
jest.mock('../projectReadService', () => ({
  getOwnedProjectTree: (...a: any[]) => mockGetOwnedProjectTree(...a),
}));

import { importProject, hasPublishedBuild, isProvisionedDomainProject } from '../projectWriteService';

const ENROLLMENT = 'enr-1';
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TX = { __tx: true };

/** A raw-SQL EXISTS probe: a row present means true. */
const HIT = [[{ '?column?': 1 }], {}];
const MISS = [[], {}];

/** The shape Mihret's browser actually sent: a UUID where a cluster key belongs. */
const STALE_PAYLOAD = {
  name: 'product_experience',
  lists: [{
    cluster: '258ddfa1-19c8-54f2-be0d-c2fdb2599a3a',
    title: 'Discovery and validation',
    tasks: [{
      story_id: 'product_experience.RESEARCH-1-SYSTEM-CLASSES',
      title: 'Compare the five system classes, and place this domain among them',
      build: 'This story is human work, not a Claude Code build, and it carries no prompt on purpose.',
    }],
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateProjectForEnrollment.mockResolvedValue({ id: PROJECT });
  mockGetOwnedProjectTree.mockImplementation(async (_e: string, id: string) => ({ id, lists: [] }));
  mockTransaction.mockImplementation(async (cb: any) => cb(TX));
  mockListFindOrCreate.mockImplementation(async ({ where }: any) => [{ id: `list-${where.cluster}`, update: jest.fn() }, true]);
  mockTaskFindOrCreate.mockImplementation(async ({ defaults }: any) => [{ ...defaults, update: jest.fn() }, true]);
  mockProjectFindOne.mockResolvedValue(null);
});

describe('a provisioned agent-domain project refuses the browser snapshot', () => {
  it('writes NOTHING when the project is in agent_domain_projects', async () => {
    mockQuery.mockResolvedValueOnce(MISS);   // no published build plan
    mockQuery.mockResolvedValueOnce(HIT);    // but it IS a domain project

    await importProject(ENROLLMENT, STALE_PAYLOAD as any);

    // The two symptoms of the real incident, each asserted at its own source.
    expect(mockListFindOrCreate).not.toHaveBeenCalled();  // no duplicate list
    expect(mockTaskFindOrCreate).not.toHaveBeenCalled();  // no reverted build
  });

  it('refuses BEFORE opening a transaction, not by rolling one back', async () => {
    mockQuery.mockResolvedValueOnce(MISS);
    mockQuery.mockResolvedValueOnce(HIT);
    await importProject(ENROLLMENT, STALE_PAYLOAD as any);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('still returns the real server-side tree, so the client sees truth rather than an error', async () => {
    mockQuery.mockResolvedValueOnce(MISS);
    mockQuery.mockResolvedValueOnce(HIT);
    const out: any = await importProject(ENROLLMENT, STALE_PAYLOAD as any);
    expect(mockGetOwnedProjectTree).toHaveBeenCalledWith(ENROLLMENT, PROJECT);
    expect(out.id).toBe(PROJECT);
  });

  it('asks agent_domain_projects by student_project_id', async () => {
    mockQuery.mockResolvedValueOnce(MISS);
    mockQuery.mockResolvedValueOnce(HIT);
    await importProject(ENROLLMENT, STALE_PAYLOAD as any);
    const sqlText = String(mockQuery.mock.calls[1][0]);
    expect(sqlText).toContain('agent_domain_projects');
    // Matching agent_domain_projects.id instead would make the guard silently always-false,
    // which is this same bug wearing a different hat.
    expect(sqlText).toContain('student_project_id = $pid');
    expect(mockQuery.mock.calls[1][1].bind.pid).toBe(PROJECT);
  });
});

describe('the published-plan path is unchanged', () => {
  it('still refuses, and does not bother asking the second question', async () => {
    mockQuery.mockResolvedValueOnce(HIT);   // published build plan
    await importProject(ENROLLMENT, STALE_PAYLOAD as any);
    expect(mockListFindOrCreate).not.toHaveBeenCalled();
    // Short-circuit: one probe, not two.
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe('THE CONTROL: an ordinary client-only project is still importable', () => {
  it('writes the list and the task when neither guard fires', async () => {
    // Without this, disabling import outright would pass every test above while breaking the
    // legacy projects the feature exists for.
    mockQuery.mockResolvedValueOnce(MISS);  // no published plan
    mockQuery.mockResolvedValueOnce(MISS);  // not a domain project

    await importProject(ENROLLMENT, {
      name: 'CoreOps',
      lists: [{ cluster: 'r0', title: 'Release 0', tasks: [{ story_id: 'STORY-001', title: 'First' }] }],
    } as any);

    expect(mockTransaction).toHaveBeenCalled();
    expect(mockListFindOrCreate).toHaveBeenCalled();
    expect(mockListFindOrCreate.mock.calls[0][0].where.cluster).toBe('r0');
  });
});

describe('the two predicates answer their own questions', () => {
  it('hasPublishedBuild reads build_plans and nothing else', async () => {
    mockQuery.mockResolvedValue(MISS);
    await hasPublishedBuild(PROJECT);
    const sqlText = String(mockQuery.mock.calls[0][0]);
    expect(sqlText).toContain('build_plans');
    expect(sqlText).toContain("status = 'published'");
    // It was answering its own question correctly all along; the bug was in what the caller
    // asked, so widening THIS would have been the wrong fix.
    expect(sqlText).not.toContain('agent_domain_projects');
  });

  it('isProvisionedDomainProject binds the id rather than interpolating it', async () => {
    mockQuery.mockResolvedValue(MISS);
    await isProvisionedDomainProject("p'; DROP TABLE student_tasks; --");
    expect(String(mockQuery.mock.calls[0][0])).not.toContain('DROP TABLE');
    expect(mockQuery.mock.calls[0][1].bind.pid).toBe("p'; DROP TABLE student_tasks; --");
  });
});
