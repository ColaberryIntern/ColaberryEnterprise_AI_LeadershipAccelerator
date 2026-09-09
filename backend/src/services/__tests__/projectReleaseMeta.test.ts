import {
  resolveReleaseName,
  extractLandsWhen,
  classifyTiming,
  rollUpTiming,
  summariseEvidence,
  summariseVerification,
  groupArtifacts,
} from '../projectReleaseMeta';

/**
 * These four functions decide what an operator reads about a student's build, so the
 * cases below are the ones where a plausible implementation would quietly lie:
 * an unverified task counted as on-time, a greedy regex swallowing a 2KB document
 * into a one-line goal, a null jsonb column producing NaN, four versions of one
 * document rendering as four artifacts.
 */

describe('resolveReleaseName', () => {
  const titles = new Map([
    ['r0', 'Release 0 · Initial Setup and Trust Spine'],
    ['prep', 'Demo prep · the dedicated week'],
  ]);

  it('returns the task-list title when one exists', () => {
    expect(resolveReleaseName('r0', titles)).toBe('Release 0 · Initial Setup and Trust Spine');
  });

  it('falls back to the raw key rather than rendering an empty heading', () => {
    expect(resolveReleaseName('r9', titles)).toBe('r9');
  });

  it('accepts a plain object as well as a Map', () => {
    expect(resolveReleaseName('r0', { r0: 'Release Zero' })).toBe('Release Zero');
  });

  it('treats a whitespace-only title as absent', () => {
    expect(resolveReleaseName('r1', new Map([['r1', '   ']]))).toBe('r1');
  });

  it('labels a missing cluster Unscheduled instead of returning empty', () => {
    expect(resolveReleaseName(null, titles)).toBe('Unscheduled');
    expect(resolveReleaseName('', titles)).toBe('Unscheduled');
  });

  it('survives a null lookup table', () => {
    expect(resolveReleaseName('r0', null)).toBe('r0');
  });
});

describe('extractLandsWhen', () => {
  it('extracts the criterion after the phrase', () => {
    const build = 'preamble\nThis release lands when: Show a production change requiring human approval.\nmore text';
    expect(extractLandsWhen(build)).toBe('Show a production change requiring human approval.');
  });

  it('stops at the newline — a greedy match would swallow the whole 2KB document', () => {
    const build = 'This release lands when: First line only.\n## What we are building\n' + 'x'.repeat(2000);
    const got = extractLandsWhen(build);
    expect(got).toBe('First line only.');
    expect(got!.length).toBeLessThan(60);
  });

  it('returns null when the phrase is absent', () => {
    expect(extractLandsWhen('nothing relevant here')).toBeNull();
  });

  it('returns null — not an empty string — when the phrase has no text after it', () => {
    // The UI omits the block on null; an empty string would render an empty quote.
    expect(extractLandsWhen('This release lands when:\nnext line')).toBeNull();
  });

  it('is case-insensitive and tolerates a missing colon', () => {
    expect(extractLandsWhen('this release lands when Ship it')).toBe('Ship it');
  });

  it('handles null and undefined without throwing', () => {
    expect(extractLandsWhen(null)).toBeNull();
    expect(extractLandsWhen(undefined)).toBeNull();
  });
});

describe('classifyTiming', () => {
  it('THE RULE: a complete task with no verified_at is unverified, never on_time', () => {
    // 24 of 196 complete tasks in production have no verified_at. Counting them as
    // on-time would overstate the figure by ~14% and hide the work needing review.
    expect(classifyTiming({ status: 'complete', verified_at: null, due_on: '2026-09-01' }))
      .toBe('unverified');
  });

  it('counts verification ON the due date as on time', () => {
    expect(classifyTiming({ status: 'complete', verified_at: '2026-09-01T23:00:00Z', due_on: '2026-09-01' }))
      .toBe('on_time');
  });

  it('counts verification the next day as late', () => {
    expect(classifyTiming({ status: 'complete', verified_at: '2026-09-02T00:30:00Z', due_on: '2026-09-01' }))
      .toBe('late');
  });

  it('compares by DATE, so a late-evening verification is not spuriously late', () => {
    // verified_at is a timestamp, due_on a date; a raw comparison would call this late.
    expect(classifyTiming({ status: 'complete', verified_at: '2026-09-01T23:59:59Z', due_on: '2026-09-01' }))
      .toBe('on_time');
  });

  it('reports a verified task with no due date as undated', () => {
    expect(classifyTiming({ status: 'complete', verified_at: '2026-09-01T10:00:00Z', due_on: null }))
      .toBe('undated');
  });

  it('reports anything not complete as open, whatever its dates', () => {
    expect(classifyTiming({ status: 'not_started', due_on: '2026-01-01' })).toBe('open');
    expect(classifyTiming({ status: 'in_progress', verified_at: '2026-09-01' })).toBe('open');
    expect(classifyTiming({})).toBe('open');
  });
});

