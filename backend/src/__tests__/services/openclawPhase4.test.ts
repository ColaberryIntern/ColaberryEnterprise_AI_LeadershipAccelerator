/**
 * OpenClaw Phase 4 — Selective Automation & Scaled Execution Tests
 *
 * Tests pure functions only (no DB):
 * - classifyAutomationRisk
 * - checkRateLimit
 * - evaluateCircuit
 * - computeKeywordPriority
 * - computePlatformScanPriority
 */

import { classifyAutomationRisk } from '../../services/agents/openclaw/openclawRiskClassifier';
import { checkRateLimit } from '../../services/agents/openclaw/openclawRateLimiter';
import { evaluateCircuit } from '../../services/agents/openclaw/openclawCircuitBreaker';
import {
  computeKeywordPriority,
  computePlatformScanPriority,
} from '../../services/agents/openclaw/openclawSignalScaler';

// ─── classifyAutomationRisk ──────────────────────────────────────────────────

describe('classifyAutomationRisk', () => {
  const base = { action_type: 'reply' as const, conversation_stage: 1, lead_score: 20, intent_level: 'low' as const };

  test('HUMAN_REQUIRED for reddit (HUMAN_EXECUTION)', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'reddit' });
    expect(result.risk).toBe('HUMAN_REQUIRED');
    expect(result.auto_approve).toBe(false);
  });

  test('HUMAN_REQUIRED for hackernews (HUMAN_EXECUTION)', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'hackernews' });
    expect(result.risk).toBe('HUMAN_REQUIRED');
  });

  test('HUMAN_REQUIRED for stage >= 5 regardless of platform', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'twitter', conversation_stage: 5 });
    expect(result.risk).toBe('HUMAN_REQUIRED');
  });

  test('HUMAN_REQUIRED for stage 7 on API_POSTING platform', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'devto', conversation_stage: 7 });
    expect(result.risk).toBe('HUMAN_REQUIRED');
  });

  test('HUMAN_REQUIRED for dm_suggestion', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'twitter', action_type: 'dm_suggestion' });
    expect(result.risk).toBe('HUMAN_REQUIRED');
  });

  test('HUMAN_REQUIRED for create_post on PASSIVE_SIGNAL platform', () => {
    // quora is PASSIVE_SIGNAL + HUMAN_EXECUTION, so it hits HUMAN_EXECUTION first
    // Use a hypothetical: devto is HYBRID_ENGAGEMENT, so create_post IS allowed on it
    // hackernews is PASSIVE_SIGNAL — but also HUMAN_EXECUTION
    // All PASSIVE_SIGNAL platforms are also HUMAN_EXECUTION, so HUMAN_REQUIRED either way
    const result = classifyAutomationRisk({ ...base, platform: 'reddit', action_type: 'create_post' });
    expect(result.risk).toBe('HUMAN_REQUIRED');
  });

  test('ASSISTED_AUTOMATION for high lead_score (>= 70) on API_POSTING platform', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'twitter', lead_score: 75 });
    expect(result.risk).toBe('ASSISTED_AUTOMATION');
    expect(result.requires_human_review).toBe(true);
  });

  test('ASSISTED_AUTOMATION for high intent at stage 3+', () => {
    const result = classifyAutomationRisk({
      ...base,
      platform: 'devto',
      intent_level: 'high',
      conversation_stage: 3,
      lead_score: 30,
    });
    expect(result.risk).toBe('ASSISTED_AUTOMATION');
  });

  test('SAFE_AUTOMATION for twitter reply at stage 1 with low score', () => {
    // twitter is HYBRID_ENGAGEMENT + API_POSTING → shouldAutoApprove returns true
    const result = classifyAutomationRisk({ ...base, platform: 'twitter' });
    expect(result.risk).toBe('SAFE_AUTOMATION');
    expect(result.auto_approve).toBe(true);
  });

  test('SAFE_AUTOMATION for devto reply at stage 2', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'devto', conversation_stage: 2 });
    expect(result.risk).toBe('SAFE_AUTOMATION');
    expect(result.auto_approve).toBe(true);
  });

  test('Unknown platform defaults to HUMAN_REQUIRED', () => {
    const result = classifyAutomationRisk({ ...base, platform: 'unknown_platform_xyz' });
    expect(result.risk).toBe('HUMAN_REQUIRED');
  });
});

