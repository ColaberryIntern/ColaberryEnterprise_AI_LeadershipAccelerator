import * as fs from 'fs';
import * as path from 'path';
import {
  GROWTH_JOURNEY_ENV_KEYS,
  resolveGrowthJourneyFlags,
  isGrowthJourneyCapabilityEnabled,
  enabledGrowthJourneyCapabilities,
  type GrowthJourneyFlags,
  type GrowthJourneyCapability,
} from '../growthJourneyFlags';
import { EXPLORER_GROWTH_ENV_KEYS, type ExplorerGrowthFlags } from '../explorerGrowthFlags';

/**
 * T209 — the Growth Journey flags.
 *
 * Two properties carry the weight:
 *
 *   1. NOTHING IS ON BY DEFAULT, and the master governs every sub-flag. The
 *      `journeyExecution` flag is the only one that can cause a person to be
 *      contacted; it is asserted off on its own line, not only in a loop.
 *
 *   2. THE NAMES DO NOT COLLIDE WITH EXPLORER'S. `explorerGrowthFlags.test.ts`
 *      walks every `.ts` file for `.<explorerSubFlag>\b`. The proof here is not
 *      "the names look different" — it is running THAT guard's own regex over
 *      THIS module's source and asserting zero matches, so the acceptance
 *      criterion "the existing Explorer guard stays green with no new ALLOWED
 *      entry" is proven from this side as well as from theirs.
 */

const FLAG_KEYS = Object.keys(GROWTH_JOURNEY_ENV_KEYS) as (keyof GrowthJourneyFlags)[];
const SUB_FLAGS = FLAG_KEYS.filter((k) => k !== 'growthJourneyEnabled');
const CAPABILITIES: GrowthJourneyCapability[] = [
  'journeySignalIngest',
  'journeyClassification',
  'journeyExecution',
];

const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ...over });

const allOn = () =>
  env(Object.fromEntries(Object.values(GROWTH_JOURNEY_ENV_KEYS).map((k) => [k, 'true'])));

describe('default OFF, per flag', () => {
  it('resolves every flag to false from an empty environment', () => {
    const flags = resolveGrowthJourneyFlags(env());
    for (const key of FLAG_KEYS) expect(flags[key]).toBe(false);
  });

  it('has exactly four flags — a master and three capabilities', () => {
    expect(FLAG_KEYS).toHaveLength(4);
    expect(SUB_FLAGS).toHaveLength(3);
    expect(CAPABILITIES).toHaveLength(3);
  });

  it('journeyExecution — the only flag that can contact a person — is off, on its own line', () => {
    expect(resolveGrowthJourneyFlags(env()).journeyExecution).toBe(false);
    expect(resolveGrowthJourneyFlags(process.env).journeyExecution).toBe(false);
  });

  it('only the exact string "true" turns a flag on', () => {
    for (const raw of ['1', 'TRUE', 'True', 'yes', 'on', ' true', 'true ']) {
      const flags = resolveGrowthJourneyFlags(env({ GROWTH_JOURNEY_ENABLED: raw }));
      expect(flags.growthJourneyEnabled).toBe(false);
    }
    expect(resolveGrowthJourneyFlags(env({ GROWTH_JOURNEY_ENABLED: 'true' })).growthJourneyEnabled).toBe(true);
  });

  it('is frozen — a flag cannot be flipped at runtime', () => {
    const flags = resolveGrowthJourneyFlags(env());
    expect(Object.isFrozen(flags)).toBe(true);
  });
});

describe('the master governs every capability', () => {
  it('master OFF disables every capability regardless of its own flag', () => {
    const flags = resolveGrowthJourneyFlags({ ...allOn(), GROWTH_JOURNEY_ENABLED: 'false' });
    for (const c of CAPABILITIES) expect(isGrowthJourneyCapabilityEnabled(c, flags)).toBe(false);
    expect(enabledGrowthJourneyCapabilities(flags)).toEqual([]);
  });

  it('master ON alone enables nothing — each capability needs its own flag too', () => {
    const flags = resolveGrowthJourneyFlags(env({ GROWTH_JOURNEY_ENABLED: 'true' }));
    for (const c of CAPABILITIES) expect(isGrowthJourneyCapabilityEnabled(c, flags)).toBe(false);
  });

  it('master ON plus one sub-flag enables exactly that capability', () => {
    const flags = resolveGrowthJourneyFlags(
      env({ GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_CLASSIFICATION_ENABLED: 'true' }),
    );
    expect(isGrowthJourneyCapabilityEnabled('journeyClassification', flags)).toBe(true);
    expect(isGrowthJourneyCapabilityEnabled('journeySignalIngest', flags)).toBe(false);
    expect(isGrowthJourneyCapabilityEnabled('journeyExecution', flags)).toBe(false);
    expect(enabledGrowthJourneyCapabilities(flags)).toEqual(['journeyClassification']);
  });

  it('everything on enables all three', () => {
    const flags = resolveGrowthJourneyFlags(allOn());
    expect(enabledGrowthJourneyCapabilities(flags).sort()).toEqual([...CAPABILITIES].sort());
  });
});

