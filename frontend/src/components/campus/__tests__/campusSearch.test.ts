import { searchCampus, SEARCH_LIMIT } from '../campusSearch';
import { campusBuildingsFor } from '../useCampusView';
import type { CampusPresence } from '../campusApi';

const B = campusBuildingsFor('member');
const PRESENCE: CampusPresence = {
  library: { count: 3, people: [{ enrollment_id: 'e1', display_name: 'Mia Lopez', avatar_url: null }, { anonymous: true }, { anonymous: true }] },
};

describe('searchCampus', () => {
  it('empty query returns nothing', () => {
    expect(searchCampus('   ', B, PRESENCE, false)).toEqual([]);
  });

  it('finds a building and its rooms by building name', () => {
    const r = searchCampus('library', B, PRESENCE, false);
    expect(r[0]).toMatchObject({ kind: 'building', buildingId: 'library', label: 'Library' });
    expect(r.some((x) => x.kind === 'room' && x.route === '/portal/library')).toBe(true);
  });

  it('finds a room by its own label and points at its real route', () => {
    const r = searchCampus('assign', B, null, false);
    expect(r).toContainEqual(expect.objectContaining({ kind: 'room', label: 'Assignments', route: '/portal/assignments', buildingId: 'studio', navigable: true }));
  });

  it('finds a named person and says which building they are in', () => {
    expect(searchCampus('mia', B, PRESENCE, false)).toEqual([{ kind: 'person', id: 'p:e1', label: 'Mia Lopez', buildingId: 'library', detail: 'In Library' }]);
  });

  it('anonymous presence is never searchable (no name to match, nothing leaks)', () => {
    expect(searchCampus('anonymous', B, PRESENCE, false)).toEqual([]);
    expect(searchCampus('learner', B, PRESENCE, false).some((x) => x.kind === 'person')).toBe(false);
  });

  it('the Game Room (C10) is a navigable room', () => {
    expect(searchCampus('game', B, null, false)).toContainEqual(expect.objectContaining({ kind: 'room', route: '/portal/game-room', navigable: true }));
  });

  it('puts labels that start with the query first and caps the list', () => {
    const r = searchCampus('p', B, null, false);
    expect(r.length).toBeLessThanOrEqual(SEARCH_LIMIT);
    const firstNonPrefix = r.findIndex((x) => !x.label.toLowerCase().startsWith('p'));
    if (firstNonPrefix >= 0) expect(r.slice(firstNonPrefix).every((x) => !x.label.toLowerCase().startsWith('p'))).toBe(true);
  });

  it('honors Workplace names', () => {
    expect(searchCampus('knowledge', B, null, true)[0]).toMatchObject({ kind: 'building', label: 'Knowledge Base' });
  });
});