// ─── checkRateLimit ──────────────────────────────────────────────────────────

describe('checkRateLimit', () => {
  test('blocks when hourly limit exceeded', () => {
    // twitter is HYBRID_ENGAGEMENT → max_per_hour: 4
    const result = checkRateLimit('twitter', 4, 5);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Hourly limit');
  });

  test('blocks when daily limit exceeded', () => {
    // twitter is HYBRID_ENGAGEMENT → max_per_day: 20
    const result = checkRateLimit('twitter', 1, 20);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily limit');
  });

  test('allows when within both limits', () => {
    const result = checkRateLimit('twitter', 2, 10);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('uses correct limits per strategy type', () => {
    // reddit is PASSIVE_SIGNAL → max_per_hour: 2, max_per_day: 8
    const result = checkRateLimit('reddit', 1, 1);
    expect(result.limit_hour).toBe(2);
    expect(result.limit_day).toBe(8);

    // linkedin is AUTHORITY_BROADCAST → max_per_hour: 3, max_per_day: 10
    const result2 = checkRateLimit('linkedin', 1, 1);
    expect(result2.limit_hour).toBe(3);
    expect(result2.limit_day).toBe(10);
  });

  test('PASSIVE_SIGNAL platforms block at lower limits', () => {
    const result = checkRateLimit('reddit', 2, 3);
    expect(result.allowed).toBe(false);
  });
});

// ─── evaluateCircuit ─────────────────────────────────────────────────────────

describe('evaluateCircuit', () => {
  test('CLOSED when error rate below threshold', () => {
    const state = evaluateCircuit(1, 10, null, null);
    expect(state).toBe('CLOSED');
  });

  test('OPEN when error rate exceeds 50% with >= 5 samples', () => {
    const state = evaluateCircuit(4, 6, new Date(), null);
    expect(state).toBe('OPEN');
  });

  test('does not trip on small sample (2/3 = 67% but min_sample=5)', () => {
    const state = evaluateCircuit(2, 3, new Date(), null);
    expect(state).toBe('CLOSED');
  });

  test('HALF_OPEN after cooldown expires', () => {
    const openedAt = new Date(Date.now() - 35 * 60 * 1000); // 35 minutes ago
    const state = evaluateCircuit(4, 6, new Date(), openedAt);
    expect(state).toBe('HALF_OPEN');
  });

  test('stays OPEN during cooldown', () => {
    const openedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const state = evaluateCircuit(4, 6, new Date(), openedAt);
    expect(state).toBe('OPEN');
  });

  test('CLOSED when error count is zero with enough samples', () => {
    const state = evaluateCircuit(0, 10, null, null);
    expect(state).toBe('CLOSED');
  });

  test('custom config threshold', () => {
    // 30% error rate, custom threshold at 25%
    const state = evaluateCircuit(3, 10, new Date(), null, { error_threshold_percent: 25 });
    expect(state).toBe('OPEN');
  });
});

// ─── computeKeywordPriority ─────────────────────────────────────────────────

describe('computeKeywordPriority', () => {
  const baseKeywords = ['ai training', 'enterprise ai', 'leadership'];

  test('returns top-performing topics as primary keywords', () => {
    const learnings = [
      { metric_key: 'data analytics', metric_value: 8.5, sample_size: 10, confidence: 0.8 },
      { metric_key: 'ml ops', metric_value: 7.2, sample_size: 5, confidence: 0.6 },
      { metric_key: 'ai governance', metric_value: 6.0, sample_size: 4, confidence: 0.5 },
    ];
    const result = computeKeywordPriority(learnings, baseKeywords);
    expect(result.primary).toContain('data analytics');
    expect(result.primary).toContain('ml ops');
    expect(result.primary.length).toBeLessThanOrEqual(10);
  });

  test('falls back to base keywords when no learnings', () => {
    const result = computeKeywordPriority([], baseKeywords);
    expect(result.primary).toHaveLength(0);
    expect(result.secondary).toEqual(baseKeywords);
  });

  test('deduplicates between primary and secondary', () => {
    const learnings = [
      { metric_key: 'ai training', metric_value: 9.0, sample_size: 10, confidence: 0.9 },
    ];
    const result = computeKeywordPriority(learnings, baseKeywords);
    expect(result.primary).toContain('ai training');
    // Should not appear in secondary since it's already primary
    expect(result.secondary).not.toContain('ai training');
  });

  test('filters out low-confidence learnings', () => {
    const learnings = [
      { metric_key: 'weak signal', metric_value: 9.0, sample_size: 1, confidence: 0.1 },
    ];
    const result = computeKeywordPriority(learnings, baseKeywords);
    expect(result.primary).not.toContain('weak signal');
  });

  test('assigns weights to all keywords', () => {
    const learnings = [
      { metric_key: 'data analytics', metric_value: 8.5, sample_size: 10, confidence: 0.8 },
    ];
    const result = computeKeywordPriority(learnings, baseKeywords);
    expect(result.weights['data analytics']).toBe(8.5);
    expect(result.weights['ai training']).toBe(1); // default weight
  });
});

// ─── computePlatformScanPriority ─────────────────────────────────────────────

describe('computePlatformScanPriority', () => {
  const platforms = ['devto', 'twitter', 'youtube'];

  test('high-engagement platforms get > 1.0 multiplier', () => {
    const learnings = [
      { metric_key: 'devto', metric_value: 8.0, sample_size: 10 },
      { metric_key: 'twitter', metric_value: 4.0, sample_size: 10 },
      { metric_key: 'youtube', metric_value: 3.0, sample_size: 10 },
    ];
    // avg = 5.0, devto = 8/5 = 1.6
    const result = computePlatformScanPriority(learnings, platforms);
    const devto = result.find(r => r.platform === 'devto')!;
    expect(devto.scan_frequency_multiplier).toBeGreaterThan(1.0);
  });

  test('low-engagement platforms get < 1.0 multiplier', () => {
    const learnings = [
      { metric_key: 'devto', metric_value: 8.0, sample_size: 10 },
      { metric_key: 'twitter', metric_value: 4.0, sample_size: 10 },
      { metric_key: 'youtube', metric_value: 2.0, sample_size: 10 },
    ];
    // avg ~4.67, youtube = 2/4.67 ≈ 0.43 → capped at 0.5
    const result = computePlatformScanPriority(learnings, platforms);
    const youtube = result.find(r => r.platform === 'youtube')!;
    expect(youtube.scan_frequency_multiplier).toBeLessThan(1.0);
  });

  test('multiplier capped at [0.5, 2.0]', () => {
    const learnings = [
      { metric_key: 'devto', metric_value: 100, sample_size: 10 },
      { metric_key: 'twitter', metric_value: 1, sample_size: 10 },
      { metric_key: 'youtube', metric_value: 1, sample_size: 10 },
    ];
    const result = computePlatformScanPriority(learnings, platforms);
    const devto = result.find(r => r.platform === 'devto')!;
    const twitter = result.find(r => r.platform === 'twitter')!;
    expect(devto.scan_frequency_multiplier).toBeLessThanOrEqual(2.0);
    expect(twitter.scan_frequency_multiplier).toBeGreaterThanOrEqual(0.5);
  });

  test('platforms with no data get 1.0', () => {
    const result = computePlatformScanPriority([], platforms);
    for (const p of result) {
      expect(p.scan_frequency_multiplier).toBe(1.0);
    }
  });

  test('insufficient sample size gets default multiplier', () => {
    const learnings = [
      { metric_key: 'devto', metric_value: 10, sample_size: 1 }, // too few samples
    ];
    const result = computePlatformScanPriority(learnings, ['devto']);
    expect(result[0].scan_frequency_multiplier).toBe(1.0);
  });
});

// ─── Safety Invariants ───────────────────────────────────────────────────────

describe('safety', () => {
  const humanPlatforms = ['reddit', 'hackernews', 'quora', 'facebook_groups', 'linkedin_comments'];

  test('HUMAN_EXECUTION platforms NEVER return SAFE_AUTOMATION', () => {
    for (const platform of humanPlatforms) {
      // Test across all action types and stages
      for (const action_type of ['reply', 'create_post', 'follow_up', 'dm_suggestion'] as const) {
        for (const stage of [1, 2, 3, 4, 5]) {
          const result = classifyAutomationRisk({
            platform,
            action_type,
            conversation_stage: stage,
            lead_score: 10,
            intent_level: 'low',
          });
          expect(result.risk).not.toBe('SAFE_AUTOMATION');
        }
      }
    }
  });

  test('stage >= 5 NEVER returns SAFE_AUTOMATION', () => {
    const apiPlatforms = ['twitter', 'devto', 'hashnode', 'bluesky', 'linkedin', 'medium'];
    for (const platform of apiPlatforms) {
      for (const stage of [5, 6, 7, 8]) {
        const result = classifyAutomationRisk({
          platform,
          action_type: 'reply',
          conversation_stage: stage,
          lead_score: 10,
          intent_level: 'low',
        });
        expect(result.risk).not.toBe('SAFE_AUTOMATION');
      }
    }
  });

  test('dm_suggestion NEVER returns SAFE_AUTOMATION', () => {
    const result = classifyAutomationRisk({
      platform: 'twitter',
      action_type: 'dm_suggestion',
      conversation_stage: 1,
      lead_score: 5,
      intent_level: 'low',
    });
    expect(result.risk).not.toBe('SAFE_AUTOMATION');
  });

  test('Medium is now API_POSTING, not HUMAN_EXECUTION', () => {
    const result = classifyAutomationRisk({
      platform: 'medium',
      action_type: 'reply',
      conversation_stage: 1,
      lead_score: 10,
      intent_level: 'low',
    });
    // Medium should NOT be HUMAN_REQUIRED just because of platform
    // (it may be HUMAN_REQUIRED for other reasons like stage >= 5)
    expect(result.risk).not.toBe('HUMAN_REQUIRED');
  });
});

// ─── Quality Gate Agent ──────────────────────────────────────────────────────

import { evaluateResponseQuality } from '../../services/agents/openclaw/openclawQualityGateAgent';

describe('evaluateResponseQuality', () => {
  const goodResponse = `It's surprising how often teams overlook the real challenge of AI integration: aligning AI capabilities with existing workflows. Tools can be powerful, but they're only effective when seamlessly embedded into day-to-day operations. This requires not just technical implementation but a strategic alignment with business objectives, often a missing piece in AI adoption. I explore this topic further here: https://enterprise.colaberry.ai/i/oc-medium-test123`;

  test('approves well-formed educational response', () => {
    const result = evaluateResponseQuality(goodResponse, 'medium');
    expect(result.approved).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toHaveLength(0);
  });

  test('rejects response that is too short', () => {
    const result = evaluateResponseQuality('Great article!', 'medium');
    expect(result.approved).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining('Too short'));
  });

  test('rejects response with spam patterns', () => {
    const spammy = `This is a great article about AI. Buy now and get a discount on our platform! Sign up today for a free trial. Visit https://example.com for more details about our amazing product.`;
    const result = evaluateResponseQuality(spammy, 'medium');
    expect(result.approved).toBe(false);
    expect(result.reasons.some(r => r.includes('prohibited pattern'))).toBe(true);
  });

  test('rejects response with too many links', () => {
    const linky = `Check out https://example.com/one and https://example.com/two and https://example.com/three for more. This is an interesting topic that deserves more exploration in the AI space.`;
    const result = evaluateResponseQuality(linky, 'medium');
    expect(result.approved).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining('Too many links'));
  });

  test('rejects response with emdash', () => {
    const withEmdash = `This is a great insight \u2014 teams often overlook the real challenge of AI integration. Aligning AI capabilities with existing workflows requires strategic thinking and careful implementation planning.`;
    const result = evaluateResponseQuality(withEmdash, 'medium');
    expect(result.approved).toBe(false);
    expect(result.reasons).toContainEqual(expect.stringContaining('emdash'));
  });

  test('rejects response with insufficient substance', () => {
    // Only one real sentence plus a link
    const thin = `Nice post! https://enterprise.colaberry.ai/i/oc-medium-test`;
    const result = evaluateResponseQuality(thin, 'medium');
    expect(result.approved).toBe(false);
  });

  test('score is capped between 0 and 100', () => {
    const terrible = `Buy now! $99 discount! Sign up today! Free trial! Don't miss out! Act fast! Limited time!`;
    const result = evaluateResponseQuality(terrible, 'medium');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
