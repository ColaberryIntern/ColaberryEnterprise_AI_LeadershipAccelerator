/**
 * BANKED XP SURVIVES A REWRITTEN HISTORY.
 *
 * The defect this closes, in one sentence: the XP read rebuilt its
 * `evidence_records` lookup key from the CURRENT repo sha, while the award row
 * was keyed on the sha frozen at award time — so a student who force-pushed or
 * squashed orphaned their own award and the story read 0 XP forever, with the
 * row sitting untouched in the table the whole time.
 *
 * The rule: evidence lives in our database. The repo is only where verification
 * happens. It does not get a vote in what was already banked.
 */
const mockProjectFindByPk = jest.fn();
const mockListFindAll = jest.fn();
const mockTaskFindAll = jest.fn();
const mockEvidenceFindAll = jest.fn();

jest.mock('../../../models/Project', () => ({
  __esModule: true, default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));
jest.mock('../../../models/StudentTaskList', () => ({
  __esModule: true, default: { findAll: (...a: any[]) => mockListFindAll(...a) },
}));
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true, default: { findAll: (...a: any[]) => mockTaskFindAll(...a) },
}));
jest.mock('../../../models/EvidenceRecord', () => ({
  __esModule: true, default: { findAll: (...a: any[]) => mockEvidenceFindAll(...a) },
}));
jest.mock('../../projectService', () => ({
  getProjectByEnrollment: jest.fn(), listProjectsForEnrollment: jest.fn(),
}));

import { getOwnedProjectTree } from '../projectReadService';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';
const ENROLLMENT_ID = '22222222-2222-2222-2222-222222222222';
const AWARDED_SHA = 'a'.repeat(40);
const REWRITTEN_SHA = 'b'.repeat(40);

const plain = (o: any) => ({ ...o, get: () => o });

/** A task row as `student_tasks` holds it. */
function task(over: Record<string, unknown> = {}) {
  return plain({
    id: 'task-1', task_list_id: 'list-1', project_id: PROJECT_ID, story_id: 'STORY-001',
    title: 'Take a deposit', status: 'complete', position: 0,
    verified_at: new Date('2026-08-01T12:00:00Z'),
    verified_by: 'build_pipeline:repo_verification',
    verified_ref: AWARDED_SHA,
    verification_json: { state: 'verified', commit_sha: AWARDED_SHA, criteria_total: 2, criteria_passed: 2 },
    ...over,
  });
}

/** The award, frozen. It never mentions the repo's current state. */
const AWARD_ROW = { source_ref: `STORY-001@${AWARDED_SHA}`, builder_xp: 25, created_at: new Date('2026-08-01T12:00:01Z') };

/** The refs the read actually asked the evidence table for. */
function requestedRefs(): string[] {
  const where = mockEvidenceFindAll.mock.calls[0]?.[0]?.where ?? {};
  const clauses = Object.getOwnPropertySymbols(where)
    .flatMap((s) => (Array.isArray((where as any)[s]) ? (where as any)[s] : []));
  return clauses.flatMap((c: any) => (Array.isArray(c.source_ref) ? c.source_ref : []));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockProjectFindByPk.mockResolvedValue(plain({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID, name: 'Nightshift' }));
  mockListFindAll.mockResolvedValue([plain({ id: 'list-1', cluster: 'R1', title: 'Release 1', status: 'active', position: 0 })]);
  mockTaskFindAll.mockResolvedValue([task()]);
  mockEvidenceFindAll.mockResolvedValue([AWARD_ROW]);
});

