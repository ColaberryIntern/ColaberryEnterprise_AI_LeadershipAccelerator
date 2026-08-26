import { hashCanonical } from '../../../utils/canonicalHash';

/**
 * `caseStudyAdminService` + `caseStudyAdminReview` — the record lifecycle and the
 * review desk behind `/api/admin/case-studies` (T013).
 *
 * Models are mocked, so this suite runs with `DATABASE_URL` unset (CI provisions
 * no Postgres). `caseStudySnapshotOverrides` and `utils/canonicalHash` are NOT
 * mocked: the override path's whole point is that it produces the same hash
 * envelope the snapshot builder produces, and mocking the hasher would test
 * nothing.
 *
 * The last describe block is the privacy check. `projects.enrollment_id` has to
 * be read (spec §10.1 steps 5-6 link evidence and artifacts keyed on it) and
 * must never reach stdout or a response body, so the suite captures every log
 * line the create emits and asserts the value appears in none of them.
 */

const caseStudy = { findByPk: jest.fn(), findAndCountAll: jest.fn(), create: jest.fn() };
const snapshots = { findAll: jest.fn(), findOne: jest.fn() };
const publications = { findAll: jest.fn(), findOne: jest.fn() };
const syncRuns = { findAll: jest.fn() };

const attachRepository = jest.fn();
const listRepositories = jest.fn();
const loadCaseStudyProjectFacts = jest.fn();
const linkProjectEvidence = jest.fn();
const linkPortfolioArtifacts = jest.fn();
const scoreCaseStudyReadiness = jest.fn();
const persistCaseStudySnapshot = jest.fn();
const evaluateCaseStudyPublication = jest.fn();

jest.mock('../../../models/CaseStudy', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => caseStudy.findByPk(...a),
    findAndCountAll: (...a: unknown[]) => caseStudy.findAndCountAll(...a),
    create: (...a: unknown[]) => caseStudy.create(...a),
  },
}));
jest.mock('../../../models/CaseStudySnapshot', () => ({
  __esModule: true,
  default: {
    findAll: (...a: unknown[]) => snapshots.findAll(...a),
    findOne: (...a: unknown[]) => snapshots.findOne(...a),
  },
}));
jest.mock('../../../models/CaseStudyPublication', () => ({
  __esModule: true,
  default: {
    findAll: (...a: unknown[]) => publications.findAll(...a),
    findOne: (...a: unknown[]) => publications.findOne(...a),
  },
}));
jest.mock('../../../models/CaseStudySyncRun', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => syncRuns.findAll(...a) },
}));
jest.mock('../caseStudyRepoCollection', () => ({
  attachRepository: (...a: unknown[]) => attachRepository(...a),
  listRepositories: (...a: unknown[]) => listRepositories(...a),
}));
jest.mock('../caseStudyProjectSource', () => ({
  loadCaseStudyProjectFacts: (...a: unknown[]) => loadCaseStudyProjectFacts(...a),
}));
jest.mock('../caseStudyEvidenceSource', () => ({
  linkProjectEvidence: (...a: unknown[]) => linkProjectEvidence(...a),
  linkPortfolioArtifacts: (...a: unknown[]) => linkPortfolioArtifacts(...a),
}));
jest.mock('../caseStudyReadinessService', () => ({
  scoreCaseStudyReadiness: (...a: unknown[]) => scoreCaseStudyReadiness(...a),
}));
jest.mock('../caseStudyRepoReader', () => ({
  repoLogIdentity: () => ({ repo_ref: 'opaque-handle' }),
}));
jest.mock('../caseStudySnapshotStore', () => ({
  persistCaseStudySnapshot: (...a: unknown[]) => persistCaseStudySnapshot(...a),
}));
jest.mock('../caseStudyPublicationService', () => ({
  evaluateCaseStudyPublication: (...a: unknown[]) => evaluateCaseStudyPublication(...a),
}));

import {
  archiveCaseStudy, createCaseStudyFromProject, createCaseStudyFromRepoCollection,
  getCaseStudy, isCaseStudyAdminError, listCaseStudies, updateCaseStudy,
} from '../caseStudyAdminService';
import {
  applyHumanOverride, approveSnapshot, listSyncRuns, previewSurfaceProjection,
} from '../caseStudyAdminReview';

