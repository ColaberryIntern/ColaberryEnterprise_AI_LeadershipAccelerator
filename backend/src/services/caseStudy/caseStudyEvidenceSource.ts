/**
 * caseStudyEvidenceSource — LINK the evidence and artifacts a learner already
 * produced to a Case Study (spec §10.1 steps 5 and 6, §2.6).
 *
 * LINK, NEVER MUTATE. `evidence_records` is the currency of progression: each
 * row awards Builder XP and carries a unique `idempotency_key`. It has NO
 * foreign keys and is keyed on `enrollment_id`. This module reads it and writes
 * a pointer into `case_study_evidence.evidence_record_id` — a bare UUID, as the
 * schema intends. It never updates, creates or destroys an `EvidenceRecord`, nor
 * a `PortfolioArtifact`. Editing a learner's evidence to make a story read
 * better would corrupt the ledger the platform grades on. The test asserts it
 * twice: statically over the source text, and at runtime with model mocks whose
 * write methods fail the suite if called.
 *
 * A CANDIDATE IS NOT A PUBLICATION. Every `case_study_artifacts` row created
 * here lands `status: 'candidate'`, `visibility: 'private'`, no public or
 * preview URL — a human promotes it later, nothing in this file may. Every
 * `case_study_evidence` row lands `verification_class: 'pending'` and
 * `is_publicly_openable: false` even when the source record has
 * `validated = true`: the platform confirming a learner did the work is not a
 * person deciding it may appear publicly (DATA_SOURCE_MAP §3.5).
 *
 * THE NAME COLLISION. `runtime_portfolio_artifacts.kind` DEFAULTS to the literal
 * `'case_study'`, meaning "a learner's case-study writeup". It is an artifact
 * KIND. It is not, and never becomes, a row in `case_studies`. This module maps
 * it to `artifact_type: 'document'` like any other writeup and imports no
 * CaseStudy model at all. A test pins that.
 *
 * FAILURE-FIRST (root CLAUDE.md). (1) On failure mid-loop earlier rows stay —
 * safe, because a re-run skips what is already linked, so recovery is "run it
 * again". (2) No internal retry: single statements, not network calls. (3) The
 * caller surfaces `error_class`; a stray candidate is visible to the reviewer
 * and deletable. (4) Handled: malformed input, an enrollment with no evidence, a
 * repeat call, duplicates inside one batch, an over-long title, an unknown
 * `source_type` or `kind`, unbounded row counts, and a unique-constraint
 * violation from a concurrent run (see IDEMPOTENCY — it surfaces as a tagged
 * error and the correct response is to re-run, which then links nothing).
 * NOT handled: the database being unavailable — that propagates, as in
 * `caseStudyRepoCollection`.
 *
 * IDEMPOTENCY: check-then-create on `(case_study_id, evidence_record_id)` and
 * `(case_study_id, portfolio_artifact_id)`, backed by a database guarantee.
 * Both pairs carry a PARTIAL unique index in `ensureCaseStudySchema.ts` —
 * `cs_evidence_unique_source_record` and `cs_artifacts_unique_portfolio_source`,
 * each `WHERE <source_id> IS NOT NULL`. So the service checks and the database
 * guarantees: two SIMULTANEOUS runs cannot both insert, because the second gets a
 * constraint violation at insert time rather than silently creating a duplicate.
 * Partial, so that manually-created evidence and artifacts — which carry NULL in
 * the source column and are excluded from the index — remain unlimited.
 * Sequential re-runs, the actual replay case, still write nothing.
 *
 * PII: `evidence_records` is enrollment-keyed, so the risk is live. The logs
 * carry counts, Case Study ids and a correlation id — never `enrollment_id`,
 * never `card_id`, never a `source_ref` (a private repo URL fits there), never
 * an artifact title, never an email.
 */
import { z } from 'zod';
import EvidenceRecordModel from '../../models/EvidenceRecord';
import PortfolioArtifactModel from '../../models/PortfolioArtifact';
import CaseStudyEvidenceModel from '../../models/CaseStudyEvidence';
import CaseStudyArtifactModel from '../../models/CaseStudyArtifact';
import { ensureTraceId } from '../../utils/requestContext';
import type {
  CaseStudyArtifactRef,
  CaseStudyArtifactType,
  CaseStudyEvidenceSourceType,
} from '../../types/caseStudy';

