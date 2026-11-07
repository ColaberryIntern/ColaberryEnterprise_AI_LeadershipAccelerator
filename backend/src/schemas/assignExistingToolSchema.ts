import { z } from 'zod';

/**
 * AF11.4 — the inbound body for carrying out an assignment. It is EMPTY, and that is the design.
 *
 * ## There is no field for the tool, on purpose
 *
 * The tool being granted is read off the decision Ali already recorded. If this schema accepted
 * a tool name, the grant would be a second chance to choose one, and the two could differ: the
 * console could record "assign `read_attachments`" and then grant `send_email`, with both halves
 * logged and nothing contradicting itself. An empty body makes that impossible rather than
 * merely discouraged, which is what "the grant and nothing more" has to mean to be checkable.
 *
 * Nor is there a field for the agent, the capability, or the approver. The agent and capability
 * come from the AF11.1 detail row the intern filed; the approver is the human the decision
 * names; and the caller comes from the verified token. Every one of those is a fact somebody
 * already recorded, and a body that could restate one is a body that could disagree with it.
 *
 * ## `.strict()` on an empty object is not a formality
 *
 * It turns any field at all — `autonomy_level`, `enabled`, a different `tool_name` — into a
 * visible 400 naming the key that was refused. A permissive object would silently drop the same
 * field and answer 200, and a caller reading that 200 would reasonably conclude it had been
 * accepted. Same reasoning, same wording, as `agentToolGrantSchema` and
 * `toolRequestDecisionSchema`: two gates in one ladder that refuse differently are two gates
 * somebody has to learn separately.
 */
export const AssignExistingToolSchema = z.object({}).strict();

export type AssignExistingToolBody = z.infer<typeof AssignExistingToolSchema>;
