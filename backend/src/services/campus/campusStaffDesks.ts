import { campusAudienceFor, CampusAudienceKind } from './campusAudience';
import { isReeseEnabled, getReeseEnrollmentId } from '../reese/reeseIdentitySeed';
import { isDaraEnabled, getDaraEnrollmentId } from '../curriculum/daraIdentitySeed';
import { getMayaEnrollmentId } from '../mayaIdentitySeed';
import type { CampusArea } from './campusAreas';
import { resolveMayaMode } from '../maya/mayaPromotion';
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
 * MAYA (C121, Ali 2026-11-06: "put Maya in the same IM system as everyone else"): she answers in the shared portal chat like
 * Reese and Dara, so her desk carries her enrollment id and her suggested questions. M36 (2026-11-09): her desk is on duty
 * exactly when her DM reply is LIVE on the M37 switch (maya/mayaPromotion.resolveMayaMode: kill switch, ENABLE_CHAT,
 * promotion), the same answer that gates her replies (maya/mayaReplyService.ts); off, it reads "Back soon" like every desk.
 * Her AiAgent row is NOT what gates her (see mayaIdentitySeed.ts).
 *
 * ON DUTY. Reese and Dara answer DMs whenever their AiAgent row is enabled and their identity is seeded (their reply
 * paths check nothing else); Maya when her DM reply is live and her identity is seeded. Off duty, the desk reads "Back soon"
 * and carries no enrollment id, so nothing can open a conversation that would get no answer.
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

// C88: learners' curriculum questions moved from Dara to Reese (his my_curriculum_progress tool answers the first one).
const REESE_PROMPTS = ['What does this week\'s lesson cover?', 'How do I get unstuck on this week\'s lab?', 'What should I focus on next?', 'Can you look over my project plan?'];
// C87/C88 (Ali, 2026-10-29): Dara is upstairs, for staff, monitoring the curriculum. Each question is one her staff tools
// answer from real data (curriculum_health, student_pacing in daraStaffTools.ts); nothing she cannot see yet.
const DARA_PROMPTS = ['Which lessons are students stalling on this week?', 'Who is falling behind the schedule?'];

// C121/C122: each one is answered by a real tool in her portal DM (retrieve_knowledge with the pricing rule,
// book_admissions_call, request_callback in maya/mayaPortalTools.ts).
export const MAYA_PROMPTS = ['Compare the plans for me', 'Book a call with admissions', 'Have someone call me'];

async function agentDesk(
  id: DeskId, name: string, title: string, prompts: string[],
  enabled: () => Promise<boolean>, enrollment: () => Promise<string | null>,
): Promise<StaffDesk> {
  const [on, eid] = await Promise.all([enabled(), enrollment()]);
  const onDuty = on && !!eid;
  return { id, name, title, ...AGENT_PLACES[id], ai: true, on_duty: onDuty, enrollment_id: onDuty ? eid : null, opens: null, prompts: onDuty ? prompts : [] };
}

/** Maya's identity lookup, fail closed: a lookup error leaves her desk off duty instead of failing every desk. */
async function mayaEnrollmentOrNull(): Promise<string | null> {
  try {
    return await getMayaEnrollmentId();
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'campus', event: 'maya_enrollment_lookup_failed', outcome: 'failure', error_class: e?.name || 'Error',
    }));
    return null;
  }
}

/** Maya's desk (C121; M36, 2026-11-09): the agentDesk pattern, on duty iff her DM reply is LIVE on the M37 switch
 *  (resolveMayaMode: kill switch, ENABLE_CHAT, promotion) and her identity is seeded, so the desk never offers a
 *  conversation she would not answer. Off duty she is "back soon", never an error: opens is 'site_chat_off' when chat is
 *  off and 'maya_paused' when an admin reverted her or the kill switch is on. C21 (v6 D3): Admissions, beside the gate. */
async function mayaDesk(): Promise<StaffDesk> {
  const mode = await resolveMayaMode('respondToExplorerDm');
  const on = mode.mode === 'live';
  const desk = await agentDesk('maya', 'Maya', 'Welcome desk', MAYA_PROMPTS, async () => on, mayaEnrollmentOrNull);
  return on ? desk : { ...desk, opens: mode.reason === 'chat_off' ? 'site_chat_off' : 'maya_paused' };
}

/** C21 (v6 D3): Maya is always in her Admissions building and on every help desk, for every audience (it replaces C6's
 *  Explorer-and-staff rule). C121: her chat is the shared portal chat, no longer the site widget. */
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
  if (mayaVisibleTo(audience)) desks.push(await mayaDesk());
  return { audience, desks };
}
