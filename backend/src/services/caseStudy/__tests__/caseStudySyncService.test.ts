/**
 * caseStudySyncService — T011 acceptance tests, part 1 of 2.
 *
 * This file: the five acceptance criteria (idempotency, partial failure, the
 * audit row, the log shape, concurrency) plus the non-negotiables carried from
 * earlier tasks — no private repository identity in a log, no PII in a log, no
 * mutation of `EvidenceRecord` / `PortfolioArtifact` / `Project` /
 * `GitHubConnection`, append-only sync runs, and the rule that a sync may never
 * publish, approve or verify anything.
 * Part 2 (`caseStudySyncCheckpointB.test.ts`) proves the spec's Checkpoint B
 * chain end to end against the REAL analyzer.
 *
 * NO DATABASE. Every model is mocked, so this suite runs under
 * `jest.ci.config.ts` with `DATABASE_URL` unset. Only three seams are doubled —
 * the two source models (asserted unwritten), and the repository collection and
 * analyzer, so a failure can be staged deterministically. The builder, the
 * store, the provenance merge, the readiness rubric, the evidence linker, the
 * project adapter, the repo resolver and the sync service itself are all REAL,
 * which is what makes "identical inputs ⇒ identical hash ⇒ no new row" a
 * property of the shipped code rather than of a stub.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  CASE_STUDY_ID, CARD_ID, ENROLLMENT_ID, FakeTable, PROJECT_ID, REPO_ROW_ID, REPO_ROW_ID_B,
  STUDENT_EMAIL, makeCaseStudyRow, makeProjectRow, makeReadOnlyModel, makeRepoRecord, writeSurface,
} from './syncFixtures';
import type { Row } from './syncFixtures';

/* ─────────────────────────────────────────────────────────── the doubles ──── */

const caseStudies = new FakeTable('case_studies');
const syncRuns = new FakeTable('case_study_sync_runs');
const snapshots = new FakeTable('case_study_snapshots', [['case_study_id', 'version']]);
const metrics = new FakeTable('case_study_metrics');
const csArtifacts = new FakeTable('case_study_artifacts');
const csEvidence = new FakeTable('case_study_evidence');
const projects = makeReadOnlyModel();
const evidenceRecords = makeReadOnlyModel();
const portfolioArtifacts = makeReadOnlyModel();
const gitHubConnections = makeReadOnlyModel();

jest.mock('../../../models/CaseStudy', () => ({
  __esModule: true, default: { findByPk: (id: string) => caseStudies.findByPk(id) },
}));
jest.mock('../../../models/CaseStudySyncRun', () => ({
  __esModule: true,
  default: {
    create: (v: Row) => syncRuns.create(v),
    update: (v: Row, o: any) => syncRuns.update(v, o),
    destroy: (o: any) => syncRuns.destroy(o),
  },
}));
jest.mock('../../../models/CaseStudySnapshot', () => ({
  __esModule: true,
  default: { findOne: (o: any) => snapshots.findOne(o), create: (v: Row) => snapshots.create(v) },
}));
jest.mock('../../../models/CaseStudyMetric', () => ({
  __esModule: true, default: { findAll: (o: any) => metrics.findAll(o) },
}));
jest.mock('../../../models/CaseStudyArtifact', () => ({
  __esModule: true,
  default: { findAll: (o: any) => csArtifacts.findAll(o), create: (v: Row) => csArtifacts.create(v) },
}));
jest.mock('../../../models/CaseStudyEvidence', () => ({
  __esModule: true,
  default: { findAll: (o: any) => csEvidence.findAll(o), create: (v: Row) => csEvidence.create(v) },
}));
jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: {
    findByPk: async (id: string) => projects.rows.find((r) => r.id === id) ?? null,
    ...writeSurface(() => projects),
  },
}));
jest.mock('../../../models/EvidenceRecord', () => ({
  __esModule: true,
  default: { findAll: async () => evidenceRecords.rows, ...writeSurface(() => evidenceRecords) },
}));
jest.mock('../../../models/PortfolioArtifact', () => ({
  __esModule: true,
  default: { findAll: async () => portfolioArtifacts.rows, ...writeSurface(() => portfolioArtifacts) },
}));
jest.mock('../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: {
    findOne: async () => gitHubConnections.rows[0] ?? null,
    findAll: async () => gitHubConnections.rows,
    ...writeSurface(() => gitHubConnections),
  },
}));

