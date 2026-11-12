/**
 * MR2, and the standing rule of this workstream: NOTHING SENDS.
 *
 * ── WHY THIS FILE IS SEPARATE FROM mayaEmailService.test.ts ─────────────────
 *
 * That suite drives the service with an INJECTED mode, which is the right way to test what the
 * service does in each mode but says nothing about which mode production is actually in. A
 * service that behaves perfectly in shadow is no comfort if the shipped configuration resolves
 * to live.
 *
 * So this file mocks nothing that decides the mode. It drives the **real** `resolveMayaMode` and
 * the **real** `resolveMayaCapability` against the state measured in production on 2026-11-12,
 * built by the **real** flag resolvers from an empty environment:
 *
 *   - `system_kill_switch` = false              (present and off)
 *   - `maya_capability_promotions`              -> ABSENT. No Maya promotion record exists at all.
 *   - every GROWTH_JOURNEY_* variable           -> unset
 *   - every EXPLORER_* variable                 -> unset
 *
 * The flag fixtures come from `resolveGrowthJourneyFlags({})` rather than hand-written literals,
 * for the reason `mayaEnablement.test.ts` already gives: a literal would keep passing if the
 * opt-in rule loosened from the exact string 'true' to something weaker, and that is precisely
 * the regression worth catching.
 *
 * ── THE PROPERTY ────────────────────────────────────────────────────────────
 *
 * `sendEmail` cannot reach the `sent` outcome, and it takes TWO independent changes to make it
 * possible - a recorded promotion AND an environment flag, with different owners. If either
 * test below ever reports `live`, one signature has become enough to mail a stranger.
 */
export {};

import {
  resolveMayaMode, promoteMayaCapability, type MayaPromotionDeps,
} from '../mayaPromotion';
import { resolveMayaCapability } from '../../mayaEnablement';
import { resolveGrowthJourneyFlags } from '../../../config/growthJourneyFlags';
import { resolveExplorerGrowthFlags } from '../../../config/explorerGrowthFlags';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendMayaEmailForPurpose } = require('../mayaEmailService');

/** Nothing set: exactly what `printenv` reports in the production container for these. */
const PRODUCTION_ENV = {} as NodeJS.ProcessEnv;

const PRODUCTION_FLAGS = {
  growth: resolveGrowthJourneyFlags(PRODUCTION_ENV),
  explorer: resolveExplorerGrowthFlags(PRODUCTION_ENV),
};

/**
 * The promotion resolver wired to production's measured state. Only `readRecord` varies between
 * tests; everything else is what the live container would answer.
 */
function productionDeps(over: Partial<MayaPromotionDeps> = {}): MayaPromotionDeps {
  return {
    killSwitchActive: async () => false,
    chatEnabled: () => true,
    readRecord: async () => null,
    writeRecord: async () => undefined,
    // The REAL M29 resolver, against the REAL flag objects. This is the part that must not be
    // stubbed: it is the half of the gate that belongs to the environment rather than to a
    // settings row.
    m29: (cap) => resolveMayaCapability(cap, {
      killSwitchActive: async () => false,
      growthFlags: PRODUCTION_FLAGS.growth,
      explorerFlags: PRODUCTION_FLAGS.explorer,
    }),
    now: () => new Date('2026-11-12T22:00:00Z'),
    ...over,
  };
}

/** Service deps whose transport fails the test if it is ever reached. */
function depsWithForbiddenTransport(mode: () => Promise<unknown>) {
  const send = jest.fn(async () => {
    throw new Error('the transport must be unreachable in the shipped configuration');
  });
  return {
    send,
    deps: {
      mode,
      findLeadId: async () => 77,
      evaluate: async () => ({ allowed: true }),
      ensureTable: async () => undefined,
      claim: async () => true,
      send,
      markDelivered: async () => undefined,
      markFailed: async () => undefined,
    },
  };
}

const REQ = {
  purpose: 'explorer_welcome' as const,
  recipient: 'dana.reyes@gmail.com',
  recipientName: 'Dana',
  subjectRef: 'enr-123',
};

let warnSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;
beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { warnSpy.mockRestore(); logSpy.mockRestore(); });

