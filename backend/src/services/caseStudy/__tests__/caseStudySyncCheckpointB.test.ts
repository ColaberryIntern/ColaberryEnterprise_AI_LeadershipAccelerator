/**
 * Checkpoint B demonstration — T011's blocking gate.
 *
 * The spec asks for ONE test that walks the whole chain rather than nine that
 * each prove a link:
 *
 *   several repositories → one Case Study candidate → repositories have roles →
 *   stack is detected → existing Project facts merge → evidence and artifacts
 *   link → a draft snapshot is created → every important fact has a provenance
 *   path → a SECOND identical sync is unchanged
 *
 * WHAT IS REAL HERE, AND WHY IT MATTERS. Part 1
 * (`caseStudySyncService.test.ts`) doubles `analyzeRepositories` so failures can
 * be staged precisely. This file does NOT: the analyzer, the fact extractors,
 * the dependency signatures, the manifest reader, the snapshot builder, the
 * store, the provenance merge and the readiness rubric all run for real, and the
 * only seam is `fetchImpl` — the same injection point `caseStudyRepoAnalyzer`'s
 * own suites use. "Stack is detected" therefore means the shipped extractor read
 * a real `package.json` body out of a real GitHub payload shape, not that a stub
 * returned the word `Express`.
 *
 * NO DATABASE, NO NETWORK. Models are mocked and `globalThis.fetch` is replaced
 * with a THROWING double that is asserted untouched, so the suite runs under
 * `jest.ci.config.ts` with `DATABASE_URL` unset.
 */
import { randomUUID } from 'crypto';
import {
  CASE_STUDY_ID, ENROLLMENT_ID, FakeTable, PROJECT_ID, REPO_ROW_ID_B,
  makeCaseStudyRow, makeProjectRow, makeReadOnlyModel, makeRepoRecord, writeSurface,
} from './syncFixtures';
import type { Row } from './syncFixtures';

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
  default: { create: (v: Row) => syncRuns.create(v), update: (v: Row, o: any) => syncRuns.update(v, o) },
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
    findOne: async () => null, findAll: async () => [], ...writeSurface(() => gitHubConnections),
  },
}));

const listRepositories = jest.fn();
jest.mock('../caseStudyRepoCollection', () => ({
  __esModule: true, listRepositories: (o: any) => listRepositories(o),
}));

import { syncCaseStudy } from '../caseStudySyncService';
import { describeSnapshotProvenance } from '../caseStudyProvenance';
import { makeGitHubFake, json, fileReply, notFound, repoPayload, treePayload, SENTINEL_TOKEN } from './githubFetchFake';

/* ─────────────────────────────────────────── the two repositories, on GitHub ─ */

const ATLAS_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const LEDGER_SHA = 'b1c2d3e4f5061728394a5b6c7d8e9f0123456789';

const ATLAS_TREE = treePayload([
  { path: 'package.json', type: 'blob', size: 400 },
  { path: 'README.md', type: 'blob', size: 900 },
  { path: 'CLAUDE.md', type: 'blob', size: 500 },
  { path: 'case-study.json', type: 'blob', size: 400 },
  { path: 'docs/architecture.md', type: 'blob', size: 700 },
  { path: '.github/workflows/ci.yml', type: 'blob', size: 200 },
  { path: 'Dockerfile', type: 'blob', size: 150 },
  { path: 'src/agents/planner.ts', type: 'blob', size: 2000 },
  { path: 'tests/planner.test.ts', type: 'blob', size: 800 },
]);

const LEDGER_TREE = treePayload([
  { path: 'requirements.txt', type: 'blob', size: 120 },
  { path: 'README.md', type: 'blob', size: 400 },
  { path: 'src/app.py', type: 'blob', size: 1500 },
  { path: 'tests/test_app.py', type: 'blob', size: 600 },
]);

const PACKAGE_JSON = JSON.stringify({
  name: 'atlas',
  dependencies: { express: '^4.19.0', react: '^18.3.0', pg: '^8.11.0', openai: '^4.55.0' },
  devDependencies: { jest: '^29.7.0' },
});

const REQUIREMENTS_TXT = 'fastapi==0.111.0\npsycopg2-binary==2.9.9\nanthropic==0.34.0\n';

const CASE_STUDY_MANIFEST = JSON.stringify({
  schema_version: 1,
  classification: { capabilities: ['changeover-copilot'], stack: ['Temporal'] },
  built_by: { type: 'learner', program: 'Enterprise AI Accelerator' },
  outcomes: [{
    key: 'changeover_time', label: 'Changeover time', value_display: '2h',
    verification_method: 'self',
  }],
});

const FILES: Record<string, string> = {
  'package.json': PACKAGE_JSON,
  'requirements.txt': REQUIREMENTS_TXT,
  'case-study.json': CASE_STUDY_MANIFEST,
  'README.md': '# Atlas\n\nA changeover copilot for a bottling line.',
  'CLAUDE.md': '# Agent rules\n\nDeterministic execution.',
  'docs/architecture.md': '# Architecture\n\nPlanner, executor, ledger.',
  '.github/workflows/ci.yml': 'name: ci\n',
  Dockerfile: 'FROM node:20\n',
};

