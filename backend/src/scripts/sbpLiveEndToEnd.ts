/**
 * SBP T16 — live end-to-end proof against a REAL GitHub repo.
 *
 * Every other test in this workstream mocks GitHub. This one does not, because
 * the defect the workstream exists to close is precisely "the prompt names files
 * that are not there" — and only a real clone can prove they are.
 *
 * The chain: plan → render → commit to a real repo → assemble a prompt →
 * clone the repo → confirm every path the prompt names actually opens.
 *
 * Usage (from backend/):
 *   GITHUB_TOKEN=… npx ts-node src/scripts/sbpLiveEndToEnd.ts [--keep]
 *
 * Creates a scratch repo under the workspace org, proves the chain, then deletes
 * it unless --keep is passed. Reads no production data and writes to no
 * production database — the plan comes from the checked-in pilot fixture.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { renderDocs, manifestPaths } from '../services/sbp/renderDocs';
import { writeDocsToRepo } from '../services/sbp/repoWriter';
import { buildStoryPrompt } from '../services/sbp/buildStoryPrompt';
import { BuildPlan } from '../services/sbp/planContract';
import { gatePlan } from '../services/sbp/planGate';

const KEEP = process.argv.includes('--keep');
const ORG = process.env.GITHUB_WORKSPACE_ORG || 'ColaberryIntern';
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = `sbp-live-check-${Date.now().toString(36)}`;

const plan = JSON.parse(
  readFileSync(join(__dirname, '../services/sbp/__tests__/fixtures/pilot-dryrun-plan.json'), 'utf8'),
) as BuildPlan;

let failures = 0;
const check = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

(async () => {
  if (!TOKEN) {
    console.error('GITHUB_TOKEN is required for the live check');
    process.exit(2);
  }

  console.log(`\nSBP live end-to-end — ${ORG}/${REPO}\n`);
  let created = false;
  let workdir = '';

  try {
    // ── 0. the plan is one the gate would accept for these purposes ──────────
    const gate = gatePlan(plan);
    console.log(`Plan: ${plan.stories.length} stories, ${plan.requirements.length} requirements ` +
      `(gate: ${gate.ok ? 'PASS' : `${gate.violations.length} violations — expected, this is the known-bad pilot plan`})`);

    // ── 1. create a scratch repo ─────────────────────────────────────────────
    // ColaberryIntern is a USER account, not an org (the /orgs endpoint 404s), so
    // the scratch repo is created under /user/repos. Production provisioning
    // targets /orgs/<GITHUB_WORKSPACE_ORG>/repos; this differs only in the create
    // call, and every subsequent step exercises the identical code path.
    const createRes = await gh(`/user/repos`, {
      method: 'POST',
      body: JSON.stringify({ name: REPO, private: true, auto_init: true, description: 'SBP live end-to-end check — safe to delete' }),
    });
    check('scratch repo created', createRes.ok, createRes.ok ? '' : `HTTP ${createRes.status}`);
    if (!createRes.ok) throw new Error(await createRes.text());
    created = true;
    await new Promise((r) => setTimeout(r, 2500));   // let auto_init settle

    // ── 2. render + write ────────────────────────────────────────────────────
    const repoUrl = `https://github.com/${ORG}/${REPO}`;
    const files = renderDocs(plan, { repoUrl, generatedAt: new Date().toISOString(), planVersion: 1, planSha256: 'live-check' });
    console.log(`Rendered ${files.length} files`);

    const first = await writeDocsToRepo({ owner: ORG, repo: REPO }, files, null, { correlationId: 'live-check' });
    check('first write commits', first.committed, `${first.changedPaths.length} files, ${first.commitSha?.slice(0, 7)}`);

    // ── 3. THE IDEMPOTENCY GUARANTEE, against real GitHub ────────────────────
    const manifestFile = files.find((f) => f.path === '.colaberry/manifest.json')!;
    const second = await writeDocsToRepo({ owner: ORG, repo: REPO }, files, manifestFile.content, { correlationId: 'live-check' });
    check('re-write makes NO commit (unchanged ⇒ no commit)', second.committed === false,
      second.committed ? 'it committed again — history would churn' : `${second.skippedUnchanged} skipped`);

    // ── 4. assemble a prompt against the manifest ────────────────────────────
    const story = plan.stories[0];
    const paths = manifestPaths(files);
    const prompt = buildStoryPrompt(plan, story, { repoUrl, manifestPaths: paths });
    check('prompt assembles', prompt.length > 1200, `${prompt.length} chars`);

    // ── 5. clone, and open every path the prompt names ───────────────────────
    workdir = mkdtempSync(join(tmpdir(), 'sbp-live-'));
    const cloneUrl = `https://x-access-token:${TOKEN}@github.com/${ORG}/${REPO}.git`;
    execFileSync('git', ['clone', '--depth', '1', cloneUrl, workdir], { stdio: 'pipe' });
    check('repo clones', existsSync(join(workdir, '.git')));

    // The point of the whole exercise: what the prompt tells Claude Code to open.
    const cited = [...prompt.matchAll(/^\s+\d+\.\s+\.\/(\S+)/gm)].map((m) => m[1]);
    check('prompt cites files', cited.length >= 4, cited.join(', '));
    for (const rel of cited) {
      const full = join(workdir, rel);
      const exists = existsSync(full);
      check(`  prompt path resolves: ./${rel}`, exists, exists ? `${readFileSync(full, 'utf8').length} bytes` : 'MISSING');
    }

    // ── 6. one story file per story, acceptance unticked ─────────────────────
    const storyFile = join(workdir, `docs/stories/${story.id}.md`);
    if (existsSync(storyFile)) {
      const content = readFileSync(storyFile, 'utf8');
      check('story file carries unticked acceptance boxes', content.includes('- [ ]') && !content.includes('- [x]'));
      check('story file quotes the requirement verbatim',
        content.includes(plan.requirements.find((r) => r.id === story.fulfills[0])!.statement));
    }

    // ── 7. the write allowlist held ──────────────────────────────────────────
    const tracked = execFileSync('git', ['ls-files'], { cwd: workdir, encoding: 'utf8' }).trim().split('\n');
    const outside = tracked.filter((p) => p && p !== 'README.md' && p !== 'CLAUDE.md'
      && !p.startsWith('docs/') && !p.startsWith('.colaberry/'));
    check('nothing written outside the allowlist', outside.length === 0, outside.join(', ') || 'clean');
  } catch (err: any) {
    console.error(`\nERROR: ${err?.message}`);
    failures += 1;
  } finally {
    if (workdir) { try { rmSync(workdir, { recursive: true, force: true }); } catch { /* best effort */ } }
    if (created && !KEEP) {
      const del = await gh(`/repos/${ORG}/${REPO}`, { method: 'DELETE' });
      console.log(`\nscratch repo deleted: ${del.ok ? 'yes' : `NO (HTTP ${del.status}) — delete ${ORG}/${REPO} by hand`}`);
    } else if (created) {
      console.log(`\nscratch repo KEPT: https://github.com/${ORG}/${REPO}`);
    }
  }

  console.log(`\n${failures === 0 ? 'LIVE CHECK PASSED' : `LIVE CHECK FAILED (${failures})`}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
