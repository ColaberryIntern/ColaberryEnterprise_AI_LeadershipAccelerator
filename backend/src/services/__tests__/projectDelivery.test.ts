import { computeReadiness, PROJECT_STAGES, DONE_TASK_STATUSES } from '../projectDeliveryService';

/**
 * The readiness score decides which student projects Ali looks at first, so the
 * ordering it produces is the product. These pin the behaviour that matters:
 * that it degrades honestly on today's data rather than collapsing to zero, and
 * that it always says what is MISSING rather than just emitting a number.
 *
 * Context for the weights: production holds two disjoint populations — 33
 * projects with a build plan and no repo/artifacts, and 7 with a repo and
 * artifacts and no build plan. Nothing satisfies every component, so a binary
 * gate would rank nothing and teach the operator nothing.
 */

const base = {
  tasks_total: 0,
  tasks_complete: 0,
  has_repo: false,
  artifacts: 0,
  has_exec_summary: false,
  stage: 'discovery' as const,
};

describe('computeReadiness', () => {
  it('scores an empty project at zero and names every gap', () => {
    const r = computeReadiness(base);
    expect(r.score).toBe(0);
    expect(r.ready).toBe(false);
    expect(r.gaps).toEqual(expect.arrayContaining([
      'no build plan', 'no repo', 'no artifacts', 'no executive summary',
    ]));
  });

  it('scores a fully-evidenced complete project at 100 and ready', () => {
    const r = computeReadiness({
      tasks_total: 20, tasks_complete: 20, has_repo: true,
      artifacts: 3, has_exec_summary: true, stage: 'complete',
    });
    expect(r.score).toBe(100);
    expect(r.ready).toBe(true);
    expect(r.gaps).toEqual([]);
  });

  it('never reports ready while anything is missing', () => {
    const r = computeReadiness({
      tasks_total: 20, tasks_complete: 20, has_repo: true,
      artifacts: 3, has_exec_summary: true, stage: 'portfolio',
    });
    expect(r.ready).toBe(false);
    expect(r.gaps).toContain('stage is portfolio');
  });

  describe('the real production shapes — neither must score zero', () => {
    it('a build-plan project with no repo still ranks on its progress', () => {
      // CoreOps: 28 tasks, 22 complete, no repo, no artifacts, still 'discovery'.
      const r = computeReadiness({
        ...base, tasks_total: 28, tasks_complete: 22,
      });
      expect(r.score).toBeGreaterThan(0);
      expect(r.gaps).toEqual(expect.arrayContaining(['6 of 28 tasks open', 'no repo', 'no artifacts']));
    });

    it('a repo project with no build plan also ranks, and says so', () => {
      // The implementation-stage shape: repo + artifacts, zero tasks.
      const r = computeReadiness({
        ...base, has_repo: true, artifacts: 2, stage: 'implementation', has_exec_summary: true,
      });
      expect(r.score).toBeGreaterThan(0);
      expect(r.gaps).toContain('no build plan');
    });

    it('ranks a nearly-finished build above an untouched one', () => {
      const ahead = computeReadiness({ ...base, tasks_total: 28, tasks_complete: 22 });
      const behind = computeReadiness({ ...base, tasks_total: 28, tasks_complete: 2 });
      expect(ahead.score).toBeGreaterThan(behind.score);
    });
  });

  describe('component behaviour', () => {
    it('caps the artifact component at three rather than rewarding volume', () => {
      const three = computeReadiness({ ...base, artifacts: 3 });
      const thirty = computeReadiness({ ...base, artifacts: 30 });
      expect(thirty.score).toBe(three.score);
    });

    it('treats a task-less project as missing a plan, not as 100% complete', () => {
      // 0/0 must not divide to 1 — that would rank empty projects top.
      const r = computeReadiness(base);
      const build = r.components.find((c) => c.key === 'build');
      expect(build?.score).toBe(0);
      expect(build?.gap).toBe('no build plan');
    });

    it('weights sum to 1 so the score reads as a percentage', () => {
      const r = computeReadiness(base);
      const total = r.components.reduce((n, c) => n + c.weight, 0);
      expect(Math.round(total * 1000) / 1000).toBe(1);
    });

    it('is monotonic — adding evidence never lowers the score', () => {
      const before = computeReadiness({ ...base, tasks_total: 10, tasks_complete: 5 });
      const after = computeReadiness({ ...base, tasks_total: 10, tasks_complete: 5, has_repo: true });
      expect(after.score).toBeGreaterThanOrEqual(before.score);
    });

    it('scores every stage in ascending order', () => {
      const scores = PROJECT_STAGES.map((stage) => computeReadiness({ ...base, stage }).score);
      expect(scores).toEqual([...scores].sort((a, b) => a - b));
    });
  });

  it('treats only "complete" as done — not the in_progress or blocked states', () => {
    // The first version of a production probe filtered status='done', which does
    // not exist in this enum, and reported every project at 0% complete.
    expect([...DONE_TASK_STATUSES]).toEqual(['complete']);
  });
});

/**
 * WHERE THE REPO COMES FROM. This is a source-text assertion, not a behavioural one,
 * and that is deliberate.
 *
 * The defect it guards cannot be caught by testing `computeReadiness`: that function was
 * always correct, it was being handed `has_repo: false` for every project because the query
 * above it read `projects.github_repo_url` — a column nothing writes. On production the day
 * this was fixed, 22 of 28 live projects had a repo through `github_connections` and ZERO
 * had the project column set, so the board tagged "no repo" on every row including students
 * who had spent days fighting with their repository.
 *
 * `projectRepoResolver.ts` had already found and documented this in August and exists so
 * callers stop asking the wrong table. The delivery query was written asking it anyway.
 * Nothing but reading the SQL catches that, so the SQL is what is asserted.
 */
describe('the delivery query resolves repos from the connection table', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'projectDeliveryService.ts'), 'utf8'
  );

  it('joins github_connections', () => {
    expect(source).toMatch(/LEFT JOIN github_connections/);
  });

  it('prefers the connection over the legacy project column', () => {
    // COALESCE order IS the precedence rule, and it must match decideRepoPointer.
    const coalesce = source.slice(source.indexOf('COALESCE('), source.indexOf('AS repo_url'));
    expect(coalesce.indexOf('gc.repo_url')).toBeGreaterThan(-1);
    expect(coalesce.indexOf('gc.repo_url')).toBeLessThan(coalesce.indexOf('p.github_repo_url'));
  });

  it('treats a blank repo_url as no answer', () => {
    // A connection row with no repo_url is a student who authorised GitHub and never
    // picked a repo. Counting it would claim a repository that does not exist.
    expect(source).toMatch(/NULLIF\(btrim\(gc\.repo_url\), ''\)/);
  });

  it('never reads the abandoned column on its own', () => {
    // The regression itself: `p.github_repo_url AS repo_url` with no COALESCE.
    expect(source).not.toMatch(/p\.github_repo_url\s+AS\s+repo_url/);
  });
});
