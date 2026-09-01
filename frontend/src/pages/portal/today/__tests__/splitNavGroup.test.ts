import React from 'react';
import { splitNavGroup, NAV_PRIMARY_COUNT, NAV_GROUPS } from '../PortalShell';

/**
 * The sidebar collapse rule. Group ORDER is load-bearing here — the first
 * NAV_PRIMARY_COUNT items are what a learner sees before "More" — so these
 * tests pin the ordering as well as the split.
 */

const icon = React.createElement('svg');
const item = (label: string, to?: string) => ({ label, to, icon });

describe('splitNavGroup', () => {
  const items = [item('A', '/a'), item('B', '/b'), item('C', '/c'), item('D', '/d')];

  it('shows only the first two and hides the rest when collapsed', () => {
    const r = splitNavGroup(items, false);
    expect(r.shown.map((i) => i.label)).toEqual(['A', 'B']);
    expect(r.hidden.map((i) => i.label)).toEqual(['C', 'D']);
  });

  it('shows everything when expanded, with nothing left hidden', () => {
    const r = splitNavGroup(items, true);
    expect(r.shown).toHaveLength(4);
    expect(r.hidden).toHaveLength(0);
  });

  it('leaves a short group untouched and offers no toggle', () => {
    const two = [item('A', '/a'), item('B', '/b')];
    const r = splitNavGroup(two, false);
    expect(r.shown).toHaveLength(2);
    expect(r.hidden).toHaveLength(0);
  });

  it('force-opens the group when the ACTIVE page is in the overflow', () => {
    // Otherwise a learner on /d sees no highlighted item anywhere and cannot
    // tell where they are.
    const r = splitNavGroup(items, false, '/d');
    expect(r.activeIsHidden).toBe(true);
    expect(r.shown.map((i) => i.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(r.hidden).toHaveLength(0);
  });

  it('force-opens for a nested route under a hidden item', () => {
    const r = splitNavGroup(items, false, '/d/123');
    expect(r.activeIsHidden).toBe(true);
  });

  it('stays collapsed when the active page is already one of the primaries', () => {
    const r = splitNavGroup(items, false, '/a');
    expect(r.activeIsHidden).toBe(false);
    expect(r.shown.map((i) => i.label)).toEqual(['A', 'B']);
  });

  it('ignores items with no route when matching the active page', () => {
    const withSoon = [item('A', '/a'), item('B', '/b'), { label: 'Soon', icon }];
    expect(splitNavGroup(withSoon, false, '/a').activeIsHidden).toBe(false);
  });
});

describe('NAV_GROUPS default visibility', () => {
  const firstTwo = (grp: string) =>
    NAV_GROUPS.find((g) => g.grp === grp)!.items.slice(0, NAV_PRIMARY_COUNT).map((i) => i.label);

  it('defaults each group to the two requested destinations', () => {
    expect(firstTwo('Your day')).toEqual(['Today', 'Schedule']);
    expect(firstTwo('Build and learn')).toEqual(['Classroom', 'Projects']);
    expect(firstTwo('Belong')).toEqual(['Community', 'Rooms']);
  });

  it('keeps every other destination reachable in the overflow, none dropped', () => {
    const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
    ['Path', 'Events', 'Cert Prep', 'People', 'Library', 'Portfolio'].forEach((label) => {
      expect(all).toContain(label);
    });
  });

  it('has Events routed, since the Next event chip links to it', () => {
    const events = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Events');
    expect(events?.to).toBe('/portal/events');
  });
});
