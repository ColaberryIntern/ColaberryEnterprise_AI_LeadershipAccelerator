import fs from 'fs';
import path from 'path';

/**
 * These two sections assert counts that live in the BACKEND seeder. Nothing in
 * the frontend build would notice if the seeder changed, so the page would go
 * on claiming eleven competencies and nine ranks after they stopped being true.
 *
 * That failure mode is the exact one this page criticises, so it gets a test
 * that reads the seeder rather than a constant copied from it.
 */

const SEEDER = path.join(__dirname, '../../../../../backend/src/services/progression/seeders.ts');
const AX = path.join(__dirname, '../ArchitectExperience.tsx');
const OS = path.join(__dirname, '../CapabilityOS.tsx');

const read = (p: string): string => fs.readFileSync(p, 'utf8');

describe('platform sections 1 and 5 against the progression seeder', () => {
  const seeder = read(SEEDER);

  const seededCompetencies = Array.from(
    seeder.matchAll(/\{\s*domain_id:\s*'([a-z_]+)',\s*name:\s*'([^']+)'/g),
  ).map((m) => ({ slug: m[1], name: m[2] }));

  const seededRanks = Array.from(seeder.matchAll(/\{\s*slug:\s*'[a-z_]+',\s*rank:\s*(\d+)/g));

  it('the seeder still defines 11 competencies and 9 ranks', () => {
    expect(seededCompetencies).toHaveLength(11);
    expect(seededRanks).toHaveLength(9);
  });

  it('the radar plots one point per seeded competency', () => {
    const ax = read(AX);
    const plotted = Array.from(ax.matchAll(/\{\s*name:\s*'([^']+)',\s*score:\s*(\d+)\s*\}/g));
    expect(plotted).toHaveLength(seededCompetencies.length);
  });

  it('every radar label maps to a real seeded competency, none invented', () => {
    const ax = read(AX);
    const plotted = Array.from(ax.matchAll(/\{\s*name:\s*'([^']+)',\s*score:\s*\d+\s*\}/g))
      .map((m) => m[1]);

    // Labels are shortened for the axis ("Prompt Eng."), so compare on the stem.
    const stem = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 6);
    const seededStems = seededCompetencies.map((c) => stem(c.name));

    plotted.forEach((label) => {
      expect(seededStems).toContain(stem(label));
    });
  });

  it('scores are plausible proficiencies, so the polygon cannot escape the outer ring', () => {
    const ax = read(AX);
    Array.from(ax.matchAll(/score:\s*(\d+)/g)).forEach((m) => {
      const n = Number(m[1]);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(100);
    });
  });

  it('the overall percentage is derived, never typed in', () => {
    const ax = read(AX);
    // If someone hardcodes the ring number, the shape and the number can drift
    // apart -- which is the one thing this section promises cannot happen.
    expect(ax).toMatch(/const overall = Math\.round\(/);
    expect(ax).toContain('COMPS.reduce');
    expect(ax).not.toMatch(/\{overall\}% overall.*\d\d%/);
  });

  it('the OS diagram quotes the seeded counts, not the prototype’s wrong ones', () => {
    const os = read(OS);
    expect(os).toContain("v: '9 ranks'");
    expect(os).toContain("v: '11'");
    // The prototype said ten competencies. It must not come back.
    expect(os).not.toContain("v: '10'");
  });
});