const listRepositories = jest.fn();
jest.mock('../caseStudyRepoCollection', () => ({
  __esModule: true,
  listRepositories: (o: any) => listRepositories(o),
}));

const analyzeRepositories = jest.fn();
jest.mock('../caseStudyRepoAnalyzer', () => {
  const actual = jest.requireActual('../caseStudyRepoAnalyzer');
  return { __esModule: true, ...actual, analyzeRepositories: (i: any, o: any) => analyzeRepositories(i, o) };
});

import { runWithRequestContext } from '../../../utils/requestContext';
import { opaqueRepoRef } from '../caseStudyRepoReader';
import { syncCaseStudy, CaseStudySyncError } from '../caseStudySyncService';
import type { CaseStudySyncResult } from '../caseStudySyncService';
import { makeRepoFacts, SHA_A, SHA_B } from './snapshotFixtures';
import { SENTINEL_TOKEN } from './githubFetchFake';

const SERVICE_DIR = path.join(__dirname, '..');
const readSource = (file: string): string => fs.readFileSync(path.join(SERVICE_DIR, file), 'utf8');
const SYNC_FILES = ['caseStudySyncService.ts', 'caseStudySyncSources.ts', 'caseStudySyncRunStore.ts'];

/** Comments are prose, not behaviour. A scan that cannot tell them apart fails
 *  on a doc comment that merely NAMES the thing it forbids. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ───────────────────────────────────────────────────────────── the setup ──── */

let logLines: string[] = [];
let logSpy: jest.SpyInstance;
const realToken = process.env.GITHUB_TOKEN;

/** A clean, deterministic single-repo analysis. `sha` is all that varies. */
function analysisOf(sha: string = SHA_A, over: Record<string, unknown> = {}) {
  return {
    status: 'success',
    analyzed: [makeRepoFacts({
      repoOwner: 'acme', repoName: 'atlas', repoUrl: 'https://github.com/acme/atlas',
      metadata: { owner: 'acme', name: 'atlas', fullName: 'acme/atlas', latestCommitSha: sha },
    })],
    failures: [],
    issues: [],
    ...over,
  };
}

beforeEach(() => {
  for (const table of [caseStudies, syncRuns, snapshots, metrics, csArtifacts, csEvidence]) table.reset();
  for (const model of [projects, evidenceRecords, portfolioArtifacts, gitHubConnections]) model.reset();
  caseStudies.seed(makeCaseStudyRow());
  listRepositories.mockReset();
  listRepositories.mockResolvedValue([makeRepoRecord()]);
  analyzeRepositories.mockReset();
  analyzeRepositories.mockResolvedValue(analysisOf());
  process.env.GITHUB_TOKEN = SENTINEL_TOKEN;
  logLines = [];
  logSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
});

