/**
 * demo-spec v2 - the SHAPE contract for a connected demo.
 *
 * ## What changed from v1, and why
 *
 * v1 (`demoKitAssets/DEMO_SPEC_CONTRACT.md`) logs an action with a flat `who: 'agent' | 'human'`
 * and a free-text line. The Agentic UX Trust Design Standard v1.0 names that as gap 2 of 10: a
 * demo cannot show accountable work if "an agent" is the whole of its answer to who acted.
 *
 * v2 therefore requires, for every event:
 *   - a STRUCTURED actor (type, id, label, verified) and a named `human_owner_id`, so there is
 *     always a person accountable for an agent's action;
 *   - CAUSAL fields (`work_id`, `trace_id`, `parent_event_id`) so a handoff can be traced rather
 *     than inferred from timestamps;
 *   - EVIDENCE and POLICY references, so "why" is a pointer and not a sentence;
 *   - the full ACTION LIFECYCLE, because the standard's hard gate is that no action may be
 *     claimed complete when it is not, and a vocabulary with only "done" cannot express that.
 *
 * ## Why `environment` is required and `production` is refused
 *
 * The one separation this whole step rests on: the demo is fictional, the Command Center is
 * actual state. A spec that could describe itself as production would let a simulated screen be
 * labelled live execution, which is the standard's "no fake metrics presented as live data" hard
 * gate. Refusing it in the type system is cheaper than remembering it in a prompt.
 *
 * Pure. No I/O.
 */
import { z } from 'zod';

/** The seven states an action can be in. `done` is deliberately NOT one of them. */
export const ACTION_LIFECYCLE = [
  'proposed',
  'queued',
  'executing',
  'succeeded',
  'failed',
  'canceled',
  'reverted',
] as const;
export type ActionLifecycle = (typeof ACTION_LIFECYCLE)[number];

/** Autonomy is attached to an ACTION, never to an agent as a personality trait. */
export const AUTONOMY_TIERS = ['A0', 'A1', 'A2', 'A3', 'A4'] as const;

export const RISK_LEVELS = ['low', 'medium', 'high'] as const;

/**
 * Only environments a DEMO may claim. `production` is absent on purpose: see the header.
 * Keeping this as a literal union rather than a string with a refinement means the refusal is
 * visible in the type, not only at runtime.
 */
export const DEMO_ENVIRONMENTS = ['demo', 'sandbox', 'simulation'] as const;

const ActorSchema = z.object({
  type: z.enum(['agent', 'human', 'system']),
  /** Stable id, so two actions by the same agent are provably the same agent. */
  id: z.string().min(1),
  label: z.string().min(1),
  /**
   * Whether the actor's identity was established server-side. The standard requires actor
   * identity be verified rather than asserted; a demo cannot verify anything, so it must be
   * able to say so rather than implying a guarantee it does not have.
   */
  verified: z.boolean(),
});

const ApprovalSchema = z.object({
  required: z.boolean(),
  status: z.enum(['pending', 'granted', 'denied', 'not_required']),
  assigned_to: z.string().nullable(),
});

export const DemoEventSchema = z.object({
  event_id: z.string().min(1),
  occurred_at: z.string().min(1),
  work_id: z.string().min(1),
  trace_id: z.string().min(1),
  parent_event_id: z.string().nullable(),

  actor: ActorSchema,
  /** The accountable person. Required even when the actor IS a human, so it is never ambiguous. */
  human_owner_id: z.string().min(1),

  action: z.string().min(1),
  status: z.enum(ACTION_LIFECYCLE),
  risk_level: z.enum(RISK_LEVELS),
  autonomy_tier: z.enum(AUTONOMY_TIERS),

  /** Why, in one line. Narrative, and explicitly NOT audit truth on its own. */
  reason_summary: z.string().min(1),
  evidence_refs: z.array(z.string()),
  policy_refs: z.array(z.string()),

  approval: ApprovalSchema,
  side_effects: z.array(z.string()),
  reversible: z.boolean(),
  recovery_ref: z.string().nullable(),

  environment: z.enum(DEMO_ENVIRONMENTS),
});

export type DemoEvent = z.infer<typeof DemoEventSchema>;

export const DemoSpecSchema = z.object({
  schema_version: z.literal(2),
  environment: z.enum(DEMO_ENVIRONMENTS),
  app: z.object({
    name: z.string().min(1),
    descriptor: z.string(),
    persona: z.object({ name: z.string(), role: z.string() }),
  }),
  events: z.array(DemoEventSchema),
  /** Screens, entities, nav and the rest stay as v1 described them. */
  screens: z.record(z.string(), z.unknown()).optional(),
  entities: z.record(z.string(), z.unknown()).optional(),
  nav: z.array(z.unknown()).optional(),
});

export type DemoSpec = z.infer<typeof DemoSpecSchema>;

export interface SpecProblem {
  path: string;
  message: string;
}

/**
 * Validate a candidate spec's SHAPE.
 *
 * Returns problems rather than throwing, because the caller (the generator) has a useful
 * half-answer: it can report every field that is wrong at once instead of one per round trip.
 * The PERSIST path turns a non-empty result into a refusal; see connectedDemoStore.
 */
export function validateDemoSpecShape(candidate: unknown): SpecProblem[] {
  const result = DemoSpecSchema.safeParse(candidate);
  if (result.success) return [];
  return result.error.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }));
}

/** True only when the spec is shape-valid. A thin helper so callers do not re-derive emptiness. */
export function isDemoSpecShapeValid(candidate: unknown): candidate is DemoSpec {
  return validateDemoSpecShape(candidate).length === 0;
}
