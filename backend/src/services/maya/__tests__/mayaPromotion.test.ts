import {
  DEFAULT_STATES, parseRecord, promoteMayaCapability, resolveAllMayaModes, resolveMayaMode, revertMayaCapability,
  PromotionReviewError, type MayaPromotionDeps, type PromotionRecord,
} from '../mayaPromotion';
import type { MayaCapability, MayaEnablement } from '../../mayaEnablement';

/**
 * M37 - the shadow-to-live switch. Every acceptance criterion of the ticket is a test here:
 *   - each capability promotes independently
 *   - promote, verify, revert, verify again (the cycle)
 *   - the kill switch silences her immediately, and an unreadable switch counts as on
 *   - no promotion without human review (reviewer + note), and no promotion by default
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
    now: () => new Date('2026-11-09T15:00:00Z'),
    ...over,
  };
  return { deps, writes, get stored() { return stored; } };
}

const review = { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed shadow output for a week' };

describe('resolveMayaMode defaults (Q2: A)', () => {
  it('starts the DM reply live and everything else in shadow, with no stored record', async () => {
    const { deps } = harness();
    const modes = Object.fromEntries((await resolveAllMayaModes(deps)).map((m) => [m.capability, m]));
    expect(modes.respondToExplorerDm).toMatchObject({ mode: 'live', reason: 'default_live' });
    expect(modes.sendInAppWelcome).toMatchObject({ mode: 'shadow', reason: 'not_promoted' });
    expect(modes.createJourneyHandoff).toMatchObject({ mode: 'shadow', reason: 'not_promoted' });
    expect(modes.readPerson360).toMatchObject({ mode: 'shadow', reason: 'not_promoted' });
    expect(DEFAULT_STATES.respondToExplorerDm).toBe('live');
  });

  it('keeps the DM reply live even though every M29 flag is off (production today)', async () => {
    const m29 = jest.fn();
    const { deps } = harness({ m29 });
    expect((await resolveMayaMode('respondToExplorerDm', deps)).mode).toBe('live');
    expect(m29).not.toHaveBeenCalled();
  });

  it('turns the DM reply off when ENABLE_CHAT is off', async () => {
    const { deps } = harness({ chatEnabled: () => false });
    expect(await resolveMayaMode('respondToExplorerDm', deps)).toMatchObject({ mode: 'off', reason: 'chat_off' });
  });
});

describe('the kill switch silences every capability', () => {
  it('on -> off for all four, regardless of promotion', async () => {
    const t = harness({ m29On: true });
    for (const cap of ['sendInAppWelcome', 'createJourneyHandoff', 'readPerson360'] as const) await promoteMayaCapability(cap, review, t.deps);
    t.deps.killSwitchActive = async () => true;
    for (const m of await resolveAllMayaModes(t.deps)) expect(m).toMatchObject({ mode: 'off', reason: 'kill_switch' });
  });

  it('unreadable switch fails CLOSED', async () => {
    const { deps } = harness({ killSwitchActive: async () => { throw new Error('db down'); } });
    for (const m of await resolveAllMayaModes(deps)) expect(m).toMatchObject({ mode: 'off', reason: 'kill_switch_unreadable' });
  });

  it('unreadable promotion record fails CLOSED', async () => {
    const { deps } = harness({ readRecord: async () => { throw new Error('db down'); } });
    expect(await resolveMayaMode('respondToExplorerDm', deps)).toMatchObject({ mode: 'off', reason: 'promotion_unreadable' });
  });
});

describe('promotion requires a human review', () => {
  it('rejects a promotion with no note or no reviewer, and stores nothing', async () => {
    const t = harness({ m29On: true });
    await expect(promoteMayaCapability('sendInAppWelcome', { reviewerId: 'ali@colaberry.com', reviewNote: '  ' }, t.deps)).rejects.toBeInstanceOf(PromotionReviewError);
    await expect(promoteMayaCapability('sendInAppWelcome', { reviewerId: '', reviewNote: 'looks fine' }, t.deps)).rejects.toBeInstanceOf(PromotionReviewError);
    expect(t.writes).toHaveLength(0);
    expect((await resolveMayaMode('sendInAppWelcome', t.deps)).mode).toBe('shadow');
  });

  it('a promoted proactive capability stays shadow while M29 is off (NOTHING SENDS)', async () => {
    const t = harness({ m29On: false });
    await promoteMayaCapability('sendInAppWelcome', review, t.deps);
    expect(await resolveMayaMode('sendInAppWelcome', t.deps)).toMatchObject({ mode: 'shadow', reason: 'm29:growth_flag_off:journeyExecution' });
  });
});

describe('promote, verify, revert, verify again', () => {
  it('runs the full cycle on one capability without touching the others', async () => {
    const t = harness({ m29On: true });
    expect((await resolveMayaMode('sendInAppWelcome', t.deps)).mode).toBe('shadow');

    const p = await promoteMayaCapability('sendInAppWelcome', review, t.deps);
    expect(p).toEqual({ capability: 'sendInAppWelcome', state: 'live', changed: true });
    expect(await resolveMayaMode('sendInAppWelcome', t.deps)).toMatchObject({ mode: 'live', reason: 'promoted' });
    expect((await resolveMayaMode('createJourneyHandoff', t.deps)).mode).toBe('shadow'); // independent

    const r = await revertMayaCapability('sendInAppWelcome', { reviewerId: 'ops@colaberry.com', reviewNote: 'Pausing after a complaint' }, t.deps);
    expect(r).toEqual({ capability: 'sendInAppWelcome', state: 'shadow', changed: true });
    expect((await resolveMayaMode('sendInAppWelcome', t.deps)).mode).toBe('shadow');

    await promoteMayaCapability('sendInAppWelcome', review, t.deps);
    expect((await resolveMayaMode('sendInAppWelcome', t.deps)).mode).toBe('live');

    const rec = parseRecord(t.stored);
    expect(rec.history.map((h) => `${h.action}:${h.by}`)).toEqual([
      'promote:ali@colaberry.com', 'revert:ops@colaberry.com', 'promote:ali@colaberry.com',
    ]);
  });

  it('can revert the default-live DM reply to shadow, and that sticks', async () => {
    const t = harness();
    await revertMayaCapability('respondToExplorerDm', review, t.deps);
    expect(await resolveMayaMode('respondToExplorerDm', t.deps)).toMatchObject({ mode: 'shadow', reason: 'not_promoted' });
  });

  it('promoting the default-live DM reply is a no-op: nothing written, no history entry', async () => {
    const t = harness();
    expect(await promoteMayaCapability('respondToExplorerDm', review, t.deps)).toEqual({ capability: 'respondToExplorerDm', state: 'live', changed: false });
    expect(t.writes).toHaveLength(0);
  });

  it('promoting an already-promoted capability is a no-op (idempotent)', async () => {
    const t = harness({ m29On: true });
    await promoteMayaCapability('createJourneyHandoff', review, t.deps);
    const again = await promoteMayaCapability('createJourneyHandoff', review, t.deps);
    expect(again.changed).toBe(false);
    expect(t.writes).toHaveLength(1);
  });
});

describe('parseRecord', () => {
  it('ignores unknown capabilities and malformed states rather than trusting them', () => {
    const rec = parseRecord({ capabilities: { sendInAppWelcome: { state: 'on' }, bogus: { state: 'live' }, readPerson360: { state: 'live', by: 'a', at: 'b', note: 'c' } } });
    expect(Object.keys(rec.capabilities)).toEqual(['readPerson360']);
    expect(parseRecord('nonsense')).toEqual({ capabilities: {}, history: [] });
  });
});