describe('rollUpTiming', () => {
  it('counts each bucket and reports on-time share of judgeable work only', () => {
    const r = rollUpTiming([
      { status: 'complete', verified_at: '2026-09-01', due_on: '2026-09-01' },
      { status: 'complete', verified_at: '2026-09-01', due_on: '2026-09-02' },
      { status: 'complete', verified_at: '2026-09-05', due_on: '2026-09-01' },
      { status: 'complete', verified_at: null, due_on: '2026-09-01' },
      { status: 'not_started', due_on: '2026-09-01' },
    ]);
    expect(r).toMatchObject({ on_time: 2, late: 1, unverified: 1, open: 1, undated: 0 });
    // 2 of 3 judgeable, NOT 2 of 5 — unverified and open are unknown, not failures.
    expect(r.on_time_pct).toBe(67);
  });

  it('reports null rather than 0% when nothing is judgeable', () => {
    // 0 would read as "everything late"; null means "nothing measurable yet".
    const r = rollUpTiming([{ status: 'complete', verified_at: null, due_on: '2026-09-01' }]);
    expect(r.on_time_pct).toBeNull();
  });

  it('handles an empty list', () => {
    expect(rollUpTiming([])).toMatchObject({ on_time: 0, late: 0, on_time_pct: null });
  });
});

describe('summariseEvidence', () => {
  it('reports has_evidence false for no rows — the live case in production today', () => {
    const e = summariseEvidence([]);
    expect(e.has_evidence).toBe(false);
    expect(e.manifests).toBe(0);
    expect(e.files_created).toBe(0);
  });

  it('handles null and undefined without throwing', () => {
    expect(summariseEvidence(null).has_evidence).toBe(false);
    expect(summariseEvidence(undefined).has_evidence).toBe(false);
  });

  it('sums the jsonb array columns across manifests', () => {
    const e = summariseEvidence([
      {
        files_created: ['a.ts', 'b.tsx'], files_modified: ['c.ts'],
        apis_added: [{ path: '/x' }, { path: '/y' }], ui_components_added: [{ name: 'Card' }],
        tests_added: [], database_changes: [{ table: 't' }],
        execution_timestamp: '2026-07-22T22:54:27.000Z',
      },
      {
        files_created: ['d.ts'], files_modified: [], apis_added: [],
        ui_components_added: [], tests_added: ['e.test.ts'], database_changes: [],
        execution_timestamp: '2026-08-01T10:00:00.000Z',
      },
    ]);
    expect(e).toMatchObject({
      has_evidence: true, manifests: 2, files_created: 3, files_modified: 1,
      apis_added: 2, ui_components_added: 1, tests_added: 1, database_changes: 1,
    });
    expect(e.last_execution_at).toBe('2026-08-01T10:00:00.000Z');
  });

  it('counts a NULL jsonb column as 0, not NaN', () => {
    // Every one of these columns is nullable; NaN would propagate into the UI.
    const e = summariseEvidence([{ files_created: null, apis_added: undefined, execution_timestamp: null }]);
    expect(e.files_created).toBe(0);
    expect(e.apis_added).toBe(0);
    expect(Number.isNaN(e.files_created)).toBe(false);
    expect(e.last_execution_at).toBeNull();
  });

  it('counts a non-array jsonb value as 0 rather than throwing', () => {
    const e = summariseEvidence([{ files_created: { unexpected: 'object' }, tests_added: 'oops' }]);
    expect(e.files_created).toBe(0);
    expect(e.tests_added).toBe(0);
  });
});

