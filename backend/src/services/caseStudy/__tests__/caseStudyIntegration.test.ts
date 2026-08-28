/**
 * Case Study OS — the INTEGRATION suite. Spec §40, plan T020.
 *
 * The nineteen tasks before this one each shipped with unit coverage, and every
 * one of those suites doubles the seam directly below the module it tests. What
 * no test proved is that the modules agree with EACH OTHER: that a repository
 * collection produces a snapshot, that the snapshot survives approval and the
 * publish gate, that publication pins a version, and that the public HTTP API
 * serves that pinned version and nothing else. That seam is what this file
 * exercises, scenario by scenario, in the order spec §40 lists them.
 *
 * ── WHAT IS REAL ────────────────────────────────────────────────────────────
 *
 * `attachRepository`, `listRepositories`, the repository analyzer, the fact
 * extractors, the dependency signatures, the project adapter, the evidence
 * linker, the snapshot builder, the snapshot store, the provenance merge, the
 * readiness rubric, the sync conductor, `approveSnapshot`, the publish gate,
 * `publishCaseStudy`, the public store, the filter engine, the projection and
 * the Express router are ALL the shipped code. Two things are doubled: the
 * DATABASE (`integrationHarness.ts`, which honours the unique indexes and the
 * `where` clauses the real DDL declares) and GITHUB (through the
 * `fetchImpl` seam the analyzer already exposes). `globalThis.fetch` is replaced
 * with a throwing double and asserted untouched, so "we injected a seam" is a
 * proof rather than a claim.
 *
 * ── NO DATABASE, SO IT RUNS IN CI ───────────────────────────────────────────
 *
 * T020 AC8. CI provisions no Postgres and sets no `DATABASE_URL`, and
 * `jest.ci.config.ts` is an IGNORE-list: a suite that needs a database ends up
 * on it and then never runs again. The last test in this file reads that config
 * and asserts this suite is not on it, because "it runs in CI" is exactly the
 * kind of claim that stops being true six months after somebody writes it in a
 * comment. Real-database coverage is T021's job, deliberately as a script.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { makeIntegrationDb, resetIntegrationDb } from './integrationHarness';
import type { IntegrationDb, Row } from './integrationHarness';
import {
  APP_SHA, APP_SHA_V2, ENROLLMENT_ID, INTAKE_ORGANIZATION, PACKAGE_JSON_V2,
  PROJECT_ID, PROJECT_VARIABLES_BLOB, STUDENT_EMAIL, appRepo, evalRepo,
  makeRepoGitHub, seedConnection, seedEvidenceRecord, seedPortfolioArtifact,
  seedProject, seedPublishableMetric, serviceRepo,
} from './integrationFixtures';
import type { RepoScript } from './integrationFixtures';
import { SENTINEL_TOKEN } from './githubFetchFake';

const db: IntegrationDb = makeIntegrationDb();

jest.mock('../../../config/database', () => ({
  __esModule: true,
  sequelize: { transaction: (fn: (t: unknown) => unknown) => fn({ id: 'integration-tx' }) },
}));
jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: db.studies.asModel() }));
jest.mock('../../../models/CaseStudySnapshot', () => ({ __esModule: true, default: db.snapshots.asModel() }));
jest.mock('../../../models/CaseStudySyncRun', () => ({ __esModule: true, default: db.syncRuns.asModel() }));
jest.mock('../../../models/CaseStudyMetric', () => ({ __esModule: true, default: db.metrics.asModel() }));
jest.mock('../../../models/CaseStudyArtifact', () => ({ __esModule: true, default: db.artifacts.asModel() }));
jest.mock('../../../models/CaseStudyEvidence', () => ({ __esModule: true, default: db.evidence.asModel() }));
jest.mock('../../../models/CaseStudyRepoCollection', () => ({ __esModule: true, default: db.repoCollections.asModel() }));
jest.mock('../../../models/CaseStudyRepository', () => ({ __esModule: true, default: db.repositories.asModel() }));
jest.mock('../../../models/CaseStudyPublication', () => ({ __esModule: true, default: db.publications.asModel() }));
jest.mock('../../../models/CaseStudyCollection', () => ({ __esModule: true, default: db.savedCollections.asModel() }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: db.projects.asModel() }));
jest.mock('../../../models/GitHubConnection', () => ({ __esModule: true, default: db.connections.asModel() }));
jest.mock('../../../models/EvidenceRecord', () => ({ __esModule: true, default: db.evidenceRecords.asModel() }));
jest.mock('../../../models/PortfolioArtifact', () => ({ __esModule: true, default: db.portfolioArtifacts.asModel() }));

import { attachRepository } from '../caseStudyRepoCollection';
import { createCaseStudyFromProject, createCaseStudyFromRepoCollection } from '../caseStudyAdminService';
import { approveSnapshot } from '../caseStudyAdminReview';
import { syncCaseStudy } from '../caseStudySyncService';
import { isCaseStudyPublicationError, publishCaseStudy } from '../caseStudyPublicationService';
import publicCaseStudyRoutes from '../../../routes/publicCaseStudyRoutes';

const ACTOR = 'ali@colaberry.com';
const LIST = '/api/public/case-studies';
const app = express().use(publicCaseStudyRoutes);

/* ───────────────────────────────────────────────────────────────── setup ──── */

