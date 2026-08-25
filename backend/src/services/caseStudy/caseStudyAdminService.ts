/**
 * caseStudyAdminService — the record-lifecycle half of the admin API (spec §10,
 * §20, §35): list/search, the two create workflows, read-one, the human
 * editorial edit, and archive.
 *
 * WHY IT EXISTS AT ALL. Every other Case Study capability already has a service
 * that owns it — sync, snapshots, readiness, publication, the repo collection —
 * and `caseStudyAdminRoutes.ts` orchestrates those rather than reimplementing
 * them. The `case_studies` row itself had no owner, and CLAUDE.md forbids the
 * alternative ("thin controller: parse → call service → map errors. No business
 * logic in the route file"). So this module owns the row, and only the row.
 * Contracts, error type and row mapping live in `caseStudyAdminStore`; the
 * snapshot review desk lives in `caseStudyAdminReview`.
 *
 * WHAT IT DELEGATES, DELIBERATELY:
 *   · repositories        → `caseStudyRepoCollection` (attach/list)
 *   · Project facts       → `caseStudyProjectSource`
 *   · evidence/artifacts  → `caseStudyEvidenceSource`
 *   · readiness           → `caseStudyReadinessService` (ADVISORY — never a gate)
 *   · publish/unpublish   → `caseStudyPublicationService` (the sole authority)
 * Nothing here decides whether something may go public. `archiveCaseStudy` is
 * the one place that even looks at a publication row, and it looks in order to
 * REFUSE (see its header), never to allow.
 *
 * PII. `projects.enrollment_id` is read — `case_study_evidence` and
 * `case_study_artifacts` are keyed on it, so §10.1 steps 5-6 cannot happen
 * without it — and it never reaches a log line, an error message or a response
 * body. Repository identities go through `repoLogIdentity`, which fails closed
 * on `unknown` visibility.
 *
 * FAILURE-FIRST. (1) On failure a create leaves at most the `case_studies` row
 * behind; every follow-on step (repo attach, evidence link) is best-effort and
 * reported in `warnings` rather than rolled back, because a candidate with no
 * repo attached is a real, resumable state the admin can fix by attaching one.
 * (2) No retries: every operation is a single database round trip, and a retry
 * is the admin clicking again — safe, because create is guarded by the slug
 * unique index and edit/archive are idempotent writes. (3) Recovery is the admin
 * UI: each error carries an `error_class` and a sentence naming the field.
 * (4) Not handled: a database outage, which surfaces as a 500.
 */
import { Op } from 'sequelize';
import type { WhereOptions } from 'sequelize';
import { z } from 'zod';
import CaseStudy from '../../models/CaseStudy';
import CaseStudyPublication from '../../models/CaseStudyPublication';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import { ensureTraceId } from '../../utils/requestContext';
import { attachRepository, listRepositories } from './caseStudyRepoCollection';
import { loadCaseStudyProjectFacts } from './caseStudyProjectSource';
import { linkPortfolioArtifacts, linkProjectEvidence } from './caseStudyEvidenceSource';
import { scoreCaseStudyReadiness } from './caseStudyReadinessService';
import type { CaseStudyReadinessReport } from './caseStudyReadinessService';
import { repoLogIdentity } from './caseStudyRepoReader';
import {
  CaseStudyAdminError, createCaseStudyRow, errorClassOf, loadCaseStudyRow, log,
  rethrowSlugConflict, slugifyCaseStudyTitle, toSnapshotSummary, toSummary, validate,
} from './caseStudyAdminStore';
import type {
  CaseStudyCreateResult, CaseStudyDetail, CaseStudyListPage, CaseStudySummary,
} from './caseStudyAdminStore';
import type { CaseStudySnapshotContent, CaseStudyStatus } from '../../types/caseStudy';

/** One import site for a caller: the route should not need to know about the store. */
export { CaseStudyAdminError, isCaseStudyAdminError } from './caseStudyAdminStore';
export type {
  CaseStudyAdminErrorClass, CaseStudyCreateResult, CaseStudyDetail, CaseStudyListPage,
  CaseStudyPublicationSummary, CaseStudySnapshotSummary, CaseStudySummary,
} from './caseStudyAdminStore';

export const MAX_LIST_LIMIT = 100;
export const DEFAULT_LIST_LIMIT = 25;
/** §10.2 pastes a handful of URLs, not a corpus. Also `MAX_REPOS_PER_CASE_STUDY`. */
export const MAX_CREATE_REPOSITORIES = 20;