/* ──────────────────────────────────────────────────────────── error type ──── */

export type CaseStudyEvidenceSourceErrorClass = 'CaseStudyEvidenceValidationError';

export class CaseStudyEvidenceSourceError extends Error {
  public readonly error_class: CaseStudyEvidenceSourceErrorClass;
  public readonly http_status = 400;
  public readonly details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CaseStudyEvidenceSourceError';
    this.error_class = 'CaseStudyEvidenceValidationError';
    this.details = details;
  }
}

export function isCaseStudyEvidenceSourceError(err: unknown): err is CaseStudyEvidenceSourceError {
  return err instanceof CaseStudyEvidenceSourceError;
}

/* ───────────────────────────────────────────────────────────── contracts ──── */

/** Spec §37 bounds every collection: one admin click must not be 900 inserts. */
export const MAX_LINKED_EVIDENCE = 200;
export const MAX_LINKED_ARTIFACTS = 100;

/** `case_study_evidence.title` is VARCHAR(300); `PortfolioArtifact.title` is 400. */
const TITLE_MAX = 300;
const REF_MAX = 512;
const DESCRIPTION_MAX = 4000;

/** `enrollmentId` comes from `CaseStudyProjectFacts.enrollmentId`. PII — never logged. */
export interface LinkArtifactsInput {
  caseStudyId: string; enrollmentId: string; limit?: number; correlationId?: string;
}

/** Adds optional narrowing to specific curriculum cards. */
export interface LinkEvidenceInput extends LinkArtifactsInput { cardIds?: string[]; }

/** `scanned` is what the bound returned, not what the enrollment holds. */
export interface LinkCounts {
  readonly created: number;
  readonly alreadyLinked: number;
  readonly scanned: number;
}

export interface LinkedEvidence {
  readonly id: string;
  readonly evidenceRecordId: string;
  readonly sourceType: CaseStudyEvidenceSourceType;
  readonly title: string;
  /** Always `'pending'` and always closed. Linking is not verifying. */
  readonly verificationClass: 'pending';
  readonly isPubliclyOpenable: false;
}

export interface LinkEvidenceResult extends LinkCounts {
  readonly linked: readonly LinkedEvidence[];
}

export interface LinkArtifactsResult extends LinkCounts {
  /** `CaseStudyArtifactRef` from `types/caseStudy` — no parallel shape. */
  readonly artifacts: readonly CaseStudyArtifactRef[];
}

/* ───────────────────────────────────────────────────────────── internals ──── */

const uuid = z.uuid();
const correlation = z.string().min(1).max(200).optional();

const linkArtifactsSchema = z.object({
  caseStudyId: uuid, enrollmentId: uuid, correlationId: correlation,
  limit: z.number().int().positive().max(MAX_LINKED_ARTIFACTS).optional(),
});

const linkEvidenceSchema = z.object({
  caseStudyId: uuid, enrollmentId: uuid, correlationId: correlation,
  cardIds: z.array(uuid).max(500).optional(),
  limit: z.number().int().positive().max(MAX_LINKED_EVIDENCE).optional(),
});

function validate<S extends z.ZodType>(schema: S, input: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  // Zod v4: `.issues`. `.errors` was removed in v4 and reads as undefined.
  const detail = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  throw new CaseStudyEvidenceSourceError(`Malformed ${what}: ${detail}`, {
    issues: parsed.error.issues,
  });
}

type Outcome = 'success' | 'failure' | 'unchanged';

/**
 * FIXED FIELDS ONLY. Spreading a row in here is how an enrollment id or a
 * private repo URL ends up in a log, so the signature does not accept one.
 */
function log(
  event: string,
  outcome: Outcome,
  correlationId: string,
  caseStudyId: string,
  counts: { scanned: number; created: number; alreadyLinked: number },
  extra: Record<string, string | number | boolean | null> = {},
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-evidence-source',
    event,
    correlation_id: correlationId,
    outcome,
    case_study_id: caseStudyId,
    scanned: counts.scanned,
    created: counts.created,
    already_linked: counts.alreadyLinked,
    ...extra,
  }));
}

const EVIDENCE_EVENT = 'case_study_evidence_source.link_evidence';
const ARTIFACT_EVENT = 'case_study_evidence_source.link_artifacts';

function plain<T>(row: unknown): T {
  const candidate = row as { get?: (opts: { plain: true }) => T };
  return typeof candidate?.get === 'function' ? candidate.get({ plain: true }) : (row as T);
}

