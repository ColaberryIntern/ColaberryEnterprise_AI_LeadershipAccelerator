/**
 * C43 (room fix F3): the left-wall boards, from the data each page reads. Each builder: real rows when there is data, and the
 * board's empty line + "Open <section>" when there is none (never a blank wall, never an invented row). Career: the interns' real
 * standup with Team "Not assigned yet"; anyone else the empty state.
 */
import { careerBoard, eventsBoard, libraryBoard, portfolioBoard, progressBoard, scheduleBoard, towerCard } from '../interior/wallBoards';

const NOW = new Date('2026-10-26T15:00:00Z');

it('Library: items, pinned and the newest; empty library: the empty line', () => {
  const v = { room_id: 'r', can_upload: false, resources: [
    { id: '1', title: 'Old guide', is_pinned: true, created_at: '2026-10-01T00:00:00Z' },
    { id: '2', title: 'New recap', is_pinned: false, created_at: '2026-10-20T00:00:00Z' },
  ] } as never;
  expect(libraryBoard(v, 'Library')).toEqual({ title: '📚 In the library', rows: [
    { label: 'Items in the library', value: '2' }, { label: 'Pinned', value: '1' }, { label: 'Newest', value: 'New recap' }] });
  expect(libraryBoard(null, 'Library')).toEqual({ title: '📚 In the library', rows: [], empty: 'Nothing here yet', open: 'Open Library' });
});

it('C75 Schedule: Today\'s included learning, each step opening its own assignment (at most four); the board opens the Today page', () => {
  const stops = [{ title: 'Watch the intro', done: true, minutes: 12, route: '/portal/runtime/a' }, { title: 'Build the agent', done: false, minutes: 30, route: '/portal/runtime/b' },
    { title: 'Reflect', done: false, minutes: null, route: '/portal/runtime/c' }] as never;
  const b = scheduleBoard(stops, 'Schedule');
  expect(b.rows).toEqual([
    { label: 'Watch the intro', value: '✓ done', route: '/portal/runtime/a' }, { label: 'Build the agent', value: '30 min', route: '/portal/runtime/b' },
    { label: 'Reflect', value: 'to do', route: '/portal/runtime/c' }]);
  expect(b).toMatchObject({ title: '📅 Today · start learning here', open: 'Open Today', route: '/portal/today' });
  expect(b.note).toContain('no card needed');
  expect(JSON.stringify(b)).not.toMatch(/\bfree\b/i);
  expect(scheduleBoard(null, 'Schedule')).toMatchObject({ rows: [], empty: 'Nothing else on today', open: 'Open Today', route: '/portal/today' });
});

it('C76 the planning desk opens the first unfinished Today item; all done or no plan: the Today page', () => {
  const s = (route: string, done: boolean) => ({ route, done }) as never;
  expect(towerCard([s('/a', true), s('/b', false), s('/c', false)])).toBe('/b');
  expect(towerCard([s('/a', true)])).toBe('/portal/today');
  expect(towerCard(null)).toBe('/portal/today');
});

it('Events Hall: the next three events in Central time, your sign-up ticked; none: No events scheduled', () => {
  const ev = (id: string, at: string, reg = false) => ({ id, title: `Event ${id}`, starts_at: at, ends_at: null, is_registered: reg });
  const rows = eventsBoard([ev('a', '2026-10-29T23:30:00Z', true), ev('b', '2026-10-27T15:00:00Z'), ev('old', '2026-10-20T15:00:00Z'), ev('c', '2026-10-30T14:00:00Z'), ev('d', '2026-11-02T14:00:00Z')] as never, NOW, 'Events Hall').rows;
  expect(rows.map((r) => r.label)).toEqual(['Event b', 'Event a', 'Event c']);
  expect(rows[1].value).toMatch(/6:30 PM ✓$/);
  expect(eventsBoard([], NOW, 'Events Hall')).toMatchObject({ rows: [], empty: 'No events scheduled' });
});

it('My Progress: Builder / Learning / Community XP from the classroom feed; no progression: No points yet (never zeros)', () => {
  const feed = { buckets: [], cards: [], progression: { xp: { learning: 1200, builder: 340, community: 15 }, level: { slug: 'x', readiness: 0.2 } } } as never;
  expect(progressBoard(feed, 'My Progress').rows).toEqual([
    { label: 'Builder XP', value: '340' }, { label: 'Learning XP', value: '1,200' }, { label: 'Community XP', value: '15' }]);
  expect(progressBoard({ buckets: [], cards: [] } as never, 'My Progress')).toMatchObject({ rows: [], empty: 'No points yet' });
  expect(progressBoard(null, 'My Progress')).toMatchObject({ rows: [], empty: 'No points yet' });
});

it('Gallery: real portfolio counts and readiness; nothing: the empty line', () => {
  const p = { artifacts: [{}, {}], projects: [{}], readiness: { met_count: 3, total_count: 4 } } as never;
  expect(portfolioBoard(p, 'Showcase Gallery').rows).toEqual([
    { label: 'Artifacts', value: '2' }, { label: 'Projects', value: '1' }, { label: 'Portfolio readiness', value: '3 of 4', pct: 75 }]);
  expect(portfolioBoard({ artifacts: [], projects: [], readiness: null } as never, 'Showcase Gallery')).toMatchObject({ rows: [], empty: 'Nothing in your portfolio yet' });
});

it('Career Center: interns see the real standup and Team Not assigned yet, opening the standup room; others: Not assigned yet', () => {
  const dash = { required_meetings: [
    { day: 'Tuesday', kind: 'office_hours', audience: 'public', title: 'Office hours' },
    { day: 'Monday', kind: 'standup', time: '9:00 AM', timezone: 'CT', audience: 'interns_only', title: 'Intern standup', room_id: 'room-9' },
  ] } as never;
  expect(careerBoard(dash, 'Career Center')).toEqual({ title: '👥 Your team', rows: [
    { label: 'Team', value: 'Not assigned yet' }, { label: 'Intern standup', value: 'Monday 9:00 AM CT' }], open: 'Open the standup room', route: '/portal/rooms/room-9' });
  expect(careerBoard(null, 'Career Center')).toEqual({ title: '👥 Your team', rows: [], empty: 'Not assigned yet', open: 'Open Career Center' });
  expect(careerBoard({ required_meetings: [] } as never, 'Career Center')).toMatchObject({ rows: [], empty: 'Not assigned yet' });
});

it('never says free', () => {
  const all = JSON.stringify([libraryBoard(null, 'L'), scheduleBoard(null, 'S'), eventsBoard(null, NOW, 'E'), progressBoard(null, 'P'), portfolioBoard(null, 'G'), careerBoard(null, 'C')]);
  expect(all).not.toMatch(/\bfree\b/i);
});
