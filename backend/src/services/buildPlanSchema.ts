import { z } from 'zod';

/**
 * Runtime contract for a Story-Driven Build engine plan (deep_plan.json).
 *
 * Shared by BOTH ingest entrypoints — the authenticated portal route
 * (`POST /api/portal/project/build-plan`) and the service-authed engine
 * webhook (`POST /api/webhooks/build-plan`) — so the two can never drift.
 * Any field the engine adds is validated in exactly one place.
 */
const AcceptanceSchema = z.object({
  scenario: z.string(),
  trust: z.boolean().optional(),
  given: z.string().optional(),
  when: z.string().optional(),
  then: z.string().optional(),
});

// String caps mirror the storage columns the ingest writes to, so an oversize
// value fails closed at HTTP 400 (clear error) instead of throwing mid-
// transaction (a rolled-back 500). Keep these in sync with server.ts /
// the model definitions: requirement_key VARCHAR(255), capabilities.name
// VARCHAR(255), student_tasks.story_id VARCHAR(60) / title VARCHAR(500),
// student_sprints.key VARCHAR(20) / name VARCHAR(255).
export const BuildPlanSchema = z.object({
  reqs: z.array(z.object({
    id: z.string().max(255),
    priority: z.string().optional(),
    statement: z.string(),
    acceptance: z.array(z.string()).optional(),
    cluster: z.string().max(255).optional(),
  })).optional(),
  stories: z.array(z.object({
    id: z.string().max(60),
    title: z.string().max(500),
    fulfills: z.array(z.string()).optional(),
    owner_agent: z.string().optional(),
    narrative: z.string().optional(),
    acceptance: z.array(AcceptanceSchema).optional(),
    build: z.string().optional(),
    vibe: z.string().optional(),
    trust: z.string().optional(),
    release: z.string().max(20).optional(),
  })).optional(),
  releases: z.array(z.object({
    key: z.string().max(20),
    name: z.string().max(255).optional(),
    goal: z.string().optional(),
    demo: z.string().optional(),
    stories: z.array(z.string()).optional(),
    weeks: z.array(z.number()).optional(),
  })).optional(),
  trace: z.object({ ok: z.boolean().optional() }).optional(),
});

export type ParsedBuildPlan = z.infer<typeof BuildPlanSchema>;

/**
 * The deterministic traceability gate the engine enforces. When the plan
 * explicitly reports `trace.ok === false`, the ingest must fail-closed
 * (HTTP 422) rather than materialize an unverified plan.
 */
export function traceGateFailed(plan: ParsedBuildPlan): boolean {
  return !!(plan.trace && plan.trace.ok === false);
}
