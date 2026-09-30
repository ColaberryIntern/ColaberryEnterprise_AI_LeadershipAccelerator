/**
 * repoWriter — the plan-drift guard.
 *
 * THE INCIDENT THIS PINS. `.colaberry/plan.json` was classified platform-owned
 * and written unconditionally. `changedFiles` compares a fresh render against
 * `.colaberry/manifest.json`, which records what the PLATFORM last wrote and
 * says nothing about what is actually in the student's repo — so a student who
 * hand-edited their plan was invisible to the check, and the next sync replaced
 * their file. In one repo the bot overwrote a student's plan, he restored it by
 * hand and reported it as platform-side corruption, and the bot overwrote him
 * again.
 *
 * Three student repos hold hand-built plans that feed a Command Center at
 * runtime, so an overwrite costs them the data AND the dashboard. Ten more have
 * a manifest carrying no `plan.json` entry at all — one has no manifest — which
 * is the case with no recorded hash to compare against, and therefore the case
 * that must refuse rather than guess.
 *
 * GitHub is mocked; nothing here touches the network, and nothing here writes to
 * a student repo.
 */
import { writeDocsToRepo, planWriteDecision } from '../repoWriter';
import { PLAN_FILE_PATH } from '../planDocument';
import { RenderedFile } from '../renderDocs';
import { createHash } from 'crypto';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const TARGET = { owner: 'ColaberryIntern', repo: 'ai-operations-center', branch: 'main' };

/** What the platform last committed. */
const PLAN_AS_PLATFORM_WROTE_IT = JSON.stringify({
  schema_version: 2, project_name: 'AI Operations Center', stories: [{ id: 'STORY-001' }],
});

/** What the platform renders today — a legitimately newer plan. */
const PLAN_AS_PLATFORM_RENDERS_IT_NOW = JSON.stringify({
  schema_version: 2, project_name: 'AI Operations Center', stories: [{ id: 'STORY-001' }, { id: 'STORY-002' }],
});

/** What the student actually has: STORY-004..015 added by hand. */
const PLAN_AS_THE_STUDENT_EDITED_IT = JSON.stringify({
  schema_version: 2,
  project_name: 'AI Operations Center',
  stories: [{ id: 'STORY-001' }, { id: 'STORY-004' }, { id: 'STORY-015' }],
});

const DOC: RenderedFile = { path: 'docs/REQUIREMENTS.md', content: '# Requirements\nA manager can see the fleet.' };
const files: RenderedFile[] = [DOC, { path: PLAN_FILE_PATH, content: PLAN_AS_PLATFORM_RENDERS_IT_NOW }];

/** A manifest recording what the platform last wrote — including the plan. */
const manifestWithPlan = () => JSON.stringify({
  files: [
    { path: DOC.path, sha256: sha(DOC.content) },
    { path: PLAN_FILE_PATH, sha256: sha(PLAN_AS_PLATFORM_WROTE_IT) },
  ],
});

/**
 * A STUB manifest: real, parseable, but carrying no `plan.json` entry. This is
 * the shape in ten live student repos.
 */
const stubManifest = () => JSON.stringify({ files: [{ path: DOC.path, sha256: sha('something else') }] });

/**
 * The 5-call commit flow, plus a `contents` endpoint serving whatever the repo
 * is supposed to contain at `plan.json`.
 *
 * `plan` of `null` means the file is genuinely absent (404); `'unreadable'`
 * means GitHub failed in a way that is NOT a 404.
 */
function githubStub(plan: string | null | 'unreadable') {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const u = decodeURIComponent(String(url));
    const body = (json: any) => ({ ok: true, status: 200, json: async () => json, text: async () => '' });

    if (u.includes(`/contents/${PLAN_FILE_PATH}`)) {
      if (plan === 'unreadable') {
        return { ok: false, status: 500, json: async () => ({}), text: async () => 'Internal Server Error' };
      }
      if (plan === null) {
        return { ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' };
      }
      return body({ content: Buffer.from(plan, 'utf8').toString('base64') });
    }
    if (u.endsWith('/git/ref/heads/main')) return body({ object: { sha: 'base-commit-sha' } });
    if (u.includes('/git/commits/base-commit-sha')) return body({ tree: { sha: 'base-tree-sha' } });
    if (u.endsWith('/git/trees')) return body({ sha: 'new-tree-sha' });
    if (u.endsWith('/git/commits')) return body({ sha: 'new-commit-sha' });
    if (u.includes('/git/refs/heads/main')) return body({});
    return body({ default_branch: 'main' });
  });
  return { impl: impl as unknown as typeof fetch, calls, mock: impl };
}

