import { trailFor, buildingIdForPath } from '../campusTrail';
import { campusBuildingsFor } from '../useCampusView';
import type { CampusAudience } from '../campusMap';

const AUDIENCES: CampusAudience[] = ['member', 'explorer', 'business', 'staff'];

describe('trailFor', () => {
  it.each(AUDIENCES)('every non-planned room route reads Campus > building > room for %s', (aud) => {
    const buildings = campusBuildingsFor(aud);
    let checked = 0;
    for (const b of buildings) {
      for (const r of b.rooms.filter((x) => !x.planned && !x.admin)) { // C6: admin links are not campus places
        const t = trailFor(r.route, buildings, false);
        // A room route shared by two buildings would be ambiguous; the catalog has none (asserted here).
        expect({ route: r.route, labels: t.map((c) => c.label) }).toEqual({ route: r.route, labels: ['Campus', b.name, r.label] });
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  // C6: the Staff Office's rooms are admin links (the Management Portal, a new tab), never a campus place or a trail.
  it('admin links never become a trail, and /portal/view-as is no longer a campus room', () => {
    expect(trailFor('/portal/mgmt-enter', campusBuildingsFor('staff'), false).map((c) => c.label)).toEqual(['Campus']);
    expect(trailFor('/portal/view-as', campusBuildingsFor('staff'), false).map((c) => c.label)).toEqual(['Campus']);
  });

  it('a page under a building but not a listed room reads Campus > building', () => {
    expect(trailFor('/portal/classroom/week/3', campusBuildingsFor('member'), false).map((c) => c.label)).toEqual(['Campus', 'Classroom']);
    expect(trailFor('/portal/projects/workspace/p1/t1', campusBuildingsFor('member'), false).map((c) => c.label)).toEqual(['Campus', 'Project Studio']);
  });

  it('a page in no building reads Campus', () => {
    expect(trailFor('/portal/settings', campusBuildingsFor('member'), false)).toEqual([{ label: 'Campus' }]);
  });

  it('the Game Room (C10) reads Campus > Game Room > Game Room', () => {
    expect(trailFor('/portal/game-room', campusBuildingsFor('member'), false).map((c) => c.label)).toEqual(['Campus', 'Game Room', 'Game Room']);
  });

  it('honors Workplace names', () => {
    expect(trailFor('/portal/rooms', campusBuildingsFor('member'), true).map((c) => c.label)).toEqual(['Campus', 'Collab Cafe', 'Rooms']);
  });

  it('buildingIdForPath follows the same rules', () => {
    expect(buildingIdForPath('/portal/company', campusBuildingsFor('business'))).toBe('career');
    expect(buildingIdForPath('/portal/settings', campusBuildingsFor('member'))).toBeNull();
  });
});
