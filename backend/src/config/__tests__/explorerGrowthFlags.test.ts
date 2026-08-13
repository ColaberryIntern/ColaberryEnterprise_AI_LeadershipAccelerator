import fs from 'fs';
import path from 'path';
import {
  resolveExplorerGrowthFlags,
  isExplorerFeatureEnabled,
  enabledExplorerFeatures,
  EXPLORER_GROWTH_ENV_KEYS,
  ExplorerGrowthFeature,
  ExplorerGrowthFlags,
} from '../explorerGrowthFlags';

const FLAG_KEYS = Object.keys(EXPLORER_GROWTH_ENV_KEYS) as (keyof ExplorerGrowthFlags)[];

const ALL_FEATURES: ExplorerGrowthFeature[] = [
  'signalIngest',
  'journeyGovernor',
  'commercial',
  'aliOutreach',
  'sms',
  'autoDial',
  'inAppNudge',
  'aiRanking',
];

/** Every flag on — the only way a capability should ever be reachable. */
function allOn(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.values(EXPLORER_GROWTH_ENV_KEYS).map((k) => [k, 'true']),
  ) as NodeJS.ProcessEnv;
}

describe('resolveExplorerGrowthFlags — default OFF', () => {
  it('resolves every flag to false for a completely empty environment', () => {
    const flags = resolveExplorerGrowthFlags({});
    for (const key of FLAG_KEYS) {
      expect(flags[key]).toBe(false);
    }
  });

  it('covers all nine documented flags', () => {
    expect(FLAG_KEYS).toHaveLength(9);
    expect(Object.keys(resolveExplorerGrowthFlags({}))).toHaveLength(9);
  });

  // Boundary: the repo convention is a strict `=== 'true'` opt-in. Anything else
  // — including a differently-cased 'TRUE' or a truthy-looking '1' — must stay OFF.
  // A flag that turned on for '1' or 'TRUE' would be an accidental live launch.
  // Asserted across ALL NINE flags, not just the master: each is read through the
  // shared isOn() helper today, but that is an implementation detail this test
  // must not depend on — a future per-flag special case has to fail here.
  it.each(['false', 'FALSE', '', '0', '1', 'TRUE', 'True', 'yes', 'on', ' true'])(
    'treats %p as OFF for every flag',
    (raw) => {
      const env = Object.fromEntries(
        Object.values(EXPLORER_GROWTH_ENV_KEYS).map((k) => [k, raw]),
      ) as NodeJS.ProcessEnv;
      const flags = resolveExplorerGrowthFlags(env);
      for (const key of FLAG_KEYS) {
        expect(flags[key]).toBe(false);
      }
    },
  );

  // Pins the literal env var strings. FLAG_KEYS is derived from the
  // implementation's own map, so without this a typo in a var name (e.g.
  // EXPLORER_SMS_ENABLE) would rename the contract and no test would notice —
  // the flag would silently read an env var nobody sets, i.e. permanently OFF.
  it('pins the exact env var name for every flag (plan §34 contract)', () => {
    expect(EXPLORER_GROWTH_ENV_KEYS).toEqual({
      growthOsEnabled: 'EXPLORER_GROWTH_OS_ENABLED',
      signalIngestEnabled: 'EXPLORER_SIGNAL_INGEST_ENABLED',
      journeyGovernorEnabled: 'EXPLORER_JOURNEY_GOVERNOR_ENABLED',
      commercialEnabled: 'EXPLORER_COMMERCIAL_ENABLED',
      aliOutreachEnabled: 'EXPLORER_ALI_OUTREACH_ENABLED',
      smsEnabled: 'EXPLORER_SMS_ENABLED',
      autoDialEnabled: 'EXPLORER_AUTO_DIAL_ENABLED',
      inAppNudgeEnabled: 'EXPLORER_IN_APP_NUDGE_ENABLED',
      aiRankingEnabled: 'EXPLORER_AI_RANKING_ENABLED',
    });
  });

  it('accepts exactly the string "true"', () => {
    const flags = resolveExplorerGrowthFlags({
      [EXPLORER_GROWTH_ENV_KEYS.growthOsEnabled]: 'true',
    } as NodeJS.ProcessEnv);
    expect(flags.growthOsEnabled).toBe(true);
  });

  it('returns a frozen object so the safety posture cannot be mutated at runtime', () => {
    const flags = resolveExplorerGrowthFlags({});
    expect(Object.isFrozen(flags)).toBe(true);
    expect(() => {
      (flags as { growthOsEnabled: boolean }).growthOsEnabled = true;
    }).toThrow();
    expect(flags.growthOsEnabled).toBe(false);
  });

  it('reads each flag from its own distinct env var (no cross-wiring)', () => {
    for (const key of FLAG_KEYS) {
      const flags = resolveExplorerGrowthFlags({
        [EXPLORER_GROWTH_ENV_KEYS[key]]: 'true',
      } as NodeJS.ProcessEnv);
      expect(flags[key]).toBe(true);
      // every OTHER flag must remain off
      for (const other of FLAG_KEYS.filter((k) => k !== key)) {
        expect(flags[other]).toBe(false);
      }
    }
  });
});

