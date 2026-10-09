/**
 * P3-T4 — what an agent is allowed to require.
 *
 * THIS IS NOT A TOOL CATALOGUE, AND THAT IS A DELIBERATE CORRECTION TO THE PLAN.
 *
 * The plan called for a `toolRegistry` that rejects "a tool that does not exist". But this repo
 * governs tools by DENIAL, not by catalogue: `claudeAgentSdkProvider.ts` ships
 * `DENIED_TOOLS = ['WebFetch', 'WebSearch']` and passes it as `disallowedTools`, while its own
 * `allowedTools` option is declared and never used. Authoring an allow-list of SDK tool names
 * would create a second truth that drifts the moment the SDK adds a tool, and would duplicate
 * nothing that exists.
 *
 * One level up there IS a governed vocabulary. `executionPolicy.ts` declares the eight
 * default-deny CAPABILITIES from Gate 8, with `isDeniedCapability()` and a `DENIAL_RATIONALE`
 * that records `enforcedBy` per capability — because, in its own words, *"'we have a policy' and
 * 'the policy is enforced' are different claims, and Gate 0 found three of these previously had
 * no enforcer at all."* So "no invented tools" becomes "no invented capabilities", anchored on
 * something the repo already governs and already enforces somewhere.
 *
 * TWO KINDS OF REJECTION, and they are not the same kind of thing:
 *
 *   DENIED     — the eight. Checked against `executionPolicy` regardless of what anyone declares.
 *                You cannot declare your way into `production_deploy`.
 *   UNDECLARED — a capability this project never said it needs. There is no global allow-list to
 *                check against and inventing one would repeat the mistake above, so the referent
 *                is the BLUEPRINT'S OWN declaration. That is the same "declared, not inferred"
 *                principle the r0 walking-skeleton finding argued for: a keyword or heuristic
 *                cannot tell a real capability from a plausible-sounding one, but a declaration
 *                can, because somebody had to write it down.
 *
 * NO DATABASE. Pure functions over values.
 */

import {
  DENIED_CAPABILITIES,
  isDeniedCapability,
  type DeniedCapability,
} from '../../delivery/execution/executionPolicy';
import { DENIED_TOOLS } from '../../delivery/execution/claudeAgentSdkProvider';

/** What one agent says it needs in order to do its job. */
export interface AgentCapabilityClaim {
  /** The agent's id, used to name it in a violation. */
  agentId: string;
  /** Capability names the agent requires. Free-form by necessity; checked, not trusted. */
  requires: ReadonlyArray<string>;
  /** Tool names the agent names explicitly, where it names any. */
  tools?: ReadonlyArray<string>;
}

/**
 * What the blueprint declared this system may need, once, up front.
 *
 * Deliberately NOT optional-with-a-default. An empty declaration means "this system requires no
 * special capability", which is a real and checkable statement; a missing one would mean the
 * check silently passes everything, and a check that cannot fail is not a check.
 */
export interface CapabilityDeclaration {
  permitted: ReadonlyArray<string>;
}

export const CAPABILITY_CODES = [
  'CAPABILITY_DENIED',
  'CAPABILITY_UNDECLARED',
  'TOOL_DENIED',
] as const;
export type CapabilityCode = (typeof CAPABILITY_CODES)[number];

export interface CapabilityViolation {
  code: CapabilityCode;
  agentId: string;
  /** The offending capability or tool name, so the message is actionable. */
  subject: string;
  message: string;
}

/** The eight, re-exported so a caller need not reach past this module to read the vocabulary. */
export const GOVERNED_DENIALS: ReadonlyArray<DeniedCapability> = DENIED_CAPABILITIES;

/**
 * Tool names the runtime refuses, read from the provider rather than restated.
 *
 * A third denial added upstream is honoured here with no edit, which is the point of importing
 * the constant instead of copying its two current values.
 */
export const GOVERNED_DENIED_TOOLS: ReadonlyArray<string> = DENIED_TOOLS;

/**
 * Check one roster's capability claims.
 *
 * Returns every violation rather than the first: an agent roster is reviewed as a whole, and
 * stopping at the first problem would make a reviewer re-run the gate to find the second.
 */
export function checkCapabilityClaims(
  claims: ReadonlyArray<AgentCapabilityClaim>,
  declaration: CapabilityDeclaration,
): CapabilityViolation[] {
  const out: CapabilityViolation[] = [];
  const permitted = new Set(declaration.permitted);
  const deniedTools = new Set(GOVERNED_DENIED_TOOLS);

  for (const claim of claims) {
    for (const cap of claim.requires) {
      // DENIED beats declared, always. Checked first so the message names the real reason: an
      // agent requiring `production_deploy` is refused because it is denied, not because the
      // blueprint forgot to list it.
      if (isDeniedCapability(cap)) {
        out.push({
          code: 'CAPABILITY_DENIED',
          agentId: claim.agentId,
          subject: cap,
          message: `agent ${claim.agentId} requires '${cap}', which is one of the ${GOVERNED_DENIALS.length} `
            + 'default-deny capabilities. No declaration permits it: see executionPolicy '
            + 'DENIAL_RATIONALE for which layer enforces it.',
        });
        continue;
      }
      if (!permitted.has(cap)) {
        out.push({
          code: 'CAPABILITY_UNDECLARED',
          agentId: claim.agentId,
          subject: cap,
          message: `agent ${claim.agentId} requires '${cap}', which this blueprint never declared. `
            + 'A capability invented inside an agent roster is indistinguishable from a real one '
            + 'unless it was declared up front, so it is refused rather than guessed at.',
        });
      }
    }

    for (const tool of claim.tools ?? []) {
      if (deniedTools.has(tool)) {
        out.push({
          code: 'TOOL_DENIED',
          agentId: claim.agentId,
          subject: tool,
          message: `agent ${claim.agentId} names tool '${tool}', which the runtime refuses `
            + '(claudeAgentSdkProvider DENIED_TOOLS). Naming it in a blueprint does not make it '
            + 'available; the run would simply not have it.',
        });
      }
    }
  }
  return out;
}

/**
 * True when nothing in the roster is denied or undeclared.
 *
 * Separate from the list so a caller can gate on a boolean without re-deriving emptiness, and so
 * "there were no violations" and "we did not look" cannot be confused at the call site.
 */
export function capabilityClaimsAcceptable(
  claims: ReadonlyArray<AgentCapabilityClaim>,
  declaration: CapabilityDeclaration,
): boolean {
  return checkCapabilityClaims(claims, declaration).length === 0;
}
