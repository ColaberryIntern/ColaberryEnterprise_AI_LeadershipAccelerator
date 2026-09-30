// Reese Product Phase 1, R9 — extracted from agentDetailEmployeeFacts.ts (which
// hit this repo's 500-line hard ceiling; CLAUDE.md's Modular Composition Rule
// requires a split before adding new code). Pure, dependency-free lookup
// tables and small helpers describing Reese's 7 real behaviours — zero
// behaviour change from the extraction itself.

/** Every real switch key this UI can write. `reactive_dm_reply` and
 * `health_assessment` share ONE underlying column (Reese's own
 * `ai_agents.enabled`) -- a real coupling, disclosed on both rows, not a UI
 * bug. */
export type ReeseBehaviourKey =
  | 'reactive_dm_reply'
  | 'autonomous_outreach_sweep'
  | 'outreach_follow_ups'
  | 'welcome_dms'
  | 'student_support_supersession_resolver'
  | 'presence_heartbeat'
  | 'health_assessment';

export const BEHAVIOUR_KEY_BY_NAME: Record<string, ReeseBehaviourKey> = {
  'Reactive DM reply': 'reactive_dm_reply',
  'Autonomous outreach sweep': 'autonomous_outreach_sweep',
  'Outreach follow-ups': 'outreach_follow_ups',
  'Welcome DMs': 'welcome_dms',
  'Student support supersession resolver': 'student_support_supersession_resolver',
  'Presence heartbeat': 'presence_heartbeat',
  'Health assessment': 'health_assessment',
};

// R9 — Ali, live, on the Employee facts card: "I feel like the Employee
// Facts should be connected to capabilities, tools and scheduled work
// tabs. They should be related and therefore correlated." Grounded in
// TOOL_INVENTORY.md's own `source` field (which real controller calls
// which real tool), never invented. `[]` for behaviours the tool inventory
// has no entry for (the presence heartbeat touches no tool or side effect
// it tracks).
export const BEHAVIOUR_TOOLS: Record<ReeseBehaviourKey, string[]> = {
  reactive_dm_reply: ['respond_to_dm', 'read_learner_context', 'read_student_success_snapshot', 'assess_student_health', 'read_attachments'],
  health_assessment: ['assess_student_health'],
  autonomous_outreach_sweep: ['Autonomous outreach DM send'],
  outreach_follow_ups: ['Outreach follow-up DM send', 'Escalation'],
  welcome_dms: ['Welcome DM send'],
  student_support_supersession_resolver: ['Student-support ticket auto-close'],
  presence_heartbeat: [],
};

export const CRON_REGISTRY_NAMES: Record<string, string> = {
  'Autonomous outreach sweep': 'ReeseAutonomousOutreachSweep',
  'Outreach follow-ups': 'ReeseOutreachFollowUps',
  'Presence heartbeat': 'ReesePresenceHeartbeat',
  'Student support supersession resolver': 'ReeseStudentSupportSupersessionResolver',
};

/** R9 follow-up (2026-09-18) — reverse of CRON_REGISTRY_NAMES, keyed by the
 * sibling AiAgent row's real `agent_name` instead of the behaviour's
 * display name, so agentDetailService.ts can look up a behaviour key from
 * a `related_tasks` row without re-deriving the mapping. */
export const BEHAVIOUR_KEY_BY_CRON_AGENT_NAME: Record<string, ReeseBehaviourKey> = Object.fromEntries(
  Object.entries(CRON_REGISTRY_NAMES).map(([name, agentName]) => [agentName, BEHAVIOUR_KEY_BY_NAME[name]]),
);

/** Welcome DMs moved from an env-var-only switch to a real database setting
 * (`ai_agents.config.welcome_enabled`) so it can be toggled from the
 * Employee facts card, matching the other 6 behaviours. Reads the
 * ALREADY-LOADED agent row (never a second query) -- falls back to the env
 * var only when the DB value has never been set, so deploying this change
 * alone never silently changes live behaviour (see
 * reeseIdentitySeed.ts's isReeseWelcomeEnabled(), the same fallback used by
 * the real enforcement path in reeseWelcomeService.ts). */
export function welcomeEnabledFromAgent(agent: { config?: Record<string, unknown> | null }): boolean {
  const configValue = agent.config?.welcome_enabled;
  if (typeof configValue === 'boolean') return configValue;
  return String(process.env.REESE_WELCOME_ENABLED ?? 'true').toLowerCase() !== 'false';
}