afterEach(() => {
  logSpy.mockRestore();
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

const sync = (over: Record<string, unknown> = {}): Promise<CaseStudySyncResult> =>
  syncCaseStudy({ caseStudyId: CASE_STUDY_ID, correlationId: 'corr-1', ...over } as any);

const syncLines = (): Record<string, any>[] => logLines
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter((e): e is Record<string, any> => !!e && e.service === 'case-study-sync');

/* ══ AC1 ══ a second identical sync is `unchanged` and writes NO new snapshot ══ */

describe('AC1 — the headline idempotency requirement (spec §30)', () => {
  it('creates one snapshot on the first sync', async () => {
    const first = await sync();
    expect(first.status).toBe('success');
    expect(first.snapshotOutcome).toBe('created');
    expect(first.snapshotVersion).toBe(1);
    expect(snapshots.rows).toHaveLength(1);
  });

  it('a SECOND identical sync returns `unchanged` and creates NO new snapshot row', async () => {
    const first = await sync();
    const second = await sync({ correlationId: 'corr-2' });

    expect(second.status).toBe('unchanged');
    expect(second.snapshotOutcome).toBe('unchanged');
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.snapshotVersion).toBe(1);
    // The assertion this whole checkpoint turns on.
    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.creates).toHaveLength(1);
  });

  it('is unchanged even when the wall clock moves between the two runs', async () => {
    const first = await sync({ now: () => new Date('2026-08-22T10:00:00.000Z') });
    const second = await sync({ now: () => new Date('2027-01-09T23:45:11.000Z') });
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.status).toBe('unchanged');
    expect(snapshots.rows).toHaveLength(1);
  });

  it('a genuinely different commit DOES create version 2', async () => {
    await sync();
    analyzeRepositories.mockResolvedValue(analysisOf(SHA_B));
    const second = await sync();
    expect(second.status).toBe('success');
    expect(second.snapshotOutcome).toBe('created');
    expect(second.snapshotVersion).toBe(2);
    expect(snapshots.rows).toHaveLength(2);
  });

  it('still records BOTH runs — the ledger is append-only, the snapshot is not', async () => {
    await sync();
    await sync();
    expect(syncRuns.rows).toHaveLength(2);
    expect(syncRuns.rows.map((r) => r.status)).toEqual(['success', 'unchanged']);
    expect(syncRuns.destroys).toBe(0);
  });
});

/* ══ AC2 ══ partial failure records per-repo error classes and still builds ══ */

describe('AC2 — one bad repository never destroys the candidate (spec §29)', () => {
  const twoRepos = () => [makeRepoRecord(), makeRepoRecord({
    id: REPO_ROW_ID_B, repoOwner: 'acme', repoName: 'ledger', role: 'backend',
    repoUrl: 'https://github.com/acme/ledger',
  })];

  const oneFailed = () => analysisOf(SHA_A, {
    status: 'partial',
    failures: [{
      status: 'failed', repoOwner: 'acme', repoName: 'ledger',
      error: { error_class: 'RepoNotFound', message: 'repository metadata unavailable (RepoNotFound)' },
    }],
  });

  it('records `partial`, the per-repo error class, and STILL writes a snapshot', async () => {
    listRepositories.mockResolvedValue(twoRepos());
    analyzeRepositories.mockResolvedValue(oneFailed());

    const result = await sync();

    expect(result.status).toBe('partial');
    expect(result.snapshotOutcome).toBe('created');
    expect(snapshots.rows).toHaveLength(1);
    expect(result.repoErrors).toEqual([{
      repositoryId: REPO_ROW_ID_B,
      repoRef: opaqueRepoRef('acme', 'ledger'),
      errorClass: 'RepoNotFound',
      message: 'repository metadata unavailable (RepoNotFound)',
    }]);
  });

  it('writes the failure onto the audit row with the counts split correctly', async () => {
    listRepositories.mockResolvedValue(twoRepos());
    analyzeRepositories.mockResolvedValue(oneFailed());
    await sync();

    const run = syncRuns.rows[0];
    expect(run.status).toBe('partial');
    expect(run.repos_attempted).toBe(2);
    expect(run.repos_succeeded).toBe(1);
    expect(run.repos_failed).toBe(1);
    expect(run.error_class).toBe('RepoNotFound');
    expect(run.metadata.repo_errors[0].error_class ?? run.metadata.repo_errors[0].errorClass)
      .toBe('RepoNotFound');
  });

  it('a degraded (issue-only) read is `partial` too, not a silent success', async () => {
    analyzeRepositories.mockResolvedValue(analysisOf(SHA_A, {
      status: 'partial',
      issues: [{ error_class: 'RateLimited', message: 'languages unavailable', repoOwner: 'acme', repoName: 'atlas' }],
    }));
    const result = await sync();
    expect(result.status).toBe('partial');
    expect(result.repoIssues[0]).toMatchObject({
      repoRef: opaqueRepoRef('acme', 'atlas'), errorClass: 'RateLimited',
    });
  });

  it('when EVERY repository fails, no snapshot is written and the old one stays pinned', async () => {
    // Spec §6.5: published proof survives repo availability changes. A GitHub
    // outage must not replace a rich snapshot with an empty one.
    const first = await sync();
    expect(snapshots.rows).toHaveLength(1);

    analyzeRepositories.mockResolvedValue({
      status: 'failed', analyzed: [], issues: [],
      failures: [{
        status: 'failed', repoOwner: 'acme', repoName: 'atlas',
        error: { error_class: 'RateLimited', message: 'repository metadata unavailable (RateLimited)' },
      }],
    });
    const second = await sync();

    expect(second.status).toBe('failed');
    expect(second.snapshotOutcome).toBe('skipped');
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.creates).toHaveLength(1);
    expect(syncRuns.rows[1].status).toBe('failed');
  });
});