/* ─────────────────────────────────────────────────────────────── schemas ──── */

const uuid = z.uuid();
const correlation = z.string().min(1).max(200).optional();
const actor = z.string().trim().min(1).max(255);

const listSchema = z.object({
  status: z.enum(['draft', 'review', 'approved', 'published', 'archived']).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  industry: z.string().trim().min(1).max(120).optional(),
  projectId: uuid.optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_LIST_LIMIT).optional(),
  offset: z.number().int().min(0).optional(),
  correlationId: correlation,
});

const slugField = z.string().trim().min(1).max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase words separated by single hyphens');

const fromProjectSchema = z.object({
  projectId: uuid,
  title: z.string().trim().min(1).max(300).optional(),
  slug: slugField.optional(),
  actor,
  correlationId: correlation,
});

const fromReposSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug: slugField.optional(),
  repositories: z.array(z.string().trim().min(1).max(500)).min(1).max(MAX_CREATE_REPOSITORIES),
  actor,
  correlationId: correlation,
});

/**
 * THE HUMAN-OWNED FIELDS, and nothing else (spec §34: "auto-sync facts and human
 * editorial copy must have separate ownership"). A field absent from this object
 * cannot be written through this service at all — the consent columns are here
 * because granting consent IS a human act, and `status` is here because moving a
 * record to `review` is one too.
 */
const updateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  slug: slugField.optional(),
  status: z.enum(['draft', 'review', 'approved', 'archived']).optional(),
  canonicalSummary: z.string().trim().max(8000).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  primaryCapability: z.string().trim().max(120).nullable().optional(),
  programKey: z.string().trim().max(80).nullable().optional(),
  builtByType: z.string().trim().max(40).nullable().optional(),
  visibility: z.enum(['public', 'anonymized', 'private']).optional(),
  organizationDisplayName: z.string().trim().max(255).nullable().optional(),
  organizationIsAnonymized: z.boolean().optional(),
  organizationIdentityMode: z.enum(['named', 'anonymized', 'hidden']).optional(),
  organizationNamingConsent: z.boolean().optional(),
  builderIdentityMode: z.enum(['named', 'role_only', 'anonymous']).optional(),
  builderNamingConsent: z.boolean().optional(),
});

const updateInputSchema = z.object({
  caseStudyId: uuid,
  patch: updateSchema.refine((p) => Object.keys(p).length > 0, {
    message: 'at least one field must be supplied',
  }),
  actor,
  correlationId: correlation,
});

const idSchema = z.object({ caseStudyId: uuid, actor, correlationId: correlation });
const readSchema = z.object({ caseStudyId: uuid, correlationId: correlation });

/* ───────────────────────────────────────────────────── the read operations ── */

/**
 * List/search candidates. Archived rows are EXCLUDED unless asked for, because
 * the dashboard's default question is "what am I working on", and a soft-archive
 * that still shows up in the default list is not an archive.
 */
export async function listCaseStudies(input: unknown): Promise<CaseStudyListPage> {
  const data = validate(listSchema, input ?? {}, 'Case Study list query');
  const correlationId = ensureTraceId(data.correlationId);
  const limit = data.limit ?? DEFAULT_LIST_LIMIT;
  const offset = data.offset ?? 0;

  const where: WhereOptions = {};
  if (data.status) where.status = data.status;
  if (data.industry) where.industry = data.industry;
  if (data.projectId) where.project_id = data.projectId;
  if (!data.includeArchived) where.archived_at = { [Op.is]: null };
  if (data.search) {
    // Parameterised by Sequelize — the value is never interpolated into SQL.
    const like = `%${data.search}%`;
    (where as Record<symbol, unknown>)[Op.or] = [
      { title: { [Op.iLike]: like } }, { slug: { [Op.iLike]: like } },
    ];
  }

  const found = await CaseStudy.findAndCountAll({
    where, limit, offset, order: [['updated_at', 'DESC']],
  });
  const items = (found.rows ?? []).map(toSummary);
  log('case_study.admin_listed', 'success', correlationId, {
    total: found.count ?? items.length, status: data.status,
  });
  return { items, total: found.count ?? items.length, limit, offset };
}

