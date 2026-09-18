import AiAgent from '../../models/AiAgent';
import type { ReeseBehaviourKey } from './agentDetailEmployeeFacts';

/**
 * Reese Product Phase 1 follow-up (2026-09-18) — Ali, live, on the Employee
 * facts card: "who's in charge of turning on and off behaviors. It should be
 * admins and manager. I have no ability here." Every one of the 7 real
 * switches BEHAVIOUR_INVENTORY.md documents is now actually writable, from
 * the same card that displays it. Reese-only by construction: this file
 * resolves the target row itself (never trusts a caller-supplied agent id
 * for the sibling rows) and only ever writes Reese's own row or one of her 4
 * named cron siblings -- never an arbitrary agent.
 *
 * `reactive_dm_reply` and `health_assessment` share ONE underlying column
 * (Reese's own `ai_agents.enabled`) -- the exact same real coupling
 * BEHAVIOUR_INVENTORY.md and TOOL_INVENTORY.md already document. Setting
 * either one sets that column; both rows read the same value on the next
 * load. This is disclosed on the card, not hidden.
 */

const REESE_AGENT_NAME = 'Reese';

const SIBLING_REGISTRY_NAME: Partial<Record<ReeseBehaviourKey, string>> = {
  autonomous_outreach_sweep: 'ReeseAutonomousOutreachSweep',
  outreach_follow_ups: 'ReeseOutreachFollowUps',
  presence_heartbeat: 'ReesePresenceHeartbeat',
  student_support_supersession_resolver: 'ReeseStudentSupportSupersessionResolver',
};

export class ReeseAgentMissingError extends Error {
  constructor() {
    super("No ai_agents row for agent_name='Reese'.");
    this.name = 'ReeseAgentMissingError';
  }
}

export class ReeseSiblingMissingError extends Error {
  constructor(agentName: string) {
    super(`No ai_agents row for agent_name='${agentName}' (Reese's own sibling registry row).`);
    this.name = 'ReeseSiblingMissingError';
  }
}

export interface SetReeseBehaviourSwitchResult {
  key: ReeseBehaviourKey;
  enabled: boolean;
  /** Every behaviour key whose displayed state also changed as a result of
   * this one write -- always includes `key` itself; includes the paired key
   * too when the shared-switch coupling applies. */
  alsoChanged: ReeseBehaviourKey[];
}

/**
 * The one write path for every real Reese behaviour switch. `actorEmail` is
 * logged by the caller (the route layer already has `req.admin!.email` from
 * `requireAgentManagerOrAdmin`); this function itself does no authorization
 * -- that is the route's job, matching every other write in this phase.
 */
export async function setReeseBehaviourSwitch(
  key: ReeseBehaviourKey,
  enabled: boolean,
): Promise<SetReeseBehaviourSwitchResult> {
  const siblingName = SIBLING_REGISTRY_NAME[key];

  if (siblingName) {
    const sibling = await AiAgent.findOne({ where: { agent_name: siblingName } });
    if (!sibling) throw new ReeseSiblingMissingError(siblingName);
    await sibling.update({ enabled });
    return { key, enabled, alsoChanged: [key] };
  }

  const reese = await AiAgent.findOne({ where: { agent_name: REESE_AGENT_NAME } });
  if (!reese) throw new ReeseAgentMissingError();

  if (key === 'welcome_dms') {
    await reese.update({ config: { ...(reese.config || {}), welcome_enabled: enabled } } as any);
    return { key, enabled, alsoChanged: [key] };
  }

  // reactive_dm_reply / health_assessment — the shared switch.
  await reese.update({ enabled });
  const paired: ReeseBehaviourKey = key === 'reactive_dm_reply' ? 'health_assessment' : 'reactive_dm_reply';
  return { key, enabled, alsoChanged: [key, paired] };
}
