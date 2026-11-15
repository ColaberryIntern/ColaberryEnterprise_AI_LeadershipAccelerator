import fs from 'fs';
import path from 'path';
import { ALL_MAYA_CAPABILITIES } from '../mayaToolGovernance';
import {
  isRefusedCapability, resolveAllMayaModes, resolveMayaMode,
  type MayaPromotionDeps, type PromotableCapability, type PromotionState,
} from '../mayaPromotion';
import type { MayaCapability, MayaEnablement } from '../../mayaEnablement';

/**
 * T17 - THE STOP BUTTON, asserted over the whole capability set rather than one capability.
 *
 * ── WHAT THIS ADDS THAT THE OTHER SUITES DO NOT ─────────────────────────────────────────────
 *
 * `mayaCapabilityStates.test.ts` already proves every capability is `off` when the switch is on
 * **with nothing stored**. That is the weaker half of the property, because with nothing stored
 * most capabilities are not `live` anyway, so the switch has little to beat.
 *
 * The two cases here are the ones that matter:
 *
 *   1. EVERYTHING PROMOTED TO LIVE, by a real stored record, and the switch beats all of it.
 *      This is the state the system is in after somebody has worked through the console - which
 *      is exactly when an incident would make somebody reach for the switch.
 *   2. THE SWITCH IS UNREADABLE. It must fail CLOSED. `isKillSwitchActive` swallows a read error
 *      and returns false, which fails OPEN; `resolveMayaMode` uses the STRICT reader instead, and
 *      this is the test that says so for every capability rather than for one.
 *
 * ── WHY THE RECORD IS BUILT, NOT HAND-WRITTEN ───────────────────────────────────────────────
 *
 * The stored record below is generated from `ALL_MAYA_CAPABILITIES`, so a capability added
 * tomorrow is covered the moment it exists. A hand-written literal would keep passing while
 * saying nothing about the new one, which is the failure mode this kind of test is for.
 */

/** A promotion record that puts every promotable capability at `live`. The worst case. */
function everythingLive(): { capabilities: Record<string, unknown>; history: unknown[] } {
  const capabilities: Record<string, unknown> = {};
  for (const cap of ALL_MAYA_CAPABILITIES) {
    if (isRefusedCapability(cap)) continue;
    capabilities[cap as PromotableCapability] = {
      state: 'live' as PromotionState,
      by: 'ali@colaberry.com',
      at: '2026-11-15T12:00:00Z',
      note: 'promoted everything, which is the state the switch has to beat',
    };
  }
  return { capabilities, history: [] };
}

function deps(over: Partial<MayaPromotionDeps> = {}): MayaPromotionDeps {
  return {
    killSwitchActive: async () => false,
    chatEnabled: () => true,
    readRecord: async () => everythingLive(),
    writeRecord: async () => undefined,
    // M29 fully ON, so the flag axis is not what is stopping anything here either.
    m29: async (cap: MayaCapability): Promise<MayaEnablement> => ({
      capability: cap, enabled: true, reason: 'enabled',
    }),
    now: () => new Date('2026-11-15T12:00:00Z'),
    ...over,
  };
}

let warn: jest.SpyInstance;
beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

describe('T17 the instrument is sound before it is trusted', () => {
  it('CONTROL - with the switch CLEAR, this record really does make everything live', async () => {
    // Without this, both assertions below could be passing because the record does nothing.
    const all = await resolveAllMayaModes(deps());
    const promotable = all.filter((m) => !isRefusedCapability(m.capability));
    expect(promotable.length).toBeGreaterThan(5);
    for (const m of promotable) {
      expect({ cap: m.capability, mode: m.mode }).toEqual({ cap: m.capability, mode: 'live' });
    }
  });

  it('CONTROL - the record covers every promotable capability, so none is untested', () => {
    const record = everythingLive();
    const promotable = ALL_MAYA_CAPABILITIES.filter((c) => !isRefusedCapability(c));
    expect(Object.keys(record.capabilities).sort()).toEqual([...promotable].sort());
  });
});

describe('T17 an ACTIVE kill switch beats a record that promoted everything', () => {
  it('every capability resolves off, and says the incident rather than a flag', async () => {
    const all = await resolveAllMayaModes(deps({ killSwitchActive: async () => true }));
    expect(all).toHaveLength(ALL_MAYA_CAPABILITIES.length);
    for (const m of all) {
      // The REASON matters as much as the mode: somebody asking "why can Maya not act" during an
      // incident should be told the incident, not a flag that also happens to be off.
      expect({ cap: m.capability, mode: m.mode, reason: m.reason })
        .toEqual({ cap: m.capability, mode: 'off', reason: 'kill_switch' });
    }
  });

  it('including the one capability that ships live without a promotion', async () => {
    // `bookStrategyCall` is the declared transactional-receipt exception, so it is the capability
    // most likely to be treated as outside the rules. It is not.
    expect(await resolveMayaMode('bookStrategyCall', deps({ killSwitchActive: async () => true })))
      .toMatchObject({ mode: 'off', reason: 'kill_switch' });
  });
});

describe('T17 an UNREADABLE kill switch fails CLOSED, for every capability', () => {
  it('every capability resolves off, with its own distinct reason', async () => {
    const all = await resolveAllMayaModes(deps({
      killSwitchActive: async () => { throw new Error('settings table unreachable'); },
    }));
    expect(all).toHaveLength(ALL_MAYA_CAPABILITIES.length);
    for (const m of all) {
      expect({ cap: m.capability, mode: m.mode, reason: m.reason })
        .toEqual({ cap: m.capability, mode: 'off', reason: 'kill_switch_unreadable' });
    }
  });

  it('and it is a DIFFERENT reason from an active switch, because they need different actions', async () => {
    // Collapsing the two would tell an operator to look for a thrown switch when the real
    // problem is that the settings table cannot be read.
    const active = await resolveMayaMode('sendDocument', deps({ killSwitchActive: async () => true }));
    const unreadable = await resolveMayaMode('sendDocument', deps({
      killSwitchActive: async () => { throw new Error('unreachable'); },
    }));
    expect(active.reason).not.toBe(unreadable.reason);
  });
});

describe('T17 the resolver reads the switch STRICTLY, pinned in the source', () => {
  it('uses the strict reader, not the one that swallows a read error', () => {
    // The behavioural tests above prove the current code fails closed. This one pins WHY, in the
    // file where somebody would "simplify" it: `isKillSwitchActive` returns false on a read
    // error, so a switch to it would make every assertion above fail - but only if somebody runs
    // them, and only this assertion names the trap.
    const source = fs.readFileSync(path.join(__dirname, '..', 'mayaPromotion.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');
    expect(source).toContain('isKillSwitchActiveStrict');
    // CONTROL: the non-strict name is a real export of that module, so this is a live hazard
    // rather than a hypothetical one.
    const launchSafety = fs.readFileSync(path.join(__dirname, '..', '..', 'launchSafety.ts'), 'utf8');
    expect(launchSafety).toContain('export async function isKillSwitchActive(');
    expect(source).not.toMatch(/isKillSwitchActive\s*\(/);
  });
});
