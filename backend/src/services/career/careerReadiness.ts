/**
 * careerReadiness — Portfolio Publication Readiness (build plan §20).
 *
 * Two things this file is careful about:
 *
 * 1. **It is a POLICY, not a hardcoded threshold.** Plan §20 requires a
 *    configurable `PortfolioReadinessPolicy` so the bar can move without a code
 *    change to the scorer. `DEFAULT_POLICY` is the shipped default; every
 *    function takes a policy argument.
 *
 * 2. **It is NOT job readiness.** Plan §20: "Keep Portfolio Publication
 *    Readiness separate from Job/Career Readiness. Do not publicly label someone
 *    'job ready' based only on a portfolio rule." Nothing in this file, and
 *    nothing that renders it, may describe a person as employable. It scores one
 *    thing: whether a portfolio has enough substance to be worth a human review.
 *
 * Deterministic and pure — no I/O, no AI. Given the same projection it always
 * returns the same score, which is what makes it testable and what keeps a
 * readiness number from being something a model invented.
 */
import type { CareerCapability, CareerIdentity, CareerArtifact, CareerProject, CareerGithub } from './careerEvidenceAdapters';

export interface ReadinessRequirement {
  key: string;
  label: string;
  /** Relative contribution to the 0-100 score. */
  weight: number;
  /** Whether publication is blocked while this is unmet, independent of score. */
  required: boolean;
  met: boolean;
  /** Human-readable statement of the ACTUAL observed value, never a target. */
  detail: string;
}

export interface PortfolioReadinessPolicy {
  min_verified_capabilities: number;
  min_artifacts: number;
  min_projects: number;
  /** Score at or above which the portfolio may be SUBMITTED for review. */
  publish_threshold: number;
}

export const DEFAULT_POLICY: PortfolioReadinessPolicy = {
  min_verified_capabilities: 3,
  min_artifacts: 3,
  min_projects: 1,
  publish_threshold: Number(process.env.CAREER_READINESS_PUBLISH_THRESHOLD || 70),
};

export interface ReadinessInput {
  identity: CareerIdentity;
  capabilities: CareerCapability[];
  artifacts: CareerArtifact[];
  projects: CareerProject[];
  github: CareerGithub;
}

export interface ReadinessResult {
  score: number;
  requirements: ReadinessRequirement[];
  met_count: number;
  total_count: number;
  /**
   * Meets the numeric + required-item policy. Deliberately NOT called
   * `publishable`: meeting policy earns the right to REQUEST a review, and a
   * human still approves. Plan §21: "AI does not approve publication."
   */
  meets_policy: boolean;
  blocking: string[];
}

export function computeReadiness(
  input: ReadinessInput,
  policy: PortfolioReadinessPolicy = DEFAULT_POLICY,
): ReadinessResult {
  const { identity, capabilities, artifacts, projects, github } = input;

  const verified = capabilities.filter(
    (c) => c.evidence_level === 'colaberry_verified' || c.evidence_level === 'delivery_verified',
  );

  const requirements: ReadinessRequirement[] = [
    {
      key: 'identity_name',
      label: 'Your name is on your profile',
      weight: 5,
      required: true,
      met: !!identity.full_name?.trim(),
      detail: identity.full_name?.trim() ? identity.full_name : 'No name on file',
    },
    {
      key: 'resume_uploaded',
      label: 'Resume uploaded',
      weight: 15,
      required: true,
      met: !!identity.resume,
      detail: identity.resume ? identity.resume.file_name : 'No resume uploaded',
    },
    {
      key: 'profile_title',
      label: 'Professional title set',
      weight: 5,
      required: false,
      met: !!identity.title?.trim(),
      detail: identity.title?.trim() || 'No title set',
    },
    {
      key: 'linkedin',
      label: 'LinkedIn profile linked',
      weight: 5,
      required: false,
      met: !!identity.linkedin_url?.trim(),
      detail: identity.linkedin_url?.trim() || 'No LinkedIn URL',
    },
    {
      key: 'verified_capabilities',
      label: `At least ${policy.min_verified_capabilities} Colaberry-verified capabilities`,
      weight: 30,
      required: true,
      met: verified.length >= policy.min_verified_capabilities,
      detail: `${verified.length} verified of ${capabilities.length} tracked`,
    },
    {
      key: 'artifacts',
      label: `At least ${policy.min_artifacts} build artifacts`,
      weight: 25,
      required: true,
      met: artifacts.length >= policy.min_artifacts,
      detail: `${artifacts.length} artifact${artifacts.length === 1 ? '' : 's'}`,
    },
    {
      key: 'projects',
      label: `At least ${policy.min_projects} project`,
      weight: 10,
      required: false,
      met: projects.length >= policy.min_projects,
      detail: `${projects.length} project${projects.length === 1 ? '' : 's'}`,
    },
    {
      key: 'github',
      label: 'A GitHub repository connected',
      weight: 5,
      required: false,
      met: github.repos.length > 0,
      detail: github.repos.length
        ? `${github.repos.length} repositor${github.repos.length === 1 ? 'y' : 'ies'} connected`
        : 'No repository connected',
    },
  ];

  const totalWeight = requirements.reduce((s, r) => s + r.weight, 0);
  const earned = requirements.reduce((s, r) => s + (r.met ? r.weight : 0), 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

  const blocking = requirements.filter((r) => r.required && !r.met).map((r) => r.key);

  return {
    score,
    requirements,
    met_count: requirements.filter((r) => r.met).length,
    total_count: requirements.length,
    meets_policy: blocking.length === 0 && score >= policy.publish_threshold,
    blocking,
  };
}
