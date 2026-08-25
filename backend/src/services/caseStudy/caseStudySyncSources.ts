/**
 * caseStudySyncSources — the READS a sync performs, and the adapters that turn
 * stored rows into the contracts the snapshot builder already declares.
 *
 * WHY IT IS ITS OWN FILE. `caseStudySyncService.ts` is the conductor: it decides
 * order, classification and what gets audited. This file is the gathering step
 * it delegates to. Splitting them keeps both inside CLAUDE.md's line ceiling and
 * makes the "no new policy" rule checkable — every function below either reads a
 * table or maps a row onto a type owned by `caseStudySnapshotInput.ts` /
 * `types/caseStudy.ts`. Not one invents a merge rule, a hash or a judgement.
 *
 * NOTHING HERE WRITES. Every function is a read or a pure mapping.
 * `EvidenceRecord`, `PortfolioArtifact`, `Project` and `GitHubConnection` are
 * never written by any path through this module — the suite asserts it with
 * mocks whose write methods fail the test if called. The only inserts a sync
 * performs at all are the pointer rows `caseStudyEvidenceSource` (T008) writes,
 * and the conductor calls that module directly rather than copying it here.
 *
 * ── WHY THE FULL SET IS RELOADED AFTER LINKING ──────────────────────────────
 *
 * The link functions return only what they CREATED, which is empty on a re-run.
 * Feeding that into the snapshot would make run 1 and run 2 produce different
 * content and therefore different hashes, breaking the one property spec §30
 * exists for. So the sync links, then reads the FULL `case_study_artifacts` and
 * `case_study_metrics` sets. Identical inputs then produce an identical set on
 * every run, first or thousandth.
 *
 * ── WHAT A PROJECT MAY NOT CONTRIBUTE ───────────────────────────────────────
 *
 * `projects.organization_name` arrives as `organizationNameCandidate` and is
 * DROPPED. Only `case_studies.organization_display_name` — a value a human put
 * on the canonical record — can name an organisation. DATA_SOURCE_MAP §3.1 calls
 * the project column "a candidate for review, never a publishable value", and a
 * test pins that it cannot reach a snapshot.
 *
 * ── FAILURE-FIRST (root CLAUDE.md) ──────────────────────────────────────────
 * 1. On failure: nothing partial — this module performs no writes.
 * 2. Retry: none. No network call originates here.
 * 3. Recovery: the conductor classifies the failure, records it on the sync run
 *    and degrades to `partial`; re-running the sync is always safe.
 * 4. Handled: an unknown case study id, a null project id, a case study with no
 *    enrollment behind it, stored strings outside their union (fail closed), an
 *    empty metric/artifact set, a malformed stored override path. NOT handled:
 *    the database being unavailable — that propagates, as in
 *    `caseStudyRepoCollection`.
 *
 * PII: this module emits NO log lines at all. `enrollmentId` passes through it
 * to the link functions and is never returned to the conductor, so the conductor
 * cannot log what it never receives.
 */
import CaseStudyModel from '../../models/CaseStudy';
import CaseStudyMetricModel from '../../models/CaseStudyMetric';
import CaseStudyArtifactModel from '../../models/CaseStudyArtifact';
import CaseStudySnapshotModel from '../../models/CaseStudySnapshot';
import { CaseStudySyncError } from './caseStudySyncRunStore';
import { parseProvenancePath } from './caseStudySnapshotOverrides';
import type { CaseStudyRepoFacts } from './caseStudyRepoAnalyzer';
import type {
  CaseStudySnapshotOverride, SnapshotPlatformFacts,
} from './caseStudySnapshotInput';
import type { CaseStudyProjectPlatformSeed } from './caseStudyProjectSource';
import type {
  CaseStudyArtifactRef, CaseStudyArtifactSourceType, CaseStudyArtifactStatus,
  CaseStudyArtifactType, CaseStudyArtifactVisibility, CaseStudyBuilderIdentityMode,
  CaseStudyBuiltByType, CaseStudyMetricEntry, CaseStudyMetricType,
  CaseStudyOrganizationIdentityMode, CaseStudyStatus, CaseStudyVerificationClass,
  CaseStudyVerificationMethod,
} from '../../types/caseStudy';
import type { CaseStudySnapshotContent } from '../../types/caseStudy';
import type { CaseStudyProvenance } from '../../types/caseStudyProvenance';