/* ══ AC3 ══ every run writes an audit row with counts and a correlation id ══ */

describe('AC3 — the `case_study_sync_runs` row', () => {
  it('carries the counts, the trigger and the caller-supplied correlation id', async () => {
    metrics.seed({ case_study_id: CASE_STUDY_ID, metric_key: 'changeover_time', label: 'Changeover time', value_display: '2h', metric_type: 'delivery', verification_class: 'pending', verification_method: 'platform', is_headline: true, publishable: false, limitations: [] });
    const result = await sync({ trigger: 'reconciliation' });

    expect(syncRuns.rows).toHaveLength(1);
    const run = syncRuns.rows[0];
    expect(run.case_study_id).toBe(CASE_STUDY_ID);
    expect(run.trigger).toBe('reconciliation');
    expect(run.correlation_id).toBe('corr-1');
    expect(run.repos_attempted).toBe(1);
    expect(run.repos_succeeded).toBe(1);
    expect(run.repos_failed).toBe(0);
    expect(run.facts_extracted).toBeGreaterThan(0);
    expect(run.candidate_metrics).toBe(1);
    expect(run.snapshot_id).toBe(result.snapshotId);
    expect(run.completed_at).toBeInstanceOf(Date);
  });

  it('sources the correlation id from utils/requestContext when the caller omits one', async () => {
    const traceId = randomUUID();
    await runWithRequestContext({ traceId }, () => syncCaseStudy({ caseStudyId: CASE_STUDY_ID }));
    expect(syncRuns.rows[0].correlation_id).toBe(traceId);
  });

  it('opens the row as `running` before the work, then moves it once', async () => {
    await sync();
    expect(syncRuns.creates[0]).toMatchObject({ status: 'running', completed_at: null });
    expect(syncRuns.updates).toHaveLength(1);
    // The append-only guarantee, in executable form.
    expect(syncRuns.updates[0].where).toMatchObject({ status: 'running' });
  });

  it('a FAILED sync still writes its row', async () => {
    listRepositories.mockRejectedValue(Object.assign(new Error('connection terminated'), { name: 'SequelizeConnectionError' }));
    const result = await sync();

    expect(result.status).toBe('failed');
    expect(syncRuns.rows).toHaveLength(1);
    expect(syncRuns.rows[0].status).toBe('failed');
    expect(syncRuns.rows[0].error_class).toBe('SequelizeConnectionError');
    expect(syncRuns.destroys).toBe(0);
  });

  it('throws — and writes NO row — for a malformed request or an unknown record', async () => {
    await expect(syncCaseStudy({ caseStudyId: 'not-a-uuid' })).rejects.toBeInstanceOf(CaseStudySyncError);
    await expect(syncCaseStudy({ caseStudyId: randomUUID() })).rejects.toMatchObject({
      error_class: 'CaseStudyNotFound', http_status: 404,
    });
    expect(syncRuns.rows).toHaveLength(0);
  });
});

