/**
 * The Program, Intelligence and System groups moved from adminNav.ts into adminNavProgramGroups.ts (AO1.2,
 * 2026-11-27) to keep adminNav.ts under the 500-line ceiling. The Campus HQ floors are numbered from
 * NAV_GROUPS order (hqModel.ts), so order matters.
 *
 * The fixture is NAV_GROUPS exactly as it stood on origin/main 8fec472e6 before the move (13 groups). New groups
 * or links may be added, but every pinned group must still exist with its section and links, in the same
 * relative order.
 */
import pinned from './fixtures/navGroups.pinned.json';
import { NAV_GROUPS } from '../adminNav';
import { PROGRAM_NAV_GROUPS } from '../adminNavProgramGroups';

interface PinnedGroup { label: string | null; section: string; paths: string[] }

describe('NAV_GROUPS survives the split', () => {
  const fixture = pinned as PinnedGroup[];

  it('keeps every pinned group, in order, with its section and links in order', () => {
    let cursor = -1;
    for (const g of fixture) {
      const at = NAV_GROUPS.findIndex((x, i) => i > cursor && x.label === g.label && x.section === g.section);
      expect({ group: g.label, found: at > cursor }).toEqual({ group: g.label, found: true });
      const paths = NAV_GROUPS[at].links.map((l) => l.path);
      let linkCursor = -1;
      for (const p of g.paths) {
        const li = paths.findIndex((x, i) => i > linkCursor && x === p);
        expect({ group: g.label, path: p, found: li > linkCursor }).toEqual({ group: g.label, path: p, found: true });
        linkCursor = li;
      }
      cursor = at;
    }
  });

  it('spreads the moved groups into NAV_GROUPS rather than dropping them', () => {
    for (const g of PROGRAM_NAV_GROUPS) expect(NAV_GROUPS).toContain(g);
  });

  it('pins a non-empty fixture', () => {
    expect(fixture.length).toBeGreaterThan(10);
  });
});
