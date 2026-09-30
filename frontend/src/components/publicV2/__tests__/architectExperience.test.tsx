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

  it('section 4 quotes the real Engineer gate thresholds', () => {
    const rc = read(path.join(__dirname, '../ReceiptsDrilldown.tsx'));

    // seeders.ts rank 5 (engineer). If anyone edits the seeder, the marketing
    // page must not go on quoting the old numbers.
    const eng = seeder.match(/slug: 'engineer', rank: 5[^\r\n]*/);
    expect(eng).not.toBeNull();
    const line = (eng as RegExpMatchArray)[0];

    const need = (k: string): string => {
      const m = line.match(new RegExp(`${k}: (\\d+)`));
      expect(m).not.toBeNull();
      return (m as RegExpMatchArray)[1];
    };

    expect(rc).toContain(`21 of ${need('min_evidence')}`);
    expect(rc).toContain(`5 of ${need('min_artifacts')}`);
    expect(rc).toContain(`9 of ${need('min_github')}`);
    expect(line).toContain('requires_ai_approval: true');
    // The approval is automated. The page must never call it a human signature.
    expect(rc).toContain('automated');
    expect(rc).not.toMatch(/human[- ]reviewed|human signature|humans remain accountable/i);
  });

  it('neither new section reintroduces the department tier', () => {
    // OrgMemberDetail.team is `string | null`; there is no department rollup.
    const rc = read(path.join(__dirname, '../ReceiptsDrilldown.tsx'));
    const tx = read(path.join(__dirname, '../TwoExperiences.tsx'));
    [rc, tx].forEach((src) => {
      const body = src.slice(src.indexOf('export default'));
      expect(body).not.toMatch(/[Dd]epartment/);
    });
  });

  it('section 4 does not promise a click through to the commit', () => {
    const rc = read(path.join(__dirname, '../ReceiptsDrilldown.tsx'));
    const body = rc.slice(rc.indexOf('export default'));
    expect(body).not.toMatch(/until you are looking at the commit|down to the line of code/i);
    expect(body).toContain('does not');
  });
});
