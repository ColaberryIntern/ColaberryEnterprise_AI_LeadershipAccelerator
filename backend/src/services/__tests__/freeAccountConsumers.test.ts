import * as fs from 'fs';
import * as path from 'path';
import {
  classify,
  stripComments,
  enumerateConsumers,
} from '../../scripts/enumerateFreeAccountConsumers';

/**
 * Phase 2 T202a. Pins the generated consumer enumeration to the committed
 * artifact, so a new reader of `enrollment_type` or an enrollment's `tier`
 * cannot arrive without someone deciding what it means.
 *
 * WHY A TRIPWIRE AND NOT A DOCUMENT. Three revisions of the Phase 2 plan
 * carried a hand-written consumer list and it was short every time — one
 * missing consumer found by the first audit, two more by the second, and a
 * direct count showing 33 files where the plan named 8. The cost of being short
 * is an untested behaviour change on a public signup path, so the list is
 * generated and this suite fails when the generated list and the committed one
 * disagree.
 *
 * The scanner is the load-bearing part, so it is checked before it is trusted:
 * a scanner that matches nothing passes while checking nothing.
 */
const DOC = path.join(__dirname, '..', '..', '..', '..', 'docs', 'growth-os-reset', 'FREE_ACCOUNT_CONSUMERS.md');

