/**
 * Case Study OS — runtime narrowing, and the exhaustiveness proofs.
 *
 * WHY THE `never` CHECKS LIVE HERE AND NOT IN THE TEST
 * A `switch` with a `default: assertNever(value)` only bites if something
 * type-checks it. `backend/tsconfig.json` EXCLUDES every `__tests__` directory, and
 * `jest.config.ts` runs ts-jest with `isolatedModules: true` (transpile only, no
 * type checking) — so an exhaustiveness guard written inside a test file is
 * checked by nothing at all and would be pure decoration. Written here, it is
 * covered by `tsc --noEmit`, which is the real gate: add a member to any union
 * below without handling it and the backend typecheck fails by name.
 *
 * The suite's job is the other half — calling each function with each member, so
 * a union that gains a member nobody thought about fails loudly in both places.
 *
 * The labels returned by `describeVerificationClass` are pinned by test to
 * `EVIDENCE_LABEL` in `frontend/src/components/publicV2/Claim.tsx`, so the same
 * evidence never gets two different words on `/proof` and `/stories`.
 *
 * LEAF MODULE: imports only its sibling contracts.
 */

import {
  CASE_STUDY_SURFACE_KEYS,
  CASE_STUDY_VERIFICATION_CLASSES,
  CASE_STUDY_VERIFICATION_METHODS,
  PUBLISHABLE_SURFACE_KEYS,
} from './caseStudy';
import type {
  CaseStudyArtifactVisibility,
  CaseStudyBuilderIdentityMode,
  CaseStudyBuiltByType,
  CaseStudyOrganizationIdentityMode,
  CaseStudyRepoVisibility,
  CaseStudyRoadmapStatus,
  CaseStudySectionKey,
  CaseStudyStatus,
  CaseStudySurfaceKey,
  CaseStudyVerificationClass,
  CaseStudyVerificationMethod,
} from './caseStudy';
import { CASE_STUDY_PROVENANCE_PRECEDENCE } from './caseStudyProvenance';
import type { CaseStudyProvenanceTier } from './caseStudyProvenance';
import { PUBLIC_VERIFICATION_CLASSES } from './caseStudyPublic';
import type { PublicVerificationClass } from './caseStudyPublic';
import { CASE_STUDY_SORT_KEYS } from './caseStudyFilters';
import type { CaseStudySortKey } from './caseStudyFilters';

/* ──────────────────────────────────────────────────────────── primitives ──── */

/**
 * Reached only when a union gained a member nobody handled. It is a compile
 * error first; the throw is the runtime backstop for data that came from the
 * database or the network rather than from TypeScript.
 */
export function assertNever(value: never, unionName: string): never {
  throw new Error(
    `ContractViolation: unhandled ${unionName} member ${JSON.stringify(value)}`,
  );
}

function isMember<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/* ─────────────────────────────────────────────────────── runtime guards ──── */

export function isCaseStudyVerificationClass(v: unknown): v is CaseStudyVerificationClass {
  return isMember(CASE_STUDY_VERIFICATION_CLASSES, v);
}

export function isCaseStudyVerificationMethod(v: unknown): v is CaseStudyVerificationMethod {
  return isMember(CASE_STUDY_VERIFICATION_METHODS, v);
}

/** The gate a projection uses to prove a figure is not `pending` before it ships. */
export function isPublicVerificationClass(v: unknown): v is PublicVerificationClass {
  return isMember(PUBLIC_VERIFICATION_CLASSES, v);
}

export function isCaseStudySurfaceKey(v: unknown): v is CaseStudySurfaceKey {
  return isMember(CASE_STUDY_SURFACE_KEYS, v);
}

/** True for `enterprise` only in Phase 1. The publish gate checks this as well. */
export function isPublishableSurfaceKey(v: unknown): v is CaseStudySurfaceKey {
  return isMember(PUBLISHABLE_SURFACE_KEYS, v);
}

export function isCaseStudySortKey(v: unknown): v is CaseStudySortKey {
  return isMember(CASE_STUDY_SORT_KEYS, v);
}

/**
 * Precedence rank — lower wins. The merge step is then
 * `provenanceRank(incoming) < provenanceRank(existing)`, so the §9 ordering is
 * written down exactly once (in `CASE_STUDY_PROVENANCE_PRECEDENCE`) and cannot
 * be re-stated differently somewhere else.
 */
export function provenanceRank(tier: CaseStudyProvenanceTier): number {
  return CASE_STUDY_PROVENANCE_PRECEDENCE.indexOf(tier);
}

/* ────────────────────────────────────────────── exhaustive descriptions ──── */

/** Wording pinned to `EVIDENCE_LABEL` in Claim.tsx. Changing one breaks the suite. */
export function describeVerificationClass(value: CaseStudyVerificationClass): string {
  switch (value) {
    case 'verified': return 'Verified';
    case 'anonymized': return 'Anonymized';
    case 'illustrative': return 'Illustrative demo';
    case 'pending': return 'Pending approval';
    default: return assertNever(value, 'CaseStudyVerificationClass');
  }
}

