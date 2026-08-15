/**
 * The Command Center data contract — the promises a student's static page is
 * allowed to rely on.
 *
 * A student's Command Center is served by GitHub Pages out of their own repo
 * with no API and no credentials, so these two files ARE the interface. That
 * makes the usual "we can fix it in the next deploy" untrue: pages are written
 * by students against whatever shape shipped, and they keep running unchanged
 * for the rest of the programme. Each test below pins one promise from
 * docs/COMMAND_CENTER_DATA_CONTRACT.md.
 *
 * Everything here is pure or mocked. Nothing touches GitHub or a database.
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BuildPlan } from '../planContract';
import {
  PLAN_DOC_SCHEMA_VERSION, PLAN_FILE_PATH, buildPlanDocument, serialisePlanDocument,
} from '../planDocument';
import {
  PROGRESS_FILE_PATH, PROGRESS_SCHEMA_VERSION,
  mergeProgressFile, parseProgressFile, renderProgressFile, serialiseProgressFile,
} from '../verification/progressContract';
import {
  PROFILE_FILE_PATH, parseProfileFile, renderProfileSeed, serialiseProfileFile,
} from '../profileContract';
import { renderDocs, RenderedFile } from '../renderDocs';
import { writeDocsToRepo, changedFiles } from '../repoWriter';
import type { Schedule } from '../buildSchedule';

const pilot: BuildPlan = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'pilot-dryrun-plan.json'), 'utf8'),
);

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const REPO_URL = 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63';

const d = (iso: string) => new Date(iso);

/** A schedule shaped like the real one, with dates on the pilot's stories. */
function scheduleFor(plan: BuildPlan): Schedule {
  return {
    buildStart: d('2026-08-20T00:00:00Z'),
    buildEnd: d('2026-10-15T00:00:00Z'),
    demoDay: d('2026-10-22T00:00:00Z'),
    buildWeeks: 8,
    capacity: { low: 8, high: 16 },
    totalTasks: plan.stories.length,
    demoReleaseKey: plan.releases[0]?.key ?? null,
    roadmapReleaseKeys: [],
    verdict: 'fits',
    tasks: plan.stories.map((s, i) => ({
      storyId: s.id,
      releaseKey: s.release,
      dueOn: d(`2026-08-${String(21 + (i % 7)).padStart(2, '0')}T00:00:00Z`),
    })),
    prep: [{ key: 'PREP-1', title: 'Rehearse the demo', dueOn: d('2026-10-19T00:00:00Z') }],
  } as Schedule;
}

// ── plan.json ───────────────────────────────────────────────────────────────