describe('the configuration actually shipped resolves to shadow', () => {
  it('with no promotion record, sendEmail is shadow and says why', async () => {
    const answer = await resolveMayaMode('sendEmail', productionDeps());
    expect(answer.mode).toBe('shadow');
    expect(answer.reason).toBe('not_promoted');
  });

  it('and the service composes, records and never touches the transport', async () => {
    const { deps, send } = depsWithForbiddenTransport(
      () => resolveMayaMode('sendEmail', productionDeps()) as Promise<never>,
    );

    const res = await sendMayaEmailForPurpose(REQ, deps);

    expect(res.outcome).toBe('recorded_shadow');
    expect(res.mode).toBe('shadow');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('it takes TWO independent changes, with two different owners', () => {
  it('a recorded promotion ALONE is not enough', async () => {
    // Promoting is a human decision through an authenticated route, with a reviewer and a note.
    // It is still not sufficient, because GROWTH_JOURNEY_EXECUTION_ENABLED is a separate switch
    // held by a different person. THIS IS THE LOAD-BEARING TEST IN THIS FILE.
    let stored: unknown = null;
    const deps = productionDeps({
      readRecord: async () => stored,
      writeRecord: async (v) => { stored = v; },
    });

    await promoteMayaCapability(
      'sendEmail',
      { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed a week of shadow rows' },
      deps,
    );

    const answer = await resolveMayaMode('sendEmail', deps);
    expect(answer.mode).toBe('shadow');
    expect(answer.reason).toBe('m29:growth_flag_off:journeyExecution');
  });

  it('the environment flag ALONE is not enough either', async () => {
    // The mirror image: the flag is on, nobody has promoted the capability, and it stays shadow.
    const flagsOn = resolveGrowthJourneyFlags({
      GROWTH_JOURNEY_ENABLED: 'true',
      GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
    } as NodeJS.ProcessEnv);

    const answer = await resolveMayaMode('sendEmail', productionDeps({
      m29: (cap) => resolveMayaCapability(cap, {
        killSwitchActive: async () => false,
        growthFlags: flagsOn,
        explorerFlags: PRODUCTION_FLAGS.explorer,
      }),
    }));

    expect(answer.mode).toBe('shadow');
    expect(answer.reason).toBe('not_promoted');
  });

  it('BOTH together, and only both, reach live', async () => {
    // The positive case belongs here too: a gate that can never open is not a gate, it is a
    // disabled feature pretending to be one, and this file would pass trivially without it.
    let stored: unknown = null;
    const flagsOn = resolveGrowthJourneyFlags({
      GROWTH_JOURNEY_ENABLED: 'true',
      GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
    } as NodeJS.ProcessEnv);
    const deps = productionDeps({
      readRecord: async () => stored,
      writeRecord: async (v) => { stored = v; },
      m29: (cap) => resolveMayaCapability(cap, {
        killSwitchActive: async () => false,
        growthFlags: flagsOn,
        explorerFlags: PRODUCTION_FLAGS.explorer,
      }),
    });

    await promoteMayaCapability(
      'sendEmail',
      { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed a week of shadow rows' },
      deps,
    );

    expect(await resolveMayaMode('sendEmail', deps)).toMatchObject({ mode: 'live', reason: 'promoted' });
  });
});

describe('the kill switch beats both of them', () => {
  it('an active switch turns the capability off entirely', async () => {
    let stored: unknown = null;
    const flagsOn = resolveGrowthJourneyFlags({
      GROWTH_JOURNEY_ENABLED: 'true', GROWTH_JOURNEY_EXECUTION_ENABLED: 'true',
    } as NodeJS.ProcessEnv);
    const base = productionDeps({
      readRecord: async () => stored,
      writeRecord: async (v) => { stored = v; },
      m29: (cap) => resolveMayaCapability(cap, {
        killSwitchActive: async () => false,
        growthFlags: flagsOn,
        explorerFlags: PRODUCTION_FLAGS.explorer,
      }),
    });
    await promoteMayaCapability(
      'sendEmail', { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed it' }, base,
    );

    const stopped = { ...base, killSwitchActive: async () => true };
    expect(await resolveMayaMode('sendEmail', stopped)).toMatchObject({ mode: 'off', reason: 'kill_switch' });
  });

  it('an UNREADABLE switch also turns it off, rather than assuming it is clear', async () => {
    const unreadable = productionDeps({
      killSwitchActive: async () => { throw new Error('settings table unreachable'); },
    });
    expect(await resolveMayaMode('sendEmail', unreadable))
      .toMatchObject({ mode: 'off', reason: 'kill_switch_unreadable' });
  });

  it('and off means the service does not even compose', async () => {
    const { deps, send } = depsWithForbiddenTransport(
      () => resolveMayaMode('sendEmail', productionDeps({
        killSwitchActive: async () => true,
      })) as Promise<never>,
    );

    const res = await sendMayaEmailForPurpose(REQ, deps);

    expect(res.outcome).toBe('off');
    expect(send).not.toHaveBeenCalled();
  });
});

describe('the flag fixtures are built by the real resolvers, not asserted', () => {
  it('an empty environment really does produce every growth flag off', () => {
    // If this ever fails, the default changed and every "cannot send" claim above is void.
    expect(PRODUCTION_FLAGS.growth.growthJourneyEnabled).toBe(false);
    expect(PRODUCTION_FLAGS.growth.journeyExecution).toBe(false);
  });

  it('and only the exact string true opens one', () => {
    for (const value of ['TRUE', 'True', '1', 'yes', 'on', '']) {
      const f = resolveGrowthJourneyFlags({
        GROWTH_JOURNEY_ENABLED: value, GROWTH_JOURNEY_EXECUTION_ENABLED: value,
      } as NodeJS.ProcessEnv);
      expect(f.growthJourneyEnabled).toBe(false);
    }
    expect(resolveGrowthJourneyFlags({
      GROWTH_JOURNEY_ENABLED: 'true',
    } as NodeJS.ProcessEnv).growthJourneyEnabled).toBe(true);
  });
});
