/**
 * caseStudyRepoCollection — attach, remove and role-assign the repositories a
 * Case Study cites as evidence (spec §10.2, §37).
 *
 * WHY THIS IS NOT REPO CONNECT
 * A Project has exactly ONE primary workspace repo, enforced by a PARTIAL unique
 * index (`github_connections_unique_project`, `db/ensureWorkspaceRepoSchema.ts:42`)
 * plus the application guards in `sbp/repoConnect/repoConnectService.ts`. A Case
 * Study repo collection is a different thing: MANY evidence repos, cited by MANY
 * case studies, binding nothing — the same repo may be one Project's workspace
 * and evidence in five Case Studies at once. So this module never calls those
 * guards or the connect/adopt flow, and never creates, updates or deletes a
 * `github_connections` row. It writes to exactly two tables:
 * `case_study_repo_collections` and `case_study_repositories`. The test file
 * asserts that statically AND at runtime, because "we remembered not to" is not
 * an invariant.
 *
 * ONE PARSER, NOT THREE
 * References are parsed by `parseRepoReference()`
 * (`sbp/repoConnect/repoReference.ts:54`) and compared by `sameRepo()` — the same
 * pure, tested parser Repo Connect uses. The two legacy regexes
 * (`projectRepoResolver.ts:57`, `githubService.ts:10`) are NOT used: both stop the
 * repo name at the first dot, so `owner/repo.js` silently becomes `repo` and the
 * Case Study cites a repository that does not exist. A test attaches
 * `owner/repo.js` precisely to prove which parser is in play.
 *
 * FAILURE-FIRST DESIGN (root CLAUDE.md)
 * 1. On failure: nothing partial. Bad input, a bad reference and a full
 *    collection are all rejected before any write, and the demote-then-write pair
 *    runs in one transaction — a failed attach cannot leave zero primaries.
 * 2. Retry: none internally; these are single statements, not network calls.
 *    Replay safety comes from idempotency — re-attaching returns the existing row.
 * 3. Recovery: the caller surfaces `error_class` to the admin, who corrects the
 *    input. No queue, no side effect to unwind.
 * 4. Handled: invalid/non-GitHub reference, malformed input, duplicate attach,
 *    the concurrent-duplicate unique-index race, a full collection, an unknown
 *    repository id, and an id belonging to another Case Study. NOT handled: the
 *    database being unavailable — that propagates to the route, where connection
 *    failures are already classified.
 *
 * SECRETS: this module never receives, reads or stores a GitHub token (those live
 * in `sbp/repoConnect/githubRepoClient.ts`), which is why the logs below can
 * safely carry every field they carry.
 */
import { z } from 'zod';
import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import CaseStudyRepoCollectionModel from '../../models/CaseStudyRepoCollection';
import CaseStudyRepositoryModel from '../../models/CaseStudyRepository';
import {
  ACCESS_STATUSES, CASE_STUDY_REPO_ROLES, REPO_VISIBILITIES, asRole, oneOf, sortRecords, toRecord,
} from './caseStudyRepoRecord';
import type { CaseStudyRepositoryRecord, RepoRow } from './caseStudyRepoRecord';
import { MAX_SCOPE_PREFIXES, normaliseScope } from './repoPathScope';
import { CaseStudyRepoError } from './caseStudyRepoErrors';
import { parseRepoReference, sameRepo } from '../sbp/repoConnect/repoReference';
import { isRepoConnectError } from '../sbp/repoConnect/connectErrors';
import { ensureTraceId } from '../../utils/requestContext';
import type { CaseStudyRepoRole, CaseStudyRepoVisibility } from '../../types/caseStudy';

/*
 * Re-exported, not redefined. Routes and services have imported these from this
 * module since T004; the row mapping moved to `caseStudyRepoRecord.ts` when this
 * file reached the 500-line ceiling, and callers should not have to care which
 * half of the split they came from.
 */
