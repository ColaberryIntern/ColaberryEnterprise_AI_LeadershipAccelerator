/**
 * caseStudyPublishRules — the publish gate's vocabulary and its STRUCTURAL
 * rules: lifecycle, snapshot approval, metric visibility, consent, repository
 * exposure and required proof metadata (spec §15 conditions 1-8, plus §6.2's
 * surface restriction).
 *
 * READ `caseStudyPublishGate.ts` FIRST. It carries the doctrine this file
 * implements — why the gate fails closed, why it returns every blocker at once,
 * and the recorded position on self-attested verification that rule 7b enforces.
 *
 * WHY THIS IS ITS OWN FILE. The gate, its structural rules and its prose scan
 * together run to roughly 670 lines, past CLAUDE.md's 500-line hard ceiling. The
 * same split already exists next door for the same reason
 * (`caseStudySnapshotBuilder` + `…Sections` + `…Overrides` + `…Input`;
 * `caseStudyReadinessService` + `…Rubric`). The dependency runs ONE way — this
 * file is the leaf that owns the types, `caseStudyPublishClaimScan.ts` imports
 * them, `caseStudyPublishGate.ts` imports both and re-exports — so the set is
 * acyclic by construction and no consumer needs to know it is split at all.
 *
 * PURE. No clock, no randomness, no I/O, no database, no logging, no model
 * import. Every function is a total function of its arguments.
 */
import { PUBLISHABLE_SURFACE_KEYS } from '../../types/caseStudy';
import { isPublishableSurfaceKey } from '../../types/caseStudyGuards';
import { repoLogIdentity } from './caseStudyRepoReader';
import type {
  CaseStudyBuilderIdentityMode,
  CaseStudyMetricEntry,
  CaseStudyOrganizationIdentityMode,
  CaseStudySnapshotContent,
  CaseStudySnapshotStatus,
  CaseStudyStatus,
  CaseStudySurfaceKey,
} from '../../types/caseStudy';
import type { CaseStudyProvenance } from '../../types/caseStudyProvenance';

/* ────────────────────────────────────────────────────────────── vocabulary ── */

/**
 * One code per rejection reason. Codes are what a LOG LINE carries — a blocker's
 * message can quote a client's name or a builder's name, and a code never can —
 * and what the admin UI anchors its remediation links to. Stable identifiers:
 * retire one, never rename it.
 */
export type CaseStudyPublishBlockerCode =
  | 'surface_not_publishable'
  | 'case_study_not_approved'
  | 'snapshot_not_approved'
  | 'metric_pending'
  | 'organization_consent'
  | 'builder_consent'
  | 'private_repo_exposed'
  | 'proof_metadata_missing'
  | 'self_attested_verification'
  | 'ai_generated_quote'
  | 'unverified_claim';

export const CASE_STUDY_PUBLISH_BLOCKER_CODES = [
  'surface_not_publishable',
  'case_study_not_approved',
  'snapshot_not_approved',
  'metric_pending',
  'organization_consent',
  'builder_consent',
  'private_repo_exposed',
  'proof_metadata_missing',
  'self_attested_verification',
  'ai_generated_quote',
  'unverified_claim',
] as const;

/** One reason a publish was refused. `message` names the FIELD and its VALUE. */
export interface CaseStudyPublishBlocker {
  readonly code: CaseStudyPublishBlockerCode;
  /** Dotted path into the snapshot content, or a column name on the record. */
  readonly field: string;
  readonly message: string;
  readonly remedy: string;
}

/** The `case_studies` columns the gate reads. Never the model instance itself. */
export interface CaseStudyPublishRecord {
  readonly id: string;
  readonly status: CaseStudyStatus;
  readonly organizationIdentityMode: CaseStudyOrganizationIdentityMode;
  readonly organizationNamingConsent: boolean;
  readonly organizationDisplayName?: string | null;
  readonly builderIdentityMode: CaseStudyBuilderIdentityMode;
  readonly builderNamingConsent: boolean;
  readonly archivedAt?: string | null;
}

/** The `case_study_snapshots` row under consideration. `null` means none exists. */
export interface CaseStudyPublishSnapshot {
  readonly id: string;
  readonly version: number;
  readonly status: CaseStudySnapshotStatus;
  readonly approvedBy?: string | null;
  readonly approvedAt?: string | null;
  readonly content: CaseStudySnapshotContent;
  readonly provenance?: CaseStudyProvenance;
}

export interface CaseStudyPublishGateInput {
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly caseStudy: CaseStudyPublishRecord;
  readonly snapshot: CaseStudyPublishSnapshot | null;
}

