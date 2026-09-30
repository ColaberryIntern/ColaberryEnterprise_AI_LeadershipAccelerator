/**
 * caseStudyProvenance — the merge policy for spec §9's source precedence.
 *
 * Several producers offer a value for the same field: project facts (3),
 * evidence and artifacts (4), a manifest (5), repo extraction (6), a human (1),
 * an approved metric or evidence row (2), an AI draft (7). Exactly one must
 * win, the same way every time, carrying enough detail for a reviewer to check.
 *
 * ONE LADDER, NOT TWO. The ordering is `CASE_STUDY_PROVENANCE_PRECEDENCE` in
 * `types/caseStudyProvenance.ts`, whose INDEX is the precedence; nothing here
 * re-declares it. An off-by-one between two copies is exactly the bug that lets
 * a repo-extracted string quietly outrank a human's decision. So this AGREES
 * WITH `caseStudySnapshotOverrides.ts` rather than competing with it: that
 * module applies a human's edits to generated content and stamps
 * `human_override`, this one decides which CANDIDATE becomes a value at all,
 * and both break a two-edit tie by "later `recordedAt` wins".
 *
 * TIER 7 IS SCREENED, NOT RANKED. An AI draft may never supply a metric, a
 * client/organisation name, a quote, a consent value, a production/shipped
 * claim or an ROI figure (spec §12; DATA_SOURCE_MAP §7). Those candidates are
 * rejected at intake, BEFORE any comparison, so the field stays empty even when
 * nothing else offers a value — outranking holds only while a rival exists. It
 * FAILS CLOSED likewise on an unknown tier, or an origin whose `kind` does not
 * belong to its tier: a default there is a permissive tier by another name.
 *
 * READ THAT PARAGRAPH PRECISELY: the screen is BY FIELD CLASS, NOT BY READING
 * PROSE. It matches the destination path, and scans the candidate's own value
 * for forbidden keys to a bounded depth. It does NOT interpret natural language.
 * An AI draft at a PERMITTED path — `identity.standfirst`, say — can still
 * contain the sentence "cut costs 40%", and nothing here will catch it, because
 * catching it would require a content classifier: non-deterministic, a
 * false-positive engine, and fatal to this module's purity guarantee.
 *
 * That residue is deliberate and is covered downstream, not here. Spec §12's
 * "AI output is always draft and must never auto-publish" plus the publish gate
 * in `caseStudyPublicationService` are what stop an unverified claim reaching a
 * public surface. Do not read this module as a guarantee that no AI-authored
 * sentence contains a number — it guarantees that no AI-authored value lands in
 * a field whose CLASS is reserved for verified sources.
 *
 * PURE. No clock, no randomness, no I/O, no logging; `recordedAt` records when
 * a source acted, not when the merge ran. FAILURE-FIRST: a non-array input
 * throws before any work, so there is no partial resolution; no retry, being
 * CPU-only; and every rejected candidate comes back with its stage and reason,
 * so an admin sees why a field is empty instead of guessing. Not handled:
 * cyclic values, which `hashCanonical` throws on by design.
 */
import { z } from 'zod';
import { CASE_STUDY_PROVENANCE_PRECEDENCE } from '../../types/caseStudyProvenance';
import { hashCanonical } from '../../utils/canonicalHash';
import { opaqueRepoRef } from './caseStudyRepoReader';
import type {
  CaseStudyProvenance, CaseStudyProvenanceEntry, CaseStudyProvenanceOrigin,
  CaseStudyProvenancePath, CaseStudyProvenanceTier,
} from '../../types/caseStudyProvenance';
import type {
  CaseStudySnapshotContent, CaseStudyVerification, IsoDateTime,
} from '../../types/caseStudy';

/* ─────────────────────────────────────────────────────────────── errors ──── */

export type CaseStudyProvenanceErrorClass = 'ProvenanceValidationError';

export class CaseStudyProvenanceError extends Error {
  public readonly error_class: CaseStudyProvenanceErrorClass;
  public readonly http_status = 400;
  public readonly details: Record<string, unknown>;

  constructor(error_class: CaseStudyProvenanceErrorClass, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CaseStudyProvenanceError';
    this.error_class = error_class;
    this.details = details;
  }
}

export function isCaseStudyProvenanceError(err: unknown): err is CaseStudyProvenanceError {
  return err instanceof CaseStudyProvenanceError;
}

/* ──────────────────────────────────────────────────────────────── tiers ──── */

/** Lower rank wins. `-1` means "not a tier we know", which is never rankable. */
export function provenanceTierRank(tier: string): number {
  return (CASE_STUDY_PROVENANCE_PRECEDENCE as readonly string[]).indexOf(tier);
}