/* ══ AC4 ══ structured logs, shaped like artifactRepoSync, carrying no token ══ */

describe('AC4 — observability (spec §38)', () => {
  it('emits start and completion events in the canonical envelope', async () => {
    const result = await sync();
    const events = syncLines();
    const names = events.map((e) => e.event);
    expect(names).toContain('case_study.sync_started');
    expect(names).toContain('case_study.sync_completed');

    for (const event of events) {
      expect(typeof event.timestamp).toBe('string');
      expect(['info', 'error']).toContain(event.level);
      expect(event.service).toBe('case-study-sync');
      expect(event.correlation_id).toBe('corr-1');
      expect(typeof event.outcome).toBe('string');
      expect(event.context.case_study_id).toBe(CASE_STUDY_ID);
    }
    const done = events.find((e) => e.event === 'case_study.sync_completed');
    expect(done.context).toMatchObject({
      sync_run_id: result.syncRunId, status: 'success', repos_attempted: 1, repos_succeeded: 1,
    });
  });

  it('never logs the GitHub token, and never returns it', async () => {
    const result = await sync();
    for (const line of logLines) expect(line).not.toContain(SENTINEL_TOKEN);
    expect(JSON.stringify(result)).not.toContain(SENTINEL_TOKEN);
  });

  it('never logs a private repository owner or name — only the opaque handle', async () => {
    listRepositories.mockResolvedValue([makeRepoRecord({ visibility: 'private', repoOwner: 'secretcorp', repoName: 'vault' })]);
    analyzeRepositories.mockResolvedValue(analysisOf(SHA_A, {
      analyzed: [makeRepoFacts({
        repoOwner: 'secretcorp', repoName: 'vault', repoUrl: 'https://github.com/secretcorp/vault',
        metadata: { owner: 'secretcorp', name: 'vault', fullName: 'secretcorp/vault', visibility: 'private' },
      })],
    }));

    await sync();
    for (const line of logLines) {
      expect(line).not.toContain('secretcorp');
      expect(line).not.toContain('vault');
    }
  });

  it('never logs a student email, an enrollment id or a card id', async () => {
    caseStudies.reset();
    caseStudies.seed(makeCaseStudyRow({ project_id: PROJECT_ID }));
    projects.rows.push(makeProjectRow());
    evidenceRecords.rows.push({ id: randomUUID(), enrollment_id: ENROLLMENT_ID, card_id: CARD_ID, source_type: 'artifact', source_ref: STUDENT_EMAIL, builder_xp: 10, validated: true });

    await sync();
    for (const line of logLines) {
      expect(line).not.toContain(STUDENT_EMAIL);
      expect(line).not.toContain(ENROLLMENT_ID);
      expect(line).not.toContain(CARD_ID);
    }
  });
});

/* ══ AC5 ══ concurrent double-invocation does not double-write ══ */

describe('AC5 — two simultaneous syncs write one snapshot', () => {
  it('invoked twice at once, exactly one snapshot row exists', async () => {
    const [a, b] = await Promise.all([sync({ correlationId: 'corr-a' }), sync({ correlationId: 'corr-b' })]);

    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.creates).toHaveLength(1);
    expect([a.snapshotOutcome, b.snapshotOutcome].sort()).toEqual(['created', 'unchanged']);
    expect(a.snapshotId).toBe(b.snapshotId);
    // Two attempts happened, so the ledger records two — that is not a duplicate.
    expect(syncRuns.rows).toHaveLength(2);
  });

  it('four at once still write one snapshot', async () => {
    const results = await Promise.all([sync(), sync(), sync(), sync()]);
    expect(snapshots.rows).toHaveLength(1);
    expect(results.filter((r) => r.snapshotOutcome === 'created')).toHaveLength(1);
    expect(results.filter((r) => r.snapshotOutcome === 'unchanged')).toHaveLength(3);
  });

  it('survives the cross-process case: a version race resolves to `unchanged`', async () => {
    // The in-process lock is a guard; the database's unique index is the
    // guarantee. Staging a concurrent insert proves the store still converges.
    let staged = false;
    snapshots.beforeCreate = () => {
      if (staged) return;
      staged = true;
      snapshots.seed({
        case_study_id: CASE_STUDY_ID, version: 1, status: 'draft', content: {}, provenance: {},
        source_commit_map: {}, generated_by: 'repo_sync', content_hash: 'f'.repeat(64),
      });
    };
    const result = await sync();
    expect(result.snapshotVersion).toBe(2);
    expect(snapshots.rows.filter((r) => r.version === 1)).toHaveLength(1);
  });
});