export { CASE_STUDY_REPO_ROLES, ACCESS_STATUSES, REPO_VISIBILITIES } from './caseStudyRepoRecord';
export type { CaseStudyRepositoryRecord } from './caseStudyRepoRecord';
export { CaseStudyRepoError, isCaseStudyRepoError } from './caseStudyRepoErrors';
export type { CaseStudyRepoErrorClass } from './caseStudyRepoErrors';

/* ─────────────────────────────────────────────────────────── vocabulary ──── */

/**
 * Spec §37: "bound repo count per collection … suggested max 20 repos per Case
 * Study". The bound is a security control, not a UX nicety — every attached repo
 * multiplies the analyzer's outbound GitHub calls in T005.
 */
export const MAX_REPOS_PER_CASE_STUDY = 20;

/* ──────────────────────────────────────────────────────────── error type ──── */

/* ───────────────────────────────────────────────────────────── contracts ──── */

export interface AttachRepositoryInput {
  caseStudyId: string;
  /** Anything §10.2 accepts: browser URL, /tree/main, .git, ssh, scp, owner/repo. */
  reference: string;
  role?: CaseStudyRepoRole;
  visibility?: CaseStudyRepoVisibility;
  allowPublicRepoLink?: boolean;
  projectId?: string | null;
  /**
   * A POINTER to an existing connection row, so the §10.1 "from existing Project"
   * flow can show where the repo came from. Writing the id writes only to
   * `case_study_repositories`; no connection row is read, created or claimed.
   */
  githubConnectionId?: string | null;
  /**
   * Path prefixes this Case Study is about. Omitted or empty means the whole
   * repository, which is the pre-scoping behaviour and stays the default.
   */
  pathScope?: string[];
  correlationId?: string;
}

export interface AttachRepositoryResult {
  repository: CaseStudyRepositoryRecord;
  collectionId: string;
  /** false when the repo was already attached — the idempotent no-op. */
  created: boolean;
}

// Zod v4. Every public function validates at the service boundary — the same
// pattern as `workLedgerService.emitEvent()` — so an unvalidated route or an
// internal caller cannot reach a database write with a malformed id.
const uuid = z.uuid();
const correlation = z.string().min(1).max(200).optional();
const roleSchema = z.enum(CASE_STUDY_REPO_ROLES);

/**
 * A scope prefix is bounded on BOTH axes. Length, because it is stored in a
 * TEXT[] an admin types into; count, because each prefix widens the claim. The
 * array itself is capped rather than left open: an unbounded list on a public
 * write path is a payload, not a setting.
 */
const scopeSchema = z.array(z.string().min(1).max(500)).max(MAX_SCOPE_PREFIXES).optional();

const attachSchema = z.object({
  caseStudyId: uuid, reference: z.string().min(1).max(500),
  role: roleSchema.optional(), visibility: z.enum(REPO_VISIBILITIES).optional(),
  allowPublicRepoLink: z.boolean().optional(), projectId: uuid.nullable().optional(),
  githubConnectionId: uuid.nullable().optional(), pathScope: scopeSchema,
  correlationId: correlation,
});
const removeSchema = z.object({ caseStudyId: uuid, repositoryId: uuid, correlationId: correlation });
const setRoleSchema = z.object({
  caseStudyId: uuid, repositoryId: uuid, role: roleSchema, correlationId: correlation,
});
const setScopeSchema = z.object({
  caseStudyId: uuid, repositoryId: uuid,
  // NOT optional here: this endpoint's whole job is to state the scope, and an
  // absent field would be indistinguishable from "clear it". `[]` clears it.
  pathScope: z.array(z.string().min(1).max(500)).max(MAX_SCOPE_PREFIXES),
  correlationId: correlation,
});
const listSchema = z.object({ caseStudyId: uuid, correlationId: correlation });

/* ───────────────────────────────────────────────────────────── internals ──── */

