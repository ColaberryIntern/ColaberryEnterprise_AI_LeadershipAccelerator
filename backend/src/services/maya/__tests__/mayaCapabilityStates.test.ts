import {
  ALL_MAYA_CAPABILITIES, MAYA_TOOL_GOVERNANCE, governanceForTool,
} from '../mayaToolGovernance';
import {
  DEFAULT_STATES, REFUSED_CAPABILITIES, currentCapabilityState, isRaise, isRefusedCapability,
  parseRecord, resolveAllMayaModes, resolveMayaMode, setMayaCapabilityState,
  PromotionReviewError,
  type MayaMode, type MayaPromotionDeps, type PromotableCapability, type PromotionRecord,
  type PromotionState,
} from '../mayaPromotion';
import type { MayaCapability, MayaEnablement } from '../../mayaEnablement';

/**
 * T2 and T3 - the four-mode dial, the three-way setter, and the capabilities that have no dial.
 *
 * `mayaPromotion.test.ts` (M37) already covers the two-mode world and still passes unchanged.
 * This suite covers what this run added:
 *
 *   - `review`, the mode that splits COMPOSE from DELIVER. Without it "turn her on, hold every
 *     message" has no state to live in: `shadow` composes and discards, which is not on, and
 *     `live` delivers without Ali, which is not held.
 *   - `setMayaCapabilityState`, because `promoteMayaCapability` could only reach `live` and
 *     `revertMayaCapability` only `shadow`, so `review` was unreachable in both directions.
 *   - `REFUSED_CAPABILITIES`, which are not a default but the absence of a dial. A capability
 *     that defaults to off can be switched on by an admin in a hurry; these cannot.
 *
 * The settings row is an in-memory value: these tests are about decisions, not Postgres.
 */

function harness(over: Partial<MayaPromotionDeps> & { m29On?: boolean; stored?: unknown } = {}) {
  let stored: unknown = over.stored ?? null;
  const writes: PromotionRecord[] = [];
  const m29On = over.m29On ?? false;
  const deps: MayaPromotionDeps = {
    killSwitchActive: async () => false,
    chatEnabled: () => true,
    readRecord: async () => stored,
    writeRecord: async (v) => { stored = v; writes.push(v); },
    m29: async (cap: MayaCapability): Promise<MayaEnablement> => (m29On
      ? { capability: cap, enabled: true, reason: 'enabled' }
      : { capability: cap, enabled: false, reason: 'growth_flag_off:journeyExecution' }),
    now: () => new Date('2026-11-13T15:00:00Z'),
    ...over,
  };
  return { deps, writes, get stored() { return stored; } };
}