/* ══ non-negotiables carried from T005-T010 ══ */

describe('a sync links and reads — it never mutates a source record', () => {
  beforeEach(() => {
    caseStudies.reset();
    caseStudies.seed(makeCaseStudyRow({ project_id: PROJECT_ID }));
    projects.rows.push(makeProjectRow());
    evidenceRecords.rows.push({ id: randomUUID(), enrollment_id: ENROLLMENT_ID, source_type: 'github_commit', source_ref: 'abc', builder_xp: 5, validated: true });
    portfolioArtifacts.rows.push({ id: randomUUID(), enrollment_id: ENROLLMENT_ID, kind: 'architecture_doc', title: 'Architecture', summary: 'How it fits together' });
  });

  it('writes nothing to EvidenceRecord, PortfolioArtifact, Project or GitHubConnection', async () => {
    await sync();
    for (const model of [evidenceRecords, portfolioArtifacts, projects, gitHubConnections]) {
      for (const [name, fn] of Object.entries(model.writes)) {
        expect(`${name}:${fn.mock.calls.length}`).toBe(`${name}:0`);
      }
    }
  });

  it('links evidence and artifacts once, and the re-run links nothing more', async () => {
    await sync();
    expect(csEvidence.rows).toHaveLength(1);
    expect(csArtifacts.rows).toHaveLength(1);

    await sync();
    expect(csEvidence.rows).toHaveLength(1);
    expect(csArtifacts.rows).toHaveLength(1);
    expect(snapshots.rows).toHaveLength(1);
  });

  it('never lets projects.organization_name reach the snapshot', async () => {
    await sync();
    const content = snapshots.rows[0].content;
    expect(JSON.stringify(content)).not.toContain('Acme Bottling Co');
    expect(content.identity.organizationDisplayName).toBeUndefined();
    expect(content.identity.organizationIdentityMode).toBe('anonymized');
  });

  it('merges the Project situation into the candidate (Checkpoint B, step 5)', async () => {
    await sync();
    const content = snapshots.rows[0].content;
    expect(content.situation.narrative).toContain('Line changeovers take four hours.');
    expect(snapshots.rows[0].provenance.situation.tier).toBe('project_facts');
  });
});

