import { assembleProjectPortfolio } from '../internshipProjectPortfolio';
import type { ProjectRow } from '../../projectDeliveryService';

/**
 * These test the pure fold: role assignment, the verified-vs-self-reported split,
 * and the student ordering. No database — a ProjectRow is constructed by hand.
 */
function mkRow(over: Partial<ProjectRow>): ProjectRow {
  return {
    project_id: 'p1',
    name: 'A Project',
    enrollment_id: 'e1',
    student_name: 'Intern',
    student_email: 'intern@example.com',
    cohort_id: 'c1',
    cohort_name: 'Cohort',
    stage: 'implementation',
    maturity_score: null,
    has_repo: true,
    repo_url: 'https://github.com/x/y',
    repo_source: 'connection',
    command_center_url: null,
    has_exec_summary: false,
    artifacts: 2,
    tasks_total: 20,
    tasks_complete: 12,
    tasks_overdue: 0,
    tasks_pct: 60,
    starts_on: null,
    ends_on: null,
    already_case_study: false,
    archived_at: null,
    is_active_project: false,
    readiness: { score: 59, ready: false, components: [], gaps: ['no executive summary'] },
    risk: { state: 'on_track', attention: 0, reason: 'Building steadily', owner_projects: 1, owner_complete: 12 },
    releases: [],
    buckets: { total: 20, done: 12, overdue: 0, due_this_week: 0, open: 8, undated: 0, no_date: 0 },
    ...over,
  };
}

describe('assembleProjectPortfolio', () => {
  it('assigns active / owned / archived roles from the pointer and archived_at', () => {
    const rows = [
      mkRow({ project_id: 'active', is_active_project: true }),
      mkRow({ project_id: 'spare', is_active_project: false }),
      mkRow({ project_id: 'old', archived_at: '2026-08-01T00:00:00Z', is_active_project: false }),
    ];
    const out = assembleProjectPortfolio('e1', rows, new Map(), new Map());
    const byId = new Map(out.projects.map((p) => [p.project_id, p.role]));
    expect(byId.get('active')).toBe('active');
    expect(byId.get('spare')).toBe('owned');
    expect(byId.get('old')).toBe('archived');
  });

  it('archived_at wins even when the row is still the active pointer', () => {
    // A soft-deleted project is history, not workload, regardless of the stale pointer.
    const rows = [mkRow({ project_id: 'p', is_active_project: true, archived_at: '2026-08-01T00:00:00Z' })];
    const out = assembleProjectPortfolio('e1', rows, new Map(), new Map());
    expect(out.projects[0].role).toBe('archived');
    expect(out.active_count).toBe(0);
    expect(out.has_live_project).toBe(false);
  });

  it('keeps verified separate from self-reported complete — never swaps the denominator', () => {
    const rows = [mkRow({ project_id: 'p', tasks_total: 20, tasks_complete: 12 })];
    const out = assembleProjectPortfolio('e1', rows, new Map([['p', 9]]), new Map([['p', 3]]));
    const s = out.projects[0].stories;
    expect(s.total).toBe(20);
    expect(s.self_reported_complete).toBe(12); // stays the readiness denominator
    expect(s.verified).toBe(9);                // its own, smaller number
    expect(s.awaiting_verification).toBe(3);
    // readiness is untouched — verified never leaks into it
    expect(out.projects[0].readiness.score).toBe(59);
  });

  it('defaults verified and awaiting to 0 when a project has no counts', () => {
    const rows = [mkRow({ project_id: 'p' })];
    const out = assembleProjectPortfolio('e1', rows, new Map(), new Map());
    expect(out.projects[0].stories.verified).toBe(0);
    expect(out.projects[0].stories.awaiting_verification).toBe(0);
  });

  it('orders active first, then owned by readiness desc, archived last', () => {
    const rows = [
      mkRow({ project_id: 'archived', archived_at: '2026-08-01T00:00:00Z', readiness: { score: 90, ready: false, components: [], gaps: [] } }),
      mkRow({ project_id: 'owned-low', readiness: { score: 20, ready: false, components: [], gaps: [] } }),
      mkRow({ project_id: 'owned-high', readiness: { score: 80, ready: false, components: [], gaps: [] } }),
      mkRow({ project_id: 'active', is_active_project: true, readiness: { score: 10, ready: false, components: [], gaps: [] } }),
    ];
    const out = assembleProjectPortfolio('e1', rows, new Map(), new Map());
    expect(out.projects.map((p) => p.project_id)).toEqual(['active', 'owned-high', 'owned-low', 'archived']);
  });

  it('reports active_count and surfaces the shared risk state/reason', () => {
    const rows = [
      mkRow({ project_id: 'a', is_active_project: true, risk: { state: 'behind', attention: 3, reason: 'Two weeks since an update', owner_projects: 2, owner_complete: 4 } }),
      mkRow({ project_id: 'b', is_active_project: false }),
    ];
    const out = assembleProjectPortfolio('e1', rows, new Map(), new Map());
    expect(out.active_count).toBe(1);
    expect(out.has_live_project).toBe(true);
    const a = out.projects.find((p) => p.project_id === 'a')!;
    expect(a.risk_state).toBe('behind');
    expect(a.risk_reason).toBe('Two weeks since an update');
  });
});
