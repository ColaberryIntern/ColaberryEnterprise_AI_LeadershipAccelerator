import { z } from 'zod';
import {
  CASE_STATES,
  ITEM_INCLUSION_STATUSES,
  ITEM_DISPOSITIONS,
  ACTION_TYPES,
  DISCOVERY_WINDOW_DAYS,
} from '../types/inboxCase';

// Runtime request/response validation for the Inbox Intel — Case Resolution
// Engine API. Every route parses input through one of these before it
// reaches a service, per root CLAUDE.md > Contract Enforcement Layer.

const discoveryWindowEnum = z.enum(Object.keys(DISCOVERY_WINDOW_DAYS) as [string, ...string[]]);

export const discoverCaseSchema = z.object({
  mode: z.enum(['PERSON', 'TOPIC']),
  query: z.string().trim().min(1).max(500),
  window: discoveryWindowEnum.default('90d'),
  providers: z.array(z.enum(['gmail_colaberry', 'gmail_personal', 'hotmail', 'basecamp'])).optional(),
});
export type DiscoverCaseInput = z.infer<typeof discoverCaseSchema>;

export const listCasesQuerySchema = z.object({
  state: z.enum(CASE_STATES).optional(),
  mode: z.enum(['PERSON', 'TOPIC']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const caseIdParamSchema = z.object({ caseId: z.string().uuid() });
export const caseItemParamSchema = z.object({ caseId: z.string().uuid(), itemId: z.string().uuid() });
export const caseQuestionParamSchema = z.object({ caseId: z.string().uuid(), questionId: z.string().uuid() });
export const caseActionParamSchema = z.object({ caseId: z.string().uuid(), actionId: z.string().uuid() });

export const quickResolveItemSchema = z.object({ resolution: z.enum(['HANDLED', 'IGNORE']) });

export const overrideActionsSchema = z.object({ instruction: z.string().min(1).max(500) });

export const updateCaseItemSchema = z
  .object({
    inclusion_status: z.enum(ITEM_INCLUSION_STATUSES).optional(),
    disposition: z.enum(ITEM_DISPOSITIONS).optional(),
    disposition_reason: z.string().max(2000).optional(),
  })
  .refine((v) => v.inclusion_status !== undefined || v.disposition !== undefined, {
    message: 'At least one of inclusion_status or disposition is required',
  });

export const answerQuestionSchema = z
  .object({
    answer: z.string().trim().max(4000).optional(),
    accept_recommended: z.boolean().optional(),
    answered_by: z.string().max(100).default('admin'),
  })
  .refine((v) => v.accept_recommended === true || (v.answer && v.answer.length > 0), {
    message: 'Provide either answer or accept_recommended:true',
  });

export const approveActionSchema = z.object({
  approved_by: z.string().max(100).default('admin'),
  edited_payload: z.record(z.string(), z.unknown()).optional(),
});

export const rejectActionSchema = z.object({
  rejected_by: z.string().max(100).default('admin'),
  reason: z.string().trim().min(1).max(2000),
});

export const approveLowRiskSchema = z.object({
  approved_by: z.string().max(100).default('admin'),
});

export const closeCaseSchema = z.object({
  closed_by: z.string().max(100).default('admin'),
});

export const reopenCaseSchema = z.object({
  reopened_by: z.string().max(100).default('admin'),
  reason: z.string().trim().min(1).max(2000),
});

export const actionTypeEnum = z.enum(ACTION_TYPES);

// AI free-text plan override (root directive extension, this session).
// The model supplies ONLY these 4 fields for new_action — target_source,
// target_id, risk_level, and idempotencyParts are always derived by code
// in caseActionOverrideService.ts, never by the model. risk_level in
// particular is hardcoded HIGH there regardless of what this schema would
// otherwise allow, so an override-created action can never be swept into
// bulk low-risk approval — see that file for the full reasoning.
export const actionOverrideOutputSchema = z.object({
  actions_to_reject: z.array(z.string()).default([]),
  new_action: z
    .object({
      item_id: z.string(),
      action_type: actionTypeEnum,
      preview: z.string().min(1),
      payload: z.record(z.string(), z.unknown()).default({}),
    })
    .nullable()
    .default(null),
});
export type ActionOverrideOutput = z.infer<typeof actionOverrideOutputSchema>;

// ---- AI assessment structured output (Phase 3: Assess/Teach/Ask) ----
// Validates the model's JSON response before it is trusted for anything.
// An invalid/malformed response never reaches the case record — the caller
// falls back to a safe, deterministic assessment instead.

const evidenceRefSchema = z.object({
  item_id: z.string(),
  source_type: z.string(),
  quote: z.string().optional(),
});

const timelineEntrySchema = z.object({
  occurred_at: z.string(),
  summary: z.string(),
  evidence: z.array(evidenceRefSchema).default([]),
});

export const caseAssessmentOutputSchema = z.object({
  objective: z.string().min(1),
  current_state: z.string().min(1),
  summary: z.string().min(1),
  timeline: z.array(timelineEntrySchema).default([]),
  confirmed_facts: z.array(z.object({ statement: z.string(), evidence: z.array(evidenceRefSchema).default([]) })).default([]),
  assumptions: z
    .array(z.object({ statement: z.string(), confidence: z.number().min(0).max(100), evidence: z.array(evidenceRefSchema).default([]) }))
    .default([]),
  contradictions: z.array(z.object({ statement: z.string(), evidence: z.array(evidenceRefSchema).default([]) })).default([]),
  root_cause_assessment: z.string().nullable().default(null),
  impact: z.string().default(''),
  people_involved: z.array(z.object({ name: z.string(), role: z.string() })).default([]),
  current_owner: z.string().nullable().default(null),
  commitments_made: z
    .array(z.object({ statement: z.string(), owner: z.string(), evidence: z.array(evidenceRefSchema).default([]) }))
    .default([]),
  deadlines: z
    .array(z.object({ description: z.string(), due_at: z.string().nullable().default(null), evidence: z.array(evidenceRefSchema).default([]) }))
    .default([]),
  blockers: z.array(z.string()).default([]),
  missing_information: z.array(z.string()).default([]),
  decisions_required: z.array(z.string()).default([]),
  recommended_next_actions: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  // Consolidated, case-level questions — never one per email. Each must be
  // answerable with a short list of choices plus a free-text write-in.
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        why_required: z.string().min(1),
        choices: z.array(z.object({ label: z.string(), consequence: z.string() })).default([]),
        recommended_answer: z.string().nullable().default(null),
      })
    )
    .default([]),
  // Advisory-only: the AI's "deeper look" verdict on each CANDIDATE item it
  // was shown, for Ali's Include/Exclude call — never auto-applied.
  candidate_item_assessments: z
    .array(
      z.object({
        item_id: z.string(),
        recommendation: z.enum(['INCLUDE', 'EXCLUDE']),
        reasoning: z.string().min(1),
      })
    )
    .default([]),
  teaching_brief: z.object({
    what_is_happening: z.string(),
    why_it_matters: z.string(),
    what_ali_is_deciding: z.string(),
    root_cause: z.string().nullable().default(null),
    confirmed_vs_inferred: z.string(),
    risk_of_acting: z.string(),
    risk_of_delaying: z.string(),
    recommended_decision: z.string(),
    rationale: z.string(),
  }),
});
export type CaseAssessmentOutput = z.infer<typeof caseAssessmentOutputSchema>;

export const assessCaseSchema = z.object({
  requested_by: z.string().max(100).default('admin'),
});
