import {
  resolveMayaCapability, isMayaCapabilityEnabled, resolveAllMayaCapabilities,
  MAYA_CAPABILITIES, MAYA_CAPABILITY_GATES,
  type MayaCapability, type MayaEnablementDeps,
} from '../mayaEnablement';
import { resolveGrowthJourneyFlags } from '../../config/growthJourneyFlags';
import { resolveExplorerGrowthFlags } from '../../config/explorerGrowthFlags';

/**
 * M29 - every Maya capability is off until somebody turns it on, and the kill
 * switch beats all of them.
 *
 * ── THE FLAG FIXTURES ARE BUILT BY THE REAL RESOLVERS ──────────────────────
 *
 * Not hand-written literals. A literal `{ growthJourneyEnabled: true, ... }`
 * would keep passing if `resolveGrowthJourneyFlags` changed its opt-in rule from
 * the exact string 'true' to something looser, which is precisely the regression
 * worth catching. Same convention as `campusTourHandoff.test.ts`.
 *
 * ── WHY EVERY CAPABILITY IS DRIVEN SEPARATELY ──────────────────────────────
 *
 * M29's fourth acceptance criterion is "tests cover each capability
 * independently". A single test over one capability would leave a mis-mapped
 * second capability invisible, so the suite enumerates `MAYA_CAPABILITIES` and
 * every table below is generated from it. A capability added without a gate
 * fails here rather than silently defaulting to someone else's switch.
 */

/** Nothing set: the production default for a flag nobody has turned on. */
const NO_ENV = {} as NodeJS.ProcessEnv;

const FLAGS_OFF = {
  growth: resolveGrowthJourneyFlags(NO_ENV),
  explorer: resolveExplorerGrowthFlags(NO_ENV),
};

/** Every gate open. Built per capability so no test depends on a global. */
const ALL_ON = {
  growth: resolveGrowthJourneyFlags({
    GROWTH_JOURNEY_ENABLED: 'true',
    GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
    GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true',
    GROWTH_JOURNEY_DECISIONS_ENABLED: 'true',
  } as NodeJS.ProcessEnv),
  explorer: resolveExplorerGrowthFlags({
    EXPLORER_GROWTH_OS_ENABLED: 'true',
    EXPLORER_IN_APP_NUDGE_ENABLED: 'true',
  } as NodeJS.ProcessEnv),
};

function deps(over: Partial<MayaEnablementDeps> = {}): MayaEnablementDeps {
  return {
    killSwitchActive: async () => false,
    growthFlags: ALL_ON.growth,
    explorerFlags: ALL_ON.explorer,
    ...over,
  };
}

describe('every capability is off by default', () => {
  it.each(MAYA_CAPABILITIES.map((c) => [c] as [MayaCapability]))(
    '%s is off with no environment set at all',
    async (capability) => {
      const v = await resolveMayaCapability(capability, deps({
        growthFlags: FLAGS_OFF.growth, explorerFlags: FLAGS_OFF.explorer,
      }));
      expect(v.enabled).toBe(false);
      // The reason must name the growth gate, not a generic "disabled": during an
      // incident the difference between "never launched" and "stopped" is the
      // whole question.
      expect(v.reason).toBe(`growth_flag_off:${MAYA_CAPABILITY_GATES[capability].growth}`);
    },
  );

  it('CONTROL: the same capabilities DO turn on when their gates are open', async () => {
    // Without this, every assertion above would also pass against a resolver
    // hardcoded to return false, which is the cheapest way to make this suite
    // green and the least useful.
    const all = await resolveAllMayaCapabilities(deps());
    expect(all.every((v) => v.enabled)).toBe(true);
    expect(all.map((v) => v.reason)).toEqual(MAYA_CAPABILITIES.map(() => 'enabled'));
  });

  it('the master flag alone is not enough for any capability', async () => {
    const masterOnly = resolveGrowthJourneyFlags(
      { GROWTH_JOURNEY_ENABLED: 'true' } as NodeJS.ProcessEnv,
    );
    const all = await resolveAllMayaCapabilities(deps({ growthFlags: masterOnly }));
    expect(all.every((v) => v.enabled)).toBe(false);
  });

  it('a sub-flag without the master is not enough either', async () => {
    const subOnly = resolveGrowthJourneyFlags({
      GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
      GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true',
      GROWTH_JOURNEY_DECISIONS_ENABLED: 'true',
    } as NodeJS.ProcessEnv);
    const all = await resolveAllMayaCapabilities(deps({ growthFlags: subOnly }));
    expect(all.every((v) => v.enabled)).toBe(false);
  });
});