/** Repos are analysed sequentially, so an odd attempt is atlas and an even one ledger. */
const perRepo = <T>(atlas: T, ledger: T) => (attempt: number): T => (attempt % 2 === 1 ? atlas : ledger);

const gitHub = () => makeGitHubFake({
  repo: perRepo(
    json(repoPayload({ name: 'atlas', full_name: 'acme/atlas', owner: { login: 'acme' } })),
    json(repoPayload({
      name: 'ledger', full_name: 'acme/ledger', owner: { login: 'acme' },
      description: 'Changeover ledger', language: 'Python',
    })),
  ),
  commits: perRepo(json([{ sha: ATLAS_SHA }]), json([{ sha: LEDGER_SHA }])),
  languages: perRepo(json({ TypeScript: 90_000 }), json({ Python: 40_000 })),
  tree: perRepo(json(ATLAS_TREE), json(LEDGER_TREE)),
  file: (p: string) => (FILES[p] ? fileReply(FILES[p]) : notFound()),
});

/* ────────────────────────────────────────────────────────────────── setup ──── */

let logSpy: jest.SpyInstance;
let globalFetch: jest.Mock;
const realGlobalFetch = (globalThis as Record<string, unknown>).fetch;
const realToken = process.env.GITHUB_TOKEN;

beforeEach(() => {
  for (const table of [caseStudies, syncRuns, snapshots, metrics, csArtifacts, csEvidence]) table.reset();
  for (const model of [projects, evidenceRecords, portfolioArtifacts, gitHubConnections]) model.reset();

  caseStudies.seed(makeCaseStudyRow({ project_id: PROJECT_ID }));
  projects.rows.push(makeProjectRow());
  evidenceRecords.rows.push({
    id: randomUUID(), enrollment_id: ENROLLMENT_ID, source_type: 'github_commit',
    source_ref: 'https://github.com/acme/atlas/commit/a1b2c3d', builder_xp: 25, validated: true,
  });
  portfolioArtifacts.rows.push({
    id: randomUUID(), enrollment_id: ENROLLMENT_ID, kind: 'architecture_doc',
    title: 'Changeover architecture', summary: 'Planner, executor, ledger.',
  });
  metrics.seed({
    case_study_id: CASE_STUDY_ID, metric_key: 'changeover_time', label: 'Changeover time',
    value_display: '2h 04m', numeric_value: 124, unit: 'minutes', metric_type: 'delivery',
    verification_class: 'pending', verification_method: 'platform', is_headline: true,
    publishable: false, limitations: ['single line'], baseline: '4h 10m', sample: '18 changeovers',
  });

  listRepositories.mockReset();
  listRepositories.mockResolvedValue([
    makeRepoRecord(),
    makeRepoRecord({
      id: REPO_ROW_ID_B, repoOwner: 'acme', repoName: 'ledger', role: 'backend',
      repoUrl: 'https://github.com/acme/ledger', allowPublicRepoLink: false,
    }),
  ]);

  process.env.GITHUB_TOKEN = SENTINEL_TOKEN;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  globalFetch = jest.fn(() => { throw new Error('globalThis.fetch was called — the fetchImpl seam was bypassed'); });
  (globalThis as Record<string, unknown>).fetch = globalFetch;
});

