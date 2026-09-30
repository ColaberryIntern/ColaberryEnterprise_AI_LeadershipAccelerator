import type { ReeseBehaviourKey } from './reeseBehaviourMetadata';

// Reese Agentic Employee & Manager Workspace, Phase 1, R11 — Ali's new mission doc,
// section 3: "Show whether each action is model-selected, rule-triggered, or
// human-directed. Show callable, configured, authorized, enabled, and healthy as
// distinct facts." Extracted into its own file rather than added to
// agentDetailEmployeeFacts.ts (already at 474 lines, this repo's 500-line hard
// ceiling) per CLAUDE.md's Modular Composition Rule.

/** How a behaviour's execution gets decided. `human_directed` has no real example on
 * Reese today (she has no manager-assignable work item yet — that is Phase 2's
 * ASSIGN_WORK -> persisted work item path) — the value exists for forward
 * compatibility, never populated by a guess. */
export type ReeseTriggerMode = 'model_selected' | 'rule_triggered' | 'human_directed';

/** Hand-verified per real behaviour, not inferred at runtime: reactive_dm_reply and
 * health_assessment let the model choose which tools to call within a triggered
 * turn (reeseTools.ts's tool_choice:'auto'); the 4 cron-registry behaviours and
 * welcome_dms all fire on a fixed rule (a schedule or a real student event), with
 * zero model choice over whether/when to run. */
const TRIGGER_MODE_BY_BEHAVIOUR: Record<ReeseBehaviourKey, ReeseTriggerMode> = {
  reactive_dm_reply: 'model_selected',
  health_assessment: 'model_selected',
  autonomous_outreach_sweep: 'rule_triggered',
  outreach_follow_ups: 'rule_triggered',
  welcome_dms: 'rule_triggered',
  student_support_supersession_resolver: 'rule_triggered',
  presence_heartbeat: 'rule_triggered',
};

export function getTriggerMode(key: ReeseBehaviourKey): ReeseTriggerMode {
  return TRIGGER_MODE_BY_BEHAVIOUR[key];
}

/** The decomposed facts the mission doc asks for, kept honestly distinct rather than
 * collapsed into the single `enabled` boolean this card already showed. */
export interface ReeseBehaviourStatusFacts {
  /** A real, exported service function backs this behaviour. Static `true` for all 7
   * real behaviours -- never a guess, and never `false` today since an entry only
   * exists here for a behaviour this file's own REESE_BEHAVIOURS inventory lists. */
  callable: boolean;
  /** Real, non-empty configuration exists: a cron schedule for the 4 registry rows,
   * or a defined tool list for the other 3. */
  configured: boolean;
  /** Whether anything today would actually BLOCK this behaviour from running. As of
   * this phase, nothing does -- `agentActionAuthorizationBridge.ts` writes real
   * ApprovalRequest rows but `abac_enforcement` stays at `shadow`, so every
   * behaviour is honestly `true` here, not because a real permission check passed
   * it, but because no live gate exists yet to fail it. Disclosed in the R13
   * reconciliation memo, not hidden behind this single boolean. */
  authorized: boolean;
  /** The same real switch state EmployeeFactsBehaviourRow.enabled already carries --
   * surfaced again under this decomposed shape for a single consistent read. */
  enabled: boolean;
  /** `error_count === 0` over this behaviour's own tracked runs, for the 4
   * cron-registry behaviours only (real run_count/error_count from their AiAgent
   * row). `null` for the 3 behaviours with no per-behaviour run tracking
   * (reactive_dm_reply, health_assessment, welcome_dms) -- an honest "no signal",
   * never a fabricated healthy/unhealthy guess. */
  healthy: boolean | null;
}

const CRON_TRACKED: ReadonlySet<ReeseBehaviourKey> = new Set([
  'autonomous_outreach_sweep',
  'outreach_follow_ups',
  'presence_heartbeat',
  'student_support_supersession_resolver',
]);

export function computeStatusFacts(
  key: ReeseBehaviourKey,
  params: {
    enabled: boolean;
    configured: boolean;
    cronRunCount: number | null;
    cronErrorCount: number | null;
  },
): ReeseBehaviourStatusFacts {
  const healthy =
    CRON_TRACKED.has(key) && params.cronRunCount != null && params.cronErrorCount != null
      ? params.cronErrorCount === 0
      : null;

  return {
    callable: true,
    configured: params.configured,
    // No live gate blocks any behaviour today (abac_enforcement stays shadow) --
    // see this field's own doc comment above.
    authorized: true,
    enabled: params.enabled,
    healthy,
  };
}