const note = { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed before changing the state' };

/** Every capability that has a dial, which is every capability except the refused three. */
const PROMOTABLE = ALL_MAYA_CAPABILITIES
  .filter((c): c is PromotableCapability => !isRefusedCapability(c));

describe('T3 the dial has four positions and the kill switch beats all of them', () => {
  const STATES: PromotionState[] = ['shadow', 'review', 'live'];

  it.each(STATES.map((s) => [s]))('a stored state of %s resolves to the matching mode', async (state) => {
    // `sendDocument` is the capability this run exists for: outbound, not M29-gated, so its
    // stored state is the ONLY thing deciding its mode.
    const t = harness();
    await setMayaCapabilityState('sendDocument', state, note, t.deps);
    const expected: Record<PromotionState, MayaMode> = { shadow: 'shadow', review: 'review', live: 'live' };
    expect(await resolveMayaMode('sendDocument', t.deps)).toMatchObject({ mode: expected[state] });
  });

  it.each(STATES.map((s) => [s]))('the kill switch beats a stored state of %s', async (state) => {
    const t = harness();
    await setMayaCapabilityState('sendDocument', state, note, t.deps);
    const killed = harness({ ...t.deps, killSwitchActive: async () => true, stored: t.stored });
    expect(await resolveMayaMode('sendDocument', killed.deps))
      .toMatchObject({ mode: 'off', reason: 'kill_switch' });
  });

  it('an UNREADABLE kill switch also beats every state, rather than assuming it is clear', async () => {
    const t = harness();
    await setMayaCapabilityState('sendDocument', 'live', note, t.deps);
    const unreadable = harness({
      ...t.deps, stored: t.stored,
      killSwitchActive: async () => { throw new TypeError('settings unreachable'); },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await resolveMayaMode('sendDocument', unreadable.deps))
      .toMatchObject({ mode: 'off', reason: 'kill_switch_unreadable' });
    // Fails closed, but not silently: an incident reader has to be able to find this.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('every capability is off when the switch is on, refused and promotable alike', async () => {
    const t = harness({ killSwitchActive: async () => true });
    const all = await resolveAllMayaModes(t.deps);
    expect(all).toHaveLength(ALL_MAYA_CAPABILITIES.length);
    for (const m of all) expect(m).toMatchObject({ mode: 'off', reason: 'kill_switch' });
  });
});

describe('T2 the shipped position of every dial', () => {
  it('nothing that reaches a person outside the product defaults to live, except the one declared exception', async () => {
    // THE ASSERTION THIS WHOLE RUN TURNS ON. Read off the effect classes rather than a hand
    // list, so a new outbound tool is covered the moment it is added to the governance map.
    const outbound = Object.keys(MAYA_TOOL_GOVERNANCE)
      .filter((n) => governanceForTool(n)?.effectClass === 'outbound')
      .map((n) => governanceForTool(n)!.capability);
    expect(outbound.length).toBeGreaterThan(0);
    for (const cap of outbound) {
      const state = isRefusedCapability(cap) ? 'refused' : DEFAULT_STATES[cap as PromotableCapability];
      expect({ cap, state }).not.toEqual({ cap, state: 'live' });
    }
  });

  it('sendEmail, the other capability that leaves the platform, does not default to live either', () => {
    expect(DEFAULT_STATES.sendEmail).not.toBe('live');
  });

  it('the transactional receipt is the ONE live exception, and it is pinned by name', () => {
    const receipts = Object.keys(MAYA_TOOL_GOVERNANCE)
      .filter((n) => governanceForTool(n)?.effectClass === 'transactional_receipt');
    expect(receipts).toEqual(['schedule_strategy_call']);
    expect(DEFAULT_STATES.bookStrategyCall).toBe('live');
  });

  it('the in-product capabilities keep working, because governing is not withdrawing', async () => {
    const { deps } = harness();
    const modes = Object.fromEntries((await resolveAllMayaModes(deps)).map((m) => [m.capability, m]));
    for (const cap of ['captureVisitorRecord', 'readSiteChatCatalog', 'composeMarketingDraft',
      'requestHumanCallback', 'runCampusTour', 'offerBookingLink', 'bookStrategyCall']) {
      expect({ cap, mode: modes[cap].mode }).toEqual({ cap, mode: 'live' });
    }
  });

  it('sendDocument ships held, which is the state Ali chose', async () => {
    const { deps } = harness();
    expect(await resolveMayaMode('sendDocument', deps))
      .toMatchObject({ mode: 'review', reason: 'default_review' });
  });

  it('every promotable capability has a declared default, so none resolves by accident', () => {
    for (const cap of PROMOTABLE) expect(DEFAULT_STATES[cap]).toBeDefined();
    expect(Object.keys(DEFAULT_STATES).sort()).toEqual([...PROMOTABLE].sort());
  });
});

describe('T2 the refused capabilities have no dial at all', () => {
  it.each(REFUSED_CAPABILITIES.map((c) => [c]))('%s resolves off and says why', async (cap) => {
    expect(await resolveMayaMode(cap, harness().deps))
      .toMatchObject({ mode: 'off', reason: 'capability_refused' });
  });

  it.each(REFUSED_CAPABILITIES.map((c) => [c]))('%s cannot be set to any state', async (cap) => {
    const t = harness();
    for (const state of ['shadow', 'review', 'live'] as PromotionState[]) {
      await expect(setMayaCapabilityState(cap, state, note, t.deps))
        .rejects.toThrow(PromotionReviewError);
    }
    expect(t.writes).toHaveLength(0);
  });

  it('a hand-written settings row cannot turn one back on', async () => {
    // The scenario: somebody edits `maya_capability_promotions` in the database directly. The
    // refusal is checked BEFORE the record is read, and `parseRecord` drops the entry anyway,
    // so there are two independent reasons this fails rather than one.
    const stored: unknown = {
      capabilities: { sendSmsSummary: { state: 'live', by: 'someone', at: '2026-11-13', note: 'x' } },
      history: [],
    };
    const t = harness({ stored });
    expect(await resolveMayaMode('sendSmsSummary', t.deps))
      .toMatchObject({ mode: 'off', reason: 'capability_refused' });
    expect(parseRecord(stored).capabilities).toEqual({});
  });

  it('the refused list is exactly SMS, voice and campaign enrolment', () => {
    expect([...REFUSED_CAPABILITIES].sort())
      .toEqual(['enrollInCampaign', 'placeVoiceCall', 'sendSmsSummary']);
  });
});

describe('T2 the three-way setter round-trips, and records every hop', () => {
  it('walks shadow -> review -> live -> review -> shadow, persisting each step', async () => {
    const t = harness({ m29On: true });
    const walk: PromotionState[] = ['shadow', 'review', 'live', 'review', 'shadow'];
    // sendDocument's default is `review`, so the walk starts by moving it to `shadow`.
    for (const step of walk) {
      const result = await setMayaCapabilityState('sendDocument', step, note, t.deps);
      expect(result).toMatchObject({ capability: 'sendDocument', state: step, changed: true });
      expect(await currentCapabilityState('sendDocument', t.deps)).toBe(step);
    }
    expect(t.writes).toHaveLength(walk.length);
    const record = parseRecord(t.stored);
    expect(record.history.map((h) => h.state)).toEqual(walk);
    expect(record.history.every((h) => h.action === 'set' && h.by === 'ali@colaberry.com')).toBe(true);
  });

  it('setting the state it already has writes nothing', async () => {
    const t = harness();
    const again = await setMayaCapabilityState('sendDocument', 'review', note, t.deps);
    expect(again).toMatchObject({ state: 'review', changed: false });
    expect(t.writes).toHaveLength(0);
  });

  it('still refuses a change with no reviewer or no note, in every direction', async () => {
    const t = harness();
    await expect(setMayaCapabilityState('sendDocument', 'live', { reviewerId: '', reviewNote: 'ok then' }, t.deps))
      .rejects.toThrow(PromotionReviewError);
    await expect(setMayaCapabilityState('sendDocument', 'live', { reviewerId: 'ali@colaberry.com', reviewNote: 'x' }, t.deps))
      .rejects.toThrow(PromotionReviewError);
    expect(t.writes).toHaveLength(0);
  });
});

describe('T2 the authority decision cannot be answered about a stale state', () => {
  // Found by an independent review of T2, not by this suite, and worth saying so: the hole was
  // between two statements that were each correct. A non-Ali admin lowering `live -> review`
  // whose request interleaved with Ali reverting to `shadow` would have landed a
  // `shadow -> review` RAISE, authorised by a check answered about the earlier world.

  it('refuses when the capability moved after the caller read it', async () => {
    const t = harness();
    await setMayaCapabilityState('sendDocument', 'live', note, t.deps);
    // The route read `live` and decided this was a lawful lowering. Somebody else then
    // reverted it to shadow.
    await setMayaCapabilityState('sendDocument', 'shadow', note, t.deps);
    await expect(setMayaCapabilityState('sendDocument', 'review',
      { ...note, expectedFrom: 'live' }, t.deps))
      .rejects.toThrow(/moved from live to shadow/);
    // And nothing was written, so the stale caller cannot have raised it.
    expect(await currentCapabilityState('sendDocument', t.deps)).toBe('shadow');
  });

  it('proceeds when the capability is where the caller thought it was', async () => {
    const t = harness();
    const result = await setMayaCapabilityState('sendDocument', 'live',
      { ...note, expectedFrom: 'review' }, t.deps);
    expect(result).toMatchObject({ state: 'live', changed: true });
  });

  it('is optional, so the two older routes keep working unchanged', async () => {
    const t = harness();
    await expect(setMayaCapabilityState('sendDocument', 'live', note, t.deps))
      .resolves.toMatchObject({ state: 'live' });
  });
});

describe('T2 which direction is a raise, because that is the auth question', () => {
  it.each([
    ['shadow', 'review', true], ['shadow', 'live', true], ['review', 'live', true],
    ['live', 'review', false], ['live', 'shadow', false], ['review', 'shadow', false],
    ['review', 'review', false],
  ] as Array<[PromotionState, PromotionState, boolean]>)(
    '%s -> %s is a raise: %s',
    (from, to, expected) => { expect(isRaise(from, to)).toBe(expected); },
  );
});

describe('T2 M29 still gates the LIVE path, and only the live path', () => {
  it('a capability raised to live without its flag falls back to shadow and says which flag', async () => {
    const t = harness({ m29On: false });
    await setMayaCapabilityState('sendEmail', 'live', note, t.deps);
    expect(await resolveMayaMode('sendEmail', t.deps))
      .toMatchObject({ mode: 'shadow', reason: 'm29:growth_flag_off:journeyExecution' });
  });

  it('but review does NOT consult it, because a human decision is the stronger gate', async () => {
    // The declared posture change. `review` delivers nothing by itself - it queues, and a named
    // human decides each message - so the flag governs the path that has no human on it. If this
    // test ever shows `shadow`, a message Ali approved would sit in the queue undeliverable and
    // nobody would know why.
    const t = harness({ m29On: false });
    await setMayaCapabilityState('sendEmail', 'review', note, t.deps);
    expect(await resolveMayaMode('sendEmail', t.deps)).toMatchObject({ mode: 'review' });
  });

  it('the site capabilities are not M29-gated at all, so no unset flag silences them', async () => {
    const t = harness({ m29On: false });
    // If these ever consulted M29 they would all be shadow here, because every growth flag is
    // unset in production. That is the failure this run must not introduce.
    expect(await resolveMayaMode('captureVisitorRecord', t.deps)).toMatchObject({ mode: 'live' });
    expect(await resolveMayaMode('bookStrategyCall', t.deps)).toMatchObject({ mode: 'live' });
  });
});