describe('.colaberry/plan.json — what the page renders from', () => {
  const doc = () => buildPlanDocument(pilot, {
    repoUrl: REPO_URL,
    planVersion: 3,
    planSha256: 'abc123',
    schedule: scheduleFor(pilot),
    baselineByStory: { [pilot.stories[0].id]: '2026-08-01' },
  });

  it('declares its schema version', () => {
    expect(doc().schema_version).toBe(PLAN_DOC_SCHEMA_VERSION);
  });

  it('carries every field the Command Center needs per story', () => {
    const story = doc().stories[0];
    for (const key of [
      'id', 'title', 'release', 'narrative', 'acceptance',
      'fulfills', 'owner_agent', 'failure_paths', 'due_on', 'due_baseline_on',
    ]) {
      expect(story).toHaveProperty(key);
    }
  });

  it('separates the baseline due date from the current one, so slippage is visible', () => {
    const story = doc().stories.find((s) => s.id === pilot.stories[0].id)!;
    expect(story.due_baseline_on).toBe('2026-08-01');
    expect(story.due_on).not.toBe(story.due_baseline_on);
  });

  it('falls back to the current date as the baseline on a first publish', () => {
    // No recorded baseline means the story has never been materialized, so
    // today's date IS the original commitment. Rendering blank would make every
    // first-publish Command Center show an empty baseline column.
    const withoutBaselines = buildPlanDocument(pilot, { schedule: scheduleFor(pilot) });
    const story = withoutBaselines.stories[0];
    expect(story.due_baseline_on).toBe(story.due_on);
    expect(story.due_on).not.toBeNull();
  });

  it('gives releases their dates, their stories and the demo target flag', () => {
    const release = doc().releases[0];
    expect(release.story_ids.length).toBeGreaterThan(0);
    expect(release.starts_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(release.ends_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(doc().releases.filter((r) => r.is_demo_target)).toHaveLength(1);
  });

  it('carries the schedule, so the page can show demo day without guessing', () => {
    expect(doc().schedule).toMatchObject({
      build_start: '2026-08-20',
      build_end: '2026-10-15',
      demo_day: '2026-10-22',
    });
  });

  it('traces every requirement to the stories that fulfil it', () => {
    const covered = doc().requirements.filter((r) => r.fulfilled_by.length > 0);
    expect(covered.length).toBeGreaterThan(0);
    for (const r of covered) {
      for (const storyId of r.fulfilled_by) {
        const story = pilot.stories.find((s) => s.id === storyId)!;
        expect(story.fulfills).toContain(r.id);
      }
    }
  });

  it('derives measures, guardrails, systems and roles once, for everyone', () => {
    const { derived } = doc();
    expect(derived.counts.requirements_total).toBe(pilot.requirements.length);
    expect(derived.counts.stories_total).toBe(pilot.stories.length);
    expect(Object.values(derived.counts.requirements_by_kind).reduce((a, b) => a + b, 0))
      .toBe(pilot.requirements.length);
    for (const m of derived.measures) expect(m.statement).toMatch(/\d/);
    for (const g of derived.guardrails) {
      expect(pilot.requirements.find((r) => r.id === g.id)!.kind).toBe('SAFE');
    }
  });

  it('renders with no schedule at all, because a cohort may have no start date', () => {
    const bare = buildPlanDocument(pilot, {});
    expect(bare.schedule).toBeNull();
    expect(bare.stories.every((s) => s.due_on === null)).toBe(true);
  });

  // ── the no-churn invariant ────────────────────────────────────────────────

  it('is byte-identical when the same plan arrives in a different array order', () => {
    // This is the whole no-churn guarantee. `changedFiles` hashes bytes, so a
    // plan that merely SORTED differently would look modified and commit to the
    // student's repo for nothing.
    const shuffled: BuildPlan = {
      ...pilot,
      stories: [...pilot.stories].reverse(),
      requirements: [...pilot.requirements].reverse(),
      releases: [...pilot.releases].reverse(),
    };
    const input = { repoUrl: REPO_URL, schedule: scheduleFor(pilot) };
    expect(serialisePlanDocument(buildPlanDocument(shuffled, input)))
      .toBe(serialisePlanDocument(buildPlanDocument(pilot, input)));
  });

  it('carries no wall-clock timestamp — freshness belongs in the manifest', () => {
    // A moving stamp in this file would make every sync a commit that says
    // nothing. The manifest is the one file allowed to carry the clock, because
    // `changedFiles` excludes it from the comparison.
    const serialised = serialisePlanDocument(doc());
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

// ── progress.json ───────────────────────────────────────────────────────────

const seedStories = [
  { id: 'STORY-001', release: 'r0', acceptance: ['Given a roster, when saved, then it persists.', 'Trust — every write is audited.'] },
  { id: 'STORY-002', release: 'r0', acceptance: ['Given a bad payload, when posted, then it is rejected.'] },
];

describe('.colaberry/progress.json — build progress, mirrored for a page with no API', () => {
  const rendered = () => renderProgressFile(seedStories, 'Sponsor Dashboard', {
    repoUrl: REPO_URL,
    progress: [{
      story_id: 'STORY-001',
      state: 'verified',
      criteria_passed: 2,
      criteria_total: 2,
      verified_at: '2026-08-11T10:00:00.000Z',
      commit_sha: 'a1b2c3d4',
      commit_at: '2026-08-11T09:58:00.000Z',
      points_awarded: 12,
      outstanding: [],
    }],
  });

  it('declares its schema version', () => {
    expect(rendered().schema_version).toBe(PROGRESS_SCHEMA_VERSION);
  });

  it('carries the verified commit as a URL a stranger can click without logging in', () => {
    // A portfolio claim that can only be checked by authenticating to our portal
    // is worth very little to a hiring manager. The URL is the citation.
    const story = rendered().stories.find((s) => s.id === 'STORY-001')!;
    expect(story.verification).toMatchObject({
      state: 'verified',
      commit_sha: 'a1b2c3d4',
      commit_url: `${REPO_URL}/commit/a1b2c3d4`,
      verified_at: '2026-08-11T10:00:00.000Z',
      points_awarded: 12,
    });
  });

  it('states "not_started" explicitly rather than omitting the story', () => {
    const untouched = rendered().stories.find((s) => s.id === 'STORY-002')!;
    // Rendered with no server-side progress for this story, so the block is
    // absent — and `totals` still counts it, which is what the page reads.
    expect(untouched.verification).toBeNull();
    expect(rendered().totals!.stories_not_started).toBe(1);
  });

  it('sums the totals so a page does not have to loop the stories', () => {
    expect(rendered().totals).toMatchObject({
      stories_total: 2, stories_verified: 1, stories_not_started: 1, points_awarded: 12,
    });
  });

  it('carries no wall-clock timestamp of its own', () => {
    // `verified_at` and `commit_at` are stable facts about the build. What must
    // NOT appear is a "checked at now", which would move on every sync.
    const serialised = serialiseProgressFile(renderProgressFile(seedStories, 'x', {}));
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

// ── the co-ownership guarantee ──────────────────────────────────────────────

describe("a student's completion data survives a republish", () => {
  /** What Claude Code writes back: ticks, files, tests, notes — under v1. */
  const studentV1 = JSON.stringify({
    schema_version: 1,
    project: 'Sponsor Dashboard',
    stories: [{
      id: 'STORY-001',
      release: 'r0',
      acceptance_total: 2,
      criteria: [
        { text: 'Given a roster, when saved, then it persists.', passed: true, evidence: 'roster.test.ts' },
        { text: 'Trust — every write is audited.', passed: false },
      ],
      files_touched: ['src/roster.ts'],
      tests_added: ['src/__tests__/roster.test.ts'],
      notes: 'Audit trail still to do.',
      updated_at: '2026-08-10T12:00:00.000Z',
    }],
  });

  it('carries the ticks across a v1 → v2 schema bump', () => {
    // THE regression this guards. The version check used to be an equality, so
    // bumping the schema made every existing student file unparseable, merge
    // fell back to the fresh render, and every tick was silently wiped.
    const merged = mergeProgressFile(renderProgressFile(seedStories, 'Sponsor Dashboard'), studentV1);
    const story = merged.stories.find((s) => s.id === 'STORY-001')!;
    expect(story.criteria[0].passed).toBe(true);
    expect(story.criteria[0].evidence).toBe('roster.test.ts');
    expect(story.criteria[1].passed).toBe(false);
    expect(story.files_touched).toEqual(['src/roster.ts']);
    expect(story.tests_added).toEqual(['src/__tests__/roster.test.ts']);
    expect(story.notes).toBe('Audit trail still to do.');
  });

  it('upgrades the merged result to the current version', () => {
    const merged = mergeProgressFile(renderProgressFile(seedStories, 'x'), studentV1);
    expect(merged.schema_version).toBe(PROGRESS_SCHEMA_VERSION);
  });

  it('refuses to let the repo assert its own verification', () => {
    // The `verification` block is the platform's conclusion about the student's
    // evidence. If merge read it back out of the repo, a student could type
    // `"state": "verified"` into the file and have it survive.
    const forged = JSON.parse(studentV1);
    forged.stories[0].verification = { state: 'verified', criteria_passed: 2, criteria_total: 2, points_awarded: 9999 };
    const merged = mergeProgressFile(
      renderProgressFile(seedStories, 'x', {
        progress: [{ story_id: 'STORY-001', state: 'in_progress', criteria_passed: 1, criteria_total: 2 }],
      }),
      JSON.stringify(forged),
    );
    expect(merged.stories.find((s) => s.id === 'STORY-001')!.verification).toMatchObject({
      state: 'in_progress', criteria_passed: 1,
    });
  });

  it('drops a tick whose criterion the plan reworded', () => {
    const reworded = mergeProgressFile(
      renderProgressFile(
        [{ id: 'STORY-001', release: 'r0', acceptance: ['Given a roster, when saved, then it persists to Postgres.'] }],
        'x',
      ),
      studentV1,
    );
    // The sentence they ticked is not the sentence now being asked for.
    expect(reworded.stories[0].criteria[0].passed).toBe(false);
  });
});

// ── version tolerance, both directions ──────────────────────────────────────

describe('schema versioning — what is guaranteed across versions', () => {
  it('a v1 CONSUMER still finds every field it was written against in a v2 file', () => {
    // Simulates a student's page written before v2 shipped: it reads only the
    // v1 keys. Every one must still be present and mean the same thing.
    const v2 = renderProgressFile(seedStories, 'Sponsor Dashboard', {
      repoUrl: REPO_URL,
      progress: [{ story_id: 'STORY-001', state: 'verified', criteria_passed: 2, criteria_total: 2 }],
    });
    const asV1Consumer = JSON.parse(serialiseProgressFile(v2));
    expect(typeof asV1Consumer.schema_version).toBe('number');
    expect(asV1Consumer.project).toBe('Sponsor Dashboard');
    expect(Array.isArray(asV1Consumer.stories)).toBe(true);
    for (const s of asV1Consumer.stories) {
      expect(typeof s.id).toBe('string');
      expect(Array.isArray(s.criteria)).toBe(true);
      for (const c of s.criteria) {
        expect(typeof c.text).toBe('string');
        expect(typeof c.passed).toBe('boolean');
      }
      expect(Array.isArray(s.files_touched)).toBe(true);
      expect(Array.isArray(s.tests_added)).toBe(true);
    }
  });

  it('a v1 plan.json consumer still finds the top-level keys in a v2 file', () => {
    // v1 of plan.json was a bare `JSON.stringify(plan)`, so pages read
    // `project_name`, `requirements`, `releases` and `stories` at the root.
    // v2 adds beside them; it must never move them.
    const doc = JSON.parse(serialisePlanDocument(buildPlanDocument(pilot, {})));
    expect(doc.project_name).toBe(pilot.project_name);
    expect(doc.descriptor).toBe(pilot.descriptor);
    expect(doc.requirements).toHaveLength(pilot.requirements.length);
    expect(doc.releases).toHaveLength(pilot.releases.length);
    expect(doc.stories).toHaveLength(pilot.stories.length);
  });

  it('accepts an older file but REFUSES one from the future', () => {
    const older = parseProgressFile(JSON.stringify({ schema_version: 1, stories: [] }));
    expect(older.ok).toBe(true);

    const newer = parseProgressFile(JSON.stringify({ schema_version: 99, stories: [] }));
    expect(newer.ok).toBe(false);
    // A file we cannot interpret must say so rather than be read as "nothing done".
    expect((newer as any).error_class).toBe('ProgressFileUnsupportedVersion');
  });

  it('still rejects a malformed file rather than reading it as "nothing done"', () => {
    expect(parseProgressFile('{ not json').ok).toBe(false);
    expect((parseProgressFile('{ not json') as any).error_class).toBe('ProgressFileNotJson');
  });
});

// ── the profile layer ───────────────────────────────────────────────────────

describe('.colaberry/profile.json — the student-owned portfolio layer', () => {
  it('is seeded closed: nothing is publishable until the student says so', () => {
    const seed = renderProfileSeed({ repoUrl: REPO_URL });
    expect(seed.disclosure).toBe('private');
    expect(Object.values(seed.include).every((v) => v === false)).toBe(true);
    expect(seed.summary).toBeNull();
  });

  it('seeds the links, because those are facts rather than choices', () => {
    expect(renderProfileSeed({ repoUrl: REPO_URL }).links.repo).toBe(REPO_URL);
  });

  it('round-trips through its own parser', () => {
    const parsed = parseProfileFile(serialiseProfileFile(renderProfileSeed({ repoUrl: REPO_URL })));
    expect(parsed.ok).toBe(true);
  });

  it('reports a malformed profile softly instead of replacing the student prose', () => {
    // Unlike progress.json, a bad profile costs nobody a verification — so the
    // safe move is to leave their bytes alone and say why.
    const parsed = parseProfileFile('{ oops');
    expect(parsed.ok).toBe(false);
  });
});

// ── the write path, end to end ──────────────────────────────────────────────

describe('the write path holds the idempotency guarantee', () => {
  const TARGET = { owner: 'ColaberryIntern', repo: 'sponsor-dashboard-248d9d63', branch: 'main' };

  const render = (): RenderedFile[] => renderDocs(pilot, {
    repoUrl: REPO_URL,
    generatedAt: '2026-08-15T00:00:00.000Z',
    planVersion: 3,
    planSha256: 'abc123',
    schedule: scheduleFor(pilot),
  });

  function githubStub(existing: Record<string, string> = {}) {
    const calls: string[] = [];
    const impl = jest.fn(async (url: any, init: any) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      const u = String(url);
      const body = (json: any) => ({ ok: true, status: 200, json: async () => json, text: async () => '' });
      for (const [path, content] of Object.entries(existing)) {
        if (u.includes(encodeURIComponent(path))) {
          return body({ content: Buffer.from(content, 'utf8').toString('base64') });
        }
      }
      if (u.includes('/contents/')) return { ok: false, status: 404, text: async () => 'Not Found' };
      if (u.endsWith('/git/ref/heads/main')) return body({ object: { sha: 'base-sha' } });
      if (u.includes('/git/commits/base-sha')) return body({ tree: { sha: 'base-tree' } });
      if (u.endsWith('/git/trees')) return body({ sha: 'tree-sha' });
      if (u.endsWith('/git/commits')) return body({ sha: 'commit-sha' });
      if (u.includes('/git/refs/heads/main')) return body({});
      return body({ default_branch: 'main' });
    });
    return { impl: impl as unknown as typeof fetch, calls, mock: impl };
  }

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'platform-token';
    delete process.env.GITHUB_API_URL;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('an unchanged plan produces NO commit and no network call', async () => {
    const files = render();
    const manifest = files.find((f) => f.path === '.colaberry/manifest.json')!.content;
    const { impl, mock } = githubStub();
    const result = await writeDocsToRepo(TARGET, files, manifest, { fetchImpl: impl });
    expect(result.committed).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it('the manifest alone is never worth a commit', () => {
    // The manifest carries `generated_at`, so its bytes differ on every render
    // even when nothing it describes changed. It must only ride along.
    const files = render();
    const hashes = Object.fromEntries(
      files.filter((f) => f.path !== '.colaberry/manifest.json').map((f) => [f.path, sha(f.content)]),
    );
    expect(changedFiles(files, hashes)).toEqual([]);
  });

  it('writes the new data files on a first publish', async () => {
    const { impl } = githubStub();
    const result = await writeDocsToRepo(TARGET, render(), null, { fetchImpl: impl });
    expect(result.committed).toBe(true);
    expect(result.changedPaths).toEqual(expect.arrayContaining([
      PLAN_FILE_PATH, PROGRESS_FILE_PATH, PROFILE_FILE_PATH,
    ]));
  });

  it('never overwrites a profile the student has already written', async () => {
    // The seed embeds the repo URL, so a repo rename changes its hash and drags
    // the file into the change set. Without the seed-once guard that would
    // delete their portfolio prose and reset their publication consent.
    const studentProfile = serialiseProfileFile({
      ...renderProfileSeed({ repoUrl: REPO_URL }),
      disclosure: 'public',
      summary: 'I built an agreement-to-onboarding pipeline for a 40-person team.',
    });
    const files = render();
    const staleManifest = JSON.stringify({
      files: files
        .filter((f) => f.path !== '.colaberry/manifest.json')
        .map((f) => ({
          path: f.path,
          // Everything matches except the profile, which looks changed.
          sha256: f.path === PROFILE_FILE_PATH ? sha('an older seed') : sha(f.content),
        })),
    });

    const { impl } = githubStub({ [PROFILE_FILE_PATH]: studentProfile });
    const result = await writeDocsToRepo(TARGET, files, staleManifest, { fetchImpl: impl });

    expect(result.committed).toBe(false);
    expect(result.changedPaths).not.toContain(PROFILE_FILE_PATH);
  });
});