const ID = '11111111-1111-4111-8111-111111111111';
const SNAP = '22222222-2222-4222-8222-222222222222';
const OTHER_SNAP = '44444444-4444-4444-8444-444444444444';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const ENROLLMENT = '55555555-5555-4555-8555-555555555555';

interface Row { [key: string]: unknown; update: jest.Mock }

function caseStudyRow(overrides: Record<string, unknown> = {}): Row {
  const row: Record<string, unknown> = {
    id: ID, slug: 'acme-claims', title: 'Acme Claims', status: 'draft',
    source_type: 'repo_collection', project_id: null, canonical_summary: null,
    industry: null, primary_capability: null, program_key: null, built_by_type: null,
    visibility: 'private', organization_display_name: null,
    organization_is_anonymized: true, organization_identity_mode: 'hidden',
    organization_naming_consent: false, builder_identity_mode: 'anonymous',
    builder_naming_consent: false, approved_by: null, approved_at: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'),
    updated_at: new Date('2026-08-02T00:00:00.000Z'), archived_at: null,
    ...overrides,
  };
  row.update = jest.fn(async (values: Record<string, unknown>) => {
    Object.assign(row, values);
    return row;
  });
  return row as Row;
}

const CONTENT = { identity: { title: 'Generated title', standfirst: 'A standfirst' } };
const COMMITS = { 'acme/claims': 'abc123' };

function snapshotRow(overrides: Record<string, unknown> = {}): Row {
  const row: Record<string, unknown> = {
    id: SNAP, case_study_id: ID, version: 3, status: 'draft',
    content: JSON.parse(JSON.stringify(CONTENT)),
    provenance: { 'identity.standfirst': { tier: 'ai_draft', recordedAt: '2026-08-01T00:00:00.000Z' } },
    source_commit_map: { ...COMMITS },
    generated_at: new Date('2026-08-03T00:00:00.000Z'), generated_by: 'repo_sync',
    approved_by: null, approved_at: null, content_hash: 'a'.repeat(64),
    ...overrides,
  };
  row.update = jest.fn(async (values: Record<string, unknown>) => {
    Object.assign(row, values);
    return row;
  });
  return row as Row;
}

let logLines: string[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  logLines = [];
  jest.spyOn(console, 'log').mockImplementation((line?: unknown) => {
    logLines.push(String(line));
  });
  listRepositories.mockResolvedValue([]);
  attachRepository.mockResolvedValue({ created: true });
  publications.findAll.mockResolvedValue([]);
  snapshots.findAll.mockResolvedValue([]);
});

afterEach(() => jest.restoreAllMocks());

/* ─────────────────────────────────────────────────────────────── list/read ── */

describe('listCaseStudies', () => {
  it('excludes archived rows unless asked, and returns a page', async () => {
    caseStudy.findAndCountAll.mockResolvedValue({ rows: [caseStudyRow()], count: 1 });

    const page = await listCaseStudies({});

    expect(page.total).toBe(1);
    expect(page.limit).toBe(25);
    expect(page.items[0].slug).toBe('acme-claims');
    const where = caseStudy.findAndCountAll.mock.calls[0][0].where;
    expect(where.archived_at).toBeDefined();
  });

  it('includes archived rows when asked', async () => {
    caseStudy.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });

    await listCaseStudies({ includeArchived: true });

    expect(caseStudy.findAndCountAll.mock.calls[0][0].where.archived_at).toBeUndefined();
  });

  it('rejects an out-of-range limit before touching the database', async () => {
    await expect(listCaseStudies({ limit: 0 })).rejects.toMatchObject({
      error_class: 'ValidationError', http_status: 400,
    });
    expect(caseStudy.findAndCountAll).not.toHaveBeenCalled();
  });
});