/** The paths actually sent to GitHub in the tree — the only thing that truly lands. */
const committedPaths = (calls: Array<{ url: string; init: RequestInit }>): string[] => {
  const tree = calls.find((c) => c.url.endsWith('/git/trees'));
  if (!tree) return [];
  return JSON.parse(String(tree.init.body)).tree.map((t: any) => t.path);
};

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'platform-token';
  delete process.env.GITHUB_API_URL;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ── the headline ────────────────────────────────────────────────────────────
describe('a plan that differs from the manifest hash is never overwritten', () => {
  it('does not commit plan.json when the student has edited it', async () => {
    const { impl, calls } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    const result = await writeDocsToRepo(TARGET, files, manifestWithPlan(), { fetchImpl: impl });

    expect(result.changedPaths).not.toContain(PLAN_FILE_PATH);
    expect(committedPaths(calls)).not.toContain(PLAN_FILE_PATH);
  });

  it('still delivers everything else, so one edited file does not block the sync', async () => {
    // The doc is stale too, so there is genuinely something else to commit —
    // otherwise dropping the plan empties the change set and the correct
    // outcome is no commit at all, which is a different property (below).
    const manifest = JSON.stringify({
      files: [
        { path: DOC.path, sha256: sha('an older requirements doc') },
        { path: PLAN_FILE_PATH, sha256: sha(PLAN_AS_PLATFORM_WROTE_IT) },
      ],
    });
    const { impl, calls } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    const result = await writeDocsToRepo(TARGET, files, manifest, { fetchImpl: impl });

    expect(result.committed).toBe(true);
    expect(committedPaths(calls)).toContain(DOC.path);
    expect(committedPaths(calls)).not.toContain(PLAN_FILE_PATH);
  });

  it('logs the refusal with a reason, so "my plan stopped updating" is answerable', async () => {
    const spy = jest.spyOn(console, 'log');
    const { impl } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    await writeDocsToRepo(TARGET, files, manifestWithPlan(), { fetchImpl: impl });

    const lines = spy.mock.calls.map((c) => String(c[0]));
    const skip = lines.find((l) => l.includes('sbp_repo_plan_write_skipped'));
    expect(skip).toBeDefined();
    expect(skip).toContain('skip_edited');
  });
});

// ── the ten repos ───────────────────────────────────────────────────────────
describe('a manifest with no plan entry is treated as unknown, not as permission', () => {
  it('refuses to overwrite when the manifest is a stub with no plan.json entry', async () => {
    // Nine live repos. `existing[plan]` is undefined, so the old code saw the
    // file as changed and wrote it unconditionally.
    const { impl, calls } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    const result = await writeDocsToRepo(TARGET, files, stubManifest(), { fetchImpl: impl });

    expect(result.changedPaths).not.toContain(PLAN_FILE_PATH);
    expect(committedPaths(calls)).not.toContain(PLAN_FILE_PATH);
  });

  it('refuses to overwrite when there is no manifest at all', async () => {
    // Martin2100-AI: no manifest, and STORY-004..015 added by hand.
    const { impl, calls } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    const result = await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });

    expect(result.changedPaths).not.toContain(PLAN_FILE_PATH);
    expect(committedPaths(calls)).not.toContain(PLAN_FILE_PATH);
  });

  it('records the refusal as unknown provenance rather than as an edit', async () => {
    const spy = jest.spyOn(console, 'log');
    const { impl } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });

    const skip = spy.mock.calls.map((c) => String(c[0]))
      .find((l) => l.includes('sbp_repo_plan_write_skipped'));
    expect(skip).toContain('skip_unknown_provenance');
  });
});

