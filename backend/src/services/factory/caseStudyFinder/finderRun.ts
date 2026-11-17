/**
 * finderRun - one Case Study Finder run: read, assemble, store. The ONLY I/O of the Finder.
 *
 *   - ONE running run per tenant (partial unique index); a run older than ABANDON_AFTER_MS is marked failed first,
 *     so a restart cannot lock the button.
 *   - Bounded: at most MAX_REPOS repositories (this repo first), one tree read each; commits and one model call only
 *     for the MAX_PROPOSALS kept.
 *   - Partial failure is normal: an unreadable repo is listed as unavailable and the run continues.
 *   - Writes ONLY its own run row. Nothing here creates, links, edits or publishes a service or a case study.
 * Every dependency is injectable, so the whole pipeline is tested without GitHub, a model or a database.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import type { EvidenceSummary } from '../serviceEvidenceSummaryTypes';
import type { CommitFact, FinderProposal, FinderResult, FinderRunView, Need, ProcessCandidate, RepoRef, RepoScan } from './finderTypes';
import { buildNeeds } from './finderNeeds';
import { findProcesses } from './finderProcesses';
import { applyJudgment, capPerNeed, judgeCandidates, rankProcesses, toProposal, buildCommandFor, MAX_PER_NEED, MAX_PROPOSALS, type Ranked } from './finderAssemble';
import { judgeFit, MAX_JUDGE_CANDIDATES, MIN_FIT, type Judgment } from './finderJudge';
import { writeNarrative, type NarrativeFacts } from './finderNarrative';
import type { CaseStudyRef, CaseStudyRepoScope } from './finderMatch';

export const MAX_REPOS = 60;
export const JUDGE_CONCURRENCY = 4;
export const ABANDON_AFTER_MS = 20 * 60 * 1000;
export const PLATFORM_REPO = (): { owner: string; repo: string } => {
  const [owner, repo] = (process.env.CASE_STUDY_FINDER_PLATFORM_REPO || 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator').split('/');
  return { owner, repo };
};
/** Placeholder repos connected while testing the GitHub step (or used as test fixtures); never our work. */
const NOT_WORK = new Set(['octocat/hello-world', 'expressjs/express']);

export interface TreeResult { branch: string; paths: string[] }
export interface FinderDeps {
  loadSummary: (tenantId: string) => Promise<EvidenceSummary>;
  loadDescriptions: (tenantId: string) => Promise<Map<string, string | null>>;
  loadRepos: () => Promise<RepoRef[]>;
  loadCaseStudies: () => Promise<{ caseStudies: CaseStudyRef[]; scopes: CaseStudyRepoScope[] }>;
  readTree: (ref: RepoRef) => Promise<TreeResult | null>;
  readCommits: (ref: RepoRef, branch: string, root: string) => Promise<CommitFact[]>;
  narrate: (f: NarrativeFacts) => Promise<FinderProposal['narrative']>;
  judge: (p: ProcessCandidate, candidates: Need[]) => Promise<Judgment | null>;
  now: () => Date;
}

/* ----------------------------------------------------------------------------------------------- default I/O */

