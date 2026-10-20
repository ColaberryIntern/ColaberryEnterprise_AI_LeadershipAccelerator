import type { BuildingId, CampusBuilding } from './campusMap';
import type { Happening } from './BuildingCard';

/**
 * What the arrival panel says about a building (C11b), as pure data: the hero's place name and "Happening here", built only from
 * what the campus really knows (broadcast discovery, today's plan route, live presence). With nothing true to say it says the
 * building is quiet, never an invented event.
 */
/** The gate's own card has no place line (it IS the place, and Workplace names rename it). */
export function zoneLabelOf(b: Pick<CampusBuilding, 'zone'>): string | undefined {
  if (b.zone === 'gate') return undefined;
  return b.zone === 'ave' ? 'South Avenue' : 'The Quad';
}

export function happeningAt(id: BuildingId, s: { onAir: boolean; routeIndex: number; count: number | null; presenceError: boolean }): Happening[] {
  const out: Happening[] = [];
  if (s.onAir) out.push({ title: 'On air now', detail: 'Colaberry Live is broadcasting here', tone: 'hot' });
  if (s.routeIndex >= 0) out.push({ title: 'On today’s plan', detail: `Stop ${s.routeIndex + 1} of your route`, tone: 'live' });
  if (s.presenceError) out.push({ title: 'Who is here is unavailable', detail: 'Headcounts are hidden, not zero', tone: '' });
  else if (s.count && s.count > 0) out.push({ title: `${s.count} ${s.count === 1 ? 'person' : 'people'} here now`, detail: 'From live presence', tone: 'live' });
  if (!out.length) out.push({ title: 'Quiet right now', detail: id === 'gate' ? 'The way in and out of campus' : 'Nobody is here at the moment', tone: '' });
  return out;
}
