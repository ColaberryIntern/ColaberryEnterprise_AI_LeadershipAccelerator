/**
 * The snapshot's purity claim, ENFORCED rather than stated.
 *
 * ## What happened, and why a header comment was not enough
 *
 * `agentDomainSnapshot.ts` says of itself: *"Pure. No I/O, no clock, no randomness: the bridge
 * supplies every input."* That was true, and then one import line made it false.
 *
 * The line imported `candidatesSection` from `candidateService.ts`. That module imports
 * `models/AgentDomainCandidate`, which calls `.init(..., { sequelize })` at MODULE SCOPE. So
 * merely importing the snapshot now constructed a Sequelize model, and because
 * `agentDomainRoutes.ts` imports the snapshot, five untouched test suites — 138 tests — stopped
 * being able to run at all:
 *
 *     TypeError: Cannot read properties of undefined (reading 'define')
 *       at AgentDomainCandidate.init (src/models/AgentDomainCandidate.ts)
 *       at candidateService.ts
 *       at agentDomainSnapshot.ts        <- the added line
 *       at agentDomainRoutes.ts
 *
 * The producer's own test run passed, because it ran the new suites and not the five that already
 * existed. A claim in a comment cannot fail; this file can.
 *
 * ## What is asserted, and why it is the import GRAPH rather than one line
 *
 * A direct `../../models` import is the obvious form and not the one that bit. The real rule is
 * that nothing the snapshot imports may reach a model, so the check walks the transitive graph of
 * first-party imports and fails naming the path it found.
 */

import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '..');
const ENTRY = 'agentDomainSnapshot.ts';

/**
 * First-party relative VALUE imports of one file, as paths on disk.
 *
 * `import type` is excluded deliberately, and the distinction is the whole point rather than a
 * convenience: a type-only import is ERASED by TypeScript, so it creates no runtime edge and
 * cannot run anybody's module-scope `.init()`. Counting one would have failed this test on
 * `candidateSection.ts -> ensureAgentDomainCandidateSchema.ts`, an edge that does not exist at
 * runtime, and the only way to make it pass would have been to weaken the assertion that matters.
 *
 * The regression this file exists for came through a VALUE import — `candidatesSection` is a
 * function — so narrowing to value imports loses nothing. A mutation proof below confirms it.
 */
function importsOf(file: string): string[] {
  const src = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // Whole-clause type imports: `import type { X } from '...'` / `import type X from '...'`.
    .replace(/import\s+type\s+[\s\S]*?from\s+'[^']+';/g, '');
  const specs = [...src.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => m[1]);
  return specs
    .map((spec) => path.resolve(path.dirname(file), spec))
    // A specifier resolves either to a FILE (`./candidateSection` -> `candidateSection.ts`) or to
    // a DIRECTORY with a barrel (`../../models` -> `models/index.ts`). The first version of this
    // walker handled only the file form, so a directory specifier failed `.endsWith('.ts')` and
    // was dropped silently — which meant the single most obvious form of the regression this file
    // exists to catch, `import { AgentDomainCandidate } from '../../models'`, was INVISIBLE to it.
    // T004's verifier proved that by injecting exactly that line: the guard passed 5 of 5 while
    // the original 138-test breakage was fully reintroduced. The directory form is used 207 times
    // elsewhere under `backend/src/services`, so this was a live hole, not a hypothetical one.
    .map((p) => {
      if (fs.existsSync(`${p}.ts`)) return `${p}.ts`;
      if (fs.existsSync(path.join(p, 'index.ts'))) return path.join(p, 'index.ts');
      return p;
    })
    .filter((p) => p.endsWith('.ts') && fs.existsSync(p));
}

/** Every first-party module the entry point reaches, and the path it took to each. */
function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>([[entry, [path.basename(entry)]]]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    const trail = seen.get(file) as string[];
    for (const next of importsOf(file)) {
      if (seen.has(next)) continue;
      seen.set(next, [...trail, path.basename(next)]);
      queue.push(next);
    }
  }
  return seen;
}

const GRAPH = reachable(path.join(DIR, ENTRY));

describe('the snapshot reaches no Sequelize model', () => {
  it('POSITIVE CONTROL: the walker really does walk, so an empty result would mean something', () => {
    // More than the entry file, and specifically the modules the snapshot visibly uses. The named
    // assertions are the real control: a size check alone would pass over a walker that found
    // some arbitrary other file. Five is the true count today and the walk is transitive, so
    // `candidateSection -> candidateStages` is in here as well as the direct edges.
    expect(GRAPH.size).toBeGreaterThan(1);
    const names = [...GRAPH.keys()].map((f) => path.basename(f));
    expect(names).toContain('candidateSection.ts');
    expect(names).toContain('autonomyLadder.ts');
    expect(names).toContain('candidateStages.ts');
  });

  it('imports nothing from ../../models, directly or through anything it imports', () => {
    const offenders = [...GRAPH.entries()]
      .filter(([file]) => file.split(path.sep).includes('models'))
      .map(([, trail]) => trail.join(' -> '));
    expect(offenders).toEqual([]);
  });

  /**
   * The resolver's own control, against the hole T004's verifier found.
   *
   * Without it, a `${p}/index.ts` regression in `importsOf` would make all three negative
   * assertions above pass over a graph that quietly stops at the barrel — green, and blind to the
   * exact import that caused the original 138-test breakage.
   */
  it('POSITIVE CONTROL: the resolver can see a DIRECTORY import, not just a file one', () => {
    const barrel = path.join(DIR, '..', '..', 'models', 'index.ts');
    expect(fs.existsSync(barrel)).toBe(true);
    const tmp = path.join(__dirname, '__purity_probe__.ts');
    // `../../../models` from `__tests__/`, which is the same directory the real `../../models`
    // from `agentDomain/` resolves to. The probe has to land on the barrel for real, or it would
    // prove the resolver can see a path that happens not to exist.
    fs.writeFileSync(tmp, "import { Project } from '../../../models';\nexport const x = Project;\n");
    try {
      const names = [...reachable(tmp).keys()].map((f) => path.basename(f));
      expect(names).toContain('index.ts');
      const reachedModels = [...reachable(tmp).keys()]
        .some((f) => f.split(path.sep).includes('models'));
      expect(reachedModels).toBe(true);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('reaches no module that calls .init at module scope', () => {
    // The model files are the ones that do this, and naming the BEHAVIOUR rather than the folder
    // means a model moved elsewhere is still caught.
    const offenders: string[] = [];
    for (const [file, trail] of GRAPH) {
      const src = fs.readFileSync(file, 'utf8');
      if (/^\w[\w.]*\.init\(/m.test(src)) offenders.push(trail.join(' -> '));
    }
    expect(offenders).toEqual([]);
  });

  it('reaches no module that imports the database connection', () => {
    const offenders: string[] = [];
    for (const [file, trail] of GRAPH) {
      const src = fs.readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      if (/from '[^']*config\/database'/.test(src)) offenders.push(trail.join(' -> '));
    }
    expect(offenders).toEqual([]);
  });

  /**
   * MUTATION PROOF, run by hand on 2026-11-19: repointing the snapshot's import back at
   * `./candidateService` turns the three assertions above red, each naming the real path
   * `agentDomainSnapshot.ts -> candidateService.ts -> AgentDomainCandidate.ts`.
   */
  it('still exposes the candidates section, so purity was not bought by dropping the feature', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { candidatesSection } = require('../candidateSection');
    expect(typeof candidatesSection).toBe('function');
    expect(candidatesSection(undefined).known).toBe(false);
  });
});