let logSpy: jest.SpyInstance;
let globalFetch: jest.Mock;
const realGlobalFetch = (globalThis as Record<string, unknown>).fetch;
const realToken = process.env.GITHUB_TOKEN;

beforeEach(() => {
  resetIntegrationDb(db);
  process.env.GITHUB_TOKEN = SENTINEL_TOKEN;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  globalFetch = jest.fn(() => {
    throw new Error('globalThis.fetch was called — the fetchImpl seam was bypassed');
  });
  (globalThis as Record<string, unknown>).fetch = globalFetch;
});

afterEach(() => {
  expect(globalFetch).not.toHaveBeenCalled();
  (globalThis as Record<string, unknown>).fetch = realGlobalFetch;
  logSpy.mockRestore();
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

/** No source table may be written by anything in this feature. */
const assertSourcesUnwritten = (): void => {
  for (const model of [db.projects, db.connections, db.evidenceRecords, db.portfolioArtifacts]) {
    expect(model.writeAttempts).toEqual([]);
  }
};

const sync = (caseStudyId: string, scripts: readonly RepoScript[], correlationId = 'integration') =>
  syncCaseStudy({ caseStudyId, trigger: 'manual', correlationId, fetchImpl: makeRepoGitHub(scripts).impl });

const consented = (over: Row = {}): Row => ({
  slug: 'bottling-line-copilot',
  title: 'Bottling line copilot',
  status: 'draft',
  source_type: 'repo_collection',
  visibility: 'anonymized',
  project_id: null,
  canonical_summary: 'A copilot that walks operators through a changeover.',
  industry: 'manufacturing',
  primary_capability: 'agents',
  program_key: 'enterprise-accelerator',
  built_by_type: 'learner',
  organization_display_name: null,
  organization_is_anonymized: true,
  organization_identity_mode: 'anonymized',
  organization_naming_consent: false,
  builder_identity_mode: 'role_only',
  builder_naming_consent: false,
  archived_at: null,
  ...over,
});

/**
 * The reference record, taken all the way to APPROVED: a consented Case Study,
 * one public repository the admin cleared for linking, and one genuinely
 * publishable metric. Each negative scenario below breaks exactly ONE thing
 * about it, so a refusal names the rule that fired.
 */
async function approvedRecord(
  scripts: readonly RepoScript[] = [appRepo()],
  over: { study?: Row; metric?: Row } = {},
): Promise<{ caseStudyId: string; snapshotId: string }> {
  const study = db.studies.seed(consented(over.study));
  await attachRepository({
    caseStudyId: study.id,
    reference: `https://github.com/${scripts[0].owner}/${scripts[0].repo}`,
    role: 'primary',
    visibility: 'public',
    allowPublicRepoLink: true,
  });
  seedPublishableMetric(db, study.id, over.metric);
  const run = await sync(study.id, scripts);
  expect(run.snapshotId).toBeTruthy();
  await approveSnapshot({ caseStudyId: study.id, snapshotId: run.snapshotId as string, actor: ACTOR });
  return { caseStudyId: study.id, snapshotId: run.snapshotId as string };
}

const detailUrl = (slug = 'bottling-line-copilot') => `${LIST}/${slug}`;

/* ═══════════════════════════════════ 1 ═══ existing Project ⇒ one draft ═════ */

describe('§40 — Project + GitHubConnection + EvidenceRecord + PortfolioArtifact = one draft', () => {
  it('assembles one Case Study candidate from the four platform records', async () => {
    seedProject(db);
    seedConnection(db);
    seedEvidenceRecord(db);
    seedPortfolioArtifact(db);

    const created = await createCaseStudyFromProject({ projectId: PROJECT_ID, actor: ACTOR });

    // ONE candidate, born draft, linked to the Project.
    expect(db.studies.rows).toHaveLength(1);
    expect(created.caseStudy).toMatchObject({ status: 'draft', sourceType: 'project', projectId: PROJECT_ID });
    expect(created.warnings).toEqual([]);

    // The repository came from `github_connections`. `projects.github_repo_url`
    // is null in the fixture, which is the production reality the resolver
    // exists for, so a regression that read the column reports "no repository".
    expect(created.repositories).toHaveLength(1);
    expect(created.repositories[0]).toMatchObject({ repoOwner: 'acme', repoName: 'atlas', role: 'primary' });
    expect(db.projects.rows[0].github_repo_url).toBeNull();

    // Evidence and artifacts linked as CANDIDATES, never as verified proof.
    expect(db.evidence.rows).toHaveLength(1);
    expect(db.evidence.rows[0]).toMatchObject({ verification_class: 'pending', is_publicly_openable: false });
    expect(db.artifacts.rows).toHaveLength(1);
    expect(db.artifacts.rows[0]).toMatchObject({ status: 'candidate', visibility: 'private' });

    const run = await sync(created.caseStudy.id, [appRepo()]);
    expect(run.status).toBe('success');
    expect(run.snapshotOutcome).toBe('created');
    expect(db.snapshots.rows).toHaveLength(1);

    const snapshot = db.snapshots.rows[0];
    expect(snapshot).toMatchObject({ version: 1, status: 'draft' });
    const content = snapshot.content;
    expect(content.repositories).toHaveLength(1);
    expect(content.situation.narrative).toContain('Line changeovers take four hours and stall the whole plant.');
    expect(content.artifacts[0]).toMatchObject({ title: 'Changeover architecture' });

    // A sync may never publish, and the source records are read-only.
    expect(db.publications.rows).toEqual([]);
    assertSourcesUnwritten();

    // None of the seeded PII crosses into the snapshot.
    const serialized = JSON.stringify(snapshot);
    for (const secret of [INTAKE_ORGANIZATION, STUDENT_EMAIL, ENROLLMENT_ID, PROJECT_VARIABLES_BLOB, SENTINEL_TOKEN]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

/* ═════════════════════════════════ 2 + 3 ═══ many repos, run twice ═════════ */

describe('§40 — frontend + backend + eval repo = one Case Study, and a repeat sync is unchanged', () => {
  const scripts = [appRepo(), serviceRepo(), evalRepo()];

  const threeRepoCandidate = () => createCaseStudyFromRepoCollection({
    title: 'Atlas changeover platform',
    repositories: ['acme/atlas', 'acme/ledger', 'acme/atlas-eval'],
    actor: ACTOR,
  });

  it('collapses three repositories into ONE candidate whose stack came from all three', async () => {
    const created = await threeRepoCandidate();
    expect(created.warnings).toEqual([]);
    expect(db.studies.rows).toHaveLength(1);
    expect(db.repositories.rows).toHaveLength(3);
    expect(created.repositories.map((r) => [r.repoName, r.role])).toEqual(
      expect.arrayContaining([['atlas', 'primary'], ['ledger', 'other'], ['atlas-eval', 'other']]),
    );

    const run = await sync(created.caseStudy.id, scripts);
    expect(run.status).toBe('success');
    expect(run.counts).toMatchObject({ reposAttempted: 3, reposSucceeded: 3, reposFailed: 0 });

    expect(db.snapshots.rows).toHaveLength(1);
    const content = db.snapshots.rows[0].content;
    expect(content.repositories.map((r: Row) => r.repoName).sort())
      .toEqual(['atlas', 'atlas-eval', 'ledger']);

    // Each assertion below can only hold if that repository's own manifest was
    // read: Express/React from atlas's package.json, FastAPI from ledger's
    // requirements.txt, LangChain and Chroma from atlas-eval's.
    expect(content.architecture.stack).toEqual(expect.arrayContaining(['Express', 'React', 'FastAPI']));
    expect(content.architecture.integrations).toEqual(
      expect.arrayContaining(['OpenAI SDK', 'Anthropic SDK', 'LangChain']),
    );
    expect(content.architecture.dataStores).toEqual(expect.arrayContaining(['PostgreSQL', 'Chroma']));
  });

  it('reports `unchanged` on a second identical sync and writes no second snapshot', async () => {
    const created = await threeRepoCandidate();
    const first = await sync(created.caseStudy.id, scripts, 'integration-1');
    const second = await sync(created.caseStudy.id, scripts, 'integration-2');

    expect(second.status).toBe('unchanged');
    expect(second.snapshotOutcome).toBe('unchanged');
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(db.snapshots.rows).toHaveLength(1);
    // Two attempts, two audit rows. That is the ledger being honest.
    expect(db.syncRuns.rows.map((r) => r.status)).toEqual(['success', 'unchanged']);
  });
});

/* ═════════════════════════════ 4 ═══ repo changes after publish ═══════════ */

describe('§40 — a repo change after publish creates a draft; the published snapshot stays pinned', () => {
  it('keeps the live page on version 1 until somebody republishes', async () => {
    const { caseStudyId } = await approvedRecord();
    const published = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });
    expect(published.outcome).toBe('published');
    expect(published.snapshotVersion).toBe(1);

    const before = await request(app).get(detailUrl());
    expect(before.status).toBe(200);
    expect(before.body.caseStudy.stack).not.toContain('fastify');

    // The repository moves: a new commit that adds a Fastify dependency.
    const moved = [appRepo({
      sha: APP_SHA_V2,
      files: { ...appRepo().files, 'package.json': PACKAGE_JSON_V2 },
    })];
    const resync = await sync(caseStudyId, moved, 'integration-resync');

    expect(resync.snapshotOutcome).toBe('created');
    expect(resync.snapshotVersion).toBe(2);
    expect(db.snapshots.rows).toHaveLength(2);
    const v1 = db.snapshots.rows.find((r) => r.version === 1) as Row;
    const v2 = db.snapshots.rows.find((r) => r.version === 2) as Row;
    expect(v2.status).toBe('draft');
    expect(v2.content.architecture.stack).toContain('Fastify');
    // The two versions genuinely stand at different commits.
    expect(v1.content.repositories[0].lastSeenSha).toBe(APP_SHA);
    expect(v2.content.repositories[0].lastSeenSha).toBe(APP_SHA_V2);

    // The pin did not move, and the live page did not change under the reader.
    expect(db.publications.rows[0].published_snapshot_id).toBe(published.publishedSnapshotId);
    const during = await request(app).get(detailUrl());
    expect(during.status).toBe(200);
    expect(during.body.caseStudy.stack).not.toContain('fastify');

    // Republishing is an explicit second act with its own gate run.
    await approveSnapshot({ caseStudyId, snapshotId: v2.id, actor: ACTOR });
    const republished = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });
    expect(republished.outcome).toBe('published');
    expect(republished.publishedSnapshotId).toBe(v2.id);

    const after = await request(app).get(detailUrl());
    expect(after.body.caseStudy.stack).toContain('fastify');
    // One publication row throughout — republish moves the pin, it does not fork.
    expect(db.publications.rows).toHaveLength(1);
  });

  it('publishing the same approved snapshot twice writes nothing the second time', async () => {
    const { caseStudyId } = await approvedRecord();
    const first = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });
    const again = await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });
    expect(again.outcome).toBe('unchanged');
    expect(again.publicationId).toBe(first.publicationId);
    expect(db.publications.rows).toHaveLength(1);
  });
});

