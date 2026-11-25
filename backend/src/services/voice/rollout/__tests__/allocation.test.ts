import { allocate, bucketOf, type AllocationInput } from '../allocation';
import { compareHistory, historyHash, type HistoryRow } from '../reconcile';
import { exitFor, parseReconcileArgs } from '../../../../scripts/voice/reconcile';
import { drillAllowed } from '../../../../scripts/voice/rollbackDrill';
import { parseRollbackArgs } from '../../../../scripts/voice/rollbackRoute';

const R = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const leads = Array.from({ length: 2000 }, (_, i) => `lead:${i}`);
const inside = leads.find((l) => bucketOf(R, l) < 10)!;
const base = (over: Partial<AllocationInput> = {}): AllocationInput => ({
  route: { id: R, brandSlug: 'colaberry', profileId: 'p1', mode: 'canary', canaryPercent: 10, audience: leads }, version: { id: 'v1', profileId: 'p1', brandSlug: 'colaberry', status: 'published', engine: 'conversation_relay' },
  recipientRef: inside, brandSlug: 'colaberry', testMode: false, directReady: true, prior: null, ...over,
});
const route = (over: object) => ({ route: { ...base().route!, ...over } });
const version = (over: object) => ({ version: { ...base().version!, ...over } });

describe('allocation', () => {
  it('the same person on the same route always lands on the same side', () => {
    for (const l of leads.slice(0, 200)) expect(allocate(base({ recipientRef: l }))).toEqual(allocate(base({ recipientRef: l })));
  });
  it('the share is close to the percentage, and raising it only adds people', () => {
    const direct = (p: number) => new Set(leads.filter((l) => allocate(base({ ...route({ canaryPercent: p }), recipientRef: l })).provider === 'direct'));
    const ten = direct(10); const thirty = direct(30);
    expect(ten.size / leads.length).toBeGreaterThan(0.07);
    expect(ten.size / leads.length).toBeLessThan(0.13);
    for (const l of ten) expect(thirty.has(l)).toBe(true);
    expect(direct(0).size).toBe(0);
  });
  it('different routes put different people in the canary', () => {
    const a = leads.filter((l) => bucketOf(R, l) < 10).length;
    const both = leads.filter((l) => bucketOf(R, l) < 10 && bucketOf('other', l) < 10).length;
    expect(both).toBeLessThan(a / 2);
  });
  it.each<[string, Partial<AllocationInput>, string, string]>([
    ['in the canary', {}, 'direct', 'canary'],
    ['outside the approved audience', route({ audience: [] }), 'synthflow_legacy', 'outside_audience'],
    ['no route', { route: null }, 'synthflow_legacy', 'no_route'],
    ['legacy', route({ mode: 'legacy' }), 'synthflow_legacy', 'legacy_mode'],
    ['shadow never places a second call', route({ mode: 'shadow' }), 'synthflow_legacy', 'shadow_is_evaluation_only'],
    ['an unknown mode', route({ mode: 'surprise' }), 'synthflow_legacy', 'unknown_mode'],
    ['disabled', route({ mode: 'disabled' }), 'none', 'route_disabled'],
    ['a test route and a real call', route({ mode: 'test' }), 'synthflow_legacy', 'test_mode_route'],
    ['live', route({ mode: 'live', audience: [] }), 'direct', 'live'],
    ['another brand', { brandSlug: 'other' }, 'synthflow_legacy', 'brand_mismatch'],
    ['a version of another brand', version({ brandSlug: 'other' }), 'synthflow_legacy', 'version_not_for_this_route'],
    ['a version of another agent', version({ profileId: 'p2' }), 'synthflow_legacy', 'version_not_for_this_route'],
    ['no version', { version: null }, 'synthflow_legacy', 'version_not_published'],
    ['a retired version', version({ status: 'retired' }), 'synthflow_legacy', 'version_not_published'],
    ['engines not ready', { directReady: false }, 'synthflow_legacy', 'direct_not_ready'],
    ['Engine B on a real call', version({ engine: 'openai_realtime' }), 'synthflow_legacy', 'engine_b_test_only'],
    ['Engine B on a test call', { ...route({ mode: 'test' }), ...version({ engine: 'openai_realtime' }), testMode: true }, 'direct', 'test'],
    ['an unknown engine', version({ engine: 'x' }), 'synthflow_legacy', 'engine_unknown'],
    ['already dispatched', { prior: { engine: 'conversation_relay', state: 'completed' } }, 'none', 'already_dispatched'],
    ['outcome unknown, even after a rollback', { ...route({ mode: 'legacy' }), prior: { engine: 'conversation_relay', state: 'dispatch_unknown' } }, 'none', 'outcome_unknown_never_redialed'],
  ])('%s', (_n, over, provider, reason) => expect(allocate(base(over))).toMatchObject({ provider, reason }));
});

