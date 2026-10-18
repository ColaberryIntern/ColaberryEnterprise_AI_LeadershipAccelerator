/**
 * C6: the campus each audience gets - every building, its label, primary action and rooms (with their links) - pinned as a
 * snapshot. The first version was recorded BEFORE C6 changed anything, so the snapshot diff in the C6 PR shows exactly what
 * C6 changed for each audience (member, Explorer, business, staff).
 */
import { campusBuildingsFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';

const AUDIENCES: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];

const view = (aud: CampusAudience) => campusBuildingsFor(aud).map((b) => ({
  id: b.id,
  name: b.name,
  workplaceName: b.workplaceName,
  explorer: b.explorer,
  gate: b.gate ?? null,
  primary: `${b.primary.label} -> ${b.primary.route}`,
  rooms: b.rooms.map((r) => `${r.label} -> ${r.route}${r.planned ? ` (planned ${r.planned})` : ''}${(r as { admin?: boolean }).admin ? ' (admin, new tab)' : ''}`),
}));

describe('per-audience campus (buildings, labels, links)', () => {
  it.each(AUDIENCES)('%s', (aud) => {
    expect(view(aud)).toMatchSnapshot();
  });
});
