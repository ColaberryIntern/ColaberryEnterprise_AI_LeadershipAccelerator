import { buildHq, floorLabelFor, opensInPlace, PLACEMENT_SECTION, type HqNav } from '../hqModel';
import { NAV_GROUPS } from '../../../Layout/adminNav';
import type { NavGroup } from '../../../Layout/adminNav';

const placement: NavGroup = { label: 'Placement', section: PLACEMENT_SECTION, links: [{ path: '/admin/placement/students', label: 'Student prep', icon: 'user-star-line', inPlace: true }] };
const other = (label: string, section: string): NavGroup => ({ label, section, links: [{ path: `/admin/${section}`, label, icon: 'x' }] });
const nav = (groups: NavGroup[]): HqNav => ({ pinned: [], groups });
const all = () => true;

describe('the Career Prep floor: one floor, three names (CP2.1)', () => {
  it('is named per audience; every other floor keeps its sidebar label', () => {
    expect(floorLabelFor(placement, 'member')).toBe('Career Prep');
    expect(floorLabelFor(placement, 'explorer')).toBe('Career Prep');
    expect(floorLabelFor(placement, 'business')).toBe('Hiring');
    expect(floorLabelFor(placement, 'staff')).toBe('Placement');
    expect(floorLabelFor(other('Revenue', 'revenue'), 'member')).toBe('Revenue');
  });

  it('takes its floor number from its place in the sidebar, never a constant', () => {
    const a = buildHq(all, true, 'staff', nav([other('A', 'a'), placement, other('B', 'b')]));
    const b = buildHq(all, true, 'staff', nav([placement, other('A', 'a'), other('B', 'b')]));
    const num = (hq: ReturnType<typeof buildHq>) => hq.floors.find((f) => f.label === 'Placement')?.num;
    expect(num(a)).toBe('3');
    expect(num(b)).toBe('4');
  });

  it('opens the staff door in place, and only for a holder of placement', () => {
    const holder = buildHq((s) => s === PLACEMENT_SECTION, true, 'staff', nav([placement])).floors.find((f) => f.label === 'Placement')!;
    expect(holder.rooms[0]).toMatchObject({ open: true, inPlace: true });
    expect(opensInPlace(holder.rooms[0])).toBe(true);
    const without = buildHq(() => false, true, 'staff', nav([placement])).floors.find((f) => f.label === 'Placement')!;
    expect(without.access).toBe('none');
  });

  it('keeps every other staff room opening in a new tab', () => {
    const f = buildHq(all, true, 'staff', nav([other('A', 'a')])).floors.find((x) => x.label === 'A')!;
    expect(opensInPlace(f.rooms[0])).toBe(false);
  });

  it('ships in the real sidebar: a Placement group, gated placement, with in-place Student prep and the kit F9 desk links', () => {
    const g = NAV_GROUPS.find((x) => x.section === PLACEMENT_SECTION);
    expect(g?.links).toEqual(['students', 'queue', 'inboxes', 'bookings', 'fees'].map((p) => expect.objectContaining({ path: `/admin/placement/${p}`, inPlace: true })));
  });
});
