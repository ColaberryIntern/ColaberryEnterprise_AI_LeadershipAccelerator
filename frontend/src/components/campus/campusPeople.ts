import type { CampusAreaPresence, CampusPerson, CampusPresenceEntry } from './campusApi';
import type { CampusAudience } from './campusMap';
import type { StaffDesk } from './campusPeopleApi';

/**
 * Pure helpers for the people on the campus (Colaberry Campus C5): which tokens to draw beside a building, and which
 * staff desks belong in a building's card. No rendering, no I/O.
 */
export const TOKENS_PER_BUILDING = 3;

export const isNamed = (e: CampusPresenceEntry): e is CampusPerson => !('anonymous' in e);

/** The named people the server listed for a building (the viewer is never listed), capped, plus how many more. */
export function tokensFor(area: CampusAreaPresence | undefined, max: number = TOKENS_PER_BUILDING): { shown: CampusPerson[]; more: number } {
  const named = (area?.people ?? []).filter(isNamed);
  return { shown: named.slice(0, max), more: Math.max(0, named.length - max) };
}

/** C21 (v6 D3): Maya is always in her Admissions building and on the help desks, for every audience (it replaced C6's
 *  Explorer-and-staff rule). The server decides first; this is the second, independent check. */
export function mayaAllowedFor(audience: CampusAudience): boolean {
  return audience === 'explorer' || audience === 'staff' || audience === 'member' || audience === 'business';
}

/** The desks that belong in this building's card for this viewer (an older server's Maya at the gate counts as Admissions). */
export function desksForBuilding(desks: StaffDesk[], buildingId: string, audience: CampusAudience): StaffDesk[] {
  const at = (d: StaffDesk) => (d.id === 'maya' && d.building === 'gate' ? 'admissions' : d.building);
  return desks.filter((d) => at(d) === buildingId && (d.id !== 'maya' || mayaAllowedFor(audience)));
}