export function isSupportedProvenanceTier(value: unknown): value is CaseStudyProvenanceTier {
  return typeof value === 'string' && provenanceTierRank(value) >= 0;
}

/** Which `origin.kind` may accompany which tier. An AI draft wearing an
 *  approved metric's tier is the dangerous direction; this table stops it. */
export const TIER_ORIGIN_KINDS: Readonly<Record<CaseStudyProvenanceTier, readonly string[]>> = {
  human_override: ['human'],
  approved_metric_evidence: ['case_study_metric', 'case_study_evidence'],
  project_facts: ['project_field'],
  evidence_or_artifact: ['evidence_record', 'portfolio_artifact'],
  repo_manifest: ['manifest'],
  repo_extraction: ['repo_extraction'],
  ai_draft: ['ai_draft'],
};

/* ────────────────────────────────────────────────── the six absolute NOs ──── */

export type AiForbiddenFieldClass =
  'metric' | 'organization_identity' | 'quote' | 'consent' | 'production_claim' | 'roi';

/** Matched against each lower-cased path key IN THIS ORDER, so a key in two
 *  classes (`organizationNamingConsent`) reports the stricter one and never
 *  depends on iteration order. `measurement` is in the metric rule on purpose:
 *  it is the section where numbers are explained. */
const AI_FORBIDDEN_RULES: readonly { readonly cls: AiForbiddenFieldClass; readonly key: RegExp }[] = [
  { cls: 'roi', key: /roi|revenue|costsav|savings|payback|profit/ },
  { cls: 'quote', key: /quote|testimonial|endorsement/ },
  { cls: 'consent', key: /consent|allowpublicrepolink/ },
  { cls: 'production_claim', key: /production|deployed|deployment|shipped|golive|projectstatus/ },
  { cls: 'organization_identity', key: /organi[sz]ation|client|customer|displayname/ },
  { cls: 'metric', key: /metric|measurement|numericvalue|valuedisplay|baseline|methodology/ },
];

/** `heroMetrics[0].valueDisplay` ⇒ `['herometrics', 'valuedisplay']`. */
function pathKeys(path: string): string[] {
  return path.replace(/\[\d+\]/g, '').split('.').filter(Boolean).map((s) => s.toLowerCase());
}

/** The class this path belongs to, or `null` if an AI draft may propose it. */
export function classifyAiForbiddenPath(path: string): AiForbiddenFieldClass | null {
  const keys = pathKeys(path);
  for (const rule of AI_FORBIDDEN_RULES) {
    if (keys.some((k) => rule.key.test(k))) return rule.cls;
  }
  return null;
}

const MAX_SCAN_DEPTH = 8;
/** A path may be innocent while the value is not — an AI candidate for the
 *  whole `identity` section carries `organizationDisplayName` and two consent
 *  flags inside it. Keys are sorted, so the violation reported is stable. */