/* ────────────────────────────────────────────────────────────── bounds ───── */

/** Spec §37 bounds every collection a single admin click can pull. */
export const MAX_SYNC_METRICS = 200;
export const MAX_SYNC_ARTIFACTS = 200;
export const MAX_CARRIED_OVERRIDES = 500;

/* ───────────────────────────────────────────────────────── narrow helpers ─── */

/** Sequelize instance or plain object — both are acceptable inputs. */
export function plainRow<T>(row: unknown): T {
  const candidate = row as { get?: (o: { plain: true }) => T };
  return typeof candidate?.get === 'function' ? candidate.get({ plain: true }) : (row as T);
}

/** Blank, whitespace and null all collapse to "absent". Never to `''`. */
function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Fail closed: a stored string the union does not know becomes the safe default. */
function oneOf<T extends string>(allowed: readonly string[], value: unknown, fallback: T): T {
  return allowed.includes(String(value)) ? (value as T) : fallback;
}

/** …and its absent-rather-than-guessed sibling, for genuinely optional columns. */
function oneOfOptional<T extends string>(allowed: readonly string[], value: unknown): T | undefined {
  return allowed.includes(String(value)) ? (value as T) : undefined;
}

function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as T;
}

const CASE_STUDY_STATUSES = ['draft', 'review', 'approved', 'published', 'archived'];
const ORG_MODES = ['named', 'anonymized', 'hidden'];
const BUILDER_MODES = ['named', 'role_only', 'anonymous'];
const BUILT_BY = ['learner', 'intern', 'client_team', 'colaberry_team', 'ai_flotation_team', 'joint_team'];
const METRIC_TYPES = ['business_outcome', 'delivery', 'performance', 'scale', 'quality', 'adoption', 'technical'];
const VERIFICATION_CLASSES = ['verified', 'anonymized', 'illustrative', 'pending'];
const VERIFICATION_METHODS = ['client', 'repo', 'platform', 'internal', 'self', 'manual'];
const ARTIFACT_TYPES = ['screenshot', 'architecture', 'demo', 'deck', 'roadmap', 'report', 'evaluation', 'code', 'document', 'other'];
const ARTIFACT_SOURCES = ['repo', 'portfolio_artifact', 'manual', 'generated'];
const ARTIFACT_VISIBILITIES = ['public', 'request_only', 'private'];
const ARTIFACT_STATUSES = ['candidate', 'approved', 'rejected'];

/* ───────────────────────────────────────────────────── the canonical row ──── */

/** The `case_studies` columns a sync reads. Consent lives here and nowhere else. */
export interface CaseStudyRecordFacts {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: CaseStudyStatus;
  readonly projectId?: string;
  readonly summary?: string;
  readonly industry?: string;
  readonly primaryCapability?: string;
  readonly programKey?: string;
  readonly builtByType?: CaseStudyBuiltByType;
  readonly organizationDisplayName?: string;
  readonly organizationIdentityMode: CaseStudyOrganizationIdentityMode;
  readonly organizationNamingConsent: boolean;
  readonly builderIdentityMode: CaseStudyBuilderIdentityMode;
  readonly builderNamingConsent: boolean;
}