describe('summariseVerification', () => {
  const verified = (over: Record<string, unknown> = {}) => ({
    verification_json: {
      state: 'verified', reasons: [], commit_at: '2026-08-18T13:36:23Z',
      checked_at: '2026-09-08T08:36:37.478Z',
      commit_sha: 'b55c1179827f3bed3b174e795e72ceaff770d6fe',
      outstanding: [], criteria_total: 3, criteria_passed: 3, ...over,
    },
  });

  it('reports nothing for no rows', () => {
    const s = summariseVerification([]);
    expect(s.has_verification).toBe(false);
    expect(s.commits).toBe(0);
    expect(s.outstanding_count).toBe(0);
  });

  it('handles null and undefined without throwing', () => {
    expect(summariseVerification(null).has_verification).toBe(false);
    expect(summariseVerification(undefined).has_verification).toBe(false);
  });

  it('counts verified and in-progress tasks separately', () => {
    const s = summariseVerification([
      verified(),
      verified({ state: 'in_progress', criteria_passed: 0, commit_sha: null }),
    ]);
    expect(s.tasks_with_verification).toBe(2);
    expect(s.verified_tasks).toBe(1);
    expect(s.in_progress_tasks).toBe(1);
  });

  it('counts DISTINCT commits — one commit closing three tasks is one commit', () => {
    const s = summariseVerification([verified(), verified(), verified()]);
    expect(s.commits).toBe(1);
  });

  it('picks the newest commit as latest', () => {
    const s = summariseVerification([
      verified({ commit_sha: 'aaa', commit_at: '2026-08-01T00:00:00Z' }),
      verified({ commit_sha: 'bbb', commit_at: '2026-08-20T00:00:00Z' }),
    ]);
    expect(s.commits).toBe(2);
    expect(s.latest_commit_sha).toBe('bbb');
    expect(s.latest_commit_at).toBe('2026-08-20T00:00:00Z');
  });

  it('sums acceptance criteria across tasks', () => {
    const s = summariseVerification([
      verified({ criteria_passed: 3, criteria_total: 3 }),
      verified({ criteria_passed: 0, criteria_total: 4 }),
    ]);
    expect(s.criteria_passed).toBe(3);
    expect(s.criteria_total).toBe(7);
  });

  it('deduplicates outstanding criteria — the same blocker across tasks is one item', () => {
    const s = summariseVerification([
      verified({ state: 'in_progress', outstanding: ['Log every issue with a timestamp.', 'Handle missing data.'] }),
      verified({ state: 'in_progress', outstanding: ['Log every issue with a timestamp.'] }),
    ]);
    expect(s.outstanding).toEqual(['Log every issue with a timestamp.', 'Handle missing data.']);
    expect(s.outstanding_count).toBe(2);
  });

  it('treats a missing criteria count as 0, never NaN', () => {
    // Every field in verification_json is optional; NaN would reach the UI.
    const s = summariseVerification([{ verification_json: { state: 'verified' } }]);
    expect(s.criteria_total).toBe(0);
    expect(Number.isNaN(s.criteria_total)).toBe(false);
    expect(s.has_verification).toBe(true);
  });

  it('skips rows whose verification_json is absent or malformed', () => {
    const s = summariseVerification([
      { verification_json: null },
      { verification_json: 'not an object' },
      verified(),
    ]);
    expect(s.tasks_with_verification).toBe(1);
  });

  it('tracks the most recent check time across rows', () => {
    const s = summariseVerification([
      verified({ checked_at: '2026-09-01T00:00:00Z' }),
      verified({ checked_at: '2026-09-09T16:04:44Z' }),
    ]);
    expect(s.last_checked_at).toBe('2026-09-09T16:04:44Z');
  });
});

describe('groupArtifacts', () => {
  it('groups versions of one document into a single entry, newest first', () => {
    // Production holds four rows that are all versions of one specification; listed
    // raw they would look like four separate artifacts.
    const g = groupArtifacts([
      { artifact_name: 'System Requirements Specification', version: 1, has_content: true, submitted_at: '2026-04-25T21:54:25Z' },
      { artifact_name: 'System Requirements Specification', version: 8, has_content: true, submitted_at: '2026-05-22T12:33:43Z' },
      { artifact_name: 'System Requirements Specification', version: 2, has_content: true, submitted_at: '2026-04-26T11:38:36Z' },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].name).toBe('System Requirements Specification');
    expect(g[0].latest_version).toBe(8);
    expect(g[0].versions.map((v) => v.version)).toEqual([8, 2, 1]);
  });

  it('returns an empty array for no rows — the live case for all 30 visible projects', () => {
    expect(groupArtifacts([])).toEqual([]);
    expect(groupArtifacts(null)).toEqual([]);
  });

  it('keeps distinct documents separate and sorts them by name', () => {
    const g = groupArtifacts([
      { artifact_name: 'Zeta Report', version: 1 },
      { artifact_name: 'Alpha Brief', version: 1 },
    ]);
    expect(g.map((x) => x.name)).toEqual(['Alpha Brief', 'Zeta Report']);
  });

  it('carries has_content through so the UI never offers a dead file link', () => {
    // file_name is null on every production row; the click-through must target
    // content, not a download.
    const g = groupArtifacts([{ artifact_name: 'Spec', version: 1, file_name: null, has_content: true }]);
    expect(g[0].versions[0].has_content).toBe(true);
    expect(g[0].versions[0].file_name).toBeNull();
  });

  it('names an untitled artifact rather than emitting an empty heading', () => {
    expect(groupArtifacts([{ version: 1 }])[0].name).toBe('Untitled artifact');
  });
});