export function findAiForbiddenKey(
  value: unknown, depth = 0, trail = '',
): { readonly cls: AiForbiddenFieldClass; readonly at: string } | null {
  if (depth > MAX_SCAN_DEPTH || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findAiForbiddenKey(value[i], depth + 1, `${trail}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const at = trail ? `${trail}.${key}` : key;
    const cls = classifyAiForbiddenPath(key);
    if (cls) return { cls, at };
    const hit = findAiForbiddenKey((value as Record<string, unknown>)[key], depth + 1, at);
    if (hit) return hit;
  }
  return null;
}

/* ─────────────────────────────────────────────────────────── candidates ──── */

export interface CaseStudyFieldCandidate {
  readonly path: CaseStudyProvenancePath;
  readonly value: unknown;
  readonly tier: CaseStudyProvenanceTier;
  readonly origin: CaseStudyProvenanceOrigin;
  /** When the source acted. A recorded fact, never a clock read at merge time. */
  readonly recordedAt: IsoDateTime;
  readonly verification?: CaseStudyVerification;
  /** Optional stable tie-break key, consulted before the origin's own identity. */
  readonly candidateKey?: string;
}

export type ProvenanceRejectionReason = 'invalid_candidate' | 'unsupported_tier'
  | 'origin_tier_mismatch' | 'ai_forbidden_field' | 'outranked';

/** `stage` is what makes "rejected outright" checkable rather than asserted:
 *  `screened` never entered a comparison, `ranked` entered one and lost. */
export interface ProvenanceRejection {
  readonly path: string;
  readonly tier?: string;
  readonly stage: 'invalid' | 'screened' | 'ranked';
  readonly reason: ProvenanceRejectionReason;
  readonly detail?: string;
}

export interface ProvenanceResolution {
  readonly values: Readonly<Record<CaseStudyProvenancePath, unknown>>;
  readonly provenance: CaseStudyProvenance;
  readonly rejected: readonly ProvenanceRejection[];
  /** Paths some candidate offered where every candidate was screened out. */
  readonly unresolved: readonly string[];
  /** Paths where a `human_override` beat something a later sync offered. */
  readonly preservedOverrides: readonly string[];
}

// Zod v4: `error.issues`, never `.errors`. `tier` is a plain string so an
// UNKNOWN tier is rejected as data with its own reason, not lumped in with a
// candidate that has no path at all.
const candidateSchema = z.object({
  path: z.string().trim().min(1).max(200),
  tier: z.string().trim().min(1).max(64),
  origin: z.object({ kind: z.string().trim().min(1).max(64) }).loose(),
  recordedAt: z.string().trim().min(1).max(40),
  candidateKey: z.string().max(200).optional(),
}).loose();

interface Screened {
  readonly candidate: CaseStudyFieldCandidate;
  readonly rank: number;
  readonly sortKey: string;
  readonly valueKey: string;
}

/** Total order, so a winner can never depend on array order: tier rank, later
 *  `recordedAt`, the caller's stable key, the origin's identity, the value's
 *  canonical hash. Candidates tying on all five are indistinguishable. */
function compareCandidates(a: Screened, b: Screened): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  const byTime = b.candidate.recordedAt.localeCompare(a.candidate.recordedAt);
  if (byTime !== 0) return byTime;
  const byKey = a.sortKey.localeCompare(b.sortKey);
  if (byKey !== 0) return byKey;
  return a.valueKey.localeCompare(b.valueKey);
}

function screen(candidate: CaseStudyFieldCandidate): Screened | ProvenanceRejection {
  const parsed = candidateSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      path: typeof candidate?.path === 'string' && candidate.path ? candidate.path : '(unknown)',
      stage: 'invalid', reason: 'invalid_candidate',
      detail: `${issue.path.join('.') || '(root)'} ${issue.message}`,
    };
  }
  const { path, tier, origin } = candidate;
  if (!isSupportedProvenanceTier(tier)) {
    return { path, tier: String(tier), stage: 'screened', reason: 'unsupported_tier' };
  }
  if (!TIER_ORIGIN_KINDS[tier].includes(origin.kind)) {
    return { path, tier, stage: 'screened', reason: 'origin_tier_mismatch',
      detail: `origin.kind '${origin.kind}' is not valid for tier '${tier}'` };
  }
  if (tier === 'ai_draft') {
    const byPath = classifyAiForbiddenPath(path);
    const byValue = byPath ? null : findAiForbiddenKey(candidate.value);
    const cls = byPath ?? byValue?.cls;
    if (cls) {
      return { path, tier, stage: 'screened', reason: 'ai_forbidden_field',
        detail: `an AI draft may never supply a ${cls} value${byValue ? ` (at '${byValue.at}')` : ''}` };
    }
  }
  return {
    candidate,
    rank: provenanceTierRank(tier),
    sortKey: candidate.candidateKey ?? hashCanonical(origin),
    valueKey: hashCanonical(candidate.value),
  };
}

/** Resolve every candidate to at most one winner per path. A stored snapshot's
 *  provenance participates via `existingProvenanceAsCandidates()`, which is why
 *  a later sync cannot silently overwrite a human override: the override is
 *  simply a stronger candidate, the sync's value comes back `outranked`, and
 *  the path is listed in `preservedOverrides`. */
export function resolveCaseStudyProvenance(
  candidates: readonly CaseStudyFieldCandidate[],
): ProvenanceResolution {
  if (!Array.isArray(candidates)) {
    throw new CaseStudyProvenanceError('ProvenanceValidationError', 'candidates must be an array');
  }

  const byPath = new Map<string, Screened[]>();
  const rejected: ProvenanceRejection[] = [];
  const offered = new Set<string>();

  for (const candidate of candidates) {
    const screened = screen(candidate);
    if ('reason' in screened) {
      offered.add(screened.path);
      rejected.push(screened);
      continue;
    }
    offered.add(screened.candidate.path);
    const bucket = byPath.get(screened.candidate.path);
    if (bucket) bucket.push(screened); else byPath.set(screened.candidate.path, [screened]);
  }

  const values: Record<string, unknown> = {};
  const provenance: Record<string, CaseStudyProvenanceEntry> = {};
  const preservedOverrides: string[] = [];

  for (const path of [...byPath.keys()].sort()) {
    const ranked = [...(byPath.get(path) as Screened[])].sort(compareCandidates);
    const [winner, ...losers] = ranked;
    values[path] = winner.candidate.value;
    provenance[path] = {
      tier: winner.candidate.tier, origin: winner.candidate.origin,
      recordedAt: winner.candidate.recordedAt,
      ...(winner.candidate.verification ? { verification: winner.candidate.verification } : {}),
    };
    for (const loser of losers) {
      rejected.push({ path, tier: loser.candidate.tier, stage: 'ranked',
        reason: 'outranked', detail: `'${winner.candidate.tier}' outranks '${loser.candidate.tier}'` });
    }
    if (winner.candidate.tier === 'human_override' && losers.length > 0) preservedOverrides.push(path);
  }

  return {
    values,
    provenance,
    rejected,
    unresolved: [...offered].filter((p) => !(p in values)).sort(),
    preservedOverrides: preservedOverrides.sort(),
  };
}

/** Fold a stored snapshot's provenance back into candidates for the next merge. */
export function existingProvenanceAsCandidates(
  provenance: CaseStudyProvenance,
  values: Readonly<Record<string, unknown>>,
): readonly CaseStudyFieldCandidate[] {
  return Object.keys(values).sort().flatMap((path) => {
    const entry = provenance[path];
    if (!entry) return [];
    return [{
      path, value: values[path], tier: entry.tier, origin: entry.origin,
      recordedAt: entry.recordedAt,
      ...(entry.verification ? { verification: entry.verification } : {}),
    }];
  });
}

/* ────────────────────────────────────────────────────────────── coverage ──── */

export interface SnapshotProvenanceField {
  readonly path: string;
  readonly tier: CaseStudyProvenanceTier | 'unknown';
  /** The provenance path that covered it — itself, or a section above it. */
  readonly coveredBy: string | null;
}

/** Every leaf path in the content, in the dotted form provenance keys use. */
export function enumerateSnapshotPaths(content: CaseStudySnapshotContent): readonly string[] {
  const out: string[] = [];
  const walk = (value: unknown, trail: string, depth: number): void => {
    if (value === undefined) return;
    const nested = depth <= MAX_SCAN_DEPTH && value !== null && typeof value === 'object';
    if (nested && Array.isArray(value) && value.length > 0) {
      value.forEach((item, i) => walk(item, `${trail}[${i}]`, depth + 1));
      return;
    }
    const keys = nested && !Array.isArray(value) ? Object.keys(value as Record<string, unknown>).sort() : [];
    if (keys.length > 0) {
      for (const k of keys) walk((value as Record<string, unknown>)[k], trail ? `${trail}.${k}` : k, depth + 1);
      return;
    }
    if (trail) out.push(trail);
  };
  walk(content, '', 0);
  return out;
}

/** `a.b[0].c` ⇒ `['a.b[0].c', 'a.b[0]', 'a.b', 'a']`. */
export function provenanceAncestors(path: string): readonly string[] {
  const out: string[] = [];
  let cursor = path;
  while (cursor.length > 0) {
    out.push(cursor);
    const cut = Math.max(cursor.lastIndexOf('['), cursor.lastIndexOf('.'));
    if (cut <= 0) break;
    cursor = cursor.slice(0, cut);
  }
  return out;
}

/** Spec §7.4 allows field-level OR section-level provenance, so a field is
 *  covered by an entry on itself or on any section above it. `unknown` is a
 *  field on a published page that nobody can account for. */
export function describeSnapshotProvenance(
  content: CaseStudySnapshotContent, provenance: CaseStudyProvenance,
): readonly SnapshotProvenanceField[] {
  return enumerateSnapshotPaths(content).map((path) => {
    for (const ancestor of provenanceAncestors(path)) {
      const entry = provenance[ancestor];
      if (entry) return { path, tier: entry.tier, coveredBy: ancestor };
    }
    return { path, tier: 'unknown' as const, coveredBy: null };
  });
}

export function findUnknownProvenanceFields(
  content: CaseStudySnapshotContent, provenance: CaseStudyProvenance,
): readonly string[] {
  return describeSnapshotProvenance(content, provenance)
    .filter((f) => f.tier === 'unknown').map((f) => f.path);
}

/* ─────────────────────────────────────────────────────────── log safety ──── */

/** A log-safe reference to where a value came from, for callers that DO log.
 *  Repository identity is always opaque: this module never sees a visibility
 *  flag, and `repoLogIdentity()` fails closed on `unknown` for the same reason.
 *  No actor, no project id, no evidence id — an accountable identity belongs in
 *  the provenance record a reviewer opens, never in stdout. */
export function provenanceLogRef(origin: CaseStudyProvenanceOrigin): string {
  if (origin.kind === 'manifest' || origin.kind === 'repo_extraction') {
    return `${origin.kind}:${opaqueRepoRef(origin.repoOwner, origin.repoName)}`;
  }
  if (origin.kind === 'ai_draft') return `ai_draft:${origin.promptKey}`;
  return origin.kind;
}