/* ════════════════════════════════ 5 ═══ the publish guard ═════════════════ */

describe('§40 — a pending metric that would be visible refuses publication', () => {
  it('refuses with metric_pending and writes no publication row', async () => {
    const { caseStudyId } = await approvedRecord([appRepo()], {
      // ONE field differs from the reference record that publishes above.
      metric: { verification_class: 'pending', verification_method: 'platform', evidence_id: null },
    });

    const attempt = publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });
    await expect(attempt).rejects.toThrow(/publish/i);
    const err = await attempt.catch((e: unknown) => e);
    expect(isCaseStudyPublicationError(err)).toBe(true);
    const publicationError = err as { error_class: string; details: { codes?: readonly string[] } };
    expect(publicationError.error_class).toBe('PublishBlocked');
    expect(publicationError.details.codes).toEqual(['metric_pending']);

    expect(db.publications.rows).toEqual([]);
    const index = await request(app).get(LIST);
    expect(index.body.items).toEqual([]);
  });
});

/* ═════════════════════════════════ 6 ═══ privacy ══════════════════════════ */

describe('§40 — a private repository with public linking disabled never reaches the public API', () => {
  const PRIVATE = { owner: 'acme-internal', repo: 'ledger-private' };
  const privateScript = () => serviceRepo({ ...PRIVATE, private: true });

  it('renders the public repository, counts the private one, and names it nowhere', async () => {
    const { caseStudyId } = await approvedRecord([appRepo(), privateScript()], {});
    // Attached AFTER the reference repo so the private one is `other`, and with
    // linking explicitly disabled — the state spec §16 describes.
    await attachRepository({
      caseStudyId,
      reference: `https://github.com/${PRIVATE.owner}/${PRIVATE.repo}`,
      role: 'other',
      visibility: 'private',
      allowPublicRepoLink: false,
    });
    const resync = await sync(caseStudyId, [appRepo(), privateScript()], 'integration-private');
    await approveSnapshot({ caseStudyId, snapshotId: resync.snapshotId as string, actor: ACTOR });
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });

    // The internal snapshot DOES know about it — that is why the leak test means
    // something. The public payload must not.
    const latest = db.snapshots.rows.find((r) => r.id === resync.snapshotId) as Row;
    expect(latest.content.repositories).toHaveLength(2);
    expect(JSON.stringify(latest.content)).toContain(PRIVATE.repo);

    const detail = await request(app).get(detailUrl());
    expect(detail.status).toBe(200);
    expect(detail.body.caseStudy.repositories.map((r: Row) => r.label)).toEqual(['atlas']);
    expect(detail.body.caseStudy.privateRepositoryCount).toBe(1);

    const index = await request(app).get(LIST);
    for (const leak of [PRIVATE.owner, PRIVATE.repo, `https://github.com/${PRIVATE.owner}/${PRIVATE.repo}`]) {
      expect(detail.text).not.toContain(leak);
      expect(index.text).not.toContain(leak);
    }
  });
});