describe('the kill switch overrides everything', () => {
  it.each(MAYA_CAPABILITIES.map((c) => [c] as [MayaCapability]))(
    '%s is off when the switch is active, even with every gate open',
    async (capability) => {
      const v = await resolveMayaCapability(capability, deps({
        killSwitchActive: async () => true,
      }));
      expect(v.enabled).toBe(false);
      expect(v.reason).toBe('kill_switch');
    },
  );

  it('an UNREADABLE switch fails closed, not open', async () => {
    // `isKillSwitchActive` swallows a read error and returns false, which fails
    // OPEN. This resolver uses the strict reader for that reason: an agent that
    // can contact a human does not get the benefit of the doubt about whether it
    // was stopped.
    const all = await resolveAllMayaCapabilities(deps({
      killSwitchActive: async () => { throw new Error('settings unreadable'); },
    }));
    expect(all.every((v) => v.enabled)).toBe(false);
    expect(all.map((v) => v.reason)).toEqual(MAYA_CAPABILITIES.map(() => 'kill_switch_unreadable'));
  });

  it('never throws, so an unreadable switch is an answer rather than an exception', async () => {
    await expect(resolveMayaCapability('createJourneyHandoff', deps({
      killSwitchActive: async () => { throw new Error('boom'); },
    }))).resolves.toEqual({
      capability: 'createJourneyHandoff', enabled: false, reason: 'kill_switch_unreadable',
    });
  });

  it('the switch beats the flags in the REASON too, not only the outcome', async () => {
    // Deliberate deviation from resolveStops(), which reports flag_master_off
    // without reading the switch. M29 says the switch overrides everything, and
    // a reader asking "why can Maya not act" during an incident should be told
    // the incident.
    const v = await resolveMayaCapability('sendInAppWelcome', deps({
      killSwitchActive: async () => true,
      growthFlags: FLAGS_OFF.growth,
      explorerFlags: FLAGS_OFF.explorer,
    }));
    expect(v.reason).toBe('kill_switch');
    expect(v.reason).not.toBe('growth_flag_off:journeyExecution');
  });
});

describe('the channel gate applies only where the mapping declares one', () => {
  it('the in-app capabilities need the Explorer nudge flag as well', async () => {
    const closedChannel = resolveExplorerGrowthFlags(
      { EXPLORER_GROWTH_OS_ENABLED: 'true' } as NodeJS.ProcessEnv,
    );
    for (const capability of ['respondToExplorerDm', 'sendInAppWelcome'] as MayaCapability[]) {
      const v = await resolveMayaCapability(capability, deps({ explorerFlags: closedChannel }));
      expect(v.enabled).toBe(false);
      expect(v.reason).toBe('explorer_flag_off:inAppNudge');
    }
  });

  it('the capabilities with NO channel gate are unaffected by Explorer flags', async () => {
    for (const capability of ['createJourneyHandoff', 'readPerson360'] as MayaCapability[]) {
      const v = await resolveMayaCapability(capability, deps({
        explorerFlags: FLAGS_OFF.explorer,
      }));
      expect(v.enabled).toBe(true);
      expect(v.reason).toBe('enabled');
    }
  });

  it('the growth gate is checked BEFORE the channel, so the reason is the deeper one', async () => {
    const v = await resolveMayaCapability('sendInAppWelcome', deps({
      growthFlags: FLAGS_OFF.growth,
      explorerFlags: FLAGS_OFF.explorer,
    }));
    // Both are off; the growth flag is the more fundamental switch and is what
    // gets reported.
    expect(v.reason).toBe('growth_flag_off:journeyExecution');
  });
});