describe('getCaseStudy', () => {
  it('404s with a named error when the record does not exist', async () => {
    caseStudy.findByPk.mockResolvedValue(null);

    const err = await getCaseStudy({ caseStudyId: ID }).catch((e) => e);

    expect(isCaseStudyAdminError(err)).toBe(true);
    expect(err.error_class).toBe('CaseStudyNotFound');
    expect(err.http_status).toBe(404);
  });

  it('returns the latest and the approved snapshot, with ADVISORY readiness', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findAll.mockResolvedValue([
      snapshotRow({ id: OTHER_SNAP, version: 4 }),
      snapshotRow({ version: 3, status: 'approved' }),
    ]);
    publications.findAll.mockResolvedValue([]);
    scoreCaseStudyReadiness.mockReturnValue({ score: 61, band: 'developing', gaps: [] });

    const detail = await getCaseStudy({ caseStudyId: ID });

    expect(detail.latestSnapshot?.version).toBe(4);
    expect(detail.approvedSnapshot?.version).toBe(3);
    expect(detail.readiness).toMatchObject({ score: 61 });
  });

  it('still returns the record when readiness scoring throws — the score authorises nothing', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findAll.mockResolvedValue([snapshotRow()]);
    scoreCaseStudyReadiness.mockImplementation(() => { throw new Error('rubric blew up'); });

    const detail = await getCaseStudy({ caseStudyId: ID });

    expect(detail.readiness).toBeNull();
    expect(detail.caseStudy.id).toBe(ID);
  });
});

/* ──────────────────────────────────────────────────────────────── creates ── */

describe('createCaseStudyFromProject (§10.1)', () => {
  const facts = {
    projectId: PROJECT, name: 'Claims Routing', enrollmentId: ENROLLMENT,
    executiveSummary: 'Routes claims.', industry: 'Insurance', programId: 'accelerator',
    repo: { owner: 'acme', name: 'claims', url: null, source: 'connection' },
    scores: {}, archived: false,
  };

  it('links the Project, attaches its repo as primary, and links evidence + artifacts', async () => {
    loadCaseStudyProjectFacts.mockResolvedValue(facts);
    caseStudy.create.mockResolvedValue(caseStudyRow({ project_id: PROJECT, source_type: 'project' }));
    linkProjectEvidence.mockResolvedValue({ created: 2 });
    linkPortfolioArtifacts.mockResolvedValue({ created: 1 });

    const result = await createCaseStudyFromProject({ projectId: PROJECT, actor: 'ali@colaberry.com' });

    expect(caseStudy.create).toHaveBeenCalledWith(expect.objectContaining({
      project_id: PROJECT, status: 'draft', source_type: 'project',
    }));
    expect(attachRepository).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'acme/claims', role: 'primary',
    }));
    expect(linkProjectEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ enrollmentId: ENROLLMENT }),
    );
    expect(linkPortfolioArtifacts).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
  });

  it('does NOT auto-publish — the row is born draft and private (§10.1 step 11)', async () => {
    loadCaseStudyProjectFacts.mockResolvedValue(facts);
    caseStudy.create.mockResolvedValue(caseStudyRow());

    const result = await createCaseStudyFromProject({ projectId: PROJECT, actor: 'ali@colaberry.com' });

    expect(result.caseStudy.status).toBe('draft');
    expect(result.caseStudy.visibility).toBe('private');
    expect(result.caseStudy.organizationNamingConsent).toBe(false);
    expect(result.caseStudy.builderNamingConsent).toBe(false);
  });

  it('warns rather than failing when the Project has no connected repository', async () => {
    loadCaseStudyProjectFacts.mockResolvedValue({
      ...facts, repo: { owner: null, name: null, url: null, source: 'none' },
    });
    caseStudy.create.mockResolvedValue(caseStudyRow());

    const result = await createCaseStudyFromProject({ projectId: PROJECT, actor: 'ali@colaberry.com' });

    expect(attachRepository).not.toHaveBeenCalled();
    expect(result.warnings.join(' ')).toContain('no connected repository');
  });

  it('turns a duplicate slug into a named 409, not a raw Sequelize error', async () => {
    loadCaseStudyProjectFacts.mockResolvedValue(facts);
    caseStudy.create.mockRejectedValue(
      Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' }),
    );

    const err = await createCaseStudyFromProject({ projectId: PROJECT, actor: 'a@b.c' }).catch((e) => e);

    expect(err.error_class).toBe('SlugConflict');
    expect(err.http_status).toBe(409);
  });
});

