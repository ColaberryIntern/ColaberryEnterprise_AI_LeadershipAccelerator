import { z } from 'zod';
import { knownActionTypes } from '../services/routingActionsService';

/**
 * Routing-rule request bodies (Phase 2, T226).
 *
 * The one rule that matters: an action's `type` must be a key of the engine's
 * registry. Before this, any string was accepted, stored, and then run as
 * `unknown` — a rule that looked saved and did nothing, forever. The registry
 * (`ACTION_HANDLERS`) is read at validation time, not copied, so adding a
 * handler is the only step to make its type valid here.
 *
 * Action bodies are otherwise open (`passthrough`): each handler validates its
 * own fields at run time and says why it refused.
 */

export const routingActionSchema = z
  .object({
    type: z
      .string()
      .min(1)
      .refine((t) => knownActionTypes().includes(t), {
        // Names the value, not only its path: an operator reading the admin form's
        // error sees WHICH type is unknown, and a typo is visible as a typo.
        // (Zod 4: the message function is `error`, and the value is `issue.input`.)
        error: (issue) => `unknown action type "${String(issue.input)}"`,
      }),
  })
  .passthrough();

export const routingRuleCreateSchema = z.object({
  name: z.string().min(1).max(255),
  priority: z.number().int().min(0).max(100000).optional(),
  conditions: z.record(z.string(), z.unknown()),
  actions: z.array(routingActionSchema).min(1),
  continue_on_match: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const routingRuleUpdateSchema = routingRuleCreateSchema.partial();

export type RoutingRuleCreateBody = z.infer<typeof routingRuleCreateSchema>;
export type RoutingRuleUpdateBody = z.infer<typeof routingRuleUpdateSchema>;