describe('a student force-pushes after a story was awarded', () => {
  it('XP still reads the awarded amount, because the lookup uses the FROZEN sha', async () => {
    // The repo now carries a different sha for the same work. `verified_ref`
    // does not move, so neither does the key.
    mockTaskFindAll.mockResolvedValue([task({
      verification_json: { state: 'verified', commit_sha: REWRITTEN_SHA, criteria_total: 2, criteria_passed: 2 },
    })]);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);

    expect(tree?.build_verification?.xp_earned).toBe(25);
    // The old code would have asked for `STORY-001@bbb…` and found nothing.
    expect(requestedRefs()).toEqual([`STORY-001@${AWARDED_SHA}`]);
    expect(requestedRefs()).not.toContain(`STORY-001@${REWRITTEN_SHA}`);
  });

  it('XP survives even when the CURRENT verdict blob no longer says verified', async () => {
    // The student deleted .colaberry/ as well. The latch holds the story; the
    // award is looked up from the latch, not from the blob.
    mockTaskFindAll.mockResolvedValue([task({
      verification_json: { state: 'not_started', commit_sha: null, criteria_total: 2, criteria_passed: 0 },
    })]);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);

    expect(tree?.build_verification?.xp_earned).toBe(25);
    expect(tree?.lists[0].tasks[0].verification?.state).toBe('verified');
    expect(tree?.lists[0].tasks[0].verification?.latched).toBe(true);
  });

  it('XP survives when the verdict blob is gone entirely', async () => {
    mockTaskFindAll.mockResolvedValue([task({ verification_json: null })]);
    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);
    expect(tree?.build_verification?.xp_earned).toBe(25);
  });
});

describe('the XP read is gated on the latch, not on the repo', () => {
  it('asks for nothing at all when no story has ever been verified', async () => {
    mockTaskFindAll.mockResolvedValue([task({ verified_at: null, verified_ref: null, verification_json: null })]);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);

    expect(tree?.build_verification).toBeNull();   // never synced
    expect(mockEvidenceFindAll).not.toHaveBeenCalled();
  });

  it('scopes to THIS project\'s stories, so a second build\'s XP is never counted here', async () => {
    await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);
    const where = mockEvidenceFindAll.mock.calls[0][0].where;
    expect(where.enrollment_id).toBe(ENROLLMENT_ID);
    expect(where.source_type).toBe('github_commit');
    expect(requestedRefs()).toEqual([`STORY-001@${AWARDED_SHA}`]);
  });

  it('falls back to a story-prefix lookup for a task verified before verified_ref existed', async () => {
    // The latch is set, the frozen sha is not. The award row still exists and
    // is still keyed `<story>@<sha>`; the `@` is what makes the prefix safe.
    mockTaskFindAll.mockResolvedValue([task({ verified_ref: null })]);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);

    expect(tree?.build_verification?.xp_earned).toBe(25);

    // The clause is `{ source_ref: { [Op.startsWith]: 'STORY-001@' } }`, and a
    // Sequelize operator is a Symbol key — invisible to JSON.stringify, so it
    // has to be read off the symbol directly.
    const where = mockEvidenceFindAll.mock.calls[0][0].where;
    const clauses: any[] = Object.getOwnPropertySymbols(where).flatMap((s) => (where as any)[s] ?? []);
    const patterns = clauses.flatMap((c) => {
      const ref = c.source_ref;
      if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return [];
      return Object.getOwnPropertySymbols(ref).map((s) => ref[s]);
    });
    expect(patterns).toContain('STORY-001@');
  });

  it('counts one award per story, never two, if a duplicate row ever appeared', async () => {
    // Should be impossible — the latch is first-write-wins — but summing two
    // would invent XP nobody granted, so the earliest wins.
    mockEvidenceFindAll.mockResolvedValue([
      AWARD_ROW,
      { source_ref: `STORY-001@${REWRITTEN_SHA}`, builder_xp: 25, created_at: new Date('2026-08-09T12:00:00Z') },
    ]);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);
    expect(tree?.build_verification?.xp_earned).toBe(25);
  });

  it('sums across stories, once each', async () => {
    mockTaskFindAll.mockResolvedValue([
      task(),
      task({ id: 'task-2', story_id: 'STORY-002', verified_ref: 'c'.repeat(40), position: 1 }),
    ]);
    mockEvidenceFindAll.mockResolvedValue([
      AWARD_ROW,
      { source_ref: `STORY-002@${'c'.repeat(40)}`, builder_xp: 15, created_at: new Date('2026-08-02T12:00:00Z') },
    ]);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);
    expect(tree?.build_verification?.xp_earned).toBe(40);
  });

  it('fails soft: an unreadable evidence table costs a dashboard number, not the project read', async () => {
    mockEvidenceFindAll.mockRejectedValue(new Error('connection terminated'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tree = await getOwnedProjectTree(ENROLLMENT_ID, PROJECT_ID);

    expect(tree).not.toBeNull();
    expect(tree?.build_verification?.xp_earned).toBe(0);
    // The story itself is still verified — only the number was unavailable.
    expect(tree?.lists[0].tasks[0].verification?.state).toBe('verified');
  });
});
