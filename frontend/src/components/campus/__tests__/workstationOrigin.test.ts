/**
 * Back out returns where you came from (Ali, 2026-10-26: Today -> back to Today; the Classroom's workstation -> back to the Classroom;
 * a project's workspace -> back to that project). The workstation's Stand up returns to the page that opened it; from the campus map
 * (or a deep link) there is no page, so it stands you in the room. A bench hop keeps whichever origin it had.
 */
jest.mock('../CampusContext', () => ({ useCampus: () => ({}) }));
jest.mock('../home/useHomeFacts', () => ({ useHomeFacts: () => ({}) }));
// eslint-disable-next-line import/first
import { benchState, returnToOf } from '../workstation/WorkstationShell';

describe('returnToOf: the page Stand up returns to', () => {
  it.each([
    [{ from: '/portal/today' }, '/portal/today'],
    [{ from: '/portal/classroom/week/3' }, '/portal/classroom/week/3'],
    [{ from: '/portal/projects?project=p1' }, '/portal/projects?project=p1'],
  ])('a page origin (%o) is returned to', (state, want) => {
    expect(returnToOf(state)).toBe(want);
  });
  it.each([
    ['no state (a deep link)', null],
    ['no from', {}],
    ['the campus home', { from: '/portal/campus' }],
    ['the campus home with a query', { from: '/portal/campus?b=lecture' }],
    ['a hop that started on the map', { from: '/portal/classroom', fromCampus: true }],
  ])('%s: stand inside the room on the map', (_n, state) => {
    expect(returnToOf(state)).toBeNull();
  });
});

describe('benchState: a bench hop keeps the origin', () => {
  it('from a page, the next workstation still returns to that page', () => {
    expect(returnToOf(benchState('/portal/today', '/portal/classroom'))).toBe('/portal/today');
  });
  it('from the map, the section picks the room and Stand up stays the map', () => {
    const s = benchState(null, '/portal/classroom');
    expect(s).toEqual({ from: '/portal/classroom', fromCampus: true });
    expect(returnToOf(s)).toBeNull();
  });
});