afterEach(() => {
  expect(globalFetch).not.toHaveBeenCalled();
  (globalThis as Record<string, unknown>).fetch = realGlobalFetch;
  logSpy.mockRestore();
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

const MANIFESTS = { 'acme/atlas': CASE_STUDY_MANIFEST };

/* ══════════════════════════════ the chain ══════════════════════════════════ */

describe('Checkpoint B — several repos to one idempotent candidate', () => {
  it('walks the whole chain, then repeats itself exactly', async () => {
    const fake = gitHub();
    const first = await syncCaseStudy({
      caseStudyId: CASE_STUDY_ID, trigger: 'manual', correlationId: 'checkpoint-b',
      fetchImpl: fake.impl, manifestContents: MANIFESTS,
    });

    /* 1 — several repositories become ONE candidate ---------------------- */
    expect(first.status).toBe('success');
    expect(first.counts).toMatchObject({ reposAttempted: 2, reposSucceeded: 2, reposFailed: 0 });
    expect(snapshots.rows).toHaveLength(1);
    const content = snapshots.rows[0].content;
    expect(content.repositories).toHaveLength(2);

    /* 2 — repositories carry their roles --------------------------------- */
    const roles = Object.fromEntries(content.repositories.map((r: any) => [r.repoName, r.role]));
    expect(roles).toEqual({ atlas: 'primary', ledger: 'backend' });
    // The consent flag rides along per repository, not per Case Study.
    const byName = Object.fromEntries(content.repositories.map((r: any) => [r.repoName, r]));
    expect(byName.atlas.allowPublicRepoLink).toBe(true);
    expect(byName.ledger.allowPublicRepoLink).toBe(false);
    expect(byName.atlas.lastSeenSha).toBe(ATLAS_SHA);
    expect(byName.ledger.lastSeenSha).toBe(LEDGER_SHA);

    /* 3 — the stack is DETECTED, from real manifest bodies ---------------- */
    expect(content.architecture.stack).toEqual(expect.arrayContaining([
      'Express', 'React', 'FastAPI', 'Python', 'TypeScript',
    ]));
    expect(content.architecture.dataStores).toEqual(expect.arrayContaining(['PostgreSQL']));
    expect(content.architecture.integrations).toEqual(
      expect.arrayContaining(['OpenAI SDK', 'Anthropic SDK']),
    );
    // …and the manifest's declared stack merges in beside the extracted one.
    expect(content.taxonomy.stack).toEqual(expect.arrayContaining(['Temporal']));

    /* 4 — existing Project facts merge ------------------------------------ */
    expect(content.situation.narrative).toContain('Line changeovers take four hours.');
    expect(content.situation.goals).toContain('Cut changeover time in half.');
    expect(content.identity.summary).toBe('A copilot for the bottling line.');
    // The organisation the student typed at intake is NOT publishable.
    expect(JSON.stringify(content)).not.toContain('Acme Bottling Co');

    /* 5 — evidence and artifacts link ------------------------------------- */
    expect(csEvidence.rows).toHaveLength(1);
    expect(csEvidence.rows[0]).toMatchObject({
      verification_class: 'pending', is_publicly_openable: false,
    });
    expect(csArtifacts.rows).toHaveLength(1);
    expect(csArtifacts.rows[0]).toMatchObject({ status: 'candidate', visibility: 'private' });
    expect(content.artifacts[0]).toMatchObject({
      title: 'Changeover architecture', status: 'candidate', visibility: 'private',
    });

    /* 6 — a DRAFT snapshot, never an approved one ------------------------- */
    expect(snapshots.creates[0].status).toBe('draft');
    expect(first.snapshotOutcome).toBe('created');
    expect(first.snapshotVersion).toBe(1);
    // The manifest outcome landed as a candidate metric, not a published figure.
    const outcome = content.measurement.metrics.find((m: any) => m.key === 'changeover_time');
    expect(outcome).toMatchObject({ publishable: false });
    expect(outcome.verification.class).toBe('pending');

    /* 7 — every important fact has a provenance path ---------------------- */
    const provenance = snapshots.rows[0].provenance;
    const covered = describeSnapshotProvenance(content, provenance);
    const uncovered = covered.filter((f) => f.tier === 'unknown').map((f) => f.path);
    expect(uncovered).toEqual([]);
    expect(provenance.repositories.tier).toBe('repo_extraction');
    expect(provenance.taxonomy.tier).toBe('repo_manifest');
    expect(provenance.situation.tier).toBe('project_facts');
    expect(first.unknownProvenanceFields).toEqual([]);

    /* 8 — a second IDENTICAL sync is unchanged ---------------------------- */
    const second = await syncCaseStudy({
      caseStudyId: CASE_STUDY_ID, trigger: 'manual', correlationId: 'checkpoint-b-2',
      fetchImpl: gitHub().impl, manifestContents: MANIFESTS,
    });

    expect(second.status).toBe('unchanged');
    expect(second.snapshotOutcome).toBe('unchanged');
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(snapshots.rows).toHaveLength(1);
    expect(snapshots.creates).toHaveLength(1);
    // Two attempts, two audit rows. That is the ledger being honest, not a duplicate.
    expect(syncRuns.rows).toHaveLength(2);
    expect(syncRuns.rows.map((r) => r.status)).toEqual(['success', 'unchanged']);
    // Nothing linked twice either.
    expect(csEvidence.rows).toHaveLength(1);
    expect(csArtifacts.rows).toHaveLength(1);
  });

  it('records the readiness score as advisory data and nothing more', async () => {
    const result = await syncCaseStudy({
      caseStudyId: CASE_STUDY_ID, fetchImpl: gitHub().impl, manifestContents: MANIFESTS,
    });
    expect(result.readiness).toEqual({ score: expect.any(Number), band: expect.any(String) });
    expect(result.readiness!.score).toBeGreaterThan(0);
    expect(syncRuns.rows[0].metadata.readiness).toEqual(result.readiness);
    // The record is still a draft; readiness authorised nothing.
    expect(caseStudies.rows[0].status).toBe('draft');
    expect(snapshots.rows[0].status).toBe('draft');
  });

  it('the GitHub token never reaches the snapshot, the run row or the result', async () => {
    const result = await syncCaseStudy({
      caseStudyId: CASE_STUDY_ID, fetchImpl: gitHub().impl, manifestContents: MANIFESTS,
    });
    expect(JSON.stringify(result)).not.toContain(SENTINEL_TOKEN);
    expect(JSON.stringify(snapshots.rows)).not.toContain(SENTINEL_TOKEN);
    expect(JSON.stringify(syncRuns.rows)).not.toContain(SENTINEL_TOKEN);
  });
});