export interface CaseStudyPublishDecision {
  readonly allowed: boolean;
  readonly blockers: readonly CaseStudyPublishBlocker[];
  /** Deduplicated codes, in rule order. The log line carries these, not messages. */
  readonly codes: readonly CaseStudyPublishBlockerCode[];
  /** Spec §15's block, ready to hand to an admin. Empty when allowed. */
  readonly summary: string;
}

/* ───────────────────────────────────────────────────────────────── helpers ── */

export const arr = <T>(v: readonly T[] | undefined | null): readonly T[] => (Array.isArray(v) ? v : []);
export const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
export const has = (v: unknown): boolean => text(v).length > 0;

/** Collector. Rules push into it; nothing ever short-circuits the run. */
export class Blockers {
  private readonly list: CaseStudyPublishBlocker[] = [];

  add(code: CaseStudyPublishBlockerCode, field: string, message: string, remedy: string): void {
    this.list.push(Object.freeze({ code, field, message, remedy }));
  }

  all(): readonly CaseStudyPublishBlocker[] {
    return Object.freeze([...this.list]);
  }
}

export interface MetricAt {
  readonly metric: CaseStudyMetricEntry;
  readonly path: string;
}

/**
 * Hero metrics then measurement metrics, deduplicated by `key` with hero
 * winning — the same order `caseStudyReadinessRubric.buildReadinessContext` uses,
 * deliberately, so the gate and the readiness panel are talking about the same
 * list of figures even though they reach opposite kinds of conclusion.
 */
export function collectMetrics(content: CaseStudySnapshotContent): readonly MetricAt[] {
  const out: MetricAt[] = [];
  const seen = new Set<string>();
  const push = (m: CaseStudyMetricEntry, path: string): void => {
    if (!m || typeof m !== 'object') return;
    const key = has(m.key) ? text(m.key) : path;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ metric: m, path });
  };
  arr(content.heroMetrics).forEach((m, i) => push(m, `heroMetrics[${i}]`));
  arr(content.measurement?.metrics).forEach((m, i) => push(m, `measurement.metrics[${i}]`));
  return out;
}

/**
 * A metric is VISIBLE when `publishable` is true. `case_study_metrics.publishable`
 * defaults FALSE in the DDL, so anything a human has not deliberately promoted
 * is invisible and none of the visibility rules apply to it.
 */
export const visible = (m: MetricAt): boolean => m.metric?.publishable === true;

/** `headline metric "41% fewer stockouts"` / `metric "Deploy frequency"`. */
export function metricName(m: CaseStudyMetricEntry): string {
  const shown = has(m.valueDisplay) ? text(m.valueDisplay) : text(m.label) || '(unnamed metric)';
  return `${m?.isHeadline === true ? 'headline metric' : 'metric'} "${shown}"`;
}

/* ─────────────────────────────────────────────────────── the structural rules ── */

/** 13 — only `enterprise` may be published in Phase 1 (spec §6.2). */
export function ruleSurface(input: CaseStudyPublishGateInput, b: Blockers): void {
  if (isPublishableSurfaceKey(input.surfaceKey)) return;
  b.add('surface_not_publishable', 'surface_key',
    `surface "${input.surfaceKey}" is accepted by the contract but is not publishable in Phase 1`,
    `publish to ${PUBLISHABLE_SURFACE_KEYS.map((k) => `"${k}"`).join(' or ')}; the other surfaces exist so that adding one later is a publication row rather than a schema change`);
}

/** 1 — the Case Study itself must be approved, and must not be archived. */
export function ruleStatus(record: CaseStudyPublishRecord, b: Blockers): void {
  if (record.status !== 'approved') {
    b.add('case_study_not_approved', 'case_studies.status',
      `Case Study status is "${record.status}"; only an approved Case Study may be published`,
      'move the record through review and approve it, then publish');
  }
  if (has(record.archivedAt)) {
    b.add('case_study_not_approved', 'case_studies.archived_at',
      `Case Study was archived at ${text(record.archivedAt)}, and an archived record may not be published`,
      'restore the record before publishing');
  }
}

