/**
 * studentDataContract — the spec a student can actually read.
 *
 * These tests exist because of a measured defect, not a hypothetical one. A
 * student built his Command Center against a `plan.json` carrying `built` on
 * each requirement and `status` on each story. Neither field has ever existed
 * in our schema. He had no spec to check against: the accurate one lived only
 * in the platform repo, and the only JSON samples he was ever shown were of
 * `progress.json` with `verification` omitted.
 *
 * The property under test is that the spec SHIPS and says the load-bearing
 * thing. A doc that is correct and absent is what we already had.
 */
import { renderDocs, isAllowedPath, manifestPaths } from '../renderDocs';
import { STUDENT_DATA_CONTRACT_PATH, renderStudentDataContract } from '../studentDataContract';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const CTX = {
  repoUrl: 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63',
  generatedAt: '2026-08-10T00:00:00Z',
  planVersion: 1,
  planSha256: 'abc123',
};

const render = () => renderDocs(pilot, CTX);
const contract = () => render().find((f) => f.path === STUDENT_DATA_CONTRACT_PATH)!;

describe('the contract reaches the student', () => {
  it('is rendered into the repo', () => {
    expect(render().map((f) => f.path)).toContain(STUDENT_DATA_CONTRACT_PATH);
  });

  it('sits inside the platform write allowlist', () => {
    expect(isAllowedPath(STUDENT_DATA_CONTRACT_PATH)).toBe(true);
  });

  it('is listed in the manifest, so a prompt may reference it', () => {
    expect(manifestPaths(render())).toContain(STUDENT_DATA_CONTRACT_PATH);
  });

  it('is cited from CLAUDE.md, which is the file a fresh session opens first', () => {
    const claude = render().find((f) => f.path === 'CLAUDE.md')!.content;
    expect(claude).toContain(STUDENT_DATA_CONTRACT_PATH);
  });
});

describe('it states the rule that was missed', () => {
  const body = () => contract().content;

  it('names both files and which one carries completion', () => {
    expect(body()).toContain('.colaberry/plan.json');
    expect(body()).toContain('.colaberry/progress.json');
    expect(body()).toMatch(/stories\[\]\.verification\.state|verification\.state|state {2,}not_started/);
  });

  it('says outright that the two invented fields do not exist', () => {
    // The exact words a reader searching for their own bug will search for.
    expect(body()).toMatch(/no `built` field on a requirement/i);
    expect(body()).toMatch(/no `status` field on a story/i);
  });

  it('documents every plan.json field a Command Center is likely to render', () => {
    for (const field of [
      'fulfilled_by', 'due_on', 'due_baseline_on', 'owner_agent', 'acceptance',
      'is_demo_target', 'starts_on', 'ends_on', 'cluster', 'statement', 'kind',
    ]) {
      expect(body()).toContain(field);
    }
  });

  it('documents the whole verification block, which no shipped sample ever showed', () => {
    for (const field of [
      'state', 'criteria_passed', 'criteria_total', 'verified_at',
      'commit_sha', 'commit_url', 'points_awarded', 'outstanding',
    ]) {
      expect(body()).toContain(field);
    }
    for (const state of ['not_started', 'in_progress', 'submitted', 'verified']) {
      expect(body()).toContain(state);
    }
  });

  it('shows the join, because normalised files are useless without it', () => {
    expect(body()).toContain('progressById');
    expect(body()).toContain('plan.stories.map');
  });

  it('shows that a requirement being built is DERIVED, not stored', () => {
    expect(body()).toMatch(/Derived, never stored/i);
    expect(body()).toContain('fulfilled_by.every');
  });

  it('warns that absent is not zero, so a page cannot invent a confident 0', () => {
    expect(body()).toMatch(/absent means not measured, zero means/i);
  });
});

describe('it cannot churn a sync', () => {
  it('is byte-identical across renders, carrying no clock and no student data', () => {
    expect(renderStudentDataContract()).toBe(renderStudentDataContract());
  });

  it('carries no ISO timestamp, per the nothing-volatile invariant', () => {
    expect(renderStudentDataContract()).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('names no student and no project, so it is the same file in every repo', () => {
    const body = renderStudentDataContract();
    expect(body).not.toContain(pilot.project_name);
    for (const s of pilot.stories) expect(body).not.toContain(s.title);
  });
});
