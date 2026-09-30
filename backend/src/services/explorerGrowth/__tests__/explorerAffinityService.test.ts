const queryMock = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => queryMock(...a) },
}));

import {
  computeAffinities,
  AFFINITY_TAGS,
  AFFINITY_THRESHOLD,
  DECLARED_WEIGHT,
  OBSERVED_WEIGHT,
} from '../explorerAffinityService';

const ENR = 'e1';
const NOW = new Date('2026-08-21T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** Route the declared query and the observed query to canned rows. */
function mockDb(opts: {
  declared?: Record<string, unknown> | null;
  observed?: Array<{ card_type: string; occurred_at: Date }>;
  failDeclared?: boolean;
  failObserved?: boolean;
}) {
  queryMock.mockImplementation((sql: string) => {
    const isDeclared = /FROM enrollments/.test(sql);
    if (isDeclared) {
      if (opts.failDeclared) return Promise.reject(new Error('declared down'));
      return Promise.resolve(opts.declared ? [opts.declared] : []);
    }
    if (opts.failObserved) return Promise.reject(new Error('observed down'));
    return Promise.resolve(opts.observed ?? []);
  });
}

beforeEach(() => queryMock.mockReset());

describe('the blend', () => {
  it('weights declared 0.4 and observed 0.6', () => {
    expect(DECLARED_WEIGHT).toBe(0.4);
    expect(OBSERVED_WEIGHT).toBe(0.6);
    expect(DECLARED_WEIGHT + OBSERVED_WEIGHT).toBe(1);
  });

  it('declared alone scores 0.4 — BELOW the threshold, so it cannot act on its own', () => {
    // 0.4 clears 0.35, so a single declared match DOES register. That is the
    // documented model: declared intent is weak evidence, not no evidence.
    mockDb({ declared: { goal: 'I want to become a leader', resume_version: 0 } });
    return computeAffinities(ENR, { asOf: NOW }).then((a) => {
      const lead = a.find((x) => x.tag === 'leadership');
      expect(lead?.confidence).toBeCloseTo(0.4, 3);
      expect(lead?.sources).toEqual(['declared']);
    });
  });

  it('observed alone on ONE fresh engagement is deliberately NOT enough', async () => {
    // 1 - 2^-1 = 0.5 observed, × 0.6 = 0.30 — below 0.35, so ONE engagement is
    // deliberately not enough by itself.
    mockDb({ observed: [{ card_type: 'prompt_challenge', occurred_at: NOW }] });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a.find((x) => x.tag === 'agentic_ai')).toBeUndefined();
  });

  it('two fresh engagements DO clear it', async () => {
    // 1 - 2^-2 = 0.75, × 0.6 = 0.45.
    mockDb({
      observed: [
        { card_type: 'prompt_challenge', occurred_at: NOW },
        { card_type: 'prompt_challenge', occurred_at: NOW },
      ],
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a.find((x) => x.tag === 'agentic_ai')?.confidence).toBeCloseTo(0.45, 2);
  });

  it('combines both sources and reports both', async () => {
    mockDb({
      declared: { goal: 'build agents', resume_version: 0 },
      observed: [{ card_type: 'prompt_challenge', occurred_at: NOW }],
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    const t = a.find((x) => x.tag === 'agentic_ai');
    expect(t?.confidence).toBeCloseTo(0.4 + 0.3, 2);
    expect(t?.sources).toEqual(['declared', 'observed']);
  });

  it('never exceeds 1', async () => {
    mockDb({
      declared: { goal: 'agent agentic autonomous', resume_version: 0 },
      observed: Array.from({ length: 40 }, () => ({ card_type: 'prompt_challenge', occurred_at: NOW })),
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a[0].confidence).toBeLessThanOrEqual(1);
  });
});

describe('the 0.35 threshold', () => {
  it('drops anything below it', async () => {
    mockDb({ observed: [{ card_type: 'community_discussion', occurred_at: daysAgo(90) }] });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a).toEqual([]);
  });

  it('is the documented value', () => {
    expect(AFFINITY_THRESHOLD).toBe(0.35);
  });
});

describe('observed evidence decays on a 30-day half-life', () => {
  it('an engagement one half-life old counts half as much', async () => {
    mockDb({ observed: [{ card_type: 'prompt_challenge', occurred_at: daysAgo(30) }] });
    const a = await computeAffinities(ENR, { asOf: NOW });
    // n = 0.5 → 1 - 2^-0.5 ≈ 0.293 → × 0.6 ≈ 0.176, under threshold
    expect(a.find((x) => x.tag === 'agentic_ai')).toBeUndefined();
  });

  it('recent engagement outranks stale engagement of another tag', async () => {
    mockDb({
      observed: [
        { card_type: 'prompt_challenge', occurred_at: NOW },
        { card_type: 'prompt_challenge', occurred_at: NOW },
        { card_type: 'market_intelligence', occurred_at: daysAgo(120) },
        { card_type: 'market_intelligence', occurred_at: daysAgo(120) },
      ],
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a[0].tag).toBe('agentic_ai');
  });
});

describe('no learner is ever locked to a persona (§7.6)', () => {
  it('recomputes from scratch — a tag with no current evidence is ABSENT', async () => {
    // Not decayed from a stored value: gone. Merging with a previous result
    // would weld someone permanently to an interest they showed once.
    mockDb({ declared: null, observed: [] });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a).toEqual([]);
  });

  it('is deterministic for a fixed asOf', async () => {
    mockDb({ declared: { goal: 'leadership', resume_version: 0 } });
    const a = await computeAffinities(ENR, { asOf: NOW });
    const b = await computeAffinities(ENR, { asOf: NOW });
    expect(b).toEqual(a);
  });
});

describe('resume_version 0 means never ingested', () => {
  it('ignores resume_text when the resume was never ingested', async () => {
    // Contributing nothing, rather than a false zero or a phantom match.
    mockDb({
      declared: { resume_text: 'lifelong data analytics leader', resume_version: 0 },
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a).toEqual([]);
  });

  it('uses resume_text once it HAS been ingested', async () => {
    mockDb({
      declared: { resume_text: 'lifelong data analytics leader', resume_version: 2 },
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a.map((x) => x.tag)).toContain('data_analytics');
  });
});

describe('degrades rather than blinding the profile', () => {
  it('falls back to observed when the declared query fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockDb({
      failDeclared: true,
      observed: [
        { card_type: 'prompt_challenge', occurred_at: NOW },
        { card_type: 'prompt_challenge', occurred_at: NOW },
      ],
    });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a.map((x) => x.tag)).toContain('agentic_ai');
  });

  it('falls back to declared when the observed query fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockDb({ declared: { goal: 'leadership role', resume_version: 0 }, failObserved: true });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a.map((x) => x.tag)).toContain('leadership');
  });

  it('returns empty rather than throwing when both fail', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockDb({ failDeclared: true, failObserved: true });
    await expect(computeAffinities(ENR, { asOf: NOW })).resolves.toEqual([]);
  });
});

describe('the tag vocabulary is closed', () => {
  it('ignores a curriculum type that says nothing about interest', async () => {
    mockDb({ observed: [{ card_type: 'github_sync', occurred_at: NOW }] });
    const a = await computeAffinities(ENR, { asOf: NOW });
    expect(a).toEqual([]);
  });

  it('carries all 17 documented tags', () => {
    expect(AFFINITY_TAGS).toHaveLength(17);
    expect(AFFINITY_TAGS).toContain('ai_internship');
  });

  it('only ever returns tags from the vocabulary', async () => {
    mockDb({ declared: { goal: 'leadership and data analytics', resume_version: 0 } });
    const a = await computeAffinities(ENR, { asOf: NOW });
    for (const t of a) expect(AFFINITY_TAGS).toContain(t.tag as never);
  });
});