describe('free-account consumer enumeration (T202a)', () => {
  const doc = fs.readFileSync(DOC, 'utf8');
  const rows = enumerateConsumers();
  const branching = rows.filter((r) => r.branching);
  const reporting = rows.filter((r) => !r.branching);

  describe('the scanner itself can fail', () => {
    it('classifies a real comparison as branching', () => {
      const c = classify(`if (e.enrollment_type === 'explorer') return 1;`);
      expect(c.branching).toBe(true);
    });

    it('classifies a query filter as branching', () => {
      const c = classify(`where: { enrollment_type: 'explorer', status: 'active' }`);
      expect(c.branching).toBe(true);
    });

    it('classifies an enrollment tier comparison as branching', () => {
      const c = classify(`const isStudent = enrollment.tier === 'member';`);
      expect(c.branching).toBe(true);
    });

    it('classifies a Sequelize operator object as branching — the form that misfiled cohortService', () => {
      // `cohortService.ts:431` filters three dashboard counts on exactly this,
      // and the original rules all expected a quote after the colon, so the file
      // was classified reporting-only: present in the artifact, and therefore
      // passing the completeness tripwire, while silently exempt from needing a
      // behaviour test.
      const c = classify(`const notExplorer = { enrollment_type: { [Op.ne]: 'explorer' } };`);
      expect(c.branching).toBe(true);
    });

    it('classifies a tier operator object as branching too', () => {
      const c = classify(`where: { tier: { [Op.in]: ['guest'] } }`);
      expect(c.branching).toBe(true);
    });

    it('does NOT classify a comment as branching — the bug that inflated the first scan', () => {
      const c = classify(`// not just enrollment_type='explorer', also staff\nexport const x = 1;`);
      expect(c.branching).toBe(false);
    });

    it('does NOT classify a block comment as branching', () => {
      const c = classify(`/* gate ONLY enrollment_type='explorer' here */\nexport const y = 2;`);
      expect(c.branching).toBe(false);
    });

    it('does NOT count an unrelated "tier" as a consumer — the bug that produced 277 rows', () => {
      // No enrollment anywhere in the file: a build tier is not an enrollment tier.
      const c = classify(`export const buildTiers = { free: 1 }; const t = plan.tier;`);
      expect(c.mentions).toBe(false);
    });

    it('DOES count a tier read in an enrollment context', () => {
      const c = classify(`const enrollment = await Enrollment.findByPk(id); return enrollment.tier;`);
      expect(c.mentions).toBe(true);
    });

    it('stripComments blanks a whole-line comment without moving line numbers', () => {
      const src = `// enrollment_type === 'explorer'\nconst b = 2;`;
      const out = stripComments(src);
      expect(out.split('\n')).toHaveLength(2);
      expect(out).not.toContain('explorer');
      expect(out).toContain('const b = 2;');
    });

    it('stripComments KEEPS a trailing comment, deliberately — over-counting is the safe direction', () => {
      // The line still contains real code, and a stripper that tried to split
      // code from trailing comment would need to know whether the `//` is inside
      // a string. Keeping it means a mention in a trailing comment is counted as
      // real: a false positive, which costs a test, rather than a false negative,
      // which costs a missed consumer.
      const src = `const a = 1; // enrollment_type === 'explorer'`;
      expect(stripComments(src)).toContain('explorer');
    });

    it('stripComments never swallows code past its own line — the server.ts under-count', () => {
      // The first version matched block comments across lines and was fooled by
      // the same two characters inside a string, removing 61% of server.ts.
      const src = [
        `const sql = 'SELECT /* not a comment */ 1';`,
        `const keep = "enrollment_type";`,
      ].join('\n');
      const out = stripComments(src);
      expect(out).toContain('enrollment_type');
      expect(out).toContain('const sql');
    });

    it('stripComments leaves a URL\'s double slash alone', () => {
      const src = `const u = 'https://example.com/x'; const tier = 'guest';`;
      expect(stripComments(src)).toContain('guest');
    });
  });

  describe('the scan found a real, non-empty population', () => {
    it('finds branching and reporting consumers, not zero', () => {
      expect(branching.length).toBeGreaterThan(20);
      expect(reporting.length).toBeGreaterThan(5);
    });

    it('finds the consumers two audit cycles had to point out, by name', () => {
      const files = branching.map((r) => r.file);
      // Cycle 1 found this one missing from every task.
      expect(files).toContain('services/cape/capeTodayPlanService.ts');
      // Cycle 2 found these two.
      expect(files).toContain('services/personHistoryService.ts');
      expect(files).toContain('services/subscriptionRosterService.ts');
      // Found during execution, in no audit cycle.
      expect(files).toContain('services/leads/prospectAccount.ts');
      // The gate the whole phase is about.
      expect(files).toContain('services/explorerGrowth/explorerIdentityBridge.ts');
    });

    it('every branching row carries evidence that is real code, not an empty string', () => {
      for (const r of branching) {
        expect(r.evidence.length).toBeGreaterThan(0);
      }
    });
  });

  describe('the committed artifact matches the generated scan', () => {
    it('documents every branching file the scan finds', () => {
      const missing = branching.map((r) => r.file).filter((f) => !doc.includes(f));
      expect(missing).toEqual([]);
    });

    it('documents every reporting file the scan finds', () => {
      const missing = reporting.map((r) => r.file).filter((f) => !doc.includes(f));
      expect(missing).toEqual([]);
    });

    it('states the branching and reporting counts the scan actually produced', () => {
      expect(doc).toContain(`## BRANCHING — ${branching.length} files`);
      expect(doc).toContain(`## REPORTING — ${reporting.length} files`);
    });

    it('gives every branching file a determination, so no row can be silently skipped', () => {
      // Each branching file gets a table row; a row with no determination text
      // after the file name is an undecided consumer.
      // Collected rather than asserted one at a time, so a failure names the
      // offending file instead of only a length.
      const undecided: string[] = [];
      for (const r of branching) {
        const line = doc.split('\n').find((l) => l.includes(`\`${r.file}\``) && l.startsWith('|'));
        if (!line) {
          undecided.push(`${r.file} — no table row`);
          continue;
        }
        // Split on UNESCAPED pipes only: several determinations quote a type
        // union like 'guest' \| 'member', and a plain split('|') lands on the
        // wrong cell for exactly those rows.
        const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
        const determination = cells[cells.length - 2] ?? '';
        if (determination.length <= 20) {
          undecided.push(`${r.file} — determination too short: "${determination}"`);
        }
      }
      expect(undecided).toEqual([]);
    });

    /**
     * The first draft's two tallies were off by one in compensating directions,
     * so they still summed to the branching count and the arithmetic validated
     * itself. Counting from the parsed cells makes that impossible: the parts
     * must sum to the whole AND each part must match what the document claims.
     */
    describe('the per-population tallies are derived, not asserted', () => {
      const rows = doc.split('\n').filter((l) => /^\| \d+ \| `/.test(l));
      const cellsOf = (l: string) => l.split(/(?<!\\)\|/).map((c) => c.trim());
      const aChanges = rows.filter((l) => cellsOf(l)[4] === '**CHANGES**');
      const bChanges = rows.filter((l) => cellsOf(l)[5] === '**CHANGES**');
      const writers = rows.filter((l) => cellsOf(l)[4] === 'writer');
      const unchanged = rows.filter((l) => cellsOf(l)[4] === 'unchanged' && cellsOf(l)[5] === 'unchanged');

      it('the table has one row per branching file', () => {
        expect(rows).toHaveLength(branching.length);
      });

      it('the four tallies sum to the branching count, with nothing uncategorised', () => {
        expect(aChanges.length + bChanges.length + writers.length + unchanged.length).toBe(rows.length);
      });

      it('the document states the tally it actually has for population A', () => {
        expect(doc).toContain(`| Changes for population A | **${aChanges.length}** |`);
      });

      it('the document states the tally it actually has for population B', () => {
        expect(doc).toContain(`| Changes for population B | **${bChanges.length}**`);
      });

      it('the document states the writer and unchanged tallies it actually has', () => {
        expect(doc).toContain(`| Writers | **${writers.length}** |`);
        expect(doc).toContain(`| Unchanged, with a stated reason | **${unchanged.length}** |`);
      });
    });
  });
});
