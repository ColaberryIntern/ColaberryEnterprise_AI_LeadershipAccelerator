/**
 * Zod response contract for the private Career Studio surface
 * (GET /api/portal/career/profile).
 *
 * Validated in non-production at the route boundary — backend/CLAUDE.md:
 * "validate the actual response against the shape and fail loud if it diverges."
 * Mirrored by hand in `frontend/src/services/careerApi.ts`; THIS file is the
 * source of truth for the shape.
 */
import { z } from 'zod';

export const careerEvidenceLevelSchema = z.enum(['resume', 'colaberry_verified', 'delivery_verified']);

export const careerIdentitySchema = z.object({
  full_name: z.string(),
  email: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  avatar_data_url: z.string().nullable(),
  cohort_name: z.string().nullable(),
  member_since: z.string().nullable(),
  // Presence + filename only — resume CONTENT is never projected.
  resume: z.object({ file_name: z.string(), uploaded_at: z.string().nullable() }).nullable(),
});

export const careerCapabilitySchema = z.object({
  skill_id: z.string(),
  name: z.string(),
  evidence_level: careerEvidenceLevelSchema,
  proficiency: z.number(),
  confidence: z.number(),
  bands: z.object({
    claim: z.number(),
    knowledge: z.number(),
    application: z.number(),
    judgment: z.number(),
  }),
  evidence_count: z.number(),
  last_demonstrated_at: z.string().nullable(),
  source_breakdown: z.record(z.string(), z.number()),
});

export const careerArtifactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  competencies: z.array(z.string()),
  created_at: z.string().nullable(),
});

export const careerProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  organization_name: z.string().nullable(),
  industry: z.string().nullable(),
  business_problem: z.string().nullable(),
  stage: z.string().nullable(),
  github_repo_url: z.string().nullable(),
  maturity_score: z.number().nullable(),
  created_at: z.string().nullable(),
});

export const careerGithubSchema = z.object({
  repos: z.array(z.object({
    repo_url: z.string(),
    repo_owner: z.string(),
    repo_name: z.string(),
    language: z.string().nullable(),
    file_count: z.number().nullable(),
    last_sync_at: z.string().nullable(),
  })),
  activity: z.object({
    commits_last_7d: z.number(),
    open_prs: z.number(),
    total_stars: z.number(),
    synced_at: z.string().nullable(),
  }).nullable(),
});

export const readinessRequirementSchema = z.object({
  key: z.string(),
  label: z.string(),
  weight: z.number(),
  required: z.boolean(),
  met: z.boolean(),
  detail: z.string(),
});

export const readinessSchema = z.object({
  score: z.number(),
  requirements: z.array(readinessRequirementSchema),
  met_count: z.number(),
  total_count: z.number(),
  meets_policy: z.boolean(),
  blocking: z.array(z.string()),
});

export const careerNarrativeSchema = z.object({
  headline: z.string().nullable(),
  headline_source: z.enum(['profile_title', 'not_set']),
  suggested_about: z.string().nullable(),
  facts: z.array(z.string()),
});

export const careerRecentActivitySchema = z.object({
  window_days: z.number(),
  new_artifacts: z.number(),
  capabilities_advanced: z.number(),
  items: z.array(z.object({
    kind: z.enum(['artifact', 'capability']),
    label: z.string(),
    at: z.string(),
  })),
});

export const careerProfileResponseSchema = z.object({
  state: z.enum(['needs_resume', 'ready']),
  visibility: z.literal('private'),
  identity: careerIdentitySchema.nullable(),
  capabilities: z.array(careerCapabilitySchema),
  artifacts: z.array(careerArtifactSchema),
  projects: z.array(careerProjectSchema),
  github: careerGithubSchema.nullable(),
  delivery_experience: z.array(z.unknown()),
  readiness: readinessSchema.nullable(),
  narrative: careerNarrativeSchema.nullable(),
  recent_activity: careerRecentActivitySchema.nullable(),
  publication: z.object({ status: z.literal('not_published'), note: z.string() }),
  degraded: z.array(z.string()),
  generated_at: z.string(),
});

export type CareerProfileResponseContract = z.infer<typeof careerProfileResponseSchema>;