function validate<S extends z.ZodType>(schema: S, input: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  // Zod v4: `.issues`. `.errors` was removed in v4 and reads as undefined.
  const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  throw new CaseStudyRepoError('CaseStudyRepoValidationError', `Malformed ${what}: ${detail}`, {
    issues: parsed.error.issues,
  });
}

type Outcome = 'success' | 'failure' | 'unchanged';

function log(event: string, outcome: Outcome, correlationId: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-repo-collection',
    event,
    correlation_id: correlationId,
    outcome,
    ...ctx,
  }));
}

/**
 * Load the collection's rows as PLAIN OBJECTS, not Sequelize instances.
 *
 * `rows as unknown as RepoRow[]` was a cast, and the cast was a lie: a Sequelize
 * instance exposes its columns through prototype GETTERS, so `row.repo_owner`
 * reads correctly but `{ ...row }` copies `dataValues`, `_previousDataValues`
 * and none of the columns. Every caller that spread a row therefore produced an
 * object whose every field was `undefined` — and `toRecord` turned that into a
 * record reading `undefined/undefined` with the fail-closed defaults for role and
 * visibility, which looks like data rather than like an error.
 *
 * That is exactly what `setRepositoryRole` and `setRepositoryPathScope` returned
 * to the admin UI. Calling `.get({ plain: true })` here makes the cast honest and
 * fixes both at the source rather than at each call site, where the next one
 * would reintroduce it.
 */
async function loadRows(collectionId: string, transaction?: Transaction): Promise<RepoRow[]> {
  const rows = await CaseStudyRepositoryModel.findAll({
    where: { collection_id: collectionId }, ...(transaction ? { transaction } : {}),
  });
  return rows.map(plainRow);
}

/** A model instance, or something already plain, as a plain row. */
function plainRow(row: unknown): RepoRow {
  const maybe = row as { get?: (opts: { plain: boolean }) => unknown };
  return (typeof maybe?.get === 'function' ? maybe.get({ plain: true }) : row) as RepoRow;
}

/**
 * Exactly one `primary` (spec §10.2): a second primary DEMOTES the first to
 * `other` rather than throwing.
 *
 * DECISION, recorded deliberately: an admin marking a second repo primary has
 * stated an intent, and refusing it would force a demote-then-promote dance whose
 * intermediate state has NO primary at all. Demotion keeps the invariant true
 * after every single call, and nothing is lost — the demoted repo is still in the
 * collection, still analysed, and §10.2 leaves ambiguity to the admin to resolve
 * before publish, which the publish gate (T012) enforces.
 */
async function demotePrimaries(rows: RepoRow[], keepId: string | null, transaction?: Transaction): Promise<string[]> {
  const ids = rows.filter((r) => asRole(r.role) === 'primary' && r.id !== keepId).map((r) => r.id);
  if (ids.length === 0) return [];
  await CaseStudyRepositoryModel.update({ role: 'other' }, {
    where: { id: ids }, ...(transaction ? { transaction } : {}),
  });
  return ids;
}

/** Read-only lookup. Never creates — a list must not have a side effect. */
async function findCollectionId(caseStudyId: string): Promise<string | null> {
  const found = await CaseStudyRepoCollectionModel.findOne({ where: { case_study_id: caseStudyId } });
  return found ? (found as unknown as { id: string }).id : null;
}

/**
 * The Case Study's collection, created on first use. Idempotent: `findOrCreate`
 * on `case_study_id`, so two concurrent attaches share one collection.
 */
export async function ensureRepoCollection(caseStudyId: string, transaction?: Transaction): Promise<string> {
  const id = validate(uuid, caseStudyId, 'case study id');
  const [row] = await CaseStudyRepoCollectionModel.findOrCreate({
    where: { case_study_id: id }, ...(transaction ? { transaction } : {}),
    defaults: { case_study_id: id, name: 'Sources', status: 'active' },
  });
  return (row as unknown as { id: string }).id;
}