describe('createCaseStudyFromRepoCollection (§10.2)', () => {
  it('makes the first reference primary and the rest other', async () => {
    caseStudy.create.mockResolvedValue(caseStudyRow());

    await createCaseStudyFromRepoCollection({
      title: 'Acme Claims', repositories: ['acme/app', 'acme/api'], actor: 'a@b.c',
    });

    expect(attachRepository).toHaveBeenNthCalledWith(1, expect.objectContaining({
      reference: 'acme/app', role: 'primary',
    }));
    expect(attachRepository).toHaveBeenNthCalledWith(2, expect.objectContaining({
      reference: 'acme/api', role: 'other',
    }));
  });

  it('reports a reference that would not attach without losing the good ones', async () => {
    caseStudy.create.mockResolvedValue(caseStudyRow());
    attachRepository
      .mockResolvedValueOnce({ created: true })
      .mockRejectedValueOnce(Object.assign(new Error('nope'), { error_class: 'InvalidRepoReference' }));

    const result = await createCaseStudyFromRepoCollection({
      title: 'Acme Claims', repositories: ['acme/app', 'not a repo'], actor: 'a@b.c',
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('InvalidRepoReference');
    expect(result.caseStudy.id).toBe(ID);
  });

  it('derives a slug from the title when none is given', async () => {
    caseStudy.create.mockResolvedValue(caseStudyRow());

    await createCaseStudyFromRepoCollection({
      title: 'Acme Claims: FNOL Triage!', repositories: ['acme/app'], actor: 'a@b.c',
    });

    expect(caseStudy.create).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'acme-claims-fnol-triage' }),
    );
  });
});

/* ────────────────────────────────────────────────────────── edit / archive ── */

describe('updateCaseStudy (§34 human-owned fields)', () => {
  it('maps the camelCase patch onto columns and stamps an approval', async () => {
    const row = caseStudyRow();
    caseStudy.findByPk.mockResolvedValue(row);

    await updateCaseStudy({
      caseStudyId: ID,
      patch: { status: 'approved', organizationNamingConsent: true, canonicalSummary: 'Better copy' },
      actor: 'ali@colaberry.com',
    });

    const values = row.update.mock.calls[0][0];
    expect(values).toMatchObject({
      status: 'approved', organization_naming_consent: true, canonical_summary: 'Better copy',
      approved_by: 'ali@colaberry.com',
    });
    expect(values.approved_at).toBeInstanceOf(Date);
  });

  it('refuses a patch that names no field', async () => {
    await expect(updateCaseStudy({ caseStudyId: ID, patch: {}, actor: 'a@b.c' }))
      .rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(caseStudy.findByPk).not.toHaveBeenCalled();
  });

  it('cannot write a column the schema does not name', async () => {
    const row = caseStudyRow();
    caseStudy.findByPk.mockResolvedValue(row);

    await updateCaseStudy({
      caseStudyId: ID, patch: { title: 'New', approved_by: 'attacker' } as never, actor: 'a@b.c',
    });

    expect(row.update.mock.calls[0][0]).not.toHaveProperty('approved_by');
  });
});

describe('archiveCaseStudy (§35)', () => {
  it('refuses while the record is still published, naming the surface', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    publications.findAll.mockResolvedValue([{ surface_key: 'enterprise', status: 'published' }]);

    const err = await archiveCaseStudy({ caseStudyId: ID, actor: 'a@b.c' }).catch((e) => e);

    expect(err.error_class).toBe('CaseStudyPublished');
    expect(err.http_status).toBe(409);
    expect(err.message).toContain('enterprise');
  });

  it('refuses the SAME way through PATCH {status:"archived"} — both doors are guarded', async () => {
    // There are two routes to the archived state and only the dedicated endpoint
    // was checked. An admin could archive a still-published record through the
    // general-purpose PATCH, leaving `case_studies.status = 'archived'` while
    // `case_study_publications` kept serving it — the two tables then disagree
    // about whether the record exists. A guard on one of two doors is not a guard.
    const row = caseStudyRow();
    caseStudy.findByPk.mockResolvedValue(row);
    publications.findAll.mockResolvedValue([{ surface_key: 'enterprise', status: 'published' }]);

    const err = await updateCaseStudy({
      caseStudyId: ID, actor: 'a@b.c', patch: { status: 'archived' },
    }).catch((e) => e);

    expect(err.error_class).toBe('CaseStudyPublished');
    expect(err.http_status).toBe(409);
    expect(err.message).toContain('enterprise');
    // and it wrote nothing — the refusal is before the update, not after
    expect(row.update).not.toHaveBeenCalled();
  });

  it('PATCH to a NON-archived status is unaffected by a live publication', async () => {
    // Non-vacuity: the guard is scoped to the archive transition, not a blanket
    // "published records are read-only" rule.
    const row = caseStudyRow();
    caseStudy.findByPk.mockResolvedValue(row);
    publications.findAll.mockResolvedValue([{ surface_key: 'enterprise', status: 'published' }]);

    await expect(updateCaseStudy({
      caseStudyId: ID, actor: 'a@b.c', patch: { title: 'Retitled while live' },
    })).resolves.toBeDefined();
    expect(row.update).toHaveBeenCalled();
  });

  it('soft-archives and deletes nothing when no surface is live', async () => {
    const row = caseStudyRow();
    caseStudy.findByPk.mockResolvedValue(row);
    publications.findAll.mockResolvedValue([]);

    const result = await archiveCaseStudy({ caseStudyId: ID, actor: 'a@b.c' });

    expect(row.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived', archived_at: expect.any(Date) }),
    );
    expect(result.status).toBe('archived');
  });
});