/**
 * One candidate, with everything the review screen needs: its repositories, the
 * latest and the approved snapshot (with provenance, for §20's "inspect
 * provenance"), its publication rows, and an ADVISORY readiness report.
 *
 * Readiness is computed only when a snapshot exists, and its failure is
 * swallowed into `null` on purpose: a scoring error must never make a Case Study
 * unreadable, because the score authorises nothing.
 */
export async function getCaseStudy(input: unknown): Promise<CaseStudyDetail> {
  const data = validate(readSchema, input, 'Case Study read');
  const correlationId = ensureTraceId(data.correlationId);
  const row = await loadCaseStudyRow(data.caseStudyId);

  const [repositories, snapshots, publications] = await Promise.all([
    listRepositories({ caseStudyId: data.caseStudyId, correlationId }),
    CaseStudySnapshot.findAll({
      where: { case_study_id: data.caseStudyId }, order: [['version', 'DESC']], limit: 25,
    }),
    CaseStudyPublication.findAll({ where: { case_study_id: data.caseStudyId } }),
  ]);

  const rows = snapshots ?? [];
  const latest = rows.length > 0 ? toSnapshotSummary(rows[0]) : null;
  const approvedRow = rows.find((s) => s.status === 'approved') ?? null;

  let readiness: CaseStudyReadinessReport | null = null;
  if (latest) {
    try {
      readiness = scoreCaseStudyReadiness({
        content: latest.content as unknown as CaseStudySnapshotContent,
        status: row.status as CaseStudyStatus,
        snapshotStatus: latest.status,
      });
    } catch {
      readiness = null; // advisory: a scoring failure is not a read failure
    }
  }

  log('case_study.admin_read', 'success', correlationId, {
    case_study_id: data.caseStudyId, repo_count: repositories.length, status: row.status,
  });

  return {
    caseStudy: toSummary(row),
    repositories,
    latestSnapshot: latest,
    approvedSnapshot: approvedRow ? toSnapshotSummary(approvedRow) : null,
    publications: (publications ?? []).map((p) => ({
      id: p.id,
      surfaceKey: p.surface_key,
      status: p.status,
      publishedSnapshotId: p.published_snapshot_id ?? null,
      publishedAt: p.published_at ? new Date(p.published_at).toISOString() : null,
      unpublishedAt: p.unpublished_at ? new Date(p.unpublished_at).toISOString() : null,
    })),
    readiness,
  };
}

/* ─────────────────────────────────────────────────── the write operations ── */

/**
 * §10.1 — create a candidate from an existing platform Project.
 *
 * Steps 1-7 of the spec's list, in order: link `project_id`, load Project facts,
 * attach the primary repository the resolver found, link the enrollment's
 * evidence records and portfolio artifacts. Steps 8-10 (sync, snapshot,
 * readiness) are a SEPARATE admin action — `POST …/sync` — because analysing a
 * repository is a network call that can take minutes and must not be hidden
 * inside a create. Step 11 ("do not auto-publish") is satisfied by construction:
 * the row is born `draft` / `private` / no consent, and this module cannot
 * publish anything.
 */
export async function createCaseStudyFromProject(input: unknown): Promise<CaseStudyCreateResult> {
  const data = validate(fromProjectSchema, input, 'create-from-Project request');
  const correlationId = ensureTraceId(data.correlationId);

  // Throws CaseStudyProjectSourceError('CaseStudyProjectNotFound') — mapped to
  // 404 by the route, which reads `http_status` off the error.
  const facts = await loadCaseStudyProjectFacts({ projectId: data.projectId, correlationId });

  const title = data.title ?? facts.name ?? 'Untitled Case Study';
  const slug = data.slug ?? slugifyCaseStudyTitle(title);
  const row = await createCaseStudyRow({
    slug, title, status: 'draft', project_id: data.projectId, source_type: 'project',
    canonical_summary: facts.executiveSummary ?? null,
    industry: facts.industry ?? null,
    program_key: facts.programId ?? null,
    created_by: data.actor,
  }, slug);

  const warnings: string[] = [];
  if (facts.repo.owner && facts.repo.name) {
    try {
      await attachRepository({
        caseStudyId: row.id, reference: `${facts.repo.owner}/${facts.repo.name}`,
        role: 'primary', projectId: data.projectId, correlationId,
      });
    } catch (err) {
      warnings.push(`the Project's repository could not be attached (${errorClassOf(err)}); attach it manually`);
    }
  } else {
    warnings.push('this Project has no connected repository; attach one before syncing');
  }

  // §10.1 steps 5-6. `enrollmentId` is PII: used here, never logged, never returned.
  if (facts.enrollmentId) {
    const enrollmentId = facts.enrollmentId;
    try {
      await linkProjectEvidence({ caseStudyId: row.id, enrollmentId, correlationId });
    } catch (err) {
      warnings.push(`evidence records could not be linked (${errorClassOf(err)})`);
    }
    try {
      await linkPortfolioArtifacts({ caseStudyId: row.id, enrollmentId, correlationId });
    } catch (err) {
      warnings.push(`portfolio artifacts could not be linked (${errorClassOf(err)})`);
    }
  }

  const repositories = await listRepositories({ caseStudyId: row.id, correlationId });
  log('case_study.admin_created_from_project', 'success', correlationId, {
    case_study_id: row.id, project_id: data.projectId, repo_count: repositories.length,
    ...(facts.repo.owner && facts.repo.name
      ? repoLogIdentity(facts.repo.owner, facts.repo.name) : {}),
  });
  return { caseStudy: toSummary(row), repositories, warnings };
}