/* ───────────────────────────────────────────────────────── public surface ──── */

/**
 * Attach one repository to a Case Study's collection.
 *
 * Idempotent by identity, not by key: the repo IS the key. Attaching the same
 * repository twice — in any accepted form, in any casing — returns the existing
 * row with `created: false` and writes nothing. That check runs BEFORE the bound
 * check on purpose: a replayed request must not start failing just because the
 * collection filled up in between.
 */
export async function attachRepository(input: AttachRepositoryInput): Promise<AttachRepositoryResult> {
  const data = validate(attachSchema, input, 'attachRepository input');
  const correlationId = ensureTraceId(data.correlationId);

  // Parse first: a hostile or mistyped string never reaches the database. The
  // parser's RepoConnectError is re-raised as this module's error type so a Case
  // Study caller has ONE error shape, with the class string preserved verbatim.
  let ref;
  try {
    ref = parseRepoReference(data.reference);
  } catch (err) {
    if (isRepoConnectError(err) && err.error_class === 'InvalidRepoReference') {
      log('case_study.repo_attach_rejected', 'failure', correlationId, {
        case_study_id: data.caseStudyId, error_class: 'InvalidRepoReference',
      });
      throw new CaseStudyRepoError('InvalidRepoReference', err.student_message, err.details);
    }
    throw err;
  }

  const role: CaseStudyRepoRole = data.role ?? 'other';

  return sequelize.transaction(async (transaction: Transaction) => {
    const collectionId = await ensureRepoCollection(data.caseStudyId, transaction);
    const rows = await loadRows(collectionId, transaction);

    const existing = rows.find((r) => sameRepo({ owner: r.repo_owner, repo: r.repo_name }, ref));
    if (existing) {
      // No-op, deliberately including the role: re-attaching must not silently
      // re-classify a repo an admin already placed. Use setRepositoryRole().
      log('case_study.repo_attached', 'unchanged', correlationId, {
        case_study_id: data.caseStudyId, collection_id: collectionId,
        repo_owner: existing.repo_owner, repo_name: existing.repo_name, repo_count: rows.length,
      });
      return { repository: toRecord(existing), collectionId, created: false };
    }

    if (rows.length >= MAX_REPOS_PER_CASE_STUDY) {
      log('case_study.repo_attach_rejected', 'failure', correlationId, {
        case_study_id: data.caseStudyId, collection_id: collectionId,
        repo_owner: ref.owner, repo_name: ref.repo,
        error_class: 'RepoCollectionFull', repo_count: rows.length,
      });
      throw new CaseStudyRepoError(
        'RepoCollectionFull',
        `This Case Study already cites ${MAX_REPOS_PER_CASE_STUDY} repositories, which is the maximum. ` +
          'Remove one before adding another.',
        { case_study_id: data.caseStudyId, limit: MAX_REPOS_PER_CASE_STUDY, current: rows.length },
      );
    }

    if (role === 'primary') await demotePrimaries(rows, null, transaction);

    let created: RepoRow;
    try {
      created = plainRow(await CaseStudyRepositoryModel.create({
        collection_id: collectionId,
        repo_owner: ref.owner,
        repo_name: ref.repo,
        repo_url: ref.url,
        role,
        visibility: data.visibility ?? 'unknown',
        access_status: 'unknown',
        allow_public_repo_link: data.allowPublicRepoLink === true,
        project_id: data.projectId ?? null,
        github_connection_id: data.githubConnectionId ?? null,
        path_scope: normaliseScope(data.pathScope ?? []),
        metadata: {},
      }, { transaction })) as unknown as RepoRow;
    } catch (err) {
      // The database's case-insensitive unique index
      // (`cs_repositories_unique_per_collection`) is the second half of the
      // dedupe. Two overlapping attaches of the same repo: one wins, and the
      // loser returns the winner's row rather than an error the admin cannot act on.
      if ((err as { name?: string })?.name === 'SequelizeUniqueConstraintError') {
        const after = await loadRows(collectionId, transaction);
        const winner = after.find((r) => sameRepo({ owner: r.repo_owner, repo: r.repo_name }, ref));
        if (winner) {
          log('case_study.repo_attached', 'unchanged', correlationId, {
            case_study_id: data.caseStudyId, collection_id: collectionId,
            repo_owner: winner.repo_owner, repo_name: winner.repo_name, race: true,
          });
          return { repository: toRecord(winner), collectionId, created: false };
        }
      }
      throw err;
    }

    log('case_study.repo_attached', 'success', correlationId, {
      case_study_id: data.caseStudyId, collection_id: collectionId,
      repo_owner: ref.owner, repo_name: ref.repo, role, repo_count: rows.length + 1,
    });
    return { repository: toRecord(created), collectionId, created: true };
  });
}

