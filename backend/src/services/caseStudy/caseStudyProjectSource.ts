/**
 * caseStudyProjectSource — read the platform facts a Refactored Project already
 * holds, so a Case Study candidate starts from what the system knows rather than
 * from an empty form (spec §10.1 steps 2 and 3, §2.4).
 *
 * ── THE ONE RULE THIS MODULE EXISTS TO ENFORCE ──────────────────────────────
 *
 * The workspace repository is resolved by `resolveProjectRepo()`
 * (`services/projectRepoResolver.ts`), NEVER by treating `projects
 * .github_repo_url` as the answer. That column is a documented production
 * defect: measured 2026-08-20, of the sixteen students who had BOTH a
 * `github_connections.project_id` and a `repo_url`, exactly ZERO of their
 * projects had `github_repo_url` populated. A Case Study built by reading the
 * column directly would report "no repository" for essentially every real
 * Project, and the analyzer would have nothing to analyse.
 *
 * The column IS still read here — once, on the `legacyUrl` line — and handed
 * straight to the resolver as the legacy fallback the resolver itself owns. It
 * is never consulted as an answer, never compared against, never written back.
 * The test asserts both halves: an import check that the resolver decides, and
 * a behavioural case where `github_repo_url` is null while a `GitHubConnection`
 * exists — the adapter must still find the repository.
 *
 * ── READ-ONLY, AND NARROW ───────────────────────────────────────────────────
 *
 * Nothing here writes. `PROJECT_FACT_ATTRIBUTES` is an ALLOW-LIST, not a
 * convenience: `project_variables`, `portfolio_cache`, `claude_md_content`,
 * `requirements_document`, `readiness_score_breakdown` and `share_token` are
 * deliberately not selected. DATA_SOURCE_MAP §4 names raw untyped JSONB blobs as
 * the exact exposure the existing public portfolio route already has and this
 * feature must not repeat; a column never loaded cannot leak.
 *
 * ── WHAT THIS MODULE REFUSES TO DECIDE ──────────────────────────────────────
 *
 * · `organization_name` comes back as `organizationNameCandidate` and is NOT in
 *   the snapshot seed. DATA_SOURCE_MAP §3.1: free text a student typed at
 *   intake, carrying no consent and no provenance — "a candidate for review,
 *   never a publishable value".
 * · `project_stage` is returned verbatim and NOT mapped to a production or
 *   "shipped" status (DATA_SOURCE_MAP §3.6 allows no inferred fallback there):
 *   `stage = 'complete'` means a learner finished a platform workflow, not that
 *   anything runs for a real user.
 * · Everything seeded carries `class: 'pending', method: 'platform'`. Loading a
 *   fact is not verifying it.
 *
 * ── FAILURE-FIRST (root CLAUDE.md) ──────────────────────────────────────────
 * 1. On failure: nothing partial — this module performs no writes at all.
 * 2. Retry: none internally. Two reads, no network call of its own.
 * 3. Recovery: the caller surfaces `error_class`; an unknown project is a 404
 *    the admin corrects by picking a different Project.
 * 4. Handled: malformed input, unknown project id, an archived project, every
 *    optional column null, a project with no GitHubConnection, a stored
 *    `project_stage` outside the union. NOT handled: the database being
 *    unavailable — that propagates, as in `caseStudyRepoCollection`.
 *
 * PII: the log lines carry fixed fields only — never `enrollment_id`, never a
 * student email, never the organisation name or executive summary, never a
 * repository owner/name in the clear. Repository identity goes through
 * `repoLogIdentity()` from `caseStudyRepoReader`, which fails closed to an
 * opaque hash whenever visibility is not known to be public — and a workspace
 * repo's visibility is never known here.
 */
