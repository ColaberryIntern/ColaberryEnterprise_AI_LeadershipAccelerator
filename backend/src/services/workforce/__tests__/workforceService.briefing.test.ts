/**
 * workforceService.briefing() — Workforce OS perf fix, round 2 (2026-08-18,
 * session CC-20260818-wf9k). An independent loop-production-verifier caught a
 * real gap after round 1: gatherSignals()'s N+1 fix was real (schoolSignals.ts),
 * but briefing()'s OTHER leg, the uncached LLM call (generateBriefing()),
 * measured 2,369ms live and was never diagnosed. Fix: briefing() must NEVER
 * await the LLM call — it serves the existing deterministic fallback instantly
 * on a cold/expired cache while regenerating in the background. These tests
 * protect that contract directly (not just "the numbers happen to be fast").
 */
jest.mock('../../ops/schoolSignals', () => ({ gatherSignals: jest.fn() }));
jest.mock('../../ops/schoolHealth', () => ({ computeSchoolHealth: jest.fn() }));
jest.mock('../../ops/directors', () => ({
  runDirectors: jest.fn(),
  rankRecommendations: jest.fn(() => []),
}));
jest.mock('../../ops/executiveBriefing', () => ({
  generateBriefing: jest.fn(),
  deterministicBriefing: jest.fn(),
}));
jest.mock('../../../models/WorkforceTask', () => ({ findAll: jest.fn() }));
jest.mock('../../../models/WorkforceMeeting', () => ({ findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() }));
jest.mock('../../../models/WorkforceMemory', () => ({ findAll: jest.fn(), create: jest.fn() }));
jest.mock('../../../models/WorkforceMessage', () => ({ findAll: jest.fn(), create: jest.fn() }));

import { gatherSignals } from '../../ops/schoolSignals';
import { computeSchoolHealth } from '../../ops/schoolHealth';
import { runDirectors } from '../../ops/directors';
import { generateBriefing, deterministicBriefing } from '../../ops/executiveBriefing';
import { briefing, __resetBriefingCacheForTests } from '../workforceService';

const mockGatherSignals = gatherSignals as unknown as jest.Mock;
const mockComputeHealth = computeSchoolHealth as unknown as jest.Mock;
const mockRunDirectors = runDirectors as unknown as jest.Mock;
const mockGenerateBriefing = generateBriefing as unknown as jest.Mock;
const mockDeterministicBriefing = deterministicBriefing as unknown as jest.Mock;

const SIGNALS = { generated_at: '2026-08-18T00:00:00.000Z', students: {}, employment: {}, certification: {}, revenue: {}, curriculum: {} } as any;
const HEALTH = { overall: 80, band: 'thriving', subs: [] } as any;
const DIRS: any[] = [];
const DETERMINISTIC = { good_morning: 'Good morning (deterministic).', yesterday: '', priorities: [], risks: [], wins: [] };
const LLM_BRIEF = { good_morning: 'Good morning (LLM-written).', yesterday: '', priorities: [], risks: [], wins: [] };

beforeEach(() => {
  jest.clearAllMocks();
  __resetBriefingCacheForTests();
  mockGatherSignals.mockResolvedValue(SIGNALS);
  mockComputeHealth.mockReturnValue(HEALTH);
  mockRunDirectors.mockReturnValue(DIRS);
  mockDeterministicBriefing.mockReturnValue(DETERMINISTIC);
  // Never resolves by default in these tests unless a test explicitly wants it
  // to — proves briefing() never blocks on it.
  mockGenerateBriefing.mockReturnValue(new Promise(() => {}));
});

describe('briefing() — never blocks on the LLM call', () => {
  it('happy path (cold cache): returns the deterministic narrative immediately, without awaiting generateBriefing()', async () => {
    const result = await briefing();

    expect(result.briefing).toEqual(DETERMINISTIC);
    expect(mockGenerateBriefing).toHaveBeenCalledTimes(1); // kicked off...
    // ...but the awaited call above already resolved — proves briefing() did
    // not wait on it (mockGenerateBriefing is a never-resolving promise here).
  });

  it('warm cache: once a background regeneration has completed, subsequent calls return the real LLM-written narrative', async () => {
    let resolveLlm: (v: any) => void;
    mockGenerateBriefing.mockReturnValue(new Promise((resolve) => { resolveLlm = resolve; }));

    const first = await briefing();
    expect(first.briefing).toEqual(DETERMINISTIC); // cold: deterministic

    // Simulate the background regeneration completing.
    await new Promise((resolve) => {
      resolveLlm!(LLM_BRIEF);
      setImmediate(resolve);
    });

    const second = await briefing();
    expect(second.briefing).toEqual(LLM_BRIEF); // warm: real narrative
  });

  it('idempotency / cost control: multiple concurrent cold-cache calls trigger exactly ONE background LLM regeneration, never a thundering herd', async () => {
    await Promise.all([briefing(), briefing(), briefing()]);

    expect(mockGenerateBriefing).toHaveBeenCalledTimes(1);
  });

  it('failure path: a background LLM regeneration failure is caught, logged, and does not throw or crash the next request', async () => {
    mockGenerateBriefing.mockRejectedValueOnce(new Error('LLM timeout'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await briefing(); // triggers the failing background regen
    await new Promise((resolve) => setImmediate(resolve)); // let the rejection settle

    await expect(briefing()).resolves.toBeDefined(); // next call must not throw
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('background briefing regeneration failed'), 'LLM timeout');

    warnSpy.mockRestore();
  });

  it('boundary: gatherSignals()/health/directors are still computed fresh on every call, even when the briefing narrative is cached', async () => {
    await briefing();
    await briefing();

    expect(mockGatherSignals).toHaveBeenCalledTimes(2);
    expect(mockComputeHealth).toHaveBeenCalledTimes(2);
  });

  it('boundary: returns the real chief-of-staff pub shape and generated_at from live signals, not from the cache', async () => {
    const result = await briefing();
    expect(result.generated_at).toBe(SIGNALS.generated_at);
    expect(result.by).toBeDefined();
  });
});