/**
 * §10.2 — create a candidate from a pasted set of repository references.
 *
 * Every accepted reference form is decided by `attachRepository`, which reuses
 * the existing Repo Connect parser; this function does not parse a URL. The
 * FIRST reference becomes `primary` and the rest default to `other`, which is
 * §10.2's "one primary by default; admin resolves ambiguity before publish".
 *
 * A reference that will not attach does not fail the create: the row exists, the
 * failure is named in `warnings`, and the admin fixes it from the detail screen.
 * Failing the whole create would lose the nine good repositories along with the
 * tenth bad one.
 */
export async function createCaseStudyFromRepoCollection(
  input: unknown,
): Promise<CaseStudyCreateResult> {
  const data = validate(fromReposSchema, input, 'create-from-repositories request');
  const correlationId = ensureTraceId(data.correlationId);
  const slug = data.slug ?? slugifyCaseStudyTitle(data.title);

  const row = await createCaseStudyRow({
    slug, title: data.title, status: 'draft', source_type: 'repo_collection',
    created_by: data.actor,
  }, slug);

  const warnings: string[] = [];
  for (let i = 0; i < data.repositories.length; i += 1) {
    try {
      await attachRepository({
        caseStudyId: row.id, reference: data.repositories[i],
        role: i === 0 ? 'primary' : 'other', correlationId,
      });
    } catch (err) {
      // The reference is echoed because the admin pasted it and needs to know
      // WHICH line failed. It is a repository the admin already holds, not a
      // secret this module discovered.
      warnings.push(`"${data.repositories[i]}" was not attached (${errorClassOf(err)})`);
    }
  }

  const repositories = await listRepositories({ caseStudyId: row.id, correlationId });
  log('case_study.admin_created_from_repos', warnings.length > 0 ? 'partial' : 'success',
    correlationId, { case_study_id: row.id, repo_count: repositories.length });
  return { caseStudy: toSummary(row), repositories, warnings };
}

/**
 * Edit the human-owned editorial and consent fields (spec §34).
 *
 * Only the keys `updateSchema` names can be written, so a request carrying
 * `approved_by` or `id` changes neither. Consent is set here and read by the
 * publish gate; this function makes no publish decision of its own, and moving
 * `status` to `approved` here does NOT publish anything — `publishCaseStudy`
 * re-runs the whole gate on every call.
 */
/**
 * Refuse to archive a Case Study that is still published somewhere.
 *
 * Shared by BOTH doors to the archived state — `archiveCaseStudy` and
 * `updateCaseStudy({status:'archived'})`. It lived inline in the first of those
 * only, which meant the general-purpose PATCH could reach the same state
 * unguarded and leave `case_studies.status` disagreeing with
 * `case_study_publications` about whether the record exists.
 *
 * Deliberately does NOT unpublish on the admin's behalf: spec §35 treats archive
 * and unpublish as distinct operations, and silently taking a public-facing
 * action from a verb that reads as bookkeeping is how a record disappears from
 * a live site without anyone deciding it should. The error names the surfaces,
 * so the recovery is one explicit click.
 */
