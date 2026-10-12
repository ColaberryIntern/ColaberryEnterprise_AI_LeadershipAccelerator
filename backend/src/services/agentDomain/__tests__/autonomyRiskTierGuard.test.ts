/**
 * T06 remediation: an autonomy value can never reach a risk-tier column.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * ## Why this file exists
 *
 * T06's acceptance criterion had four parts and shipped two. The discovery of risk-tier-bearing
 * columns from the models was real, and so was the control proving the discovery is non-empty.
 * Missing were the criterion's actual assertion -- "no autonomy value can be written to any of
 * them" -- and the fixture that writes `autonomy:R7` into a discovered column and fails.
 *
 * `RISK_TIER_BEARING_MODELS` was an inert `string[]` with no consumer anywhere in `src/`. Its
 * stand-in test asserted that `['R0'..'R5']` does not contain `'autonomy:R7'`, which proves the
 * two vocabularies are lexically disjoint -- a different claim, and one that cannot fail if code
 * actually assigns `autonomy:R7` to `tickets.risk_tier`.
 *
 * ## Why that write is the hard stop
 *
 * Both risk sinks fail OPEN on a value they do not recognise:
 *
 *   - `agentAutonomy.isHighRiskTier()` -> `if (idx === -1) return false`, so the approval is
 *     skipped rather than demanded.
 *   - `workGraph/capabilityRouter.riskTierIndex()` -> returns `0`, so every `maxRiskTier` ceiling
 *     is cleared.
 *
 * So an autonomy value landing in a risk-tier column removes two guards and logs nothing. The
 * namespacing makes the collision impossible to reach by accident; this guard makes it impossible
 * to reach on purpose.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AUTONOMY_STAGES,
  AUTONOMY_LEVELS,
  RISK_TIER_BEARING_MODELS,
  RISK_TIER_COLUMN,
  AutonomyInRiskTierColumnError,
  assertNoAutonomyInRiskTierColumn,
} from '../autonomyLadder';

const MODELS_DIR = path.join(__dirname, '..', '..', '..', 'models');

/**
 * The models that actually declare a `risk_tier`, DISCOVERED from the filesystem rather than
 * copied from a list. A hardcoded list would silently miss a seventh model.
 */