import { z } from 'zod';
import ProjectModel from '../../models/Project';
import type { ProjectStage } from '../../models/Project';
import { resolveProjectRepo } from '../projectRepoResolver';
import type { RepoPointer } from '../projectRepoResolver';
import { repoLogIdentity } from './caseStudyRepoReader';
import { ensureTraceId } from '../../utils/requestContext';
import type { CaseStudySituationSection, CaseStudyVerification } from '../../types/caseStudy';
import type { SnapshotPlatformFacts } from './caseStudySnapshotInput';

/* ──────────────────────────────────────────────────────────── error type ──── */

export type CaseStudyProjectSourceErrorClass =
  /** The call itself was malformed — a bad uuid, a missing field. */
  | 'CaseStudyProjectValidationError'
  /** No `projects` row with that id. */
  | 'CaseStudyProjectNotFound';

const HTTP_STATUS: Record<CaseStudyProjectSourceErrorClass, number> = {
  CaseStudyProjectValidationError: 400,
  CaseStudyProjectNotFound: 404,
};

export class CaseStudyProjectSourceError extends Error {
  public readonly error_class: CaseStudyProjectSourceErrorClass;
  public readonly http_status: number;
  public readonly details: Record<string, unknown>;

  constructor(
    error_class: CaseStudyProjectSourceErrorClass,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CaseStudyProjectSourceError';
    this.error_class = error_class;
    this.http_status = HTTP_STATUS[error_class];
    this.details = details;
  }
}

export function isCaseStudyProjectSourceError(err: unknown): err is CaseStudyProjectSourceError {
  return err instanceof CaseStudyProjectSourceError;
}

/* ───────────────────────────────────────────────────────────── contracts ──── */

/**
 * The columns this adapter loads, and the only ones. A runtime array because it
 * is both passed to Sequelize's `attributes` AND asserted by the test — the
 * allow-list is the exposure control, so it has to be inspectable.
 */
export const PROJECT_FACT_ATTRIBUTES = [
  'id', 'enrollment_id', 'program_id', 'name', 'organization_name', 'industry',
  'primary_business_problem', 'selected_use_case', 'automation_goal', 'project_stage',
  'system_model', 'executive_summary', 'maturity_score', 'requirements_completion_pct',
  'health_score', 'velocity_score', 'stability_score', 'github_repo_url', 'archived_at',
] as const;

/** The shape `projectFactsFromRow` consumes. Every field is nullable — see `Project.ts`. */
export interface ProjectFactRow {
  id: string;
  enrollment_id?: string | null;
  program_id?: string | null;
  name?: string | null;
  organization_name?: string | null;
  industry?: string | null;
  primary_business_problem?: string | null;
  selected_use_case?: string | null;
  automation_goal?: string | null;
  project_stage?: string | null;
  system_model?: Record<string, unknown> | null;
  executive_summary?: string | null;
  maturity_score?: number | string | null;
  requirements_completion_pct?: number | string | null;
  health_score?: number | string | null;
  velocity_score?: number | string | null;
  stability_score?: number | string | null;
  github_repo_url?: string | null;
  archived_at?: Date | string | null;
}

/**
 * The four progress scores plus requirements completion. Absent means the
 * platform never computed it — a different statement from zero, so a missing
 * score is never rendered as `0`.
 */
export interface CaseStudyProjectScores {
  readonly maturity?: number;
  readonly health?: number;
  readonly velocity?: number;
  readonly stability?: number;
  readonly requirementsCompletionPct?: number;
}