/** PURE. Normalise one `case_studies` row. Every union narrows fail-closed. */
export function caseStudyRecordFromRow(row: Record<string, unknown>): CaseStudyRecordFacts {
  return compact({
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    title: String(row.title ?? ''),
    status: oneOf<CaseStudyStatus>(CASE_STUDY_STATUSES, row.status, 'draft'),
    projectId: text(row.project_id),
    summary: text(row.canonical_summary),
    industry: text(row.industry),
    primaryCapability: text(row.primary_capability),
    programKey: text(row.program_key),
    builtByType: oneOfOptional<CaseStudyBuiltByType>(BUILT_BY, row.built_by_type),
    organizationDisplayName: text(row.organization_display_name),
    // Consent fails closed: `hidden` / `anonymous` / false are the defaults the
    // DDL itself chose, and an unreadable value must land on them, not past them.
    organizationIdentityMode: oneOf<CaseStudyOrganizationIdentityMode>(ORG_MODES, row.organization_identity_mode, 'hidden'),
    organizationNamingConsent: row.organization_naming_consent === true,
    builderIdentityMode: oneOf<CaseStudyBuilderIdentityMode>(BUILDER_MODES, row.builder_identity_mode, 'anonymous'),
    builderNamingConsent: row.builder_naming_consent === true,
  }) as CaseStudyRecordFacts;
}

/** Load the canonical record. An unknown id is a 404, not a sync that runs anyway. */
export async function loadCaseStudyRecord(caseStudyId: string): Promise<CaseStudyRecordFacts> {
  const found = await CaseStudyModel.findByPk(caseStudyId);
  if (!found) {
    throw new CaseStudySyncError(
      'CaseStudyNotFound',
      `No case study ${caseStudyId}`,
      { case_study_id: caseStudyId },
    );
  }
  return caseStudyRecordFromRow(plainRow<Record<string, unknown>>(found));
}

/* ────────────────────────────────────────────────────────────── metrics ──── */

/** PURE. `case_study_metrics` row ⇒ the `CaseStudyMetricEntry` contract. */
export function metricEntryFromRow(row: Record<string, unknown>): CaseStudyMetricEntry {
  const limitations = Array.isArray(row.limitations)
    ? (row.limitations as unknown[]).filter((l): l is string => typeof l === 'string')
    : [];
  const baseline = text(row.baseline);
  const sample = text(row.sample);
  const methodology = text(row.methodology);
  const hasContext = Boolean(baseline || sample || methodology) || limitations.length > 0;
  const numeric = typeof row.numeric_value === 'number' && Number.isFinite(row.numeric_value)
    ? row.numeric_value
    : undefined;

  return compact({
    key: String(row.metric_key ?? ''),
    label: String(row.label ?? ''),
    valueDisplay: text(row.value_display) ?? '',
    numericValue: numeric,
    unit: text(row.unit),
    metricType: oneOf<CaseStudyMetricType>(METRIC_TYPES, row.metric_type, 'technical'),
    verification: compact({
      // A stored class outside the union is `pending`: unreadable is never verified.
      class: oneOf<CaseStudyVerificationClass>(VERIFICATION_CLASSES, row.verification_class, 'pending'),
      method: oneOf<CaseStudyVerificationMethod>(VERIFICATION_METHODS, row.verification_method, 'manual'),
      verifiedAt: row.verified_at ? new Date(row.verified_at as string).toISOString() : undefined,
      evidenceId: text(row.evidence_id),
    }),
    isHeadline: row.is_headline === true,
    publishable: row.publishable === true,
    measurement: hasContext ? compact({ baseline, sample, methodology, limitations }) : undefined,
  }) as CaseStudyMetricEntry;
}

/**
 * Every metric CANDIDATE on the record, sorted by key so the set is identical on
 * every run. Nothing is filtered by `publishable` here — the snapshot is the
 * internal record, and the publish gate (T012) is the only thing entitled to
 * decide what a visitor sees.
 */