describe('history', () => {
  const row = (id: string, over: Partial<HistoryRow> = {}): HistoryRow => ({ id, startedAt: '2026-11-01T15:00:00Z', durationSeconds: 60, outcome: 'completed', ...over });
  it('exact match passes, whatever the order or date spelling', () => {
    expect(compareHistory([row('a'), row('b')], [row('b'), row('a', { startedAt: '2026-11-01T15:00:00.000Z' })])).toMatchObject({ ok: true, manifest: 2, imported: 2 });
    expect(historyHash(row('a'))).not.toBe(historyHash(row('a', { outcome: 'failed' })));
  });
  it('missing, extra, changed and duplicate calls are each named; an empty export is not a pass', () => {
    expect(compareHistory([row('a'), row('b')], [row('a')])).toMatchObject({ ok: false, missing: ['b'] });
    expect(compareHistory([row('a')], [row('a'), row('z')])).toMatchObject({ ok: false, unexpected: ['z'] });
    expect(compareHistory([row('a')], [row('a', { durationSeconds: 61 })])).toMatchObject({ ok: false, different: ['a'] });
    expect(compareHistory([row('a')], [row('a'), row('a')])).toMatchObject({ ok: false, duplicates: ['a'] });
    expect(compareHistory([], []).ok).toBe(false);
  });
});

describe('commands are dry by default and refuse what they do not know', () => {
  it('reconcile', () => {
    expect(parseReconcileArgs([])).toEqual({ ok: true, mode: 'calls', apply: false });
    expect(parseReconcileArgs(['--dry-run'])).toMatchObject({ apply: false });
    expect(parseReconcileArgs(['--apply'])).toMatchObject({ apply: true });
    for (const bad of [['--aply'], ['--apply', '--dry-run'], ['--history', 'a']]) expect(parseReconcileArgs(bad).ok).toBe(false);
    const clean = { unreconciled: 0, ambiguousReservations: 0, canaryOutsideAudience: [], failed: [] };
    expect(exitFor(clean)).toBe(0);
    for (const dirty of [{ unreconciled: 1 }, { ambiguousReservations: 1 }, { canaryOutsideAudience: ['c'] }, { failed: [{ callId: 'c', errorClass: 'x' }] }]) expect(exitFor({ ...clean, ...dirty })).toBe(1);
  });
  it('the drill runs only on a local database made for it', () => {
    expect(drillAllowed('postgres://u@127.0.0.1:5432/voice_drill')).toBe(true);
    for (const bad of [undefined, '', 'x', 'postgres://u@127.0.0.1/postgres', 'postgres://u@db.example/voice_drill', 'postgres://u@127.0.0.1.example/voice_drill']) expect(drillAllowed(bad)).toBe(false);
  });
  it('rollback', () => {
    expect(parseRollbackArgs(['--path', 'agent-tool', '--actor', 'admin-1'])).toEqual({ ok: true, path: 'agent-tool', actor: 'admin-1', apply: false });
    expect(parseRollbackArgs(['--path', 'agent-tool', '--actor', 'admin-1', '--apply'])).toMatchObject({ apply: true });
    for (const bad of [[], ['--path', 'x'], ['--path', 'Bad Path', '--actor', 'admin-1'], ['--path', 'agent-tool']]) expect(parseRollbackArgs(bad).ok).toBe(false);
  });
});
