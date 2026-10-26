import fs from 'fs';
import path from 'path';
import { CAMPUS_AREAS, isCampusArea } from '../campusAreas';

// The frontend catalog is the source of the building ids. Read as text (it is a frontend module).
const CATALOG = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'components', 'campus', 'campusMap.ts'), 'utf8');
const frontendIds = (): string[] => {
  const block = CATALOG.slice(CATALOG.indexOf('CAMPUS_BUILDINGS'));
  return Array.from(block.matchAll(/\{\s*id:\s*'([a-z]+)'/g)).map((m) => m[1]);
};

describe('CAMPUS_AREAS', () => {
  it('equals the frontend catalog building ids exactly (no drift either way)', () => {
    const ids = frontendIds();
    expect(ids.length).toBe(14); // C21: + admissions; C39: + chow
    expect([...CAMPUS_AREAS].sort()).toEqual([...ids].sort());
  });

  it('isCampusArea accepts catalog ids only', () => {
    expect(isCampusArea('library')).toBe(true);
    expect(isCampusArea('Library')).toBe(false);
    expect(isCampusArea('dungeon')).toBe(false);
    expect(isCampusArea('')).toBe(false);
    expect(isCampusArea(undefined)).toBe(false);
    expect(isCampusArea(7)).toBe(false);
  });
});