/** 2 — an approved snapshot must exist, and must record who approved it. */
export function ruleSnapshot(snapshot: CaseStudyPublishSnapshot | null, b: Blockers): void {
  if (!snapshot) {
    b.add('snapshot_not_approved', 'case_study_snapshots',
      'no approved snapshot exists for this Case Study',
      'review the latest draft snapshot and approve it; publication pins the approved version, so there is nothing to pin until one exists');
    return;
  }
  if (snapshot.status !== 'approved') {
    b.add('snapshot_not_approved', 'case_study_snapshots.status',
      `snapshot version ${snapshot.version} has status "${snapshot.status}"; only an approved snapshot may be published`,
      'approve that snapshot version, or approve a newer one and publish that');
    return;
  }
  if (!has(snapshot.approvedBy) || !has(snapshot.approvedAt)) {
    b.add('snapshot_not_approved', 'case_study_snapshots.approved_by',
      `snapshot version ${snapshot.version} is marked approved but records no approver`,
      're-approve the snapshot so approved_by and approved_at are both stamped; an approval nobody signed is not an approval');
  }
}

/** 3 — no VISIBLE metric may still be `pending`. */
export function rulePendingMetrics(metrics: readonly MetricAt[], b: Blockers): void {
  for (const m of metrics) {
    if (!visible(m)) continue;
    if (m.metric.verification?.class !== 'pending') continue;
    b.add('metric_pending', `${m.path}.verification.class`,
      `${metricName(m.metric)} is marked publishable but its verification is still pending`,
      'verify the figure and set its verification class, or clear its publishable flag so it stays off the page');
  }
}

/** 4 — the organisation may not be named without recorded naming consent. */
export function ruleOrganizationConsent(
  record: CaseStudyPublishRecord, content: CaseStudySnapshotContent, b: Blockers,
): void {
  const identity = content.identity;
  const mode = identity?.organizationIdentityMode;
  const name = text(identity?.organizationDisplayName) || text(record.organizationDisplayName);
  const named = `organization name${name ? ` "${name}"` : ''}`;

  // Drift between the consent columns and the snapshot that would render is
  // itself a blocker. Publication must never resolve a disagreement about
  // consent by picking one of the two answers.
  if (mode !== record.organizationIdentityMode) {
    b.add('organization_consent', 'identity.organizationIdentityMode',
      `organization identity mode differs between the Case Study record ("${record.organizationIdentityMode}") and the approved snapshot ("${mode}")`,
      'change consent on the record, rebuild the snapshot and re-approve it');
  }
  if (identity?.organizationNamingConsent !== record.organizationNamingConsent) {
    b.add('organization_consent', 'identity.organizationNamingConsent',
      `organization naming consent differs between the Case Study record (${record.organizationNamingConsent}) and the approved snapshot (${identity?.organizationNamingConsent})`,
      'rebuild the snapshot from the record and re-approve it');
  }
  if (mode === 'named'
    && !(record.organizationNamingConsent === true && identity?.organizationNamingConsent === true)) {
    b.add('organization_consent', 'identity.organizationNamingConsent',
      `${named} is visible but naming consent is not approved`,
      'record the organization\'s naming consent, or set the identity mode to "anonymized" so the record describes them without naming them');
  }
  if (mode === 'named' && !name) {
    b.add('organization_consent', 'identity.organizationDisplayName',
      'organization identity mode is "named" but no organization name is recorded',
      'record the name that consent covers, or set the identity mode to "anonymized"');
  }
  if (mode === 'hidden' && name) {
    b.add('organization_consent', 'identity.organizationDisplayName',
      `organization identity mode is "hidden" but the snapshot still carries the name "${name}"`,
      'clear the organization name from the snapshot, or raise the identity mode to "anonymized" or to "named" with consent');
  }
}

