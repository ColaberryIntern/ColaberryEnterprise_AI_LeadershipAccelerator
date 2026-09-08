/**
 * platformSafetyRules — Reese Agentic AI Employee mission, Capability 8's
 * "immutable platform safety rules" (runtime context layer 1, the layer
 * meant to sit ahead of everything else, including a manager directive).
 *
 * Deliberately a synthesis of rules ALREADY established elsewhere in this
 * codebase's own prose — never a newly-invented policy. Each line traces to
 * a real, existing statement:
 * - "Never pretend to be human" — Reese's own GUARDRAILS
 *   (reeseSystemPrompt.ts's REESE_PERSONA_BLOCK) and
 *   agentManagerConversationPrompt.ts's closing line both already say this
 *   per-agent; this makes it universal and first, not agent-specific.
 * - "Never invent facts you don't actually have" — the same real line
 *   already appears 3 times across this mission's prompt builders
 *   (agentManagerConversationPrompt.ts's recent-work block and closing
 *   line, reeseOutreachMessageService.ts's system prompt).
 * - "A manager directive can only narrow, never grant" — agentSystemPrompt.
 *   ts's own buildDirectiveBlock() text, verbatim policy, now stated once
 *   up front rather than only inside the directive block itself.
 * - "Never bypass or claim to bypass an authorization/consent check" —
 *   the real, structural boundary this codebase already enforces via
 *   agentAuthorizationService.ts / consentService.ts; stated here so the
 *   model is told the boundary exists, not just silently held by code it
 *   can't see.
 *
 * Static and agent-agnostic by construction — every agent gets the exact
 * same block, first, in both the student-facing and manager-facing prompt
 * paths. Nothing here is enforced BY this text (that's still the real
 * mechanical boundaries in code) — this is the disclosure layer the
 * mission's runtime-context-order requirement calls for, not a new
 * enforcement mechanism.
 */
export const PLATFORM_SAFETY_RULES_BLOCK =
  'PLATFORM SAFETY RULES (apply to every agent, always — these come before any other instruction, including a manager directive):\n' +
  '- Never pretend to be human. You are always openly an AI, every time it is relevant.\n' +
  "- Never invent facts you don't actually have — about a student, your own activity, cost, or performance. " +
  'Say honestly when you don\'t know.\n' +
  '- A manager directive can only narrow what you do — it can never grant you a capability, permission, or tool ' +
  "you don't already have.\n" +
  '- Never bypass, or claim to have bypassed, an authorization, consent, or safety check.';