export function describePublicVerificationClass(value: PublicVerificationClass): string {
  switch (value) {
    case 'verified': return 'Verified';
    case 'anonymized': return 'Anonymized';
    case 'illustrative': return 'Illustrative demo';
    default: return assertNever(value, 'PublicVerificationClass');
  }
}

export function describeVerificationMethod(value: CaseStudyVerificationMethod): string {
  switch (value) {
    case 'client': return 'Confirmed by the client';
    case 'repo': return 'Evidenced in the repository';
    case 'platform': return 'Measured by the platform';
    case 'internal': return 'Measured internally';
    case 'self': return 'Self-reported';
    case 'manual': return 'Checked by hand';
    default: return assertNever(value, 'CaseStudyVerificationMethod');
  }
}

export function describeSurfaceKey(value: CaseStudySurfaceKey): string {
  switch (value) {
    case 'enterprise': return 'Enterprise';
    case 'training': return 'Training';
    case 'ai-flotation': return 'AI Flotation';
    case 'refactored': return 'Refactored';
    default: return assertNever(value, 'CaseStudySurfaceKey');
  }
}

export function describeRoadmapStatus(value: CaseStudyRoadmapStatus): string {
  switch (value) {
    case 'shipped': return 'Shipped';
    case 'in_progress': return 'In progress';
    case 'paused': return 'Paused';
    case 'not_pursued': return 'Not pursued';
    case 'unknown': return 'Not known';
    default: return assertNever(value, 'CaseStudyRoadmapStatus');
  }
}

export function describeBuiltByType(value: CaseStudyBuiltByType): string {
  switch (value) {
    case 'learner': return 'Learner';
    case 'intern': return 'Intern';
    case 'client_team': return 'Client team';
    case 'colaberry_team': return 'Colaberry team';
    case 'ai_flotation_team': return 'AI Flotation team';
    case 'joint_team': return 'Joint team';
    default: return assertNever(value, 'CaseStudyBuiltByType');
  }
}

export function describeBuilderIdentityMode(value: CaseStudyBuilderIdentityMode): string {
  switch (value) {
    case 'named': return 'Named, with consent on file';
    case 'role_only': return 'Role only';
    case 'anonymous': return 'Anonymous';
    default: return assertNever(value, 'CaseStudyBuilderIdentityMode');
  }
}

export function describeOrganizationIdentityMode(
  value: CaseStudyOrganizationIdentityMode,
): string {
  switch (value) {
    case 'named': return 'Named, with consent on file';
    case 'anonymized': return 'Described but not named';
    case 'hidden': return 'Not referenced';
    default: return assertNever(value, 'CaseStudyOrganizationIdentityMode');
  }
}

export function describeArtifactVisibility(value: CaseStudyArtifactVisibility): string {
  switch (value) {
    case 'public': return 'Open';
    case 'request_only': return 'On request';
    case 'private': return 'Private';
    default: return assertNever(value, 'CaseStudyArtifactVisibility');
  }
}

export function describeRepoVisibility(value: CaseStudyRepoVisibility): string {
  switch (value) {
    case 'public': return 'Public repository';
    case 'private': return 'Private repository';
    case 'unknown': return 'Visibility not established';
    default: return assertNever(value, 'CaseStudyRepoVisibility');
  }
}

export function describeCaseStudyStatus(value: CaseStudyStatus): string {
  switch (value) {
    case 'draft': return 'Draft';
    case 'review': return 'In review';
    case 'approved': return 'Approved';
    case 'published': return 'Published';
    case 'archived': return 'Archived';
    default: return assertNever(value, 'CaseStudyStatus');
  }
}

export function describeProvenanceTier(value: CaseStudyProvenanceTier): string {
  switch (value) {
    case 'human_override': return 'Human override';
    case 'approved_metric_evidence': return 'Approved metric or evidence';
    case 'project_facts': return 'Project facts';
    case 'evidence_or_artifact': return 'Evidence record or portfolio artifact';
    case 'repo_manifest': return 'Repository manifest';
    case 'repo_extraction': return 'Repository extraction';
    case 'ai_draft': return 'AI draft';
    default: return assertNever(value, 'CaseStudyProvenanceTier');
  }
}

export function describeSortKey(value: CaseStudySortKey): string {
  switch (value) {
    case 'featured': return 'Featured';
    case 'newest': return 'Newest';
    case 'strongest-proof': return 'Strongest proof';
    case 'recently-updated': return 'Recently updated';
    default: return assertNever(value, 'CaseStudySortKey');
  }
}

export function describeSectionKey(value: CaseStudySectionKey): string {
  switch (value) {
    case 'hero': return 'Hero';
    case 'situation': return 'The situation';
    case 'build': return 'The build';
    case 'architecture': return 'What was built';
    case 'measurement': return 'The measurement';
    case 'roadmap': return 'What happened next';
    case 'contributors': return 'Who built it';
    case 'artifacts': return 'Artifacts';
    case 'repositories': return 'Repositories and provenance';
    case 'cta': return 'Call to action';
    default: return assertNever(value, 'CaseStudySectionKey');
  }
}