describe('the env keys', () => {
  it('are all GROWTH_JOURNEY_* and none is EXPLORER_*', () => {
    // AD-1 forbids renaming an Explorer flag, and a new flag wearing that prefix
    // would read as one that had been.
    for (const key of Object.values(GROWTH_JOURNEY_ENV_KEYS)) {
      expect(key).toMatch(/^GROWTH_JOURNEY_/);
      expect(key).not.toMatch(/^EXPLORER_/);
    }
  });

  it('share no env var name with Explorer', () => {
    const explorer = new Set(Object.values(EXPLORER_GROWTH_ENV_KEYS));
    for (const key of Object.values(GROWTH_JOURNEY_ENV_KEYS)) expect(explorer.has(key)).toBe(false);
  });

  it('are distinct from one another', () => {
    const values = Object.values(GROWTH_JOURNEY_ENV_KEYS);
    expect(new Set(values).size).toBe(values.length);
  });
});

/**
 * The name-collision proof, from this side.
 */
describe('the property names do not collide with Explorer’s sub-flags', () => {
  const EXPLORER_SUB_FLAGS = (Object.keys(EXPLORER_GROWTH_ENV_KEYS) as (keyof ExplorerGrowthFlags)[]).filter(
    (k) => k !== 'growthOsEnabled',
  );
  const MODULE_SRC = fs.readFileSync(path.join(__dirname, '..', 'growthJourneyFlags.ts'), 'utf8');
  const ENV_SRC = fs.readFileSync(path.join(__dirname, '..', 'env.ts'), 'utf8');

  it('shares no property name with an Explorer sub-flag', () => {
    const explorer = new Set<string>(EXPLORER_SUB_FLAGS);
    for (const key of FLAG_KEYS) expect(explorer.has(key)).toBe(false);
  });

  it('the Explorer guard’s OWN regex finds nothing in this module or in env.ts', () => {
    // Exactly the pattern explorerGrowthFlags.test.ts applies to every file:
    // `\.${prop}\b`. If this ever matches, the acceptance criterion "the
    // existing Explorer guard stays green with no new ALLOWED entry" is false.
    expect(EXPLORER_SUB_FLAGS.length).toBe(9); // non-vacuity: the list is real
    for (const prop of EXPLORER_SUB_FLAGS) {
      expect(MODULE_SRC).not.toMatch(new RegExp(`\\.${prop}\\b`));
      expect(ENV_SRC).not.toMatch(new RegExp(`\\.${prop}\\b`));
    }
  });
});

/**
 * This module's own dark-launch guard — the Explorer guard's shape, for the
 * Growth Journey names. Mutation-checked: a direct sub-flag read in any file
 * outside the allowlist fails it.
 */
describe('dark-launch guard — no direct Growth Journey sub-flag reads outside the flags module', () => {
  const SRC = path.resolve(__dirname, '../..');
  const ALLOWED = [
    path.join('config', 'growthJourneyFlags.ts'),
    path.join('config', '__tests__', 'growthJourneyFlags.test.ts'),
  ];

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(full, out);
      } else if (entry.name.endsWith('.ts')) {
        out.push(full);
      }
    }
    return out;
  }

  it('walks a real tree — a blind walker would pass everything below', () => {
    const files = walk(SRC);
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join('config', 'growthJourneyFlags.ts')))).toBe(true);
  });

  it('finds no unsanctioned direct sub-flag read', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWED.some((a) => file.endsWith(a))) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const prop of SUB_FLAGS) {
        if (new RegExp(`\\.${prop}\\b`).test(text)) {
          offenders.push(`${path.relative(SRC, file)} reads .${prop}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the guard would catch a read of each of the three names', () => {
    // Non-vacuity for the regex itself, against synthetic text.
    for (const prop of SUB_FLAGS) {
      expect(new RegExp(`\\.${prop}\\b`).test(`if (flags.${prop}) {}`)).toBe(true);
      expect(new RegExp(`\\.${prop}\\b`).test(`if (flags.${prop}Something) {}`)).toBe(false);
    }
  });
});