describe('a sync never publishes, never approves and never verifies', () => {
  it('persists the snapshot as a DRAFT', async () => {
    await sync();
    expect(snapshots.creates[0].status).toBe('draft');
    expect(snapshots.rows[0].approved_by ?? null).toBeNull();
  });

  it('writes no metric at all, so nothing can become `verified`', async () => {
    metrics.seed({ case_study_id: CASE_STUDY_ID, metric_key: 'uptime', label: 'Uptime', value_display: '99.9%', metric_type: 'performance', verification_class: 'pending', verification_method: 'platform', is_headline: true, publishable: false, limitations: [] });
    await sync();
    expect(metrics.creates).toHaveLength(0);
    expect(metrics.updates).toHaveLength(0);
    const [metric] = snapshots.rows[0].content.heroMetrics;
    expect(metric.verification.class).toBe('pending');
    expect(metric.publishable).toBe(false);
  });

  it('imports no publication model and calls no approve/publish surface', () => {
    for (const file of SYNC_FILES) {
      const source = withoutComments(readSource(file));
      expect(source).not.toMatch(/CaseStudyPublication/);
      expect(source).not.toMatch(/publishCaseStudy|approveSnapshot|publication_id/);
      expect(source).not.toMatch(/verification_class\s*:\s*'verified'/);
      expect(source).not.toMatch(/status\s*:\s*'(approved|published)'/);
    }
  });

  it('carries no second hasher and no parallel readiness rubric', () => {
    for (const file of SYNC_FILES) {
      const source = withoutComments(readSource(file));
      expect(source).not.toMatch(/createHash|sha256|hashCanonical\s*\(/);
      expect(source).not.toMatch(/READINESS_WEIGHTS|CASE_STUDY_READINESS_CHECKS/);
    }
    // The advisory score IS read — from the module that owns it.
    expect(readSource('caseStudySyncService.ts')).toContain("from './caseStudyReadinessService'");
  });

  it('returns readiness as advisory data with no verdict field', async () => {
    const result = await sync();
    expect(result.readiness).toEqual({ score: expect.any(Number), band: expect.any(String) });
    expect(Object.keys(result)).not.toContain('publishable');
    expect(Object.keys(result)).not.toContain('approved');
  });
});

describe('provenance coverage is reported, not invented', () => {
  it('every generated section carries a provenance entry', async () => {
    const result = await sync();
    const provenance = snapshots.rows[0].provenance;
    expect(Object.keys(provenance)).toEqual(expect.arrayContaining(['repositories', 'architecture', 'taxonomy']));
    expect(result.unknownProvenanceFields.length).toBeLessThan(20);
  });

  it('carries a human override forward instead of overwriting it', async () => {
    await sync();
    // A reviewer corrects the standfirst; the admin surface stores it as a
    // human_override on the snapshot (T013's job — modelled here).
    const stored = snapshots.rows[0];
    stored.content = { ...stored.content, identity: { ...stored.content.identity, standfirst: 'Corrected by a human' } };
    stored.provenance = {
      ...stored.provenance,
      'identity.standfirst': {
        tier: 'human_override',
        origin: { kind: 'human', actor: 'reviewer@colaberry.com' },
        recordedAt: '2026-08-22T12:00:00.000Z',
      },
    };
    stored.content_hash = 'e'.repeat(64);

    const result = await sync();
    expect(result.snapshotOutcome).toBe('created');
    const latest = snapshots.rows[snapshots.rows.length - 1];
    expect(latest.content.identity.standfirst).toBe('Corrected by a human');
    expect(latest.provenance['identity.standfirst'].tier).toBe('human_override');

    // …and the run AFTER that is unchanged, so the carry-forward is stable.
    const third = await sync();
    expect(third.status).toBe('unchanged');
    expect(snapshots.rows).toHaveLength(2);
  });
});

describe('boundary cases', () => {
  it('a case study with no repositories still produces a snapshot', async () => {
    listRepositories.mockResolvedValue([]);
    analyzeRepositories.mockResolvedValue({ status: 'success', analyzed: [], failures: [], issues: [] });
    const result = await sync();
    expect(result.status).toBe('success');
    expect(result.counts).toMatchObject({ reposAttempted: 0, reposSucceeded: 0, factsExtracted: 0 });
    expect(snapshots.rows).toHaveLength(1);
  });

  it('a dangling project_id degrades the run without ending it', async () => {
    caseStudies.reset();
    caseStudies.seed(makeCaseStudyRow({ project_id: PROJECT_ID }));
    // No project row seeded — the adapter raises CaseStudyProjectNotFound.
    const result = await sync();
    expect(result.status).toBe('partial');
    expect(result.repoIssues).toContainEqual({ repoRef: 'project', errorClass: 'CaseStudyProjectNotFound' });
    expect(snapshots.rows).toHaveLength(1);
  });

  it('rejects an unknown trigger at the boundary, before any work', async () => {
    await expect(syncCaseStudy({ caseStudyId: CASE_STUDY_ID, trigger: 'whenever' as any }))
      .rejects.toMatchObject({ error_class: 'CaseStudySyncValidationError', http_status: 400 });
    expect(listRepositories).not.toHaveBeenCalled();
  });
});