export async function loadCandidateMetrics(caseStudyId: string): Promise<CaseStudyMetricEntry[]> {
  const rows = await CaseStudyMetricModel.findAll({
    where: { case_study_id: caseStudyId }, limit: MAX_SYNC_METRICS, order: [['metric_key', 'ASC']],
  });
  return (rows ?? [])
    .map((r) => metricEntryFromRow(plainRow<Record<string, unknown>>(r)))
    .filter((m) => m.key.length > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ──────────────────────────────────────────────────────────── artifacts ──── */

/** PURE. `case_study_artifacts` row ⇒ the `CaseStudyArtifactRef` contract. */
export function artifactRefFromRow(row: Record<string, unknown>): CaseStudyArtifactRef {
  return compact({
    id: String(row.id ?? ''),
    artifactType: oneOf<CaseStudyArtifactType>(ARTIFACT_TYPES, row.artifact_type, 'other'),
    title: String(row.title ?? ''),
    description: text(row.description),
    sourceType: oneOf<CaseStudyArtifactSourceType>(ARTIFACT_SOURCES, row.source_type, 'manual'),
    sourceRef: text(row.source_ref),
    sourceCommitSha: text(row.source_commit_sha),
    // Fail closed on both axes: an unreadable visibility is `private` and an
    // unreadable status is `candidate`. Neither can promote anything.
    visibility: oneOf<CaseStudyArtifactVisibility>(ARTIFACT_VISIBILITIES, row.visibility, 'private'),
    status: oneOf<CaseStudyArtifactStatus>(ARTIFACT_STATUSES, row.status, 'candidate'),
    publicUrl: text(row.public_url),
    previewUrl: text(row.preview_url),
  }) as CaseStudyArtifactRef;
}

/** Every artifact row on the record, sorted by id (the order the builder uses). */
export async function loadLinkedArtifacts(caseStudyId: string): Promise<CaseStudyArtifactRef[]> {
  const rows = await CaseStudyArtifactModel.findAll({
    where: { case_study_id: caseStudyId }, limit: MAX_SYNC_ARTIFACTS, order: [['id', 'ASC']],
  });
  return (rows ?? [])
    .map((r) => artifactRefFromRow(plainRow<Record<string, unknown>>(r)))
    .filter((a) => a.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/* ───────────────────────────────────────────── human overrides, preserved ── */

/** Read a value out of already-parsed content. The mirror of `setAtPath`, read-only. */
export function readAtProvenancePath(
  content: unknown, path: string,
): { readonly found: boolean; readonly value: unknown } {
  const segments = parseProvenancePath(path);
  if (!segments) return { found: false, value: undefined };
  let cursor: any = content;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return { found: false, value: undefined };
    cursor = segment.kind === 'key' ? cursor[segment.key] : cursor[segment.index];
    if (cursor === undefined) return { found: false, value: undefined };
  }
  return { found: true, value: cursor };
}

/** The stored snapshot a sync compares itself against. `null` on a first run. */
export interface LatestSnapshotFacts {
  readonly id: string;
  readonly version: number;
  readonly contentHash: string;
  readonly content: CaseStudySnapshotContent;
  readonly provenance: CaseStudyProvenance;
}

export async function loadLatestSnapshot(caseStudyId: string): Promise<LatestSnapshotFacts | null> {
  const found = await CaseStudySnapshotModel.findOne({
    where: { case_study_id: caseStudyId }, order: [['version', 'DESC']],
  });
  if (!found) return null;
  const row = plainRow<Record<string, any>>(found);
  return {
    id: String(row.id ?? ''),
    version: Number(row.version ?? 0),
    contentHash: String(row.content_hash ?? ''),
    content: (row.content ?? {}) as CaseStudySnapshotContent,
    provenance: (row.provenance ?? {}) as CaseStudyProvenance,
  };
}

/**
 * THE REVIEWER'S EDITS, CARRIED FORWARD.
 *
 * `caseStudySnapshotOverrides.ts` states the rule this implements: "a reviewer
 * who corrects a metric label, then watches the next repo sync silently
 * overwrite it, stops reviewing". The override lives in the stored snapshot as a
 * `human_override` provenance entry plus the value at that path, so the sync
 * reads both back and hands them to the builder, which re-applies them AFTER
 * regeneration. No precedence logic is added here — `human_override` is index 0
 * of `CASE_STUDY_PROVENANCE_PRECEDENCE` and the builder already honours it.
 *
 * `recordedAt` is copied from the stored entry, never re-clocked, so a
 * carried-forward override reproduces byte-identically on every future run —
 * which is what keeps the hash stable and the sync `unchanged`.
 */
export function overridesFromSnapshot(
  snapshot: LatestSnapshotFacts | null,
): CaseStudySnapshotOverride[] {
  if (!snapshot) return [];
  const out: CaseStudySnapshotOverride[] = [];
  for (const path of Object.keys(snapshot.provenance).sort()) {
    if (out.length >= MAX_CARRIED_OVERRIDES) break;
    const entry = snapshot.provenance[path];
    if (!entry || entry.tier !== 'human_override') continue;
    if (entry.origin?.kind !== 'human') continue;
    const read = readAtProvenancePath(snapshot.content, path);
    // A path that no longer exists in content is dropped rather than recreated:
    // the builder refuses to conjure a missing parent, and so does this.
    if (!read.found) continue;
    out.push({
      path,
      value: read.value,
      actor: entry.origin.actor,
      recordedAt: entry.recordedAt,
      ...(entry.origin.note ? { note: entry.origin.note } : {}),
    });
  }
  return out;
}

/* ──────────────────────────────────────────────────────── platform facts ──── */

export interface PlatformFactsInput {
  readonly record: CaseStudyRecordFacts;
  readonly projectSeed?: CaseStudyProjectPlatformSeed | null;
  readonly metrics: readonly CaseStudyMetricEntry[];
  readonly artifacts: readonly CaseStudyArtifactRef[];
}

/**
 * PURE. Assemble `SnapshotPlatformFacts` from the canonical record, the Project
 * seed and the linked sets.
 *
 * PRECEDENCE, and it is not invented here: spec §9 ranks `project_facts` below
 * anything a human curated onto the canonical record, so a `case_studies` value
 * wins wherever it exists and the Project seed fills gaps only. Consent fields
 * have NO project fallback at all — a Project cannot consent on a client's
 * behalf, so `organizationDisplayName` comes from the canonical record or comes
 * from nowhere.
 */
export function buildPlatformFacts(input: PlatformFactsInput): SnapshotPlatformFacts {
  const { record, projectSeed, metrics, artifacts } = input;
  return compact({
    slug: record.slug,
    title: record.title,
    summary: record.summary ?? projectSeed?.summary,
    projectId: record.projectId ?? projectSeed?.projectId,
    organizationDisplayName: record.organizationDisplayName,
    organizationIdentityMode: record.organizationIdentityMode,
    organizationNamingConsent: record.organizationNamingConsent,
    builderIdentityMode: record.builderIdentityMode,
    builderNamingConsent: record.builderNamingConsent,
    builtByType: record.builtByType,
    programKey: record.programKey,
    industry: record.industry ?? projectSeed?.industry,
    primaryCapability: record.primaryCapability,
    situation: projectSeed?.situation,
    artifacts: artifacts.length ? artifacts : undefined,
    metrics: metrics.length ? metrics : undefined,
  }) as SnapshotPlatformFacts;
}

/* ────────────────────────────────────────────────────────── fact counting ── */

/**
 * `case_study_sync_runs.facts_extracted` (spec §7.10) — how many mechanically
 * proven facts this repository yielded. Deterministic by construction: it counts
 * the analyzer's own already-sorted, already-deduplicated lists, so the same
 * repository at the same commit always produces the same number.
 */
export function countExtractedFacts(facts: CaseStudyRepoFacts): number {
  const d = facts.derived;
  const lists: readonly (readonly unknown[])[] = [
    d.languages, d.frameworks, d.dependencies, d.databases, d.aiSdks, d.aiProviders,
    d.agentClues, d.testFrameworks, d.ciProviders, d.manifestFiles,
  ];
  const listed = lists.reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
  const flags = [
    d.hasReadme, d.hasClaudeMd, d.hasTests, d.hasCi, d.hasDocker, d.hasDockerCompose,
    d.hasArchitectureDoc, d.hasRequirementsDoc, d.hasTraceabilityDoc, d.hasStoriesDoc,
  ].filter((flag) => flag === true).length;
  const commit = facts.metadata.latestCommitSha ? 1 : 0;
  return listed + flags + facts.documents.length + commit;
}
