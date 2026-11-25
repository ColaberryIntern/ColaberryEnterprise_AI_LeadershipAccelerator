import {
  normalizeGovReleaseLadder,
  GOV_RELEASE_FOUNDATION,
  GOV_RELEASE_PROPOSAL,
  GOV_RELEASE_BUILD_OUT,
  GOV_PARKED_RELEASES_VAR,
  getParkedReleases,
  isReleaseParked,
  withDefaultGovParking,
  activateGovRelease,
} from '../govReleaseLadder';
import type { BuildPlan, PlanRelease, PlanStory } from '../../sbp/planContract';

const rel = (key: string, week_start = 1, week_end = 1): PlanRelease => ({
  key,
  name: `name-${key}`,
  goal: `goal-${key}`,
  demo: `demo-${key}`,
  week_start,
  week_end,
});

const story = (id: string, release: string, extra: Partial<PlanStory> = {}): PlanStory => ({
  id,
  release,
  title: `title-${id}`,
  narrative: `narrative-${id}`,
  fulfills: [`REQ-${id}`],
  owner_agent: 'AGENT-001',
  acceptance: ['Trust line', 'Given x', 'Then y'],
  task_guidance: 'do the thing',
  failure_paths: ['it breaks'],
  ...extra,
});

const plan = (releases: PlanRelease[], stories: PlanStory[]): BuildPlan => ({
  project_name: 'Gov build',
  descriptor: 'a gov build',
  requirements: [],
  releases,
  stories,
});

