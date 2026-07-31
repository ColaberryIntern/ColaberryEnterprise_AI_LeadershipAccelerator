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