describe('isExplorerFeatureEnabled — master flag subordination', () => {
  it.each(ALL_FEATURES)(
    'keeps %s OFF when its own flag is on but the master flag is off',
    (feature) => {
      const env = allOn();
      delete env[EXPLORER_GROWTH_ENV_KEYS.growthOsEnabled];
      const flags = resolveExplorerGrowthFlags(env);
      expect(isExplorerFeatureEnabled(feature, flags)).toBe(false);
    },
  );

  it.each(ALL_FEATURES)(
    'keeps %s OFF when the master flag is on but its own flag is off',
    (feature) => {
      const flags = resolveExplorerGrowthFlags({
        [EXPLORER_GROWTH_ENV_KEYS.growthOsEnabled]: 'true',
      } as NodeJS.ProcessEnv);
      expect(isExplorerFeatureEnabled(feature, flags)).toBe(false);
    },
  );

  it.each(ALL_FEATURES)('enables %s only when master AND its own flag are on', (feature) => {
    const flags = resolveExplorerGrowthFlags(allOn());
    expect(isExplorerFeatureEnabled(feature, flags)).toBe(true);
  });

  // The two channels that are blocked on the §35 consent decisions get an
  // explicit named guard, so a future edit that loosens them fails loudly here.
  it('keeps voice and SMS off under a default (empty) environment', () => {
    const flags = resolveExplorerGrowthFlags({});
    expect(isExplorerFeatureEnabled('autoDial', flags)).toBe(false);
    expect(isExplorerFeatureEnabled('sms', flags)).toBe(false);
  });
});

describe('enabledExplorerFeatures', () => {
  it('reports nothing for a default environment', () => {
    expect(enabledExplorerFeatures(resolveExplorerGrowthFlags({}))).toEqual([]);
  });

  it('reports nothing when sub-flags are on but the master is off', () => {
    const env = allOn();
    delete env[EXPLORER_GROWTH_ENV_KEYS.growthOsEnabled];
    expect(enabledExplorerFeatures(resolveExplorerGrowthFlags(env))).toEqual([]);
  });

  it('reports only the capabilities whose own flag is also on', () => {
    const flags = resolveExplorerGrowthFlags({
      [EXPLORER_GROWTH_ENV_KEYS.growthOsEnabled]: 'true',
      [EXPLORER_GROWTH_ENV_KEYS.signalIngestEnabled]: 'true',
    } as NodeJS.ProcessEnv);
    expect(enabledExplorerFeatures(flags)).toEqual(['signalIngest']);
  });

  it('reports every capability when all flags are on', () => {
    const flags = resolveExplorerGrowthFlags(allOn());
    expect(enabledExplorerFeatures(flags).sort()).toEqual([...ALL_FEATURES].sort());
  });
});

/**
 * Makes the dark-launch property ENFORCED rather than advisory.
 *
 * `env.explorerGrowth` exposes the raw sub-flag booleans (they are needed for
 * admin/health display), which means a future consumer could write
 * `if (env.explorerGrowth.smsEnabled)` and activate SMS while the master switch
 * is off. A doc comment does not stop that; this test does.
 *
 * Scans backend source for direct reads of any sub-flag property outside the
 * flags module itself. The only sanctioned read is isExplorerFeatureEnabled().
 */
describe('dark-launch guard — no direct sub-flag reads outside the flags module', () => {
  const SUB_FLAG_PROPS: (keyof ExplorerGrowthFlags)[] = FLAG_KEYS.filter(
    (k) => k !== 'growthOsEnabled',
  );
  const SRC = path.resolve(__dirname, '../..');
  const ALLOWED = [
    path.join('config', 'explorerGrowthFlags.ts'),
    path.join('config', '__tests__', 'explorerGrowthFlags.test.ts'),
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

  it('finds no unsanctioned direct sub-flag read', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (ALLOWED.some((a) => file.endsWith(a))) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const prop of SUB_FLAG_PROPS) {
        // `.smsEnabled` etc. — a property access on any object. Deliberately
        // broad: these names are unique enough to this subsystem that a match
        // outside the flags module is either the bypass we are preventing or a
        // name collision worth knowing about.
        if (new RegExp(`\\.${prop}\\b`).test(text)) {
          offenders.push(`${path.relative(SRC, file)} reads .${prop}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