/**
 * Detach a repository. Idempotent: removing one that is already gone returns
 * `{ removed: false }` rather than throwing, so a retried admin click is safe.
 * Scoped to the Case Study's own collection — an id belonging to another Case
 * Study matches nothing and deletes nothing.
 */
export async function removeRepository(
  input: { caseStudyId: string; repositoryId: string; correlationId?: string },
): Promise<{ removed: boolean }> {
  const data = validate(removeSchema, input, 'removeRepository input');
  const correlationId = ensureTraceId(data.correlationId);

  const collectionId = await findCollectionId(data.caseStudyId);
  if (!collectionId) {
    log('case_study.repo_removed', 'unchanged', correlationId, {
      case_study_id: data.caseStudyId, repository_id: data.repositoryId, reason: 'no_collection',
    });
    return { removed: false };
  }

  const deleted = await CaseStudyRepositoryModel.destroy({
    where: { id: data.repositoryId, collection_id: collectionId },
  });

  log('case_study.repo_removed', deleted > 0 ? 'success' : 'unchanged', correlationId, {
    case_study_id: data.caseStudyId, collection_id: collectionId,
    repository_id: data.repositoryId, removed: deleted > 0,
  });
  return { removed: deleted > 0 };
}

/**
 * Change a repository's role. Unlike remove, an unknown id throws: the caller
 * asked for a state change that did not happen, and returning success would be a
 * lie. Promoting to `primary` demotes any incumbent (see `demotePrimaries`).
 */
export async function setRepositoryRole(
  input: { caseStudyId: string; repositoryId: string; role: CaseStudyRepoRole; correlationId?: string },
): Promise<CaseStudyRepositoryRecord> {
  const data = validate(setRoleSchema, input, 'setRepositoryRole input');
  const correlationId = ensureTraceId(data.correlationId);

  const collectionId = await findCollectionId(data.caseStudyId);
  const rows = collectionId ? await loadRows(collectionId) : [];
  const target = rows.find((r) => r.id === data.repositoryId);
  if (!collectionId || !target) {
    log('case_study.repo_role_set', 'failure', correlationId, {
      case_study_id: data.caseStudyId, repository_id: data.repositoryId,
      error_class: 'CaseStudyRepoNotFound',
    });
    throw new CaseStudyRepoError(
      'CaseStudyRepoNotFound',
      'That repository is not attached to this Case Study.',
      { case_study_id: data.caseStudyId, repository_id: data.repositoryId },
    );
  }

  return sequelize.transaction(async (transaction: Transaction) => {
    const demoted = data.role === 'primary'
      ? await demotePrimaries(rows, target.id, transaction)
      : [];

    await CaseStudyRepositoryModel.update(
      { role: data.role },
      { where: { id: target.id, collection_id: collectionId }, transaction },
    );

    log('case_study.repo_role_set', 'success', correlationId, {
      case_study_id: data.caseStudyId, collection_id: collectionId,
      repository_id: target.id, repo_owner: target.repo_owner, repo_name: target.repo_name,
      role: data.role, demoted_count: demoted.length,
    });
    return toRecord({ ...target, role: data.role });
  });
}