/* ────────────────────────────────────────────────────────── the review desk ─ */

describe('applyHumanOverride (§34)', () => {
  beforeEach(() => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findOne.mockResolvedValue(snapshotRow());
    persistCaseStudySnapshot.mockResolvedValue({
      outcome: 'created', snapshotId: OTHER_SNAP, version: 4,
      contentHash: 'b'.repeat(64), status: 'draft', race: false,
    });
  });

  it('writes a NEW version carrying human_override provenance and the builder hash envelope', async () => {
    const result = await applyHumanOverride({
      caseStudyId: ID, path: 'identity.title', value: 'Claims triage copilot',
      actor: 'ali@colaberry.com', note: 'client wording',
    });

    const draft = persistCaseStudySnapshot.mock.calls[0][0].draft;
    expect(draft.generatedBy).toBe('human_edit');
    expect(draft.content.identity.title).toBe('Claims triage copilot');
    expect(draft.provenance['identity.title']).toMatchObject({
      tier: 'human_override', origin: { kind: 'human', actor: 'ali@colaberry.com' },
    });
    // The generated tier already on the snapshot survives untouched.
    expect(draft.provenance['identity.standfirst']).toMatchObject({ tier: 'ai_draft' });
    // Same hasher, same envelope as caseStudySnapshotBuilder.ts:260.
    expect(draft.contentHash)
      .toBe(hashCanonical({ content: draft.content, sourceCommitMap: COMMITS }));
    expect(result.version).toBe(4);
  });

  it('persists as a DRAFT — an edit never approves itself', async () => {
    await applyHumanOverride({ caseStudyId: ID, path: 'identity.title', value: 'X', actor: 'a@b.c' });

    expect(persistCaseStudySnapshot.mock.calls[0][0].status).toBe('draft');
  });

  it('refuses a path the snapshot does not carry rather than conjuring it', async () => {
    const err = await applyHumanOverride({
      caseStudyId: ID, path: 'situation.narrative', value: 'X', actor: 'a@b.c',
    }).catch((e) => e);

    expect(err.error_class).toBe('ValidationError');
    expect(err.message).toContain('situation.narrative');
    expect(persistCaseStudySnapshot).not.toHaveBeenCalled();
  });

  it('refuses a prototype-pollution path', async () => {
    const err = await applyHumanOverride({
      caseStudyId: ID, path: '__proto__.polluted', value: 'X', actor: 'a@b.c',
    }).catch((e) => e);

    expect(err.error_class).toBe('ValidationError');
    expect(persistCaseStudySnapshot).not.toHaveBeenCalled();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('404s when nothing has been synced yet', async () => {
    snapshots.findOne.mockResolvedValue(null);

    const err = await applyHumanOverride({
      caseStudyId: ID, path: 'identity.title', value: 'X', actor: 'a@b.c',
    }).catch((e) => e);

    expect(err.error_class).toBe('SnapshotNotFound');
    expect(err.http_status).toBe(404);
  });
});

describe('approveSnapshot', () => {
  it('approves the version, supersedes the previous one, and approves the record', async () => {
    const record = caseStudyRow();
    const target = snapshotRow({ id: SNAP, version: 4, status: 'draft' });
    const prior = snapshotRow({ id: OTHER_SNAP, version: 3, status: 'approved' });
    caseStudy.findByPk.mockResolvedValue(record);
    snapshots.findOne.mockResolvedValue(target);
    snapshots.findAll.mockResolvedValue([prior]);

    const result = await approveSnapshot({
      caseStudyId: ID, snapshotId: SNAP, actor: 'ali@colaberry.com',
    });

    expect(result.outcome).toBe('approved');
    expect(result.supersededSnapshotIds).toEqual([OTHER_SNAP]);
    expect(prior.update).toHaveBeenCalledWith({ status: 'superseded' });
    expect(target.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved', approved_by: 'ali@colaberry.com',
    }));
    // The publish gate's rule 1 reads `case_studies.status`, so it moves too.
    expect(record.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(result.caseStudyStatus).toBe('approved');
  });

  it('is idempotent — re-approving writes nothing and reports unchanged', async () => {
    const target = snapshotRow({ status: 'approved' });
    caseStudy.findByPk.mockResolvedValue(caseStudyRow({ status: 'approved' }));
    snapshots.findOne.mockResolvedValue(target);

    const result = await approveSnapshot({ caseStudyId: ID, snapshotId: SNAP, actor: 'a@b.c' });

    expect(result.outcome).toBe('unchanged');
    expect(target.update).not.toHaveBeenCalled();
  });

  it('404s for a snapshot belonging to another Case Study', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findOne.mockResolvedValue(null);

    const err = await approveSnapshot({ caseStudyId: ID, snapshotId: SNAP, actor: 'a@b.c' })
      .catch((e) => e);

    expect(err.error_class).toBe('SnapshotNotFound');
  });
});