/** Typed platform facts for one Project. Every optional key is ABSENT when null. */
export interface CaseStudyProjectFacts {
  readonly projectId: string;
  /**
   * INTERNAL ONLY. `evidence_records` and `runtime_portfolio_artifacts` are
   * keyed on it so `caseStudyEvidenceSource` needs it, but it identifies a
   * person: never logged, never publicly projected (DATA_SOURCE_MAP §4).
   */
  readonly enrollmentId?: string;
  readonly programId?: string;
  readonly name?: string;
  /** `projects.organization_name`. A CANDIDATE for human review. Never published as-is. */
  readonly organizationNameCandidate?: string;
  readonly industry?: string;
  readonly primaryBusinessProblem?: string;
  readonly selectedUseCase?: string;
  readonly automationGoal?: string;
  readonly projectStage?: ProjectStage;
  readonly systemModel?: Record<string, unknown>;
  readonly executiveSummary?: string;
  readonly scores: CaseStudyProjectScores;
  /** Decided by `resolveProjectRepo`. `source: 'none'` is a valid, common answer. */
  readonly repo: RepoPointer;
  readonly archived: boolean;
}

/**
 * The subset of `SnapshotPlatformFacts` a Project may legitimately seed. `Pick`
 * rather than a fresh interface: the builder owns these shapes and a parallel
 * declaration would be free to drift. Note what is NOT picked — `title`,
 * `organizationDisplayName`, every consent flag. Those are human decisions
 * (DATA_SOURCE_MAP §3.1, §3.7), and a type that cannot carry them is a mistake
 * that cannot be made.
 */
export type CaseStudyProjectPlatformSeed = Pick<
  SnapshotPlatformFacts,
  'projectId' | 'industry' | 'summary' | 'situation'
>;

export interface LoadProjectFactsInput {
  projectId: string;
  correlationId?: string;
}

/* ───────────────────────────────────────────────────────────── internals ──── */

const loadSchema = z.object({
  projectId: z.uuid(),
  correlationId: z.string().min(1).max(200).optional(),
});

function validate<S extends z.ZodType>(schema: S, input: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  // Zod v4: `.issues`. `.errors` was removed in v4 and reads as undefined.
  const detail = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  throw new CaseStudyProjectSourceError(
    'CaseStudyProjectValidationError',
    `Malformed ${what}: ${detail}`,
    { issues: parsed.error.issues },
  );
}

type Outcome = 'success' | 'failure';

function log(event: string, outcome: Outcome, correlationId: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-project-source',
    event,
    correlation_id: correlationId,
    outcome,
    ...ctx,
  }));
}

/** Blank, whitespace and null all collapse to "absent". Never to `''`. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** `0` is a real score and survives; `null`, `''` and `NaN` do not. */
function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const PROJECT_STAGES: readonly ProjectStage[] = [
  'discovery', 'architecture', 'implementation', 'portfolio', 'complete',
];

/** Fail closed: a stage the union does not know is ABSENT, not a guessed default. */
function stage(value: unknown): ProjectStage | undefined {
  return PROJECT_STAGES.includes(value as ProjectStage) ? (value as ProjectStage) : undefined;
}

/** An empty JSONB object carries no facts, so it is absent rather than `{}`. */
function jsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length > 0 ? record : undefined;
}

/** Drop undefined keys so "absent" is absent from the object, not present-and-undefined. */
function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** Sequelize instance or a plain row — both are acceptable inputs. */
function plainRow(row: unknown): ProjectFactRow {
  const candidate = row as { get?: (opts: { plain: true }) => ProjectFactRow };
  return typeof candidate?.get === 'function'
    ? candidate.get({ plain: true })
    : (row as ProjectFactRow);
}

/** Loaded, not verified. A human still has to approve anything derived from it. */
const PLATFORM_PENDING: CaseStudyVerification = { class: 'pending', method: 'platform' };

/* ───────────────────────────────────────────────────────── public surface ──── */

/**
 * PURE. Normalise one `projects` row plus an already-resolved repo pointer into
 * typed facts. Separated from the I/O so the nullability rules are testable from
 * literals rather than from a database.
 */