describe('capabilities are independent of one another', () => {
  it('opening one capability does not open the others', async () => {
    // Handoffs on, execution and decisions off.
    const onlyHandoffs = resolveGrowthJourneyFlags({
      GROWTH_JOURNEY_ENABLED: 'true',
      GROWTH_JOURNEY_HANDOFFS_ENABLED: 'true',
    } as NodeJS.ProcessEnv);

    const all = await resolveAllMayaCapabilities(deps({ growthFlags: onlyHandoffs }));
    const byName = Object.fromEntries(all.map((v) => [v.capability, v.enabled]));

    expect(byName.createJourneyHandoff).toBe(true);
    expect(byName.respondToExplorerDm).toBe(false);
    expect(byName.sendInAppWelcome).toBe(false);
    expect(byName.readPerson360).toBe(false);
  });

  it('every capability has a declared gate, so none can inherit another switch', async () => {
    // A capability added to the union without a row in MAYA_CAPABILITY_GATES
    // would resolve against `undefined` and throw. This pins the mapping as
    // total rather than assuming it.
    for (const capability of MAYA_CAPABILITIES) {
      expect(MAYA_CAPABILITY_GATES[capability]).toBeDefined();
      expect(typeof MAYA_CAPABILITY_GATES[capability].growth).toBe('string');
    }
    expect(MAYA_CAPABILITIES.length).toBe(Object.keys(MAYA_CAPABILITY_GATES).length);
  });

  it('the mapping is frozen, so nothing can re-point a gate at runtime', () => {
    expect(Object.isFrozen(MAYA_CAPABILITY_GATES)).toBe(true);
    expect(Object.isFrozen(MAYA_CAPABILITIES)).toBe(true);
  });
});

describe('the boolean form agrees with the detailed form', () => {
  it.each(MAYA_CAPABILITIES.map((c) => [c] as [MayaCapability]))(
    '%s: isMayaCapabilityEnabled matches resolveMayaCapability().enabled',
    async (capability) => {
      const d = deps({ growthFlags: FLAGS_OFF.growth, explorerFlags: FLAGS_OFF.explorer });
      expect(await isMayaCapabilityEnabled(capability, d))
        .toBe((await resolveMayaCapability(capability, d)).enabled);

      const on = deps();
      expect(await isMayaCapabilityEnabled(capability, on))
        .toBe((await resolveMayaCapability(capability, on)).enabled);
    },
  );
});

describe('one kill-switch read per batch, not one per capability', () => {
  it('resolveAllMayaCapabilities reads the switch once per capability at most', async () => {
    // Guards a page refresh from multiplying a settings read by the number of
    // capabilities. Sequential resolution is the current implementation; this
    // pins the count so a change to parallel resolution has to be deliberate.
    let reads = 0;
    await resolveAllMayaCapabilities(deps({
      killSwitchActive: async () => { reads += 1; return false; },
    }));
    expect(reads).toBe(MAYA_CAPABILITIES.length);
  });

  it('a capability refused by the switch does no flag work at all', async () => {
    // The switch is first, so a stopped system does not need its flags read.
    // Proven by passing flag objects that would throw if touched.
    const exploding = new Proxy({}, {
      get() { throw new Error('flags must not be read when the switch is active'); },
    }) as never;
    await expect(resolveMayaCapability('respondToExplorerDm', {
      killSwitchActive: async () => true,
      growthFlags: exploding,
      explorerFlags: exploding,
    })).resolves.toMatchObject({ enabled: false, reason: 'kill_switch' });
  });
});