/**
 * Every repository this Case Study cites, primary first. A Case Study with no
 * collection yet returns `[]` — that is a real state (nothing attached), not an
 * error, and this read never creates the collection as a side effect.
 */
export async function listRepositories(
  input: { caseStudyId: string; correlationId?: string },
): Promise<CaseStudyRepositoryRecord[]> {
  const data = validate(listSchema, input, 'listRepositories input');
  const correlationId = ensureTraceId(data.correlationId);

  const collectionId = await findCollectionId(data.caseStudyId);
  if (!collectionId) {
    log('case_study.repos_listed', 'success', correlationId, {
      case_study_id: data.caseStudyId, repo_count: 0, collection_id: null,
    });
    return [];
  }

  const rows = await loadRows(collectionId);
  const records = sortRecords(rows.map(toRecord));
  log('case_study.repos_listed', 'success', correlationId, {
    case_study_id: data.caseStudyId, collection_id: collectionId, repo_count: records.length,
  });
  return records;
}

/**
 * Set (or clear) the part of a repository a Case Study is about.
 *
 * SEPARATE FROM ATTACH ON PURPOSE. The scope is the one field an admin gets
 * wrong on the first try — it is a path typed from memory, and the analyzer only
 * reveals whether it matched anything after a sync has run. If the only way to
 * set it were `attachRepository`, correcting a typo would mean detaching and
 * re-attaching, which discards `last_seen_sha`, `last_synced_at` and the
 * repository's id — and every snapshot that cites that id.
 *
 * `[]` CLEARS the scope and returns the repository to describing the whole
 * repository. That is a real operation, not a degenerate one: it is how an admin
 * undoes a scope that turned out to be wrong.
 *
 * NOT REVALIDATED AGAINST THE REPOSITORY HERE. Whether a prefix matches any real
 * path is a question only the analyzer can answer, and answering it here would
 * mean a GitHub call inside an admin write. The analyzer raises
 * `path scope matched 0 of N paths` on the next sync instead — visible, and on
 * the surface that actually looked.
 */
export async function setRepositoryPathScope(
  input: { caseStudyId: string; repositoryId: string; pathScope: string[]; correlationId?: string },
): Promise<CaseStudyRepositoryRecord> {
  const data = validate(setScopeSchema, input, 'setRepositoryPathScope input');
  const correlationId = ensureTraceId(data.correlationId);
  const pathScope = normaliseScope(data.pathScope);

  const collectionId = await findCollectionId(data.caseStudyId);
  const rows = collectionId ? await loadRows(collectionId) : [];
  const target = rows.find((r) => r.id === data.repositoryId);
  if (!collectionId || !target) {
    log('case_study.repo_scope_set', 'failure', correlationId, {
      case_study_id: data.caseStudyId, repository_id: data.repositoryId,
      error_class: 'CaseStudyRepoNotFound',
    });
    throw new CaseStudyRepoError(
      'CaseStudyRepoNotFound',
      'That repository is not attached to this Case Study.',
      { case_study_id: data.caseStudyId, repository_id: data.repositoryId },
    );
  }

  await CaseStudyRepositoryModel.update(
    { path_scope: pathScope },
    { where: { id: target.id, collection_id: collectionId } },
  );

  // The prefixes themselves are logged: they are paths inside a repository the
  // admin already holds, never a token and never a secret, and a scope that
  // silently matched nothing is unreadable without them.
  log('case_study.repo_scope_set', 'success', correlationId, {
    case_study_id: data.caseStudyId, collection_id: collectionId, repository_id: target.id,
    repo_owner: target.repo_owner, repo_name: target.repo_name,
    prefix_count: pathScope.length, path_scope: pathScope, cleared: pathScope.length === 0,
  });
  return toRecord({ ...target, path_scope: pathScope });
}