function discoverRiskTierModels(): string[] {
  const files = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.ts'));
  return files
    .filter((f) => /\brisk_tier\b/.test(fs.readFileSync(path.join(MODELS_DIR, f), 'utf8')))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

describe('the discovery itself', () => {
  const discovered = discoverRiskTierModels();

  it('POSITIVE CONTROL: there are models to scan, and some of them carry the column', () => {
    // A zero here would make everything below pass over an empty set.
    expect(fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.ts')).length).toBeGreaterThan(20);
    expect(discovered.length).toBeGreaterThan(0);
  });

  it('what the models declare matches the documented list, in both directions', () => {
    expect(discovered).toEqual([...RISK_TIER_BEARING_MODELS].sort());
  });
});

describe('no autonomy value may be written to a discovered risk-tier column', () => {
  const discovered = discoverRiskTierModels();

  // THE FIXTURE THE CRITERION NAMED. Iterates the DISCOVERED models, not a literal list, so a
  // seventh model added later is covered the moment it declares the column.
  it.each(discovered)('%s.risk_tier refuses autonomy:R7', (model) => {
    expect(() => assertNoAutonomyInRiskTierColumn(model, RISK_TIER_COLUMN, 'autonomy:R7'))
      .toThrow(AutonomyInRiskTierColumnError);
  });

  it('refuses every one of the ten namespaced stages, on every discovered model', () => {
    for (const model of discovered) {
      for (const stage of AUTONOMY_STAGES) {
        expect(() => assertNoAutonomyInRiskTierColumn(model, RISK_TIER_COLUMN, stage))
          .toThrow(AutonomyInRiskTierColumnError);
      }
    }
  });

  it('refuses the BARE form too, which is the genuinely dangerous one', () => {
    // `R3` is lexically valid in the risk vocabulary, so it would be accepted without complaint
    // and then mean the wrong thing. That is the collision the namespace exists to prevent.
    for (const level of AUTONOMY_LEVELS) {
      expect(() => assertNoAutonomyInRiskTierColumn('Ticket', RISK_TIER_COLUMN, level))
        .toThrow(AutonomyInRiskTierColumnError);
    }
  });

  it('the refusal explains the fail-OPEN consequence rather than just saying no', () => {
    try {
      assertNoAutonomyInRiskTierColumn('Ticket', RISK_TIER_COLUMN, 'autonomy:R7');
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(AutonomyInRiskTierColumnError);
      const m = (e as Error).message;
      expect(m).toMatch(/Ticket\.risk_tier/);
      expect(m).toMatch(/fail OPEN/);
      expect(m).toMatch(/isHighRiskTier/);
      expect(m).toMatch(/riskTierIndex/);
      expect((e as AutonomyInRiskTierColumnError).error_class).toBe('AutonomyInRiskTierColumnError');
    }
  });

  it('a REAL risk tier passes, so the guard is a guard and not a wall', () => {
    // An earlier version of this test looped over ['R0'..'R5'] asserting the array contained
    // each one -- a tautology wearing a control's name, which is the defect this run keeps
    // finding in its own work. Removed in favour of assertions that can fail.
    //
    // Note that bare R0-R5 ARE refused above, by design: unqualified, the value is ambiguous
    // between the two ladders, and fail-closed means refusing it. What must pass is a value that
    // is unambiguously a risk tier -- which in this repo is the descriptive form.
    expect(() => assertNoAutonomyInRiskTierColumn(
      'Ticket', RISK_TIER_COLUMN, 'schema_security_or_external_side_effect',
    )).not.toThrow();
    expect(() => assertNoAutonomyInRiskTierColumn('Ticket', RISK_TIER_COLUMN, null)).not.toThrow();
    expect(() => assertNoAutonomyInRiskTierColumn('Ticket', RISK_TIER_COLUMN, undefined)).not.toThrow();
    expect(() => assertNoAutonomyInRiskTierColumn('Ticket', RISK_TIER_COLUMN, 'R99')).not.toThrow();
  });

  it('leaves every OTHER column alone', () => {
    // The guard is scoped to the one column. It is not a general-purpose value filter.
    for (const col of ['autonomy_level', 'stage', 'status', 'tier']) {
      expect(() => assertNoAutonomyInRiskTierColumn('Ticket', col, 'autonomy:R7')).not.toThrow();
    }
  });
});

describe('no source file assigns an autonomy value to a risk_tier field', () => {
  function tsFilesUnder(dir: string, acc: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      // `__tests__` is excluded deliberately and narrowly. A test file CONTAINS this pattern on
      // purpose -- the positive control below plants one -- and the first run of this sweep
      // flagged its own fixture, which is the same false positive as a detector matching a term
      // inside its own banned-word list. What matters is production source.
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '__tests__') tsFilesUnder(p, acc);
      else if (e.isFile() && e.name.endsWith('.ts')) acc.push(p);
    }
    return acc;
  }

  const SRC = path.join(__dirname, '..', '..', '..');
  const files = tsFilesUnder(SRC);

  it('POSITIVE CONTROL: the sweep has a real corpus and excludes only __tests__', () => {
    expect(files.length).toBeGreaterThan(500);
    expect(files.some((f) => f.includes('__tests__'))).toBe(false);
    // The exclusion is one directory name, not a broad filter that could hide real code.
    expect(files.some((f) => f.includes(`${path.sep}models${path.sep}`))).toBe(true);
    expect(files.some((f) => f.includes(`${path.sep}services${path.sep}`))).toBe(true);
  });

  it('finds no risk_tier assignment carrying an autonomy value', () => {
    const offenders: string[] = [];
    const PATTERN = /risk_tier\s*[:=]\s*['"`](?:autonomy:)?R\d['"`]/g;
    for (const f of files) {
      // `grep -a` equivalent: three .ts files in this repo carry NUL bytes, and reading them as
      // utf8 is fine for a regex sweep.
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(PATTERN)) {
        // An `autonomy:`-prefixed value is always wrong here. A bare R0-R5 is the platform's own
        // risk vocabulary and is correct, so only the prefixed form is an offence.
        if (m[0].includes('autonomy:')) offenders.push(`${path.relative(SRC, f)}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: the sweep would catch a planted assignment', () => {
    const PATTERN = /risk_tier\s*[:=]\s*['"`](?:autonomy:)?R\d['"`]/g;
    const planted = "await Ticket.create({ risk_tier: 'autonomy:R7' });";
    const hits = [...planted.matchAll(PATTERN)].filter((m) => m[0].includes('autonomy:'));
    expect(hits).toHaveLength(1);
  });
});
