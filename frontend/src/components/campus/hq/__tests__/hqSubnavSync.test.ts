/**
 * C92 (Ali, 2026-10-30: "make sure the 2 are in sync and stay in sync"): the Campus HQ building shows the admin sidebar's live
 * sub-lists (Interns -> Gov Contracts, Agents) from the same declaration (adminNav.ts `subLists`) and the same mapping
 * (adminSubNav.ts), the sidebar renders them generically from that declaration (no hard-coded group), and the Management
 * Portal bridge opens their pages without becoming an open redirect.
 */
import fs from 'fs';
import path from 'path';
import { buildHq } from '../hqModel';
import { NAV_GROUPS, PINNED_LINKS, type NavGroup } from '../../../Layout/adminNav';
import { subNavEntries, type NavSubCards } from '../../../Layout/adminSubNav';
import { allowedMgmtNext, mgmtBridgeTo } from '../../../../pages/portal/mgmtNext';

const GOV = { key: 'gov-1', title: 'Statewide Victim-Centered', deliveryProjectId: '11111111-2222-4333-8444-555555555555', hasActiveIntern: true, closeDate: null, assignedInterns: [{ name: 'Omolola Makinde' }] };
const AGENT = { domainKey: 'curriculum', title: 'Curriculum, Learning & Content', built: false, agentId: null, intendedBuilder: 'Ruth Kumera', managerEmail: null };
const CARDS = { gov: [GOV], agents: [AGENT] } as unknown as NavSubCards;
const ALL = () => true;
const interns = (hq: ReturnType<typeof buildHq>) => hq.floors.find((f) => f.label === 'Interns')!;

describe('the building shows the sidebar sub-lists, for the same person', () => {
  it('the Interns floor has the Interns room, then each Gov Contract and each Agent, opening their admin pages', () => {
    const rooms = interns(buildHq(ALL, true, 'staff', undefined, undefined, undefined, CARDS)).rooms;
    expect(rooms.map((r) => r.label)).toEqual(['Interns', 'Statewide Victim-Centered', 'Curriculum, Learning & Content']);
    expect(rooms[1]).toMatchObject({ path: '/admin/internship/gov-contract/11111111-2222-4333-8444-555555555555', section: 'gov_contracts', open: true, newTab: true });
    expect(rooms[2]).toMatchObject({ path: '/admin/internship/agent/curriculum', section: 'agents', open: true });
  });
  it('a sub-list whose section the person does not hold is not shown (the sidebar does not show it either)', () => {
    const rooms = interns(buildHq((s) => s === 'internship', true, 'staff', undefined, undefined, undefined, CARDS)).rooms;
    expect(rooms.map((r) => r.label)).toEqual(['Interns']);
  });
  it('no cards (not loaded, or failed) = the static rooms only, never a guessed list; learners never get sub-items', () => {
    expect(interns(buildHq(ALL, true, 'staff')).rooms.map((r) => r.label)).toEqual(['Interns']);
    expect(interns(buildHq(ALL, false, 'member', undefined, undefined, undefined, CARDS)).rooms.map((r) => r.label)).toEqual(['Interns']);
  });
});

describe('drift guard: every sidebar sub-list reaches the building with no other edit', () => {
  it('for every group declaring sub-lists, the floor = its links + the same entries the sidebar maps', () => {
    const hq = buildHq(ALL, true, 'staff', undefined, undefined, undefined, CARDS);
    const top = NAV_GROUPS.length + 1;
    NAV_GROUPS.forEach((g: NavGroup, i) => {
      const fl = hq.floors.find((f) => f.num === String(top - i))!;
      const expected = [...g.links.map((l) => l.path), ...(g.subLists ?? []).flatMap((sl) => subNavEntries(sl.source, CARDS).map((e) => e.to))];
      expect(fl.rooms.map((r) => r.path)).toEqual(expected);
    });
    expect(hq.floors[0].rooms.length).toBe(PINNED_LINKS.length);
  });
  it('a NEW sub-list declared on any group appears on that floor (injected nav)', () => {
    const nav = { pinned: [], groups: [{ label: 'Lab', section: 'program', links: [], subLists: [{ source: 'agents' as const, label: 'Agents', section: 'agents', icon: 'robot-2-line', paths: [] }] }] };
    expect(buildHq(ALL, true, 'staff', nav, undefined, undefined, CARDS).floors[1].rooms.map((r) => r.label)).toEqual(['Curriculum, Learning & Content']);
  });
  it('the admin sidebar renders sub-lists from the declaration, not from a hard-coded group', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Layout', 'AdminLayout.tsx'), 'utf8');
    expect(src).toContain('group.subLists');
    expect(src).not.toMatch(/label === 'Interns'/);
  });
});

describe('the Management Portal bridge opens sub-list pages, and nothing else new', () => {
  it('a contract or agent page is allowed; extra segments, other hosts and queries are not', () => {
    expect(allowedMgmtNext('?next=' + encodeURIComponent('/admin/internship/gov-contract/11111111-2222-4333-8444-555555555555'))).toBe('/admin/internship/gov-contract/11111111-2222-4333-8444-555555555555');
    expect(allowedMgmtNext('?next=' + encodeURIComponent('/admin/agents/abc_123'))).toBe('/admin/agents/abc_123');
    expect(allowedMgmtNext('?next=' + encodeURIComponent('/admin/internship/agent/curriculum'))).toBe('/admin/internship/agent/curriculum');
    for (const bad of ['/admin/agents/a/b', '//evil.example/admin/agents/x', 'https://evil.example', '/admin/agents/x?y=1', '/admin/agents/', '/admin/internship/gov-contract/../people']) {
      expect(allowedMgmtNext('?next=' + encodeURIComponent(bad))).toBeNull();
    }
    expect(mgmtBridgeTo('/admin/agents/abc')).toBe('/portal/mgmt-enter?next=%2Fadmin%2Fagents%2Fabc');
    expect(mgmtBridgeTo('/admin/agents/a/b')).toBe('/portal/mgmt-enter');
  });
});
