/**
 * builderWorkspace — the builder surface's navigation and its two support modes.
 * PURE, no I/O.
 *
 * Master plan §Gate 11 defines eight destinations and two modes, and then says the thing
 * that matters most about them:
 *
 *   > **Same project truth, different support level.**
 *
 * ## The one invariant
 *
 * A mode changes **how much help the AI gives**. It never changes **what is true**, **what
 * the builder is allowed to do**, or **what the builder can see**.
 *
 * That distinction is worth defending explicitly, because a "learn mode" that quietly
 * shows less truth or withholds actions is a permission system wearing a teaching costume.
 * It would also be the wrong teaching tool: an intern who is shown a simplified version of
 * the project learns the simplified version. Permissions belong to `deliveryRoles.ts` and
 * `builderAuthority.ts`, which cap what someone may do based on demonstrated authority —
 * a separate axis from how much explanation they get while doing it.
 *
 * `assertModeIsSupportOnly` exists to make that a testable property rather than a comment.
 */

/** The eight destinations of the builder workspace (master plan §Gate 11). */
export type BuilderNavSection =
  | 'command'
  | 'plan'
  | 'design'
  | 'build'
  | 'agents'
  | 'proof'
  | 'release'
  | 'operate';

export const BUILDER_NAV_SECTIONS: readonly BuilderNavSection[] = [
  'command',
  'plan',
  'design',
  'build',
  'agents',
  'proof',
  'release',
  'operate',
];

export const BUILDER_NAV_PURPOSE: Record<BuilderNavSection, string> = {
  command: 'What needs attention right now, across every project you are on.',
  plan: 'Requirements, stories and what they trace to.',
  design: 'Design decisions and the visual contract.',
  build: 'Execution runs, workspaces and pull requests.',
  agents: 'Agent definitions and their trust requirements.',
  proof: 'Evidence and the quality gate for each story and release.',
  release: 'What is ready to ship and what is blocking it.',
  operate: 'What is running, and what it is doing in production.',
};

export type WorkspaceMode = 'learn' | 'delivery';

export const WORKSPACE_MODES: readonly WorkspaceMode[] = ['learn', 'delivery'];

/**
 * What the AI does differently per mode.
 *
 * Every field here is about **support**: how the assistant behaves toward the person. None
 * of them is about data access or permitted actions, and a test asserts that this stays
 * true by checking the shape of this object rather than trusting the comment.
 */
export interface ModeSupportProfile {
  /** Ask the builder to reason before offering an answer. */
  asksBuilderToReason: boolean;
  /** Offer answer choices rather than open-ended prompts where useful. */
  usesAnswerChoices: boolean;
  /** Require the builder to explain an architecture decision in their own words. */
  requiresArchitectureExplanation: boolean;
  /** Teach the Trust Before Intelligence framework as part of the work. */
  teachesTrustFramework: boolean;
  /** Give mentor-style feedback on the builder's reasoning, not just the artifact. */
  givesMentorFeedback: boolean;
  /** Summarize state rather than walking through it. */
  summarizes: boolean;
  /** Recommend a course of action outright. */
  recommends: boolean;
  /** Carry out work that has already been approved. */
  executesApprovedWork: boolean;
  /** Escalate ambiguity that has consequences rather than resolving it silently. */
  escalatesConsequentialAmbiguity: boolean;
}

export const MODE_SUPPORT: Record<WorkspaceMode, ModeSupportProfile> = {
  learn: {
    asksBuilderToReason: true,
    usesAnswerChoices: true,
    requiresArchitectureExplanation: true,
    teachesTrustFramework: true,
    givesMentorFeedback: true,
    summarizes: false,
    recommends: false,
    // Learn mode still executes approved work. Withholding execution would make the mode a
    // permission downgrade, which is exactly what it must not be — and would teach the
    // builder that learning is what you do instead of shipping.
    executesApprovedWork: true,
    escalatesConsequentialAmbiguity: true,
  },
  delivery: {
    asksBuilderToReason: false,
    usesAnswerChoices: false,
    requiresArchitectureExplanation: false,
    teachesTrustFramework: false,
    givesMentorFeedback: false,
    summarizes: true,
    recommends: true,
    executesApprovedWork: true,
    escalatesConsequentialAmbiguity: true,
  },
};

export function isWorkspaceMode(value: string): value is WorkspaceMode {
  return (WORKSPACE_MODES as readonly string[]).includes(value);
}

export interface ModeInvariantViolation {
  rule: string;
  detail: string;
}

/**
 * Assert that a mode is a support level and nothing else.
 *
 * Checks two properties that must hold across every mode:
 *
 *   1. **Escalation is not optional.** A mode that stops escalating consequential
 *      ambiguity is not a gentler assistant, it is a less safe one.
 *   2. **Execution is not gated by mode.** If one mode executed approved work and another
 *      did not, mode would have become a permission tier.
 *
 * Written as a runtime check over the table rather than as a type, so that adding a mode
 * later cannot quietly break the invariant while still compiling.
 */
export function assertModeIsSupportOnly(): ModeInvariantViolation[] {
  const violations: ModeInvariantViolation[] = [];

  for (const mode of WORKSPACE_MODES) {
    const profile = MODE_SUPPORT[mode];
    if (!profile.escalatesConsequentialAmbiguity) {
      violations.push({
        rule: 'escalation_is_not_optional',
        detail: `Mode '${mode}' does not escalate consequential ambiguity.`,
      });
    }
  }

  const executes = WORKSPACE_MODES.map((m) => MODE_SUPPORT[m].executesApprovedWork);
  if (new Set(executes).size > 1) {
    violations.push({
      rule: 'mode_is_not_a_permission_tier',
      detail:
        'Modes differ on whether approved work is executed. Mode is a support level; ' +
        'what a builder may do belongs to deliveryRoles and builderAuthority.',
    });
  }

  return violations;
}

/**
 * The truth a mode is served.
 *
 * A single function, deliberately trivial, so that "same project truth" is expressed in
 * code rather than assumed. If a future change wants mode-dependent data, it has to edit
 * this and explain itself in review.
 */
export function projectTruthForMode<T>(truth: T, _mode: WorkspaceMode): T {
  return truth;
}