function trim(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

interface EvidenceRow {
  id?: string; source_type?: string | null; source_ref?: string | null;
  builder_xp?: number | null; validated?: boolean | null;
}

interface ArtifactRow {
  id?: string; kind?: string | null; title?: string | null; summary?: string | null;
}

/**
 * `EvidenceSource` (nine values, `models/EvidenceRecord.ts`) onto
 * `CaseStudyEvidenceSourceType`. Only the three with an exact counterpart are
 * translated; the rest stay honest as `evidence_record`, which is literally
 * where they came from. Unknown strings fail closed to the same value.
 */
const EVIDENCE_SOURCE_TYPES: Record<string, CaseStudyEvidenceSourceType> = {
  github_commit: 'github_commit',
  github_pr: 'github_pr',
  artifact: 'artifact',
};

export function evidenceSourceTypeFor(source: unknown): CaseStudyEvidenceSourceType {
  return EVIDENCE_SOURCE_TYPES[String(source ?? '')] ?? 'evidence_record';
}

/**
 * Titles come from the source type, never from learner-authored text, so a
 * `case_study_evidence.title` cannot carry a name, an email or an unconsented
 * client identity.
 */
const EVIDENCE_TITLES: Record<string, string> = {
  prompt_lab: 'Prompt lab evidence', github_commit: 'GitHub commit evidence',
  github_pr: 'GitHub pull request evidence', artifact: 'Portfolio artifact evidence',
  peer_review: 'Peer review evidence', instructor_review: 'Instructor review evidence',
  deliverable: 'Deliverable evidence', implementation: 'Implementation evidence',
  portfolio: 'Portfolio evidence',
};

function evidenceTitle(source: unknown): string {
  return EVIDENCE_TITLES[String(source ?? '')] ?? 'Platform evidence record';
}

/**
 * `kind` is a free VARCHAR(40), not an enum, so this fails closed to `other`.
 * `case_study` is in the table BECAUSE it is the column default meaning "a
 * learner's case-study writeup" — an artifact, mapped to `document` like every
 * other writeup, never a `case_studies` row.
 */
const ARTIFACT_TYPES: Record<string, CaseStudyArtifactType> = {
  architecture_doc: 'architecture', prompt_library: 'document', case_study: 'document',
  reflection: 'document', implementation_notes: 'document', presentation: 'deck',
};

export function artifactTypeForKind(kind: unknown): CaseStudyArtifactType {
  return ARTIFACT_TYPES[String(kind ?? '')] ?? 'other';
}

/* ───────────────────────────────────────────────────────── public surface ──── */

/**
 * Link an enrollment's `EvidenceRecord` rows to a Case Study. Reads
 * `evidence_records` (bounded, oldest first so the set is stable across runs)
 * and inserts one pointer row per record not already linked. Source untouched.
 */
export async function linkProjectEvidence(input: LinkEvidenceInput): Promise<LinkEvidenceResult> {
  const data = validate(linkEvidenceSchema, input, 'evidence link request');
  const correlationId = ensureTraceId(data.correlationId);
  const limit = Math.min(data.limit ?? MAX_LINKED_EVIDENCE, MAX_LINKED_EVIDENCE);

  const where: Record<string, unknown> = { enrollment_id: data.enrollmentId };
  if (data.cardIds && data.cardIds.length > 0) where.card_id = data.cardIds;

  // READ ONLY. `findAll` is the only EvidenceRecord call this module makes.
  const found = await EvidenceRecordModel.findAll({ where, limit, order: [['created_at', 'ASC']] });
  const rows = (found ?? []).map((r) => plain<EvidenceRow>(r));

  const existing = await CaseStudyEvidenceModel.findAll({ where: { case_study_id: data.caseStudyId } });
  const seen = new Set<string>();
  for (const row of existing ?? []) {
    const id = plain<{ evidence_record_id?: string | null }>(row).evidence_record_id;
    if (id) seen.add(id);
  }

  const linked: LinkedEvidence[] = [];
  let alreadyLinked = 0;

  try {
    for (const row of rows) {
      if (!row.id) continue;
      if (seen.has(row.id)) { alreadyLinked += 1; continue; }
      seen.add(row.id);

      const sourceType = evidenceSourceTypeFor(row.source_type);
      const title = evidenceTitle(row.source_type);
      const created = plain<{ id: string }>(await CaseStudyEvidenceModel.create({
        case_study_id: data.caseStudyId,
        evidence_record_id: row.id,
        source_type: sourceType,
        source_ref: trim(row.source_ref, REF_MAX),
        title,
        // Linking is not verifying, and never opens anything publicly.
        verification_class: 'pending',
        is_publicly_openable: false,
        metadata: {
          platform_source_type: trim(row.source_type, 40),
          builder_xp: typeof row.builder_xp === 'number' ? row.builder_xp : null,
          platform_validated: row.validated === true,
        },
      }));
      linked.push({
        id: created.id, evidenceRecordId: row.id, sourceType, title,
        verificationClass: 'pending', isPubliclyOpenable: false,
      });
    }
  } catch (err) {
    const counts = { scanned: rows.length, created: linked.length, alreadyLinked };
    log(EVIDENCE_EVENT, 'failure', correlationId, data.caseStudyId, counts, {
      error_class: (err as Error)?.name ?? 'Error',
    });
    throw err;
  }

  const counts = { scanned: rows.length, created: linked.length, alreadyLinked };
  log(EVIDENCE_EVENT, linked.length > 0 ? 'success' : 'unchanged', correlationId,
    data.caseStudyId, counts, { bounded: rows.length >= limit });

  return { linked, ...counts };
}

/**
 * Link an enrollment's `PortfolioArtifact` rows as Case Study artifact
 * CANDIDATES. Nothing here promotes one, and `runtime_portfolio_artifacts` is
 * read and never written.
 */
export async function linkPortfolioArtifacts(input: LinkArtifactsInput): Promise<LinkArtifactsResult> {
  const data = validate(linkArtifactsSchema, input, 'artifact link request');
  const correlationId = ensureTraceId(data.correlationId);
  const limit = Math.min(data.limit ?? MAX_LINKED_ARTIFACTS, MAX_LINKED_ARTIFACTS);

  // READ ONLY. `findAll` is the only PortfolioArtifact call this module makes.
  const where = { enrollment_id: data.enrollmentId };
  const found = await PortfolioArtifactModel.findAll({ where, limit, order: [['created_at', 'ASC']] });
  const rows = (found ?? []).map((r) => plain<ArtifactRow>(r));

  const existing = await CaseStudyArtifactModel.findAll({ where: { case_study_id: data.caseStudyId } });
  const seen = new Set<string>();
  for (const row of existing ?? []) {
    const id = plain<{ portfolio_artifact_id?: string | null }>(row).portfolio_artifact_id;
    if (id) seen.add(id);
  }

  const artifacts: CaseStudyArtifactRef[] = [];
  let alreadyLinked = 0;

  try {
    for (const row of rows) {
      if (!row.id) continue;
      if (seen.has(row.id)) { alreadyLinked += 1; continue; }
      seen.add(row.id);

      const artifactType = artifactTypeForKind(row.kind);
      const title = trim(row.title, TITLE_MAX) ?? 'Untitled portfolio artifact';
      const description = trim(row.summary, DESCRIPTION_MAX);
      const created = plain<{ id: string }>(await CaseStudyArtifactModel.create({
        case_study_id: data.caseStudyId,
        artifact_type: artifactType,
        title,
        description,
        source_type: 'portfolio_artifact',
        source_ref: null,
        portfolio_artifact_id: row.id,
        // No public or preview URL: `runtime_portfolio_artifacts` has neither,
        // and inventing one would render a download that does not exist.
        public_url: null,
        preview_url: null,
        visibility: 'private',
        status: 'candidate',
      }));
      artifacts.push({
        id: created.id, artifactType, title, ...(description ? { description } : {}),
        sourceType: 'portfolio_artifact', visibility: 'private', status: 'candidate',
      });
    }
  } catch (err) {
    const counts = { scanned: rows.length, created: artifacts.length, alreadyLinked };
    log(ARTIFACT_EVENT, 'failure', correlationId, data.caseStudyId, counts, {
      error_class: (err as Error)?.name ?? 'Error',
    });
    throw err;
  }

  const counts = { scanned: rows.length, created: artifacts.length, alreadyLinked };
  log(ARTIFACT_EVENT, artifacts.length > 0 ? 'success' : 'unchanged', correlationId,
    data.caseStudyId, counts, { bounded: rows.length >= limit });

  return { artifacts, ...counts };
}