describe('listSyncRuns', () => {
  it('maps the append-only audit rows newest first', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    syncRuns.findAll.mockResolvedValue([{
      id: 'run-1', trigger: 'manual', status: 'partial', repos_attempted: 3,
      repos_succeeded: 2, repos_failed: 1, facts_extracted: 40, candidate_metrics: 2,
      snapshot_id: SNAP, correlation_id: 'corr-1', error_class: null,
      error_summary: 'one repo rate limited',
      started_at: new Date('2026-08-04T00:00:00.000Z'), completed_at: null, metadata: {},
    }]);

    const page = await listSyncRuns({ caseStudyId: ID });

    expect(page.items[0]).toMatchObject({
      id: 'run-1', status: 'partial', reposFailed: 1, snapshotId: SNAP,
      startedAt: '2026-08-04T00:00:00.000Z', completedAt: null,
    });
    expect(syncRuns.findAll.mock.calls[0][0].order).toEqual([['started_at', 'DESC']]);
  });
});

describe('previewSurfaceProjection (§34)', () => {
  it('returns the REAL gate decision with its blockers verbatim, and writes nothing', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findOne.mockResolvedValue(null); // no approved snapshot
    const decision = {
      allowed: false, codes: ['metric_pending'],
      blockers: [{
        code: 'metric_pending', field: 'heroMetrics[0]',
        message: 'headline metric "41% fewer stockouts" has no verified evidence',
        remedy: 'link verified evidence or lower the verification class',
      }],
      summary: 'Cannot publish:\n- headline metric ...',
    };
    evaluateCaseStudyPublication.mockResolvedValue(decision);

    const preview = await previewSurfaceProjection({ caseStudyId: ID, surfaceKey: 'enterprise' });

    expect(preview.decision).toBe(decision);
    expect(preview.decision.blockers[0].remedy).toContain('link verified evidence');
    expect(preview.source).toBe('none');
    expect(persistCaseStudySnapshot).not.toHaveBeenCalled();
  });

  it('WIRES the public projection — the preview is what a visitor would see (§34)', async () => {
    // This test exists because a sibling suite covering `projectPreviewDetail`
    // in isolation passed happily while `previewSurfaceProjection` returned
    // `projection: null` — proving the helper worked but never proving it was
    // called. The assertion that matters here is the wiring, not the rendering.
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findOne.mockResolvedValue(snapshotRow({
      status: 'approved',
      content: {
        identity: {
          slug: 'acme-claims', title: 'Claims triage rebuild',
          organizationIdentityMode: 'anonymized', builderIdentityMode: 'role_only',
        },
        heroMetrics: [{
          key: 'k', label: 'Verified drop', valueDisplay: '41% fewer stockouts',
          metricType: 'performance', isHeadline: true, publishable: true,
          verification: { class: 'verified', method: 'repo', evidenceRef: 'ev-1' },
        }],
        repositories: [{
          repoOwner: 'acme-private-org', repoName: 'SECRET-INTERNAL-BILLING',
          repoUrl: 'https://github.com/acme-private-org/SECRET-INTERNAL-BILLING',
          role: 'primary', visibility: 'private', accessStatus: 'connected',
          allowPublicRepoLink: false,
        }],
      },
    }));
    evaluateCaseStudyPublication.mockResolvedValue({
      allowed: true, blockers: [], codes: [], summary: '',
    });

    const preview = await previewSurfaceProjection({ caseStudyId: ID, surfaceKey: 'enterprise' });

    expect(preview.projection).not.toBeNull();
    // The private repo is dropped by the projection, so the admin sees exactly
    // what the public sees — not more.
    expect(JSON.stringify(preview.projection)).not.toContain('SECRET-INTERNAL-BILLING');
    expect(preview.projection?.privateRepositoryCount).toBe(1);
    expect(preview.projection?.heroMetrics.map((m) => m.label)).toEqual(['Verified drop']);
  });

  it('prefers the approved snapshot and says which it used', async () => {
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findOne.mockResolvedValue(snapshotRow({ status: 'approved' }));
    evaluateCaseStudyPublication.mockResolvedValue({
      allowed: true, blockers: [], codes: [], summary: '',
    });
    scoreCaseStudyReadiness.mockReturnValue({ score: 88, band: 'substantial', gaps: [] });

    const preview = await previewSurfaceProjection({ caseStudyId: ID, surfaceKey: 'enterprise' });

    expect(preview.source).toBe('approved_snapshot');
    expect(preview.snapshot?.id).toBe(SNAP);
    expect(preview.readiness).toMatchObject({ score: 88 });
  });

  it('rejects a surface key outside the contract', async () => {
    await expect(previewSurfaceProjection({ caseStudyId: ID, surfaceKey: 'intranet' }))
      .rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(evaluateCaseStudyPublication).not.toHaveBeenCalled();
  });

  it('returns the surface view OF THE REQUESTED SURFACE, not of a default', async () => {
    // Without this, a preview could return the Enterprise profile under a
    // Training `surfaceKey` and the client would render the Enterprise order
    // labelled Training — four tabs that agree with each other and disagree
    // with the server. The band order is what the client composes a lens from,
    // so it is what is asserted.
    caseStudy.findByPk.mockResolvedValue(caseStudyRow());
    snapshots.findOne.mockResolvedValue(null);
    evaluateCaseStudyPublication.mockResolvedValue({
      allowed: false, blockers: [], codes: ['surface_not_publishable'], summary: '',
    });

    const training = await previewSurfaceProjection({ caseStudyId: ID, surfaceKey: 'training' });
    const enterprise = await previewSurfaceProjection({ caseStudyId: ID, surfaceKey: 'enterprise' });

    expect(training.surface.key).toBe('training');
    expect(enterprise.surface.key).toBe('enterprise');
    expect(training.surface.sectionOrder).not.toEqual(enterprise.surface.sectionOrder);
    // And the attribution floor travels with it, or the client has nothing to
    // enforce.
    expect([...training.surface.requiredSections].sort())
      .toEqual(['contributors', 'cta', 'repositories']);
  });
});

