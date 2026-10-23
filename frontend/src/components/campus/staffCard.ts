import type { StaffDesk } from './campusPeopleApi';
import type { At } from './usePopover';

/**
 * The AI staff card (WP-5, decision Q7: a popover with "Visit the desk", instead of the help desk walking you there):
 *  - a tiny window-event bus, like the cheers: the help desk chips on the campus home, the staff chips in Who's here and the
 *    "Ask <name> anything" bubble in a room all call openStaffCard(); the one host on the map shows it;
 *  - each desk's role line and colour, from the prototype's STAFF table (D:1528-1537). Maya's "reports to Taiwo's team" names a
 *    person the campus cannot vouch for, so her line is just her role.
 */
export const STAFF_CARD_EVENT = 'cm-staff-card';
export interface StaffCardRequest { id: string; at?: At }

export function openStaffCard(id: string, at?: At): void {
  try { window.dispatchEvent(new CustomEvent<StaffCardRequest>(STAFF_CARD_EVENT, { detail: { id, at } })); } catch { /* non-DOM environment */ }
}

export function onStaffCard(cb: (r: StaffCardRequest) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<StaffCardRequest>).detail);
  window.addEventListener(STAFF_CARD_EVENT, h);
  return () => window.removeEventListener(STAFF_CARD_EVENT, h);
}

const ROLE: Record<string, [string, string]> = {
  maya: ['AI admissions', 'AI admissions'],
  reese: ['AI mentor · Student success', 'AI mentor · People success'],
  dara: ['AI guide · Curriculum & certification', 'AI guide · Learning & certification'],
};

/** "AI mentor · Student success" (Workplace: "People success"); a desk the table does not know keeps its own title. */
export function staffRole(d: Pick<StaffDesk, 'id' | 'title'>, workplace: boolean): string {
  const r = ROLE[d.id];
  return r ? r[workplace ? 1 : 0] : d.title;
}

/** The desk's colour token (Maya rose, Reese amber, Dara orange; others gold). */
export const staffTone = (id: string): string => (ROLE[id] ? `staff-${id}` : 'gold');
