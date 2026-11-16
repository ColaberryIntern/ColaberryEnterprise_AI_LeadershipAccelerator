import type { CampusAudience } from '../campusMap';
import type { HqRoom } from './hqModel';

/**
 * Career Prep v27 (CP2.2): the doors on the Career Prep floor, per audience. Students get EXACTLY
 * ONE door (Ali: "1 door that leads to multiple guided options instead of multiple doors"). Staff
 * doors are the sidebar's Placement links (built by hqModel like every floor), not this function.
 *
 *   member + Career Prep on   one own room, Career Prep, opening the room in place
 *   everyone else             no doors, and buildHq leaves the floor out entirely, so nobody Career Prep is
 *                             not open for sees any change (Release 1 ships dark). When M4 opens it, the
 *                             kit's explorer note ("Career Prep opens when you enroll") and the partners'
 *                             Hiring doors (Release 3) are added here.
 */
export const CAREER_PREP_ROOM_PATH = '/portal/career/room';

export interface CareerPrepFloorState { on: boolean; doorStatus?: string }

export function careerPrepDoorsFor(audience: CampusAudience, state: CareerPrepFloorState | undefined): HqRoom[] {
  if (audience !== 'member' || !state?.on) return [];
  return [{
    path: CAREER_PREP_ROOM_PATH, label: 'Career Prep', icon: 'focus-3-line', section: 'own',
    newTab: false, external: false, open: true, own: true,
  }];
}

export const doorsText = (n: number): string => `${n} ${n === 1 ? 'door' : 'doors'}`;

/** The student's own Career Prep floor (the one door built above), which gets its own scene and panel. */
export const isCareerPrepFloor = (f: { own?: boolean; rooms: ReadonlyArray<{ path: string }> }): boolean =>
  !!f.own && f.rooms.length === 1 && f.rooms[0].path === CAREER_PREP_ROOM_PATH;
