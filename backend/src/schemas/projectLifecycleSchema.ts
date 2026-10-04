/**
 * Zod schemas for the project-lifecycle admin API.
 *
 * Every route validates before a service is reached. CLAUDE.md's Contract Enforcement Layer is
 * explicit: "No `req.body.foo` access without a Zod parse first. Failed parse returns 400; never
 * let bad input reach a service."
 *
 * `.strict()` is deliberately NOT used on request bodies. A `.strict()` route rejects an unknown
 * key with a 400, which breaks a frontend deployed ahead of its backend — this repo has had that
 * exact failure, where a frontend-only deploy started 400ing on `.strict()` routes. Unknown keys
 * are therefore ignored rather than refused, and every field consumed is one the schema names.
 *
 * Zod 4 note: validation errors are read from `err.issues`, not `err.errors`.
 */
import { z } from 'zod';
import { LIFECYCLE_STAGES } from '../services/lifecycle/lifecycleStages';

/** A project id in either identity table. Both are UUIDs. */
export const lifecycleIdParam = z.object({
  projectId: z.string().uuid('projectId must be a UUID'),
});

/**
 * Which identity table the project lives in.
 *
 * Required rather than inferred. Guessing from the id would mean querying both tables, and a
 * lookup that falls through to the other table on a miss is how a caller learns that an id
 * exists in a space they were not asking about.
 */
export const projectKind = z.enum(['student', 'delivery']);

export const lifecycleStatusQuery = z.object({
  kind: projectKind,
});

/**
 * A stage transition request.
 *
 * `to` is the requested stage only. The server reads `from` from persisted state rather than
 * trusting the client, because a client-supplied `from` is how a stale tab walks a project
 * backwards through a transition that was legal when the page loaded.
 */
export const transitionBody = z.object({
  kind: projectKind,
  to: z.enum(LIFECYCLE_STAGES),
  /** Optional free-text reason, recorded on the condition when a return edge is taken. */
  reason: z.string().trim().max(2000).optional(),
  /** True when this originates from a preview or draft scenario. */
  isDraftScenario: z.boolean().optional(),
});

/**
 * A blueprint approval request.
 *
 * `expectedRevision` is REQUIRED and has no default. A default would silently approve whatever
 * revision happens to be current, which is exactly the stale-approval the CAS exists to refuse.
 * The approver is never read from the body — it comes from the authenticated session.
 */
export const approveBody = z.object({
  manifestId: z.string().uuid('manifestId must be a UUID'),
  expectedRevision: z.coerce.number().int().min(1),
  scope: z.enum(['documented', 'full']),
  rationale: z.string().trim().max(4000).optional(),
  selectedDesignRef: z.string().trim().max(500).optional(),
});

export type LifecycleIdParam = z.infer<typeof lifecycleIdParam>;
export type LifecycleStatusQuery = z.infer<typeof lifecycleStatusQuery>;
export type TransitionBody = z.infer<typeof transitionBody>;
export type ApproveBody = z.infer<typeof approveBody>;

/** Flatten Zod issues into a response-safe list. Reads `issues` — Zod 4, not `errors`. */
export function zodIssues(err: z.ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