export function projectFactsFromRow(row: ProjectFactRow, repo: RepoPointer): CaseStudyProjectFacts {
  const scores = compact({
    maturity: num(row.maturity_score),
    health: num(row.health_score),
    velocity: num(row.velocity_score),
    stability: num(row.stability_score),
    requirementsCompletionPct: num(row.requirements_completion_pct),
  }) as CaseStudyProjectScores;

  return compact({
    projectId: row.id,
    enrollmentId: text(row.enrollment_id),
    programId: text(row.program_id),
    name: text(row.name),
    organizationNameCandidate: text(row.organization_name),
    industry: text(row.industry),
    primaryBusinessProblem: text(row.primary_business_problem),
    selectedUseCase: text(row.selected_use_case),
    automationGoal: text(row.automation_goal),
    projectStage: stage(row.project_stage),
    systemModel: jsonObject(row.system_model),
    executiveSummary: text(row.executive_summary),
    scores,
    repo,
    archived: row.archived_at !== null && row.archived_at !== undefined,
  }) as CaseStudyProjectFacts;
}

/**
 * PURE. The seed handed to the snapshot builder. `situation` follows
 * DATA_SOURCE_MAP §3.3's ladder — `primary_business_problem` first,
 * `selected_use_case` as fallback — and is omitted entirely when the Project
 * carries neither, because spec §23 hides an unsupported section rather than
 * rendering it empty.
 */
export function toPlatformFactsSeed(facts: CaseStudyProjectFacts): CaseStudyProjectPlatformSeed {
  return compact({
    projectId: facts.projectId,
    industry: facts.industry,
    summary: facts.executiveSummary,
    situation: situationFrom(facts),
  }) as CaseStudyProjectPlatformSeed;
}

function situationFrom(facts: CaseStudyProjectFacts): CaseStudySituationSection | undefined {
  const problem = facts.primaryBusinessProblem ?? facts.selectedUseCase;
  const goals = facts.automationGoal ? [facts.automationGoal] : undefined;
  if (!problem && !goals) return undefined;
  return compact({
    narrative: problem ? [problem] : [],
    goals,
    verification: PLATFORM_PENDING,
  }) as CaseStudySituationSection;
}

/**
 * Load one Project's facts, repository included. Two reads and no writes: the
 * `projects` row (narrow allow-list) and whatever `resolveProjectRepo` needs. A
 * Project with no `GitHubConnection` and no legacy URL yields
 * `repo.source === 'none'` and is still a valid candidate — most real Projects
 * are in exactly that state and refusing them would make the feature unusable.
 */
export async function loadCaseStudyProjectFacts(
  input: LoadProjectFactsInput,
): Promise<CaseStudyProjectFacts> {
  const data = validate(loadSchema, input, 'project facts request');
  const correlationId = ensureTraceId(data.correlationId);

  const found = await ProjectModel.findByPk(data.projectId, {
    attributes: [...PROJECT_FACT_ATTRIBUTES],
  });
  if (!found) {
    log('case_study_project_source.load', 'failure', correlationId, {
      project_id: data.projectId,
      error_class: 'CaseStudyProjectNotFound',
    });
    throw new CaseStudyProjectSourceError(
      'CaseStudyProjectNotFound',
      `No project ${data.projectId}`,
      { project_id: data.projectId },
    );
  }

  const row = plainRow(found);
  // The ONLY read of this column in the module, and it is not an answer: it is
  // handed to the resolver as the legacy fallback the resolver owns (see header).
  const legacyUrl = row.github_repo_url ?? null;
  const repo = await resolveProjectRepo(data.projectId, legacyUrl);
  const facts = projectFactsFromRow({ ...row, id: data.projectId }, repo);

  log('case_study_project_source.load', 'success', correlationId, {
    project_id: data.projectId,
    repo_source: repo.source,
    ...(repo.owner && repo.name ? repoLogIdentity(repo.owner, repo.name) : {}),
    project_stage: facts.projectStage ?? null,
    archived: facts.archived,
    score_count: Object.keys(facts.scores).length,
    has_system_model: facts.systemModel !== undefined,
    has_executive_summary: facts.executiveSummary !== undefined,
  });

  return facts;
}