/** 5 — no builder may be named without recorded builder consent. */
export function ruleBuilderConsent(
  record: CaseStudyPublishRecord, content: CaseStudySnapshotContent, b: Blockers,
): void {
  const identity = content.identity;
  const mode = identity?.builderIdentityMode;
  const consented = record.builderNamingConsent === true && identity?.builderNamingConsent === true;

  if (mode !== record.builderIdentityMode) {
    b.add('builder_consent', 'identity.builderIdentityMode',
      `builder identity mode differs between the Case Study record ("${record.builderIdentityMode}") and the approved snapshot ("${mode}")`,
      'change consent on the record, rebuild the snapshot and re-approve it');
  }
  if (identity?.builderNamingConsent !== record.builderNamingConsent) {
    b.add('builder_consent', 'identity.builderNamingConsent',
      `builder naming consent differs between the Case Study record (${record.builderNamingConsent}) and the approved snapshot (${identity?.builderNamingConsent})`,
      'rebuild the snapshot from the record and re-approve it');
  }
  if (mode === 'named' && !consented) {
    b.add('builder_consent', 'identity.builderNamingConsent',
      'builder identity is "named" but builder naming consent is not approved',
      'record the builder\'s consent, or set the builder identity mode to "role_only" so the page credits the role without the person');
  }

  arr(content.contributors).forEach((c, i) => {
    if (!c || c.displayMode !== 'named') return;
    const who = `contributor "${text(c.displayName) || '(unnamed)'}"`;
    const role = has(c.role) ? ` (${text(c.role)})` : '';
    if (!consented) {
      b.add('builder_consent', `contributors[${i}].displayName`,
        `${who}${role} would be named but builder naming consent is not approved`,
        'record that contributor\'s consent, or change their displayMode to "role_only"');
    }
    if (mode !== 'named') {
      b.add('builder_consent', `contributors[${i}].displayMode`,
        `${who}${role} would be named while the builder identity mode is "${mode}"`,
        'change the contributor to "role_only", or raise the builder identity mode to "named" with consent on file');
    }
    if (!has(c.consentRecordedAt)) {
      b.add('builder_consent', `contributors[${i}].consentRecordedAt`,
        `${who}${role} is named but records no consent timestamp`,
        'stamp consentRecordedAt with when the consent was actually given; a named person with no recorded consent is the failure this field exists to prevent');
    }
  });
}

/** 6 — a repository that is not demonstrably public may not be linked. */
export function ruleRepositories(content: CaseStudySnapshotContent, b: Blockers): void {
  arr(content.repositories).forEach((r, i) => {
    if (!r || r.allowPublicRepoLink !== true) return;
    if (r.visibility === 'public') return;
    // `repoLogIdentity` fails closed on anything other than `public`, so a
    // non-public repository is named here only by its opaque handle. That makes
    // this message safe to surface to an admin AND safe to put in a log line.
    const id = repoLogIdentity(text(r.repoOwner), text(r.repoName), r.visibility);
    const ref = id.repo_ref ? `repo_ref ${id.repo_ref}` : `${id.owner}/${id.repo}`;
    b.add('private_repo_exposed', `repositories[${i}].allowPublicRepoLink`,
      `a repository whose visibility is "${r.visibility}" (role "${r.role}", ${ref}) is flagged allow_public_repo_link and would be exposed`,
      r.visibility === 'unknown'
        ? 're-read the repository\'s visibility; a repository we could not read is not a public one, so the flag cannot be honoured'
        : 'clear allow_public_repo_link; a private repository survives on the page as an opaque count, never as a link');
  });
}

/**
 * 7 — required proof metadata, and 7b — the self-attestation position.
 *
 * 7b is stated in full in `caseStudyPublishGate.ts`'s header: a `verified` class
 * on a `self` method is a MISLABEL, not weak evidence, and is refused outright.
 * The `continue` is deliberate — reporting "and it also has no evidence pointer"
 * about a metric whose label is wrong would bury the finding that matters.
 */
export function ruleProofMetadata(
  metrics: readonly MetricAt[], content: CaseStudySnapshotContent, b: Blockers,
): void {
  for (const m of metrics) {
    if (!visible(m)) continue;
    const v = m.metric.verification;
    if (v?.class === 'verified' && v?.method === 'self') {
      b.add('self_attested_verification', `${m.path}.verification.method`,
        `${metricName(m.metric)} is labelled verified but its verification method is "self"; a self-report is not third-party verification`,
        'verify it against the repository, the platform or the client, or record it as "anonymized" or "illustrative" so the surface labels it as self-reported');
      continue;
    }
    if (v?.class === 'verified' && !has(v?.evidenceId)) {
      b.add('proof_metadata_missing', `${m.path}.verification.evidenceId`,
        `${metricName(m.metric)} has no verified evidence`,
        'link a case_study_evidence row to the metric; a verified class with no evidence pointer is an assertion, not proof');
    }
    const ctx = m.metric.measurement;
    if (m.metric.isHeadline === true
      && !(has(ctx?.baseline) || has(ctx?.sample) || has(ctx?.methodology))) {
      b.add('proof_metadata_missing', `${m.path}.measurement`,
        `${metricName(m.metric)} states no baseline, sample or methodology`,
        'record how it was measured; spec §23 will not render a headline figure without the context that makes it honest');
    }
  }
  const ps = content.identity?.productionStatus;
  if (ps && ps.verification?.class === 'verified' && !has(ps.verification?.evidenceId)) {
    b.add('proof_metadata_missing', 'identity.productionStatus.verification.evidenceId',
      `production status "${ps.status}" is labelled verified but carries no evidence reference`,
      'link the evidence that establishes the deployment, or lower the verification class');
  }
}