async function parse<T>(p: Promise<{ ok: boolean; status: number; body: string }>): Promise<T | null> {
  const r = await p;
  if (!r.ok) return null;
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

async function defaultReadTree(ref: RepoRef): Promise<TreeResult | null> {
  const { githubApiRequest } = await import('../../sbp/repoConnect/githubRepoClient');
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
  const meta = await parse<{ default_branch?: string; fork?: boolean; archived?: boolean }>(githubApiRequest('GET', base));
  if (!meta?.default_branch) return null;
  const tree = await parse<{ tree?: { path: string; type: string }[] }>(githubApiRequest('GET', `${base}/git/trees/${encodeURIComponent(meta.default_branch)}?recursive=1`));
  if (!tree?.tree) return null;
  return { branch: meta.default_branch, paths: tree.tree.filter((t) => t.type === 'blob').map((t) => t.path) };
}

async function defaultReadCommits(ref: RepoRef, branch: string, root: string): Promise<CommitFact[]> {
  const { githubApiRequest } = await import('../../sbp/repoConnect/githubRepoClient');
  const q = new URLSearchParams({ sha: branch, per_page: '100', ...(root ? { path: root } : {}) });
  const list = await parse<{ sha: string; commit: { message: string; author?: { date?: string }; committer?: { date?: string } } }[]>(
    githubApiRequest('GET', `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits?${q.toString()}`));
  return (list ?? []).map((c) => ({
    sha: c.sha.slice(0, 12),
    date: c.commit.committer?.date ?? c.commit.author?.date ?? '',
    message: (c.commit.message || '').split('\n')[0].slice(0, 140),
  })).filter((c) => c.date);
}

async function defaultLoadRepos(): Promise<RepoRef[]> {
  const platform = PLATFORM_REPO();
  const rows = await sequelize.query<{ owner: string; repo: string; source: string }>(
    `SELECT DISTINCT repo_owner AS owner, repo_name AS repo, 'connected' AS source FROM github_connections
       WHERE repo_owner IS NOT NULL AND repo_name IS NOT NULL
     UNION
     SELECT DISTINCT repo_owner, repo_name, 'case_study' FROM case_study_repositories
       WHERE repo_owner IS NOT NULL AND repo_name IS NOT NULL`,
    { type: QueryTypes.SELECT },
  );
  return dedupeRepos([{ ...platform, source: 'platform' }, ...rows.map((r) => ({ owner: r.owner, repo: r.repo, source: r.source as RepoRef['source'] }))]);
}

async function defaultLoadCaseStudies(): Promise<{ caseStudies: CaseStudyRef[]; scopes: CaseStudyRepoScope[] }> {
  const caseStudies = await sequelize.query<{ id: string; title: string; slug: string | null; status: string; capability: string | null }>(
    'SELECT id, title, slug, status, primary_capability AS capability FROM case_studies', { type: QueryTypes.SELECT });
  const scopes = await sequelize.query<{ caseStudyId: string; owner: string; repo: string; pathScope: string[] | null }>(
    `SELECT c.case_study_id AS "caseStudyId", r.repo_owner AS owner, r.repo_name AS repo, r.path_scope AS "pathScope"
       FROM case_study_repositories r JOIN case_study_repo_collections c ON c.id = r.collection_id`,
    { type: QueryTypes.SELECT });
  return { caseStudies, scopes: scopes.map((s) => ({ ...s, pathScope: Array.isArray(s.pathScope) ? s.pathScope : [] })) };
}

export function defaultDeps(): FinderDeps {
  return {
    loadSummary: async (tenantId) => {
      const { getServiceEvidenceSummary } = await import('../serviceEvidenceSummary');
      return getServiceEvidenceSummary({ tenantId, status: 'all' });
    },
    loadDescriptions: async (tenantId) => {
      const { listServiceOfferings } = await import('../serviceCatalog');
      const all: { id: string; description?: string | null }[] = await listServiceOfferings({ tenantId, status: 'all' });
      return new Map(all.map((s) => [s.id, s.description ?? null]));
    },
    loadRepos: defaultLoadRepos,
    loadCaseStudies: defaultLoadCaseStudies,
    readTree: defaultReadTree,
    readCommits: defaultReadCommits,
    narrate: writeNarrative,
    judge: judgeFit,
    now: () => new Date(),
  };
}

/* ----------------------------------------------------------------------------------------------- pipeline */

export function dedupeRepos(refs: RepoRef[]): RepoRef[] {
  const seen = new Set<string>();
  const out: RepoRef[] = [];
  for (const r of refs) {
    const k = `${r.owner}/${r.repo}`.toLowerCase();
    if (seen.has(k) || NOT_WORK.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export async function runFinder(tenantId: string, deps: FinderDeps, onStage: (s: string) => Promise<void> = async () => {}): Promise<FinderResult> {
  const now = deps.now();
  const notes: string[] = [];
  await onStage('Reading our needs');
  const [summary, descriptions] = await Promise.all([deps.loadSummary(tenantId), deps.loadDescriptions(tenantId).catch(() => new Map<string, string | null>())]);
  const needs = buildNeeds(summary, descriptions);
  if (summary.opportunityFeed.source === 'unavailable') notes.push('The Gov opportunity feed was unavailable, so open-opportunity counts are missing from the needs.');
  if (summary.decideNow.openFitGaps.count === null) notes.push('Live proposal gaps could not be read, so Partly/New capabilities are missing from the needs.');

  await onStage('Listing repositories');
  const allRepos = await deps.loadRepos();
  const repos = allRepos.slice(0, MAX_REPOS);
  if (allRepos.length > repos.length) notes.push(`${allRepos.length - repos.length} more connected repositories were not read (limit ${MAX_REPOS}).`);

  const scans: RepoScan[] = [];
  const processes: ProcessCandidate[] = [];
  const branches = new Map<string, string>();
  for (const [i, ref] of repos.entries()) {
    await onStage(`Reading repositories (${i + 1} of ${repos.length})`);
    let tree: TreeResult | null = null;
    try { tree = await deps.readTree(ref); } catch { tree = null; }
    if (!tree) { scans.push({ owner: ref.owner, repo: ref.repo, source: ref.source, status: 'unavailable', processes: 0, note: 'Could not read the repository (private, renamed or deleted).' }); continue; }
    const found = findProcesses(ref, tree.paths);
    branches.set(`${ref.owner}/${ref.repo}`, tree.branch);
    processes.push(...found);
    scans.push({ owner: ref.owner, repo: ref.repo, source: ref.source, status: 'read', processes: found.length, note: found.length ? null : 'No module large enough to be a process.' });
  }

  await onStage('Checking existing case studies');
  const { caseStudies, scopes } = await deps.loadCaseStudies();
  const { ranked: shortlist, excluded } = rankProcesses(processes, needs, caseStudies, scopes);

  // The judge: one model call per shortlisted process, JUDGE_CONCURRENCY at a time. Rejections drop out.
  const judged: (Ranked | null)[] = new Array(shortlist.length).fill(null);
  let done = 0; let rejected = 0; let unjudged = 0;
  const work = shortlist.map((r, i) => async (): Promise<void> => {
    let j: Judgment | null = null;
    const offered = judgeCandidates(r, needs, MAX_JUDGE_CANDIDATES);
    try { j = await deps.judge(r.process, offered); } catch { j = null; }
    if (!j) unjudged += 1;
    judged[i] = applyJudgment(r, j, MIN_FIT, offered);
    if (j && !judged[i]) rejected += 1;
    done += 1;
    await onStage(`Judging fit (${done} of ${shortlist.length})`);
  });
  for (let i = 0; i < work.length; i += JUDGE_CONCURRENCY) await Promise.all(work.slice(i, i + JUDGE_CONCURRENCY).map((w) => w()));
  const ranked = capPerNeed(judged.filter((r): r is Ranked => !!r), MAX_PER_NEED, MAX_PROPOSALS);
  if (unjudged) notes.push(`${plural(unjudged, 'candidate')} could not be judged by AI and ${unjudged === 1 ? 'is' : 'are'} ranked by keywords only.`);

  const proposals: FinderProposal[] = [];
  for (const [i, r] of ranked.entries()) {
    await onStage(`Writing proposals (${i + 1} of ${ranked.length})`);
    const base = toProposal(r, i + 1, now.getUTCFullYear());
    const ref: RepoRef = { owner: r.process.owner, repo: r.process.repo, source: r.process.source };
    let commits: CommitFact[] = [];
    try { commits = await deps.readCommits(ref, branches.get(`${ref.owner}/${ref.repo}`) ?? 'main', r.process.root); } catch { commits = []; }
    const sorted = [...commits].sort((a, b) => a.date.localeCompare(b.date));
    const c = { count: commits.length, first: sorted[0]?.date ?? null, last: sorted[sorted.length - 1]?.date ?? null, recent: [...sorted].reverse().slice(0, 10) };
    const narrative = await deps.narrate({ process: r.process, need: r.best.need, delta: base.delta, commits: c });
    proposals.push({ ...base, commits: c, narrative, buildCommand: buildCommandFor(r.process, base.need.name, narrative.title, base.pathScope) });
  }
  if (!proposals.length) notes.push('No uncovered process matched a need. Add keywords to thin services or connect more repositories.');

  return {
    generatedAt: now.toISOString(),
    needs: {
      services: needs.filter((n) => n.kind === 'service').length,
      withNeed: needs.filter((n) => n.needScore > 0).length,
      capabilities: needs.filter((n) => n.kind === 'capability').length,
      top: needs.slice(0, 8).map((n) => ({ kind: n.kind, id: n.id, name: n.name, needScore: n.needScore, reasons: n.reasons })),
    },
    repos: scans,
    processesFound: processes.length,
    proposals: proposals.slice(0, MAX_PROPOSALS),
    excluded,
    notes: [`Read ${plural(scans.filter((s) => s.status === 'read').length, 'repository', 'repositories')}, found ${plural(processes.length, 'process', 'processes')}, ${excluded.length} already covered by a case study; ${shortlist.length} shortlisted, ${rejected} judged not a real fit.`, ...notes],
  };
}

/* ----------------------------------------------------------------------------------------------- storage */

interface RunRow { id: string; status: FinderRunView['status']; stage: string | null; last_error: string | null; started_by: string | null; started_at: Date | string; finished_at: Date | string | null; result?: FinderResult | null }
const toView = (r: RunRow): FinderRunView => ({
  id: r.id, status: r.status, stage: r.stage, lastError: r.last_error, startedBy: r.started_by,
  startedAt: new Date(r.started_at).toISOString(), finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
});

/** The latest run, plus the latest COMPLETED result (a run in progress still shows the last good proposals). */
export async function latestFinder(tenantId: string): Promise<{ run: FinderRunView | null; result: FinderResult | null; resultAt: string | null }> {
  const [run] = await sequelize.query<RunRow>(
    'SELECT id, status, stage, last_error, started_by, started_at, finished_at FROM case_study_finder_runs WHERE tenant_id = :tenantId ORDER BY started_at DESC LIMIT 1',
    { type: QueryTypes.SELECT, replacements: { tenantId } });
  const [done] = await sequelize.query<RunRow>(
    `SELECT id, status, stage, last_error, started_by, started_at, finished_at, result FROM case_study_finder_runs
      WHERE tenant_id = :tenantId AND status = 'completed' ORDER BY started_at DESC LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { tenantId } });
  return { run: run ? toView(run) : null, result: done?.result ?? null, resultAt: done?.finished_at ? new Date(done.finished_at).toISOString() : null };
}

export async function startFinderRun(tenantId: string, actor: string): Promise<{ run: FinderRunView; started: boolean }> {
  await sequelize.query(
    `UPDATE case_study_finder_runs SET status = 'failed', last_error = 'abandoned (process restarted mid-run)', finished_at = now()
      WHERE tenant_id = :tenantId AND status = 'running' AND started_at < now() - (:ms || ' milliseconds')::interval`,
    { replacements: { tenantId, ms: String(ABANDON_AFTER_MS) } });
  const created = await sequelize.query<RunRow>(
    `INSERT INTO case_study_finder_runs (tenant_id, status, stage, started_by) VALUES (:tenantId, 'running', 'Starting', :actor)
     ON CONFLICT (tenant_id) WHERE status = 'running' DO NOTHING
     RETURNING id, status, stage, last_error, started_by, started_at, finished_at`,
    { type: QueryTypes.SELECT, replacements: { tenantId, actor } });
  if (created[0]) return { run: toView(created[0]), started: true };
  const { run } = await latestFinder(tenantId);
  return { run: run as FinderRunView, started: false };
}

function logRun(event: string, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  console[outcome === 'failure' ? 'error' : 'log'](JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, outcome, context }));
}

/** Process a started run to completion. Never throws: a failure is stored on the run. */
export async function processFinderRun(runId: string, tenantId: string, deps: FinderDeps = defaultDeps()): Promise<void> {
  const setStage = async (stage: string): Promise<void> => {
    await sequelize.query('UPDATE case_study_finder_runs SET stage = :stage WHERE id = :id', { replacements: { id: runId, stage } }).catch(() => undefined);
  };
  const started = Date.now();
  try {
    const result = await runFinder(tenantId, deps, setStage);
    await sequelize.query(
      `UPDATE case_study_finder_runs SET status = 'completed', stage = NULL, result = CAST(:result AS JSONB), finished_at = now() WHERE id = :id`,
      { replacements: { id: runId, result: JSON.stringify(result) } });
    logRun('case_study_finder_run', 'success', { run_id: runId, proposals: result.proposals.length, processes: result.processesFound, ms: Date.now() - started });
  } catch (err) {
    const message = String((err as Error)?.message ?? err).slice(0, 300);
    await sequelize.query(
      `UPDATE case_study_finder_runs SET status = 'failed', last_error = :message, finished_at = now() WHERE id = :id`,
      { replacements: { id: runId, message } }).catch(() => undefined);
    logRun('case_study_finder_run', 'failure', { run_id: runId, message, ms: Date.now() - started });
  }
}