/* ─────────────────────────────────────────────────────────────── privacy ──── */

describe('logging never carries PII (CLAUDE.md observability rules)', () => {
  it('does not put the enrollment id, the actor or a repo name on stdout', async () => {
    loadCaseStudyProjectFacts.mockResolvedValue({
      projectId: PROJECT, name: 'Claims Routing', enrollmentId: ENROLLMENT,
      repo: { owner: 'acme', name: 'claims', url: null, source: 'connection' },
      scores: {}, archived: false,
    });
    caseStudy.create.mockResolvedValue(caseStudyRow());
    linkProjectEvidence.mockResolvedValue({ created: 0 });
    linkPortfolioArtifacts.mockResolvedValue({ created: 0 });

    const result = await createCaseStudyFromProject({
      projectId: PROJECT, actor: 'ali@colaberry.com',
    });

    const stdout = logLines.join('\n');
    expect(stdout).not.toContain(ENROLLMENT);
    expect(stdout).not.toContain('ali@colaberry.com');
    expect(stdout).not.toContain('acme/claims');
    // ... and the response body does not carry it either.
    expect(JSON.stringify(result)).not.toContain(ENROLLMENT);
    // The log line still exists and is useful — it carries the opaque handle.
    expect(stdout).toContain('opaque-handle');
  });
});
