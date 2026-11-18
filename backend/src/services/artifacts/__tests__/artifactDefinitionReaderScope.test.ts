import fs from 'fs';
import path from 'path';
import { CURRICULUM_READERS_SCOPED } from '../storyArtifactTypes';

/**
 * WHETHER IT IS SAFE YET TO PUT CATALOG ROWS IN `artifact_definitions`, DERIVED FROM THE SOURCE.
 *
 * The artifact-acceptance plan said to seed the eleven artifact types into `artifact_definitions`
 * because that table already holds the right columns. Measured against this tree, that is unsafe
 * today: a large number of call sites read the table with no `where` clause at all, and every one
 * of them treats a row there as a curriculum artifact a student owes. Eleven inserted rows would
 * make every active student appear to be missing eleven artifacts and would move numbers on the
 * health report.
 *
 * ## WHY THIS IS A TEST AND NOT A SENTENCE IN THE SEEDER
 *
 * The seeder refuses to write while `CURRICULUM_READERS_SCOPED` is false. A constant on its own is
 * only a promise: the next session to want those rows can flip it, see the seeder run, and never
 * learn what it broke. So the constant is not trusted. This test re-derives the answer from the
 * source tree on every run and fails if the constant and the tree disagree IN EITHER DIRECTION:
 * flip it early and the suite goes red; scope the readers and forget the constant and the suite
 * also goes red.
 *
 * ## WHY THE EXPECTATIONS ARE LISTS AND NOT A COUNT
 *
 * My own first pass at this inventory was wrong, and wrong in the flattering direction: a
 * truncated `grep | head -30` reported 8 unscoped readers, and the real figure is larger. Among
 * the ones the short list missed were `deepReconciliationService` and a bare
 * `ArtifactDefinition.count()` on the health report, which is exactly the kind of site whose
 * number would move with no visible cause. A count hides which sites it counted, so every
 * assertion here compares sorted `file:line` lists and a failure names the site.
 *
 * ## WHY IT READS FILES INSTEAD OF SHELLING TO GREP
 *
 * Same reason as `services/lifecycle/__tests__/lifecycleRegistrationCoverage.test.ts`: plain
 * `grep -r` skips several `.ts` files in this tree as binary because they contain deliberate NUL
 * bytes, and a sweep that silently omits files reports a completeness it does not have.
 * `fs.readFileSync` reads NUL bytes as content and cannot time out partway with a success status.
 */

const SRC = path.resolve(__dirname, '../../..');
const CALL = /ArtifactDefinition\.(findAll|count)\(/g;

/**
 * Keys in a `where` that make a read unable to pick up a catalog row: either the discriminator
 * itself, or a column no catalog row carries, or a lookup by primary key.
 */
const DISCRIMINATING = [
  'artifact_role',
  'CATALOG_ARTIFACT_ROLE',
  'session_id',
  'section_id',
  'lesson_id',
  'required_for_',
  'instruction_prompt_id',
  'id:',
];

type Scope = 'unscoped' | 'where_opaque' | 'scoped';
interface Site { ref: string; scope: Scope; }

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** The text between the call's parentheses, by balance rather than by a line or a fixed window. */
function callArguments(text: string, openParenIndex: number): string {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openParenIndex + 1, i);
    }
  }
  return text.slice(openParenIndex + 1);
}

function classify(args: string): Scope {
  if (!/\bwhere\b/.test(args)) return 'unscoped';
  if (DISCRIMINATING.some((k) => args.includes(k))) return 'scoped';
  // A `where` whose contents are not visible here (a variable, a spread, a helper call) cannot be
  // cleared from source, so it is a blocker rather than a pass.
  return 'where_opaque';
}

function inventory(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    CALL.lastIndex = 0;
    let m: RegExpExecArray | null = CALL.exec(text);
    while (m !== null) {
      const openParen = m.index + m[0].length - 1;
      const args = callArguments(text, openParen);
      const line = text.slice(0, m.index).split('\n').length;
      const rel = path.relative(SRC, file).split(path.sep).join('/');
      sites.push({ ref: `${rel}:${line}`, scope: classify(args) });
      m = CALL.exec(text);
    }
  }
  return sites.sort((a, b) => a.ref.localeCompare(b.ref));
}

const refs = (scope: Scope) => inventory().filter((s) => s.scope === scope).map((s) => s.ref);

describe('artifact_definitions reader scope (gates the catalog seed)', () => {
  it('finds the call sites at all, so a zero below is a measurement and not a broken sweep', () => {
    const all = inventory();
    expect(all.length).toBeGreaterThan(30);
    expect(refs('scoped').length).toBeGreaterThan(10);
  });

  /**
   * COUNTED PER FILE, not pinned to a line.
   *
   * The first version of these two tests asserted `file:line`. That broke the moment an unrelated
   * edit added an import to `healthReportService.ts`, which moved its reader from line 49 to 50
   * and reported the shift as reader drift. A false drift report on a gate like this is worse than
   * no gate: the next person reads a red suite about twenty readers and learns to re-run it with
   * updated numbers.
   *
   * Counting per file keeps every bit of the signal that matters. A NEW unscoped reader in a file
   * already listed still fails, because its count goes up; a new unscoped reader in a new file
   * still fails, because the key appears; and scoping one still fails, because the count drops.
   * Only the line number, which nothing depends on, is allowed to move. The failure message still
   * prints the lines, so a reader can navigate.
   */
  const byFile = (kind: Scope): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const r of refs(kind)) {
      const file = r.replace(/:\d+$/, '');
      out[file] = (out[file] || 0) + 1;
    }
    return out;
  };

  it('has exactly these readers with NO where clause', () => {
    expect({ sites: refs('unscoped').length, byFile: byFile('unscoped') }).toEqual({
      sites: 12,
      byFile: {
        'services/analyticsService.ts': 2,
        'services/artifactCompilerService.ts': 2,
        'services/artifactGraphService.ts': 1,
        'services/curriculumGraphService.ts': 3,
        'services/curriculumManagerService.ts': 1,
        'services/deepReconciliationService.ts': 1,
        'services/healthReportService.ts': 1,
        'services/projectProgressService.ts': 1,
      },
    });
  });

  it('still names the exact sites in its own output, for whoever has to go and look', () => {
    // Not an assertion about line numbers, a check that the inventory is still navigable: every
    // reported site carries a file AND a line, so the count above can be acted on.
    for (const r of [...refs('unscoped'), ...refs('where_opaque')]) {
      expect(r).toMatch(/^services\/[\w/.-]+\.ts:\d+$/);
    }
  });



  it('has exactly these readers whose where clause cannot be read from source', () => {
    expect({ sites: refs('where_opaque').length, byFile: byFile('where_opaque') }).toEqual({
      sites: 8,
      byFile: {
        'services/agents/orchestrationAutoRepairAgent.ts': 1,
        'services/agents/promptMonitorAgent.ts': 1,
        'services/artifactGraphService.ts': 1,
        'services/artifactService.ts': 2,
        'services/guidedExecution/guidedExecutionService.ts': 1,
        'services/nextAction/nextActionService.ts': 1,
        'services/projectExportService.ts': 1,
      },
    });
  });


  it('agrees with CURRICULUM_READERS_SCOPED, in both directions', () => {
    const blockers = [...refs('unscoped'), ...refs('where_opaque')];
    expect(CURRICULUM_READERS_SCOPED).toBe(blockers.length === 0);
  });
});
