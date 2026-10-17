import { trailFor, buildingIdForPath } from '../campusTrail';
import { campusBuildingsFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';

const AUDIENCES: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];

describe('trailFor', () => {
  it.each(AUDIENCES)('every non-planned room route reads Campus > building > room for %s', (aud) => {
    const buildings = campusBuildingsFor(aud);
    let checked = 0;
    for (const b of buildings) {
      for (const r of b.rooms.filter((x) => !x.planned)) {
        const t = trailFor(r.route, buildings, false);
        // A room route shared by two buildings would be ambiguous; the catalog has none (asserted here).
        expect({ route: r.route, labels: t.map((c) => c.label) }).toEqual({ route: r.route, labels: ['Campus', b.name, r.label] });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('the staff View as room (no building prefix) still gets its full trail', () => {
    expect(trailFor('/portal/view-as', campusBuildingsFor('staff'), false).map((c) => c.label)).toEqual(['Campus', 'Staff Office', 'View as']);
  });

  it('a page under a building but not a listed room reads Campus > building', () => {
    expect(trailFor('/portal/classroom/week/3', campusBuildingsFor('member'), false).map((c) => c.label)).toEqual(['Campus', 'Classroom']);
    expect(trailFor('/portal/projects/workspace/p1/t1', campusBuildingsFor('member'), false).map((c) => c.label)).toEqual(['Campus', 'Project Studio']);
  });

  it('a page in no building reads Campus', () => {
    expect(trailFor('/portal/settings', campusBuildingsFor('member'), false)).toEqual([{ label: 'Campus' }]);
  });

  it('a planned room never matches (nobody can be on it)', () => {
    expect(trailFor('/portal/game-room', campusBuildingsFor('member'), false).map((c) => c.label)).toEqual(['Campus', 'Game Room']);
  });

  it('honors Workplace names', () => {
    expect(trailFor('/portal/rooms', campusBuildingsFor('member'), true).map((c) => c.label)).toEqual(['Campus', 'Collab Cafe', 'Rooms']);
  });

  it('buildingIdForPath follows the same rules', () => {
    expect(buildingIdForPath('/portal/view-as', campusBuildingsFor('staff'))).toBe('career');
    expect(buildingIdForPath('/portal/settings', campusBuildingsFor('member'))).toBeNull();
  });
});
