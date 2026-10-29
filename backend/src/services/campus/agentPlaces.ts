import type { CampusArea } from './campusAreas';
import type { SectionKey } from '../access/mgmtRoles';
import { getMgmtStatus } from '../access/mgmtBridgeService';

/**
 * WHERE EACH AI AGENT STAYS (Colaberry Campus C87). Ali, 2026-10-29: "Reese should be located in the classroom always,
 * Dara should be in the Staff Office on the same level as the curriculum. If you can't get to that floor, you can't talk
 * or see Dara. Each agent will have a place where they stay."
 *
 * One place per agent, read by every campus surface (the desks route, and through it the map pins, the rooms, the help
 * desk, the Wayfinder, the list and "Visit the desk") and by the DM rule (dmEligibility).
 *
 *  - building: the campus building the agent is in.
 *  - floor:    for the Staff Office tower, the admin-menu SECTION of the floor (the same SectionKey the elevator and the
 *              admin session use). An agent on a floor is reachable only by a badge that opens that floor.
 *  - office:   the admin page whose office door the agent stands at on that floor. Dara stands at Curriculum
 *              (/admin/orchestration), which is in the Program group (section 'program') of adminNav.ts.
 */
export type AgentId = 'reese' | 'dara' | 'maya';
export interface AgentPlace { building: CampusArea; floor: SectionKey | null; office: string | null }

export const AGENT_PLACES: Readonly<Record<AgentId, AgentPlace>> = {
  reese: { building: 'lecture', floor: null, office: null },
  dara: { building: 'career', floor: 'program', office: '/admin/orchestration' },
  maya: { building: 'admissions', floor: null, office: null },
};

/** What a person sees when they try to reach an agent on a floor their badge does not open. */
export function floorBlockedMessage(name: string): string {
  return `${name} works on a Staff Office floor your badge doesn't open`;
}

/**
 * May this person reach this agent? True for an agent with no floor. For an agent on a floor: only when the person's
 * Management Portal sections include that floor's section.
 *
 * FAILURE POSTURE: fail closed. A lookup that throws counts as "the badge does not open the floor", so a broken lookup can
 * only ever hide the agent, never show them to someone who should not reach them. Logged with its error class.
 */
export async function canReachAgent(enrollmentId: string, id: AgentId): Promise<boolean> {
  const floor = AGENT_PLACES[id].floor;
  if (!floor) return true;
  try {
    const { sections } = await getMgmtStatus(enrollmentId);
    return Array.isArray(sections) && sections.includes(floor);
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'campus', event: 'agent_floor_lookup_failed', outcome: 'failure',
      error_class: e?.name || 'Error', context: { agent: id, floor },
    }));
    return false;
  }
}