async function assertNotPublished(
  caseStudyId: string,
  correlationId: string,
  event: string,
): Promise<void> {
  const live = await CaseStudyPublication.findAll({
    where: { case_study_id: caseStudyId, status: 'published' },
  });
  if ((live ?? []).length === 0) return;

  const surfaces = (live ?? []).map((p) => p.surface_key).sort();
  log(event, 'failure', correlationId, {
    case_study_id: caseStudyId, error_class: 'CaseStudyPublished',
  });
  throw new CaseStudyAdminError('CaseStudyPublished',
    `This Case Study is still published to ${surfaces.join(', ')}. Unpublish it before archiving.`,
    { surfaces });
}

export async function updateCaseStudy(input: unknown): Promise<CaseStudySummary> {
  const data = validate(updateInputSchema, input, 'Case Study update');
  const correlationId = ensureTraceId(data.correlationId);
  const row = await loadCaseStudyRow(data.caseStudyId);

  const p = data.patch;
  const values: Record<string, unknown> = {};
  const set = (column: string, value: unknown) => {
    if (value !== undefined) values[column] = value;
  };
  set('title', p.title);
  set('slug', p.slug);
  set('status', p.status);
  set('canonical_summary', p.canonicalSummary);
  set('industry', p.industry);
  set('primary_capability', p.primaryCapability);
  set('program_key', p.programKey);
  set('built_by_type', p.builtByType);
  set('visibility', p.visibility);
  set('organization_display_name', p.organizationDisplayName);
  set('organization_is_anonymized', p.organizationIsAnonymized);
  set('organization_identity_mode', p.organizationIdentityMode);
  set('organization_naming_consent', p.organizationNamingConsent);
  set('builder_identity_mode', p.builderIdentityMode);
  set('builder_naming_consent', p.builderNamingConsent);

  // An explicit `approved` from a human is an approval, and the gate reads
  // `approved_at`/`approved_by` off the record, so stamp them together or the
  // record would claim a status nobody can be held to.
  //
  // (See `assertNotPublished` below — archiving is guarded identically on both
  // the PATCH path and the dedicated archive endpoint.)
  if (p.status === 'approved') {
    values.approved_by = data.actor;
    values.approved_at = new Date();
  }
  if (p.status === 'archived') {
    // The SAME guard `archiveCaseStudy` enforces. Without it there were two
    // paths to one state transition and only one was checked: an admin could
    // archive a still-published record through a general-purpose PATCH, leaving
    // `case_studies.status = 'archived'` while `case_study_publications` kept
    // serving it. Not a public leak — the public read is driven by the
    // publication row, so the story stays live — but the two tables then
    // disagree about whether the record exists, and the next person to trust
    // `status` is misled. A guard on one of two doors is not a guard.
    await assertNotPublished(data.caseStudyId, correlationId, 'case_study.admin_updated');
    values.archived_at = new Date();
  }

  try {
    await row.update(values as never);
  } catch (err) {
    rethrowSlugConflict(err, p.slug);
  }

  log('case_study.admin_updated', 'success', correlationId, {
    case_study_id: data.caseStudyId, status: row.status,
    changed_fields: Object.keys(values).sort(),
  });
  return toSummary(row);
}

/**
 * Soft-archive. Spec §35: "normal admin action must not hard-delete Case
 * Studies", so this sets `status`/`archived_at` and removes nothing.
 *
 * IT REFUSES WHILE THE RECORD IS LIVE. Archiving a published record would leave
 * a story on the public surface that the admin believes they have retired, since
 * the public read is driven by `case_study_publications`, not by
 * `case_studies.status`. Rather than quietly unpublishing on the admin's behalf
 * — a second, unrequested public-facing act — this returns 409 naming the
 * surface, and the admin unpublishes first. Fail closed, in the direction that
 * keeps the two systems' idea of "public" identical.
 */
export async function archiveCaseStudy(input: unknown): Promise<CaseStudySummary> {
  const data = validate(idSchema, input, 'Case Study archive');
  const correlationId = ensureTraceId(data.correlationId);
  const row = await loadCaseStudyRow(data.caseStudyId);

  await assertNotPublished(data.caseStudyId, correlationId, 'case_study.admin_archived');

  await row.update({ status: 'archived', archived_at: new Date() } as never);
  log('case_study.admin_archived', 'success', correlationId, {
    case_study_id: data.caseStudyId, status: 'archived',
  });
  return toSummary(row);
}
