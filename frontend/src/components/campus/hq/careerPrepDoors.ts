import type { CampusAudience } from '../campusMap';
import type { HqRoom } from './hqModel';

/**
 * Career Prep v27 (CP2.2): the doors on the Career Prep floor, per audience. Students get EXACTLY
 * ONE door (Ali: "1 door that leads to multiple guided options instead of multiple doors"). Staff
 * doors are the sidebar's Placement links (built by hqModel like every floor), not this function.
 *
 *   student + Career Prep on  one own room, Career Prep, opening the room in place. A student is a member or an explorer:
 *                             the pilot's volunteers (Ali, 2026-11-25) hold accounts without a class. The server decides
 *                             who it is on for, per enrollment, so an explorer it is not on for sees no change.
 *   everyone else             no doors, and buildHq leaves the floor out entirely, so nobody Career Prep is
 *                             not open for sees any change (Release 1 ships dark). When M4 opens it, the
 *                             partners'
 *                             Hiring doors (Release 3) are added here.
 */
export const CAREER_PREP_ROOM_PATH = '/portal/career/room';

export interface CareerPrepFloorState { on: boolean; doorStatus?: string }

/** The audiences that can hold Career Prep at all (the server then decides, per enrollment). */
export const isPrepAudience = (a: CampusAudience): boolean => a === 'member' || a === 'explorer';

export function careerPrepDoorsFor(audience: CampusAudience, state: CareerPrepFloorState | undefined): HqRoom[] {
  if (!isPrepAudience(audience) || !state?.on) return [];
  return [{
    path: CAREER_PREP_ROOM_PATH, label: 'Career Prep', icon: 'focus-3-line', section: 'own',
    newTab: false, external: false, open: true, own: true,
  }];
}

export const doorsText = (n: number): string => `${n} ${n === 1 ? 'door' : 'doors'}`;

/** The student's own Career Prep floor (the one door built above), which gets its own scene and panel. */
export const isCareerPrepFloor = (f: { own?: boolean; rooms: ReadonlyArray<{ path: string }> }): boolean =>
  !!f.own && f.rooms.length === 1 && f.rooms[0].path === CAREER_PREP_ROOM_PATH;

/**
 * Career Prep v27 (CP5.3): the tower's words for a student whose Career Prep floor is open (kit P1 sections 2 and
 * 3). `prepFloorOf` is that floor, or undefined (everyone else: no Career Prep words anywhere in the tower).
 */
export const prepFloorOf = (floors: ReadonlyArray<{ own?: boolean; num: string; access: string; rooms: ReadonlyArray<{ path: string }> }>) =>
  floors.find((f) => isCareerPrepFloor(f) && f.access !== 'none');
export const prepOutsideHint = (num: string): string => `Your floor is lit: ${num} · Career Prep`;
/** With today's planned minutes (from the student's plan), Cora has the session ready; without, she is waiting. */
export const prepLobbyLine = (firstName: string, num: string, sessionMinutes?: number): string =>
  `Hi${firstName ? ` ${firstName}` : ''}! Career Prep is on Floor ${num}. Cora, your interview coach, ${sessionMinutes ? `has today's ${sessionMinutes}-minute session ready.` : 'is waiting for you up there.'}`;
/** The lobby directory for a student: only the floors their badge opens, then one line for the rest. */
export const prepStaffFloorsLine = (k: number): string => `${k} other ${k === 1 ? 'floor is a Colaberry staff office' : 'floors are Colaberry staff offices'}.`;
export const prepElevatorLine = 'Tap your floor. It goes straight up, no stops.';
export const prepExpressLabel = (num: string): string => `${num} · Go to Career Prep · Elevator A · straight up`;
