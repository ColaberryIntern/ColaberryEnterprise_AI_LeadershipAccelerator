import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import { isStaffOrMgmt } from '../access/staffAccess';
import { getReeseEnrollmentId } from '../reese/reeseIdentitySeed';
import { getDaraEnrollmentId } from '../curriculum/daraIdentitySeed';
import { canReachAgent, floorBlockedMessage } from '../campus/agentPlaces';

/**
 * WHO MAY DM WHOM: the one implementation of the rule (moved verbatim from dmService.assertSameCohort so the campus
 * can ask the same question without opening a room). Allowed when ANY holds:
 *   1. the other person is in my cohort;
 *   2. I am staff or management (the role-aware People panel shows staff everyone online, across cohorts);
 *   3. either side is Reese's enrollment (Reese has no cohort; students can always reach her);
 *   4. either side is Dara's enrollment (same reasoning).
 * Otherwise the exact DmError text the chat dock already shows. Reese/Dara are an explicit pair rather than a general
 * "any AI agent" mechanism: two real cases, below the three-case extraction threshold in CLAUDE.md.
 *
 * Failure posture (unchanged): an id lookup that fails or throws counts as "no bypass", so a broken lookup can only
 * ever deny a cross-cohort DM, never allow one.
 *
 * C87 (agent places): Dara stays on the Program floor of the Staff Office. A person whose badge does not open that floor
 * may not DM her, whatever their cohort or role: that check runs FIRST. Dara writing to someone is not limited here. The
 * floor lookup fails closed (canReachAgent), so a broken lookup can only ever deny.
 */
export interface DmContext { meIsStaffOrMgmt: boolean; reeseId: string | null; daraId: string | null; daraFloorOpen: boolean }
export interface DmTarget { id: string; cohort_id: string | null }

export const DM_NOT_AVAILABLE = 'That person is no longer available';
export const DM_COHORT_ONLY = 'You can only message people in your cohort';
export const DM_NO_COHORT = 'You are not in a cohort yet';
export const DM_DARA_FLOOR = floorBlockedMessage('Dara');

async function lookupAgentId(fn: () => Promise<string | null>, event: string): Promise<string | null> {
  try {
    return await fn();
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'dm', event,
      error_class: e?.name || 'Error', message: String(e?.message || e),
    }));
    return null;
  }
}

/** The viewer-side facts the rule needs. The staff check runs first, as before, so a staff sender needs no agent ids. */
export async function loadDmContext(meId: string): Promise<DmContext> {
  const meIsStaffOrMgmt = await isStaffOrMgmt(meId);
  const reeseId = await lookupAgentId(getReeseEnrollmentId, 'reese_enrollment_lookup_failed');
  const daraId = await lookupAgentId(getDaraEnrollmentId, 'dara_enrollment_lookup_failed');
  const daraFloorOpen = await canReachAgent(meId, 'dara');
  return { meIsStaffOrMgmt, reeseId, daraId, daraFloorOpen };
}

/** Pure: null when the DM is allowed, else the exact message the sender sees. */
export function dmBlockReason(meId: string, other: DmTarget | null, myCohortId: string | null | undefined, ctx: DmContext): string | null {
  if (!other) return DM_NOT_AVAILABLE;
  if (ctx.daraId && other.id === ctx.daraId && meId !== ctx.daraId && !ctx.daraFloorOpen) return DM_DARA_FLOOR;
  if (myCohortId && other.cohort_id === myCohortId) return null;
  if (ctx.meIsStaffOrMgmt) return null;
  if (ctx.reeseId && (meId === ctx.reeseId || other.id === ctx.reeseId)) return null;
  if (ctx.daraId && (meId === ctx.daraId || other.id === ctx.daraId)) return null;
  return myCohortId ? DM_COHORT_ONLY : DM_NO_COHORT;
}

/** One target, as POST /dm/open asks it. Keeps the original lookup order: the person first, then the bypasses. */
export async function dmBlockReasonFor(meId: string, otherId: string, myCohortId: string | null | undefined): Promise<string | null> {
  const row = await Enrollment.findByPk(otherId);
  if (!row) return DM_NOT_AVAILABLE;
  const other: DmTarget = { id: otherId, cohort_id: row.cohort_id ?? null };
  // C87: no same-cohort shortcut before the context any more; the Dara floor check must run for everyone.
  return dmBlockReason(meId, other, myCohortId, await loadDmContext(meId));
}

/** Many targets at once (the campus presence list): ONE Enrollment query, the same rule per id. */
export async function canDmMany(meId: string, myCohortId: string | null | undefined, otherIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (!otherIds.length) return out;
  const rows = await Enrollment.findAll({ where: { id: { [Op.in]: otherIds } }, attributes: ['id', 'cohort_id'] });
  const byId = new Map<string, DmTarget>(rows.map((r) => [String(r.id), { id: String(r.id), cohort_id: r.cohort_id ?? null }]));
  const ctx = await loadDmContext(meId);
  for (const id of otherIds) out.set(id, dmBlockReason(meId, byId.get(id) ?? null, myCohortId, ctx) === null);
  return out;
}

/**
 * C87: sending in a DM room that already exists (a thread from before Dara moved to the Program floor). openDm checks the
 * whole rule; this checks only the floor, for the room's other member. Null when allowed, else the message to show.
 */
export async function agentFloorBlockFor(meId: string, otherId: string | null | undefined): Promise<string | null> {
  if (!otherId) return null;
  const daraId = await lookupAgentId(getDaraEnrollmentId, 'dara_enrollment_lookup_failed');
  if (!daraId || otherId !== daraId || meId === daraId) return null;
  return (await canReachAgent(meId, 'dara')) ? null : DM_DARA_FLOOR;
}
