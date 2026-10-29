import { campusAudienceFor, CampusAudienceKind } from './campusAudience';
import { isReeseEnabled, getReeseEnrollmentId } from '../reese/reeseIdentitySeed';
import { isDaraEnabled, getDaraEnrollmentId } from '../curriculum/daraIdentitySeed';
import type { CampusArea } from './campusAreas';
import { env } from '../../config/env';
import { AGENT_PLACES, canReachAgent } from './agentPlaces';
import type { SectionKey } from '../access/mgmtRoles';

/**
 * The AI staff desks on the campus (Colaberry Campus C5).
 *
 * AUDIENCE, FROM THE SAME SOURCES AS THE FRONTEND. The frontend picks a campus from is_staff, is_org_manager and
 * is_explorer. Those come from resolveContentPageAccess().isStaff (staff role only; false while the page gate is off),
 * the managed-org lookup, and isFreePreviewTier. This file calls exactly those three, in the same precedence as
 * frontend/src/components/campus/campusAudience.ts (staff > business > explorer > member), so the two can only
 * disagree if one of those shared functions changes for both. A test pins the frontend precedence line.
 *
 * MAYA is shown to staff and Explorers only. She is the public admissions chat, not a portal agent. C6 (Ali's decision: the
 * website chat at the gate): her desk is on duty exactly when the site chat is switched on (ENABLE_CHAT), and the campus opens
 * her existing website chat; with the site chat off it reads "opens soon". (Historical note, C5: listed as opening with C6;
 * C7 owns her handoff). The frontend also renders her desk only inside the Main Gate, which it shows only to Explorers
 * and staff, so Maya appears only when both sides agree.
 *
 * ON DUTY. Reese and Dara answer DMs whenever their AiAgent row is enabled and their identity is seeded (their reply
 * paths check nothing else). Off duty, the desk reads "Back soon" and carries no enrollment id, so nothing can open a
 * conversation that would get no answer.
 *
 * PLACES (C87). Each desk's building, and for the Staff Office its floor and office door, come from agentPlaces.ts: Reese
 * in the Classroom, Dara on the Program floor at Curriculum, Maya in Admissions. Dara is listed ONLY for a badge that opens
 * the Program floor (canReachAgent): everyone else never sees her desk, and dmEligibility refuses the conversation too.
 */

export type { CampusAudienceKind };
export type DeskId = 'reese' | 'dara' | 'maya';

export interface StaffDesk {
  id: DeskId;
  name: string;
  title: string;
  building: CampusArea;
  /** C87: the Staff Office floor (an admin-menu section) and the office door the agent stands at; null off the tower. */
  floor: SectionKey | null;
  office: string | null;
  ai: true;
  on_duty: boolean;
  enrollment_id: string | null;
  opens: string | null;
  prompts: string[];
}

// campusAudienceFor moved to ./campusAudience (C6) so presence can use it too; re-exported for existing callers.
export { campusAudienceFor } from './campusAudience';

const REESE_PROMPTS = ['How do I get unstuck on this week\'s lab?', 'What should I focus on next?', 'Can you look over my project plan?'];
// C87 (Ali, 2026-10-29): Dara is upstairs, for staff; learners go through Reese. Only the questions that work for staff stay;
// her staff-facing role (monitoring curriculum and student habits) is C88.
const DARA_PROMPTS = ['Where is this topic covered in the curriculum?', 'What does this week\'s assignment ask for?'];

async function agentDesk(
  id: 'reese' | 'dara', name: string, title: string, prompts: string[],
  enabled: () => Promise<boolean>, enrollment: () => Promise<string | null>,
): Promise<StaffDesk> {
  const [on, eid] = await Promise.all([enabled(), enrollment()]);
  const onDuty = on && !!eid;
  return { id, name, title, ...AGENT_PLACES[id], ai: true, on_duty: onDuty, enrollment_id: onDuty ? eid : null, opens: null, prompts: onDuty ? prompts : [] };
}

/** Maya's desk: on duty iff the public site chat is on (her chat endpoints answer 204 otherwise). No enrollment: she is not
 *  a portal DM agent, and no prompts: her own widget offers its quick replies. C21 (v6 D3): her desk is in the Admissions
 *  building beside the gate, no longer a bench at the gate. */
function mayaDesk(): StaffDesk {
  const on = env.enableChat === true;
  return { id: 'maya', name: 'Maya', title: 'Welcome desk', ...AGENT_PLACES.maya, ai: true, on_duty: on, enrollment_id: null, opens: on ? null : 'site_chat_off', prompts: [] };
}

/** C21 (v6 D3): Maya is always in her Admissions building and on every help desk, for every audience (it replaces C6's
 *  Explorer-and-staff rule; her chat is still the site widget, the C6 decision). */
export function mayaVisibleTo(audience: CampusAudienceKind): boolean {
  return ['staff', 'explorer', 'member', 'business'].includes(audience);
}

export async function getStaffDesks(enrollmentId: string): Promise<{ audience: CampusAudienceKind; desks: StaffDesk[] }> {
  const [audience, reese, dara, daraReachable] = await Promise.all([
    campusAudienceFor(enrollmentId),
    agentDesk('reese', 'Reese', 'Mentor desk', REESE_PROMPTS, isReeseEnabled, getReeseEnrollmentId),
    agentDesk('dara', 'Dara', 'Curriculum desk', DARA_PROMPTS, isDaraEnabled, getDaraEnrollmentId),
    canReachAgent(enrollmentId, 'dara'),
  ]);
  // C87: no badge for the Program floor = no Dara at all (not drawn, not on the help desk, no enrollment to message)
  const desks = daraReachable ? [reese, dara] : [reese];
  if (mayaVisibleTo(audience)) desks.push(mayaDesk());
  return { audience, desks };
}