// ── the cases that must still write ─────────────────────────────────────────
describe('an unedited repo keeps receiving plan updates', () => {
  it('writes the plan when the repo copy matches the manifest hash exactly', async () => {
    const { impl, calls } = githubStub(PLAN_AS_PLATFORM_WROTE_IT);

    const result = await writeDocsToRepo(TARGET, files, manifestWithPlan(), { fetchImpl: impl });

    expect(result.changedPaths).toContain(PLAN_FILE_PATH);
    expect(committedPaths(calls)).toContain(PLAN_FILE_PATH);
  });

  it('writes the plan on a first publish, when the repo has no plan.json yet', async () => {
    // The one case that writes on incomplete information, and it is safe by
    // inspection: there is nothing there to destroy. Refusing here would mean a
    // new student never receives a plan at all.
    const { impl, calls } = githubStub(null);

    const result = await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });

    expect(result.changedPaths).toContain(PLAN_FILE_PATH);
    expect(committedPaths(calls)).toContain(PLAN_FILE_PATH);
  });
});

// ── failing safe ────────────────────────────────────────────────────────────
describe('a plan we could not read is never assumed to be absent', () => {
  it('refuses to overwrite when GitHub fails on a non-404', async () => {
    // The module already holds that "a read failure must never be treated as
    // 'they had nothing'". Treating a 500 as absent would turn a transient blip
    // into the exact data loss this guard exists to prevent.
    const { impl, calls } = githubStub('unreadable');

    const result = await writeDocsToRepo(TARGET, files, manifestWithPlan(), { fetchImpl: impl });

    expect(result.changedPaths).not.toContain(PLAN_FILE_PATH);
    expect(committedPaths(calls)).not.toContain(PLAN_FILE_PATH);
  });
});

// ── the guard must not cost a commit, or a read ─────────────────────────────
describe('the guard leaves the idempotency guarantee intact', () => {
  it('makes no commit at all when the plan is the only thing that changed', async () => {
    const manifest = JSON.stringify({
      files: [
        { path: DOC.path, sha256: sha(DOC.content) },                     // unchanged
        { path: PLAN_FILE_PATH, sha256: sha(PLAN_AS_PLATFORM_WROTE_IT) }, // changed, but edited
      ],
    });
    const { impl, calls } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    const result = await writeDocsToRepo(TARGET, files, manifest, { fetchImpl: impl });

    expect(result.committed).toBe(false);
    expect(calls.some((c) => c.url.endsWith('/git/commits') && c.init.method === 'POST')).toBe(false);
  });

  it('does not read the repo at all when nothing changed', async () => {
    const manifest = JSON.stringify({
      files: files.map((f) => ({ path: f.path, sha256: sha(f.content) })),
    });
    const { impl, mock } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    const result = await writeDocsToRepo(TARGET, files, manifest, { fetchImpl: impl });

    expect(result.committed).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it('costs exactly one extra GET when it does run', async () => {
    const { impl, calls } = githubStub(PLAN_AS_THE_STUDENT_EDITED_IT);

    await writeDocsToRepo(TARGET, files, manifestWithPlan(), { fetchImpl: impl });

    const reads = calls.filter((c) => decodeURIComponent(c.url).includes(`/contents/${PLAN_FILE_PATH}`));
    expect(reads).toHaveLength(1);
  });
});

// ── the decision itself, with no network in sight ───────────────────────────
describe('planWriteDecision (pure)', () => {
  const hash = sha(PLAN_AS_PLATFORM_WROTE_IT);

  it('writes when the repo copy is byte-identical to what the manifest records', () => {
    expect(planWriteDecision({ state: 'present', content: PLAN_AS_PLATFORM_WROTE_IT }, hash)).toBe('write');
  });

  it('refuses when a single byte differs', () => {
    expect(planWriteDecision({ state: 'present', content: `${PLAN_AS_PLATFORM_WROTE_IT} ` }, hash)).toBe('skip_edited');
  });

  it('refuses when the manifest has no hash for the plan', () => {
    expect(planWriteDecision({ state: 'present', content: PLAN_AS_PLATFORM_WROTE_IT }, undefined))
      .toBe('skip_unknown_provenance');
  });

  it('refuses when the file could not be read', () => {
    expect(planWriteDecision({ state: 'unreadable' }, hash)).toBe('skip_unreadable');
    // Even with no manifest hash, an unreadable file is never treated as absent.
    expect(planWriteDecision({ state: 'unreadable' }, undefined)).toBe('skip_unreadable');
  });

  it('writes when the file is genuinely absent, with or without a recorded hash', () => {
    expect(planWriteDecision({ state: 'absent' }, hash)).toBe('write');
    expect(planWriteDecision({ state: 'absent' }, undefined)).toBe('write');
  });
});
