import { buildHq } from '../hqModel';
import { hasHistory, readHqUsage, recordHqVisit, STAFF_TOOLS_CAP, topRooms, USAGE_KEY } from '../hqUsage';
import { hqPathFor } from '../../../Layout/useAdminCampusPresence';

// C84: the Staff tools card lists the rooms this badge opens, most used first, capped.
const all = () => true;
const marketing = (s: string) => ['dashboard', 'campaigns', 'brands'].includes(s);

beforeEach(() => window.localStorage.clear());

test('with no history: the first rooms the badge opens, in sidebar order, capped', () => {
  const hq = buildHq(all, true, 'staff');
  const { rooms, total } = topRooms(hq, {});
  const sidebar = hq.floors.flatMap((f) => f.rooms).filter((r) => r.open && !r.external);
  expect(rooms).toHaveLength(STAFF_TOOLS_CAP);
  expect(rooms.map((r) => r.path)).toEqual(sidebar.slice(0, STAFF_TOOLS_CAP).map((r) => r.path));
  expect(total).toBe(sidebar.length);
  expect(total).toBeGreaterThan(STAFF_TOOLS_CAP); // a full-access badge is the "big list" case
});

test('locked rooms never appear: a marketing badge sees only its own sections', () => {
  const hq = buildHq(marketing, true, 'staff');
  const { rooms } = topRooms(hq, {}, 99);
  expect(rooms.length).toBeGreaterThan(0);
  for (const r of rooms) expect(['dashboard', 'campaigns', 'brands']).toContain(r.section);
});

test('most used first (count, then most recent), the rest in sidebar order', () => {
  const hq = buildHq(all, true, 'staff');
  const sidebar = hq.floors.flatMap((f) => f.rooms).filter((r) => r.open && !r.external);
  const [a, b, c] = [sidebar[10].path, sidebar[12].path, sidebar[14].path];
  const usage = { [a]: { n: 2, at: 100 }, [b]: { n: 5, at: 50 }, [c]: { n: 2, at: 200 } };
  const { rooms } = topRooms(hq, usage);
  expect(rooms.slice(0, 3).map((r) => r.path)).toEqual([b, c, a]);
  expect(rooms[3].path).toBe(sidebar[0].path);
  expect(hasHistory(rooms, usage)).toBe(true);
  expect(hasHistory(topRooms(hq, {}).rooms, {})).toBe(false);
});

test('a non-staff viewer has no rooms', () => {
  expect(topRooms(buildHq(all, false, 'member'), {}).rooms).toEqual([]);
});

test('recordHqVisit counts per sidebar room and the counts drive the order', () => {
  const room = hqPathFor('/admin/leads/42');
  expect(room).toBe('/admin/leads'); // a detail page counts as its room; no record id is stored
  recordHqVisit(room, 1);
  recordHqVisit(room, 2);
  recordHqVisit(null, 3);
  expect(readHqUsage()).toEqual({ '/admin/leads': { n: 2, at: 2 } });
  expect(window.localStorage.getItem(USAGE_KEY)).not.toContain('42');
});

test('corrupt or foreign storage reads as no history', () => {
  window.localStorage.setItem(USAGE_KEY, '{not json');
  expect(readHqUsage()).toEqual({});
  window.localStorage.setItem(USAGE_KEY, JSON.stringify({ '/admin/leads': { n: 'x' }, 'https://evil': { n: 1, at: 1 }, '/admin/ok': { n: 1, at: 1 } }));
  expect(readHqUsage()).toEqual({ '/admin/ok': { n: 1, at: 1 } });
});

test('storage that throws never breaks reading or recording', () => {
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  const set = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(readHqUsage()).toEqual({});
  expect(() => recordHqVisit('/admin/leads')).not.toThrow();
  get.mockRestore();
  set.mockRestore();
});
