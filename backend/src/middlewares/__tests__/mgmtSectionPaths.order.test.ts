/**
 * PATH_SECTION moved out of mgmtSectionGate.ts into mgmtSectionPaths.ts (AO1.2, 2026-11-27) to keep the gate
 * under the 500-line ceiling. pathToSection returns the FIRST matching prefix, so ORDER IS LOAD-BEARING: a
 * reordered row silently changes who gets a 403.
 *
 * The fixture is the table exactly as it stood on origin/main 8fec472e6 before the move (101 rows). New rows
 * may be added anywhere, but every pinned row must still be present, with the same section, in the same
 * relative order. Changing a pinned row is a deliberate access change: update the fixture in the same diff.
 */
import pinned from './fixtures/pathSection.pinned.json';
import { PATH_SECTION } from '../mgmtSectionPaths';
import { pathToSection } from '../mgmtSectionGate';

type Row = [string, string];

describe('PATH_SECTION survives the move out of the gate', () => {
  const rows = PATH_SECTION as Row[];
  const fixture = pinned as Row[];

  it('keeps every pinned row with its section', () => {
    for (const [prefix, section] of fixture) {
      expect(rows.some(([p, s]) => p === prefix && s === section)).toBe(true);
    }
  });

  it('keeps the pinned rows in the same relative order', () => {
    let cursor = -1;
    for (const [prefix, section] of fixture) {
      const at = rows.findIndex(([p, s], i) => i > cursor && p === prefix && s === section);
      expect({ prefix, found: at > cursor }).toEqual({ prefix, found: true });
      cursor = at;
    }
  });

  it('is the table the gate actually consults', () => {
    const [prefix, section] = fixture[0];
    expect(pathToSection(prefix)).toBe(section);
    expect(pathToSection(`${prefix}/anything`)).toBe(section);
  });

  it('pins a non-empty table (a broken fixture must not pass vacuously)', () => {
    expect(fixture.length).toBeGreaterThan(90);
  });
});
