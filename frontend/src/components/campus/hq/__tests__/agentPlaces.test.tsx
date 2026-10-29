/**
 * C87 agent places, on the client: an AI agent whose place is a Staff Office floor stands at its office door in the tower
 * (Dara at Curriculum on the Program floor), and the staff card names the floor. The server decides who is sent Dara at all.
 */
import { deskPeople } from '../HqBuilding';
import { buildHq, placePeople } from '../hqModel';
import { deskPlace } from '../../StaffPop';
import { CAMPUS_BUILDINGS } from '../../campusMap';
import type { StaffDesk } from '../../campusPeopleApi';

const desk = (over: Partial<StaffDesk>): StaffDesk => ({
  id: 'dara', name: 'Dara', title: 'Curriculum desk', building: 'career', floor: 'program', office: '/admin/orchestration',
  ai: true, on_duty: true, enrollment_id: 'dara-1', opens: null, prompts: [], ...over,
});
const career = CAMPUS_BUILDINGS.find((b) => b.id === 'career');

describe('deskPeople', () => {
  it('an on-duty desk with an office becomes a face at that door; desks off the tower or off duty do not', () => {
    const people = deskPeople([
      desk({}),
      desk({ id: 'reese', name: 'Reese', title: 'Mentor desk', building: 'lecture', floor: null, office: null }),
      desk({ id: 'maya', name: 'Maya', title: 'Welcome desk', building: 'admissions', floor: null, office: null }),
    ]);
    expect(people).toEqual([{ key: 'desk-dara', name: 'Dara (AI, Curriculum desk)', initials: 'D', photo: null, hq_path: '/admin/orchestration' }]);
    expect(deskPeople([desk({ on_duty: false })])).toEqual([]);
    expect(deskPeople(null)).toEqual([]);
  });

  it('in a staff viewer\'s tower Dara stands at Curriculum, on the Program floor', () => {
    const hq = buildHq(() => true, true, 'staff');
    const placed = placePeople(hq, deskPeople([desk({})]));
    expect(placed.byRoom.get('/admin/orchestration')?.map((p) => p.key)).toEqual(['desk-dara']);
    const floor = hq.floors.find((f) => f.rooms.some((r) => r.path === '/admin/orchestration'));
    expect(floor?.label).toBe('Program');
    expect(placed.byFloor.get(floor!.num)?.map((p) => p.key)).toEqual(['desk-dara']);
    expect(placed.lobby).toEqual([]);
  });
});

describe('deskPlace', () => {
  it('names the floor for an agent with an office, and only the building otherwise', () => {
    expect(career).toBeDefined();
    expect(deskPlace({ office: '/admin/orchestration' }, career, false)).toMatch(/^the .+ on the Program floor$/);
    expect(deskPlace({ office: null }, career, false)).not.toMatch(/floor/);
    expect(deskPlace({ office: '/admin/not-a-page' }, career, false)).not.toMatch(/floor/);
  });
});