describe('normalizeGovReleaseLadder (M2-T1)', () => {
  it('produces exactly the three canonical releases in order', () => {
    const out = normalizeGovReleaseLadder(
      plan(
        [rel('r0', 1, 2), rel('r1', 3, 4), rel('r2', 5, 6)],
        [story('STORY-001', 'r0'), story('STORY-002', 'r1'), story('STORY-003', 'r2')],
      ),
    );
    expect(out.releases.map((r) => r.key)).toEqual([
      GOV_RELEASE_FOUNDATION,
      GOV_RELEASE_PROPOSAL,
      GOV_RELEASE_BUILD_OUT,
    ]);
    expect(out.releases.map((r) => r.name)).toEqual(['Foundation', 'Proposal', 'Full build-out']);
    // Week windows are monotonic and non-overlapping.
    const ws = out.releases.map((r) => [r.week_start, r.week_end]);
    expect(ws[0][1]).toBeLessThan(ws[1][0]);
    expect(ws[1][1]).toBeLessThan(ws[2][0]);
  });

  it('keeps the walking-skeleton (first) release in R0 and moves everything else to R2; R1 starts empty', () => {
    const out = normalizeGovReleaseLadder(
      plan(
        [rel('r0'), rel('r1'), rel('r2')],
        [
          story('STORY-001', 'r0'),
          story('STORY-002', 'r0'),
          story('STORY-003', 'r1'),
          story('STORY-004', 'r2'),
        ],
      ),
    );
    const byRelease = (k: string) => out.stories.filter((s) => s.release === k).map((s) => s.id);
    expect(byRelease(GOV_RELEASE_FOUNDATION)).toEqual(['STORY-001', 'STORY-002']);
    expect(byRelease(GOV_RELEASE_PROPOSAL)).toEqual([]);
    expect(byRelease(GOV_RELEASE_BUILD_OUT)).toEqual(['STORY-003', 'STORY-004']);
  });

  it('detects the skeleton release by localeCompare, not array order', () => {
    const out = normalizeGovReleaseLadder(
      plan(
        [rel('r2'), rel('r0'), rel('r1')], // deliberately unordered
        [story('STORY-001', 'r0'), story('STORY-002', 'r1'), story('STORY-003', 'r2')],
      ),
    );
    // r0 is still the skeleton even though it is second in the array.
    expect(out.stories.filter((s) => s.release === GOV_RELEASE_FOUNDATION).map((s) => s.id)).toEqual([
      'STORY-001',
    ]);
    expect(out.stories.filter((s) => s.release === GOV_RELEASE_BUILD_OUT).map((s) => s.id)).toEqual([
      'STORY-002',
      'STORY-003',
    ]);
  });

  it('preserves every non-release story field (ids, fulfills, acceptance, blocked_by)', () => {
    const out = normalizeGovReleaseLadder(
      plan(
        [rel('r0'), rel('r1')],
        [story('STORY-009', 'r1', { fulfills: ['REQ-042'], blocked_by: ['STORY-001'] })],
      ),
    );
    const s = out.stories[0];
    expect(s.id).toBe('STORY-009');
    expect(s.fulfills).toEqual(['REQ-042']);
    expect(s.blocked_by).toEqual(['STORY-001']);
    expect(s.acceptance).toEqual(['Trust line', 'Given x', 'Then y']);
    expect(s.release).toBe(GOV_RELEASE_BUILD_OUT); // reassigned
  });

  it('does not mutate the input plan', () => {
    const input = plan([rel('r0'), rel('r1')], [story('STORY-001', 'r1')]);
    const snapshot = JSON.stringify(input);
    normalizeGovReleaseLadder(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('handles an empty plan without throwing and still yields three releases', () => {
    const out = normalizeGovReleaseLadder(plan([], []));
    expect(out.releases.map((r) => r.key)).toEqual([
      GOV_RELEASE_FOUNDATION,
      GOV_RELEASE_PROPOSAL,
      GOV_RELEASE_BUILD_OUT,
    ]);
    expect(out.stories).toEqual([]);
  });
});

describe('gov release parking (M2-T2)', () => {
  it('withDefaultGovParking parks R2 and leaves R0/R1 active', () => {
    const vars = withDefaultGovParking({ kind: 'gov' });
    expect(vars.kind).toBe('gov'); // existing vars preserved
    expect(getParkedReleases(vars)).toEqual([GOV_RELEASE_BUILD_OUT]);
    expect(isReleaseParked(vars, GOV_RELEASE_BUILD_OUT)).toBe(true);
    expect(isReleaseParked(vars, GOV_RELEASE_FOUNDATION)).toBe(false);
    expect(isReleaseParked(vars, GOV_RELEASE_PROPOSAL)).toBe(false);
  });

  it('withDefaultGovParking NEVER overwrites an existing parked list (a re-materialize cannot re-park)', () => {
    // An admin already activated R2, leaving the list empty.
    const activated = { kind: 'gov', [GOV_PARKED_RELEASES_VAR]: [] as string[] };
    const vars = withDefaultGovParking(activated);
    expect(getParkedReleases(vars)).toEqual([]); // stays activated
  });

  it('activateGovRelease removes a release from the parked list and is idempotent', () => {
    const parked = withDefaultGovParking({ kind: 'gov' });
    const once = activateGovRelease(parked, GOV_RELEASE_BUILD_OUT);
    expect(getParkedReleases(once)).toEqual([]);
    // Activating an already-active release is a no-op.
    const twice = activateGovRelease(once, GOV_RELEASE_BUILD_OUT);
    expect(getParkedReleases(twice)).toEqual([]);
  });

  it('activateGovRelease does not mutate the input variables', () => {
    const parked = withDefaultGovParking({ kind: 'gov' });
    const snapshot = JSON.stringify(parked);
    activateGovRelease(parked, GOV_RELEASE_BUILD_OUT);
    expect(JSON.stringify(parked)).toBe(snapshot);
  });

  it('getParkedReleases is null-safe and ignores malformed values', () => {
    expect(getParkedReleases(null)).toEqual([]);
    expect(getParkedReleases(undefined)).toEqual([]);
    expect(getParkedReleases({})).toEqual([]);
    expect(getParkedReleases({ [GOV_PARKED_RELEASES_VAR]: 'r2' })).toEqual([]); // not an array
    expect(getParkedReleases({ [GOV_PARKED_RELEASES_VAR]: ['r2', 7, null] })).toEqual(['r2']); // strings only
  });
});