/* ════════════════════════════ 7 ═══ surface isolation ════════════════════ */

describe('§40 — surface isolation', () => {
  it('an Enterprise publication is visible on Enterprise', async () => {
    const { caseStudyId } = await approvedRecord();
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });

    const index = await request(app).get(LIST);
    expect(index.status).toBe(200);
    expect(index.body.items.map((i: Row) => i.slug)).toEqual(['bottling-line-copilot']);
    expect(index.body.surface.key).toBe('enterprise');
    expect((await request(app).get(detailUrl())).status).toBe(200);
  });

  it('a draft is not returned — neither an unpublished record nor a pin to a draft snapshot', async () => {
    // (a) synced, never approved, never published.
    const study = db.studies.seed(consented());
    await attachRepository({
      caseStudyId: study.id, reference: 'https://github.com/acme/atlas',
      role: 'primary', visibility: 'public', allowPublicRepoLink: true,
    });
    seedPublishableMetric(db, study.id);
    const run = await sync(study.id, [appRepo()]);

    expect((await request(app).get(LIST)).body.items).toEqual([]);
    expect((await request(app).get(detailUrl())).status).toBe(404);

    // (b) a publication row pinned to that still-DRAFT snapshot. This is the
    // shape a bug produces — a pin written before review — and the store must
    // drop it rather than render it.
    db.publications.seed({
      case_study_id: study.id, surface_key: 'enterprise', status: 'published',
      published_snapshot_id: run.snapshotId, featured: false, featured_rank: null,
      surface_title_override: null, surface_summary_override: null,
      published_at: new Date('2026-08-22T10:00:00.000Z'),
      created_at: new Date('2026-08-22T10:00:00.000Z'),
      updated_at: new Date('2026-08-22T10:00:00.000Z'),
    });
    expect(db.snapshots.rows[0].status).toBe('draft');
    expect((await request(app).get(LIST)).body.items).toEqual([]);
    expect((await request(app).get(detailUrl())).status).toBe(404);

    // (c) the same pin with the Case Study itself marked approved. Several
    // rules refuse (b) at once, so each step below removes one and leaves the
    // next standing alone. Without them a regression in any single rule would
    // leave (b) green — which is not a hypothetical: `isApprovedSnapshot`'s
    // draft check survived being deleted until step (d) was added.
    study.status = 'approved';
    expect((await request(app).get(LIST)).body.items).toEqual([]);
    expect((await request(app).get(detailUrl())).status).toBe(404);

    // (d) …and now stamped as if a reviewer had approved it while the STATUS
    // was never moved off `draft`. That is the one state in which nothing but
    // `status !== 'draft'` stands between an unreviewed snapshot and the
    // internet, and it is a real shape: an approval written by a job that
    // updated two columns and not the third.
    const pinned = db.snapshots.rows[0];
    pinned.approved_at = new Date('2026-08-22T10:00:00.000Z');
    pinned.approved_by = ACTOR;
    expect(pinned.status).toBe('draft');
    expect((await request(app).get(LIST)).body.items).toEqual([]);
    expect((await request(app).get(detailUrl())).status).toBe(404);
  });

  it('a Training-only publication is invisible to Enterprise, and the gate refuses Training today', async () => {
    const { caseStudyId, snapshotId } = await approvedRecord();

    // Phase 1: only `enterprise` is publishable, so the Training row cannot be
    // created through the service at all.
    const refused = await publishCaseStudy({ caseStudyId, surfaceKey: 'training', actor: ACTOR })
      .catch((e: unknown) => e);
    expect((refused as { details: { codes?: readonly string[] } }).details.codes)
      .toEqual(['surface_not_publishable']);

    // The row a future Training renderer WOULD write, inserted directly. The
    // Enterprise API must not see it — the surface scope is what keeps the two
    // audiences apart, and this is the only way to test it before Training ships.
    db.publications.seed({
      case_study_id: caseStudyId, surface_key: 'training', status: 'published',
      published_snapshot_id: snapshotId, featured: false, featured_rank: null,
      surface_title_override: null, surface_summary_override: null,
      published_at: new Date('2026-08-22T10:00:00.000Z'),
      created_at: new Date('2026-08-22T10:00:00.000Z'),
      updated_at: new Date('2026-08-22T10:00:00.000Z'),
    });

    expect((await request(app).get(LIST)).body.items).toEqual([]);
    expect((await request(app).get(detailUrl())).status).toBe(404);

    // …and the same record published to Enterprise IS visible, so the 404 above
    // is surface isolation rather than a record that was never publishable.
    await publishCaseStudy({ caseStudyId, surfaceKey: 'enterprise', actor: ACTOR });
    expect((await request(app).get(LIST)).body.items.map((i: Row) => i.slug))
      .toEqual(['bottling-line-copilot']);
  });
});

/* ═══════════════════════════ AC8 ═══ this suite runs in CI ════════════════ */

describe('T020 AC8 — the suite is inside CI\'s set', () => {
  it('is not excluded by jest.ci.config.ts', () => {
    const config = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'jest.ci.config.ts'), 'utf8');
    // Every entry of the ignore-list, as it is written in the source: one
    // quoted string alone on its line. `\\.` in the source is one backslash in
    // the value, so it is unescaped before being compiled back to a RegExp.
    const patterns = [...config.matchAll(/^\s*'([^']+)',\s*$/gm)]
      .map((m) => m[1].replace(/\\\\/g, '\\'));
    expect(patterns.length).toBeGreaterThan(20);
    const suitePath = 'src/services/caseStudy/__tests__/caseStudyIntegration.test.ts';
    for (const pattern of patterns) expect(new RegExp(pattern).test(suitePath)).toBe(false);
    // The extraction itself has to be able to fail, or the loop above is a
    // no-op dressed as a gate: a path that IS on the list must match.
    expect(patterns.some((p) => new RegExp(p)
      .test('src/services/__tests__/projectDnaService.test.ts'))).toBe(true);
  });
});
