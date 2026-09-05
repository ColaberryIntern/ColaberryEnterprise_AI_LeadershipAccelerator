/**
 * The two live cases this was written from, and the line between them.
 *
 * FARHAT (2026-09-05) is drift: she finished her first project, started a
 * second, built STORY-001 in it, and the portal kept rendering the first.
 *
 * QUINCY (same day) is NOT drift: his active project still has 6 outstanding
 * tasks and his other project is finished. A "newest project wins" rule would
 * have moved him off unfinished work. If a future change makes his case report,
 * the checker has started guessing.
 */
import { detectActiveProjectDrift, DriftInput, ProjectActivity } from '../activeProjectDrift';

const proj = (over: Partial<ProjectActivity> & { project_id: string }): ProjectActivity => ({
  name: over.project_id, last_verified_at: null, outstanding_tasks: 0,
  published: true, archived: false, ...over,
});

const student = (over: Partial<DriftInput> = {}): DriftInput => ({
  enrollment_id: 'enr-1', full_name: 'Test Student', email: 't@example.test',
  active_project_id: 'p1', projects: [], ...over,
});

describe('Farhat: building one project, watching another', () => {
  const farhat = student({
    full_name: 'Farhat Beig',
    active_project_id: 'ai-support',
    projects: [
      proj({ project_id: 'ai-support', name: 'AI Support Workflow', last_verified_at: '2026-08-20T00:00:00Z', outstanding_tasks: 0 }),
      proj({ project_id: 'kashmir', name: 'Kashmir Craft', last_verified_at: '2026-09-05T02:56:29Z', outstanding_tasks: 19 }),
    ],
  });

  it('is reported', () => {
    const f = detectActiveProjectDrift(farhat);
    expect(f).toHaveLength(1);
    expect(f[0].code).toBe('work_elsewhere');
  });

  it('names both projects, so the finding is actionable without a lookup', () => {
    const [f] = detectActiveProjectDrift(farhat);
    expect(f.showing).toBe('AI Support Workflow');
    expect(f.working_in).toBe('Kashmir Craft');
  });
});

describe('Quincy: two live projects, and the active one is unfinished', () => {
  const quincy = student({
    full_name: 'Quincy Nkwain Ninying',
    active_project_id: 'coreops',
    projects: [
      // 22 of 28 done, so 6 outstanding, and verified OLDER than the other one.
      proj({ project_id: 'coreops', name: 'CoreOps', last_verified_at: '2026-08-21T00:00:00Z', outstanding_tasks: 6 }),
      // Finished, and newer.
      proj({ project_id: 'ambit', name: 'Ambit', last_verified_at: '2026-08-30T00:00:00Z', outstanding_tasks: 0 }),
    ],
  });

  it('is NOT reported, because his active project still has work in it', () => {
    expect(detectActiveProjectDrift(quincy)).toEqual([]);
  });

  it('would be reported by a naive newest-wins rule, which is why the guard exists', () => {
    // Same student, but with the outstanding work cleared: now the pointer
    // really is stale and the finding is correct.
    const finished = { ...quincy, projects: quincy.projects.map((p) => ({ ...p, outstanding_tasks: 0 })) };
    expect(detectActiveProjectDrift(finished)).toHaveLength(1);
  });
});

describe('the pointer is missing or dead', () => {
  it('reports a student with no active project but a published one', () => {
    const f = detectActiveProjectDrift(student({ active_project_id: null, projects: [proj({ project_id: 'p1' })] }));
    expect(f[0].code).toBe('no_active_project');
  });

  it('reports a pointer aimed at an archived project', () => {
    const f = detectActiveProjectDrift(student({
      projects: [proj({ project_id: 'p1', archived: true }), proj({ project_id: 'p2', last_verified_at: '2026-09-01T00:00:00Z' })],
    }));
    expect(f[0].code).toBe('active_archived');
  });
});

describe('quiet when there is nothing to say', () => {
  it('says nothing for a student with one project', () => {
    expect(detectActiveProjectDrift(student({ projects: [proj({ project_id: 'p1', outstanding_tasks: 3 })] }))).toEqual([]);
  });

  it('says nothing when no project has ever been published', () => {
    expect(detectActiveProjectDrift(student({
      projects: [proj({ project_id: 'p1', published: false }), proj({ project_id: 'p2', published: false })],
    }))).toEqual([]);
  });

  it('says nothing when nothing has ever verified, since there is no evidence of where they work', () => {
    expect(detectActiveProjectDrift(student({
      projects: [proj({ project_id: 'p1' }), proj({ project_id: 'p2' })],
    }))).toEqual([]);
  });
});
