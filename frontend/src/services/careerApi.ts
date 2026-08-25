/**
 * careerApi — typed client for the private Career Studio (/portal/portfolio).
 *
 * Types mirror `backend/src/schemas/careerPortfolioSchema.ts` — that file is the
 * single source of truth; keep these in sync by hand until a shared-types package
 * exists. (Same convention as capeApi.ts.)
 */
import portalApi from '../utils/portalApi';
import api from '../utils/api';

export type CareerEvidenceLevel = 'none' | 'resume' | 'colaberry_verified' | 'delivery_verified';
export type CareerAccessState = 'baseline_missing' | 'ready';

export interface CareerIdentity {
  full_name: string;
  email: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  avatar_data_url: string | null;
  cohort_name: string | null;
  member_since: string | null;
  resume: { file_name: string; uploaded_at: string | null } | null;
}

export interface CareerCapability {
  skill_id: string;
  name: string;
  evidence_level: CareerEvidenceLevel;
  proficiency: number;
  confidence: number;
  bands: { claim: number; knowledge: number; application: number; judgment: number };
  evidence_count: number;
  last_demonstrated_at: string | null;
  source_breakdown: Record<string, number>;
}

export interface CareerArtifact {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  competencies: string[];
  created_at: string | null;
}

export interface CareerProject {
  id: string;
  name: string;
  organization_name: string | null;
  industry: string | null;
  business_problem: string | null;
  stage: string | null;
  github_repo_url: string | null;
  maturity_score: number | null;
  created_at: string | null;
}

export interface CareerRepo {
  repo_url: string;
  repo_owner: string;
  repo_name: string;
  language: string | null;
  file_count: number | null;
  last_sync_at: string | null;
}

export interface CareerGithub {
  repos: CareerRepo[];
  activity: { commits_last_7d: number; open_prs: number; total_stars: number; synced_at: string | null } | null;
}

export interface ReadinessRequirement {
  key: string;
  label: string;
  weight: number;
  required: boolean;
  met: boolean;
  detail: string;
}

export interface CareerReadiness {
  score: number;
  requirements: ReadinessRequirement[];
  met_count: number;
  total_count: number;
  meets_policy: boolean;
  blocking: string[];
}

export interface CareerNarrative {
  headline: string | null;
  headline_source: 'profile_title' | 'not_set';
  suggested_about: string | null;
  facts: string[];
}

export interface CareerRecentActivity {
  window_days: number;
  new_artifacts: number;
  capabilities_advanced: number;
  items: Array<{ kind: 'artifact' | 'capability'; label: string; at: string }>;
}

export interface CareerProfile {
  state: CareerAccessState;
  visibility: 'private';
  identity: CareerIdentity | null;
  capabilities: CareerCapability[];
  artifacts: CareerArtifact[];
  projects: CareerProject[];
  github: CareerGithub | null;
  delivery_experience: unknown[];
  readiness: CareerReadiness | null;
  narrative: CareerNarrative | null;
  recent_activity: CareerRecentActivity | null;
  publication: { status: 'not_published'; note: string };
  degraded: string[];
  generated_at: string;
}

/**
 * The ONE definition of "Colaberry stands behind this capability".
 *
 * Deliberately a positive allow-list, and deliberately in one place. Two
 * components previously each carried their own `evidence_level !== 'resume'`
 * check; when the `none` level was introduced both silently flipped every
 * no-evidence capability to "verified" and the UI reported 10 of 10 verified
 * from an empty ledger. A new level must never widen this by default — adding
 * one to the union should require an explicit decision here.
 */
export function isVerifiedLevel(level: CareerEvidenceLevel): boolean {
  return level === 'colaberry_verified' || level === 'delivery_verified';
}

/** Employer-readable label for an evidence level. Never exposes raw band scores. */
export const EVIDENCE_LEVEL_LABEL: Record<CareerEvidenceLevel, string> = {
  none: 'No evidence yet',
  resume: 'Resume evidence',
  colaberry_verified: 'Colaberry Verified',
  delivery_verified: 'Delivery Verified',
};

export async function fetchCareerProfile(): Promise<CareerProfile> {
  const { data } = await portalApi.get<CareerProfile>('/api/portal/career/profile');
  return data;
}

// ── Publication + review (Gate 9b/10, post-convergence) ─────────────────────
//
// The public portfolio is the Capstone Record at /p/:slug. These endpoints drive the
// governance around it: a learner asks for review, a human decides, and the learner
// separately chooses who may see an approved record.
//
// `status` and `visibility` are deliberately independent. A reviewer approves that the
// work is publishable; the learner alone decides the audience.

export type CapstoneReviewState = 'no_record' | 'draft' | 'in_review' | 'published' | 'changes_requested';
export type RecordVisibility = 'private' | 'unlisted' | 'public';
export type ReviewDecision = 'approved' | 'changes_requested' | 'rejected';

export interface CapstoneReviewStatus {
  state: CapstoneReviewState;
  slug: string | null;
  version: number | null;
  visibility: RecordVisibility | null;
  public_url: string | null;
  last_review: { decision: ReviewDecision; notes: string | null; decided_at: string } | null;
}

export async function fetchPublicationStatus(): Promise<CapstoneReviewStatus> {
  const { data } = await portalApi.get<CapstoneReviewStatus>('/api/portal/career/publication');
  return data;
}

export async function requestReview(): Promise<{ review_id: string; version: number; deduplicated: boolean }> {
  const { data } = await portalApi.post('/api/portal/career/publication/request-review', {});
  return data;
}

/** The learner's own opt-in. `public` is the only value that allows indexing. */
export async function setVisibility(visibility: RecordVisibility): Promise<{ visibility: RecordVisibility; indexable: boolean }> {
  const { data } = await portalApi.put('/api/portal/career/publication/visibility', { visibility });
  return data;
}

// ── Reviewer (admin + mentor) ──────────────────────────────────────────────

export interface ReviewQueueItem {
  review_id: string;
  record_id: string;
  enrollment_id: string;
  version: number;
  requested_at: string;
  slug: string | null;
  visibility: string | null;
  full_name: string | null;
}

export async function fetchReviewQueue(): Promise<{ items: ReviewQueueItem[]; reviewer_kind: 'admin' | 'mentor' | 'none' }> {
  const { data } = await api.get<{ ok: boolean; items: ReviewQueueItem[]; reviewer_kind: 'admin' | 'mentor' | 'none' }>(
    '/api/admin/career/review-queue',
  );
  return { items: data.items, reviewer_kind: data.reviewer_kind };
}

export async function submitReviewDecision(
  recordId: string,
  decision: ReviewDecision,
  notes?: string,
): Promise<{ decision: ReviewDecision; published: boolean }> {
  const { data } = await api.post(`/api/admin/career/review/${encodeURIComponent(recordId)}`, { decision, notes });
  return data;
}
