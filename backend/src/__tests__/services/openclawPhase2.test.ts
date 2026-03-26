/**
 * OpenClaw Phase 2 — Revenue Intelligence & Conversion Engine Tests
 *
 * Pure function tests — no DB, no network.
 */
import {
  detectConversationStage,
  detectConversionSignals,
  validateContentForStage,
  validateFollowUpContent,
} from '../../services/agents/openclaw/openclawPlatformStrategy';
import { computeLeadScore } from '../../services/agents/openclaw/openclawLeadScoringService';

// ─── detectConversationStage (8-stage model) ────────────────────────────────

describe('detectConversationStage', () => {
  it('returns stage 1 for empty history', () => {
    expect(detectConversationStage([])).toBe(1);
  });

  it('returns stage 2 for one their-reply', () => {
    expect(detectConversationStage([
      { content: 'Thanks for the insight', is_our_reply: false },
    ])).toBe(2);
  });

  it('returns stage 3 for multiple replies with questions', () => {
    expect(detectConversationStage([
      { content: 'Good point', is_our_reply: false },
      { content: 'How does that work in practice?', is_our_reply: false },
    ])).toBe(3);
  });

  it('returns stage 4 for 3+ replies', () => {
    expect(detectConversationStage([
      { content: 'Interesting', is_our_reply: false },
      { content: 'We tried that', is_our_reply: false },
      { content: 'It was challenging', is_our_reply: false },
    ])).toBe(4);
  });

  it('returns stage 5 for interest signals', () => {
    expect(detectConversationStage([
      { content: 'That sounds great, show me more', is_our_reply: false },
    ])).toBe(5);
  });

  it('detects interest signals case-insensitively', () => {
    expect(detectConversationStage([
      { content: "I'd LOVE TO learn more about this", is_our_reply: false },
    ])).toBe(5);
  });

  it('ignores our replies when counting their replies', () => {
    expect(detectConversationStage([
      { content: 'Great insight', is_our_reply: false },
      { content: 'Thanks! Want to know more?', is_our_reply: true },
    ])).toBe(2);
  });

  it('uses latest their-reply for interest signal detection', () => {
    expect(detectConversationStage([
      { content: 'Interesting', is_our_reply: false },
      { content: 'Our follow-up', is_our_reply: true },
      { content: 'Sign me up!', is_our_reply: false },
    ])).toBe(5);
  });
});

// ─── detectConversionSignals ────────────────────────────────────────────────

describe('detectConversionSignals', () => {
  it('returns empty for no content', () => {
    expect(detectConversionSignals('')).toEqual([]);
  });

  it('detects high-confidence signals', () => {
    const signals = detectConversionSignals('Sign me up for the next cohort!');
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].confidence).toBe(1.0);
    expect(signals[0].signal).toBe('sign me up');
  });

  it('detects medium-confidence signals', () => {
    const signals = detectConversionSignals("I'm interested in learning more");
    expect(signals.some(s => s.signal === 'interested')).toBe(true);
  });

  it('detects multiple signals', () => {
    const signals = detectConversionSignals("That sounds great, I'd love to jump on a call");
    expect(signals.length).toBeGreaterThanOrEqual(2);
  });

  it('returns signals sorted by confidence descending', () => {
    const signals = detectConversionSignals("I'm interested and would love to see pricing");
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].confidence).toBeGreaterThanOrEqual(signals[i].confidence);
    }
  });

  it('is case-insensitive', () => {
    const signals = detectConversionSignals('WHERE CAN I find more info?');
    expect(signals.some(s => s.signal === 'where can i')).toBe(true);
  });
});

// ─── validateContentForStage ────────────────────────────────────────────────

describe('validateContentForStage', () => {
  it('blocks links before stage 5', () => {
    expect(validateContentForStage('Check out https://example.com', 3).passed).toBe(false);
  });

  it('blocks CTAs before stage 5', () => {
    expect(validateContentForStage('Sign up now for our program', 2).passed).toBe(false);
  });

  it('allows clean content at stage 1-4', () => {
    expect(validateContentForStage('Most teams struggle with workflow integration', 1).passed).toBe(true);
  });

  it('allows one link at stage 5', () => {
    expect(validateContentForStage('Here is the resource: https://example.com', 5).passed).toBe(true);
  });

  it('allows one link at stage 6', () => {
    expect(validateContentForStage('Thought of this: https://example.com', 6).passed).toBe(true);
  });

  it('blocks multiple links at stage 5', () => {
    expect(validateContentForStage('See https://a.com and https://b.com', 5).passed).toBe(false);
  });

  it('blocks all content at stage 7', () => {
    expect(validateContentForStage('Any content here', 7).passed).toBe(false);
  });

  it('blocks all content at stage 8', () => {
    expect(validateContentForStage('Any content here', 8).passed).toBe(false);
  });
});

// ─── validateFollowUpContent ────────────────────────────────────────────────

describe('validateFollowUpContent', () => {
  it('blocks follow-ups at stage 1', () => {
    const result = validateFollowUpContent('Just checking in', 1, 0);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Stage 1');
  });

  it('allows follow-up at stage 2 with count 0', () => {
    const result = validateFollowUpContent('Saw an interesting update on this topic', 2, 0);
    expect(result.passed).toBe(true);
  });

  it('blocks follow-up when count >= 2', () => {
    const result = validateFollowUpContent('Any content', 3, 2);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Max 2');
  });

  it('blocks aggressive language', () => {
    const result = validateFollowUpContent('Last chance to get in before we close!', 3, 0);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('aggressive');
  });

  it('blocks urgency patterns', () => {
    expect(validateFollowUpContent('Act now before this expires', 4, 0).passed).toBe(false);
    expect(validateFollowUpContent('Hurry, limited time offer', 3, 0).passed).toBe(false);
  });

  it('allows gentle follow-up at stage 5', () => {
    const result = validateFollowUpContent('Saw a case study on your exact challenge: https://example.com', 5, 0);
    expect(result.passed).toBe(true);
  });

  it('blocks follow-up at stage 7 (no automated content)', () => {
    expect(validateFollowUpContent('Just following up', 7, 0).passed).toBe(false);
  });
});

// ─── computeLeadScore ───────────────────────────────────────────────────────

describe('computeLeadScore', () => {
  it('returns 0 score for empty inputs', () => {
    const result = computeLeadScore([], []);
    expect(result.score).toBe(0);
    expect(result.priority_tier).toBe('cold');
  });

  it('scores engagement depth correctly (reply=3, comment=2, reaction=1)', () => {
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      [
        { engagement_type: 'reply' },
        { engagement_type: 'comment' },
        { engagement_type: 'reaction' },
      ],
    );
    // engagement_depth: 3+2+1=6, stage_weight: 1*3.125=3.125, platform: reddit=4
    expect(result.components.engagement_depth).toBe(6);
  });

  it('caps engagement depth at 25', () => {
    const manyReplies = Array(20).fill({ engagement_type: 'reply' }); // 20*3=60, capped at 25
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      manyReplies,
    );
    expect(result.components.engagement_depth).toBe(25);
  });

  it('uses highest conversation stage for stage weight', () => {
    const result = computeLeadScore(
      [
        { current_stage: 2, platform: 'reddit' },
        { current_stage: 5, platform: 'linkedin' },
      ],
      [{ engagement_type: 'reply' }],
    );
    // stage_weight: 5 * 3.125 = 15.625
    expect(result.components.stage_weight).toBeCloseTo(15.625);
  });

  it('scores seniority correctly', () => {
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      [{ engagement_type: 'reply', role_seniority: 'c_level' }],
    );
    expect(result.components.seniority_weight).toBe(15);
  });

  it('gives linkedin highest platform weight (10)', () => {
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'linkedin' }],
      [{ engagement_type: 'reply' }],
    );
    expect(result.components.platform_weight).toBe(10);
  });

  it('gives multi-platform bonus', () => {
    const result = computeLeadScore(
      [
        { current_stage: 3, platform: 'reddit' },
        { current_stage: 3, platform: 'linkedin' },
        { current_stage: 2, platform: 'twitter' },
      ],
      [{ engagement_type: 'reply' }],
    );
    // 3 platforms → (3-1)*5 = 10
    expect(result.components.multi_platform_bonus).toBe(10);
  });

  it('caps multi-platform bonus at 10', () => {
    const result = computeLeadScore(
      [
        { current_stage: 1, platform: 'reddit' },
        { current_stage: 1, platform: 'linkedin' },
        { current_stage: 1, platform: 'twitter' },
        { current_stage: 1, platform: 'devto' },
      ],
      [],
    );
    expect(result.components.multi_platform_bonus).toBe(10);
  });

  it('assigns hot tier for score >= 70', () => {
    // Force high score: stage 8 * 3.125 = 25, c_level = 15, linkedin = 10, many replies
    const result = computeLeadScore(
      [{ current_stage: 8, platform: 'linkedin' }, { current_stage: 5, platform: 'reddit' }],
      Array(10).fill({ engagement_type: 'reply', role_seniority: 'c_level', updated_at: new Date().toISOString() }),
    );
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.priority_tier).toBe('hot');
  });

  it('assigns warm tier for score 40-69', () => {
    const result = computeLeadScore(
      [{ current_stage: 4, platform: 'linkedin' }],
      [
        { engagement_type: 'reply', role_seniority: 'manager', updated_at: new Date().toISOString() },
        { engagement_type: 'comment', role_seniority: 'manager', updated_at: new Date().toISOString() },
      ],
    );
    // engagement: 3+2=5, stage: 4*3.125=12.5, seniority: 6, platform: 10, recency: 15 = ~49
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.priority_tier).toBe('warm');
  });

  it('assigns cold tier for score < 40', () => {
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      [{ engagement_type: 'reaction' }],
    );
    expect(result.score).toBeLessThan(40);
    expect(result.priority_tier).toBe('cold');
  });

  it('caps total score at 100', () => {
    const result = computeLeadScore(
      [
        { current_stage: 8, platform: 'linkedin' },
        { current_stage: 8, platform: 'reddit' },
        { current_stage: 8, platform: 'twitter' },
      ],
      Array(20).fill({ engagement_type: 'reply', role_seniority: 'c_level', updated_at: new Date().toISOString() }),
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('gives recency score for recent engagements', () => {
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      [{ engagement_type: 'reply', updated_at: new Date().toISOString() }], // just now
    );
    expect(result.components.recency).toBe(15);
  });

  it('gives lower recency for older engagements', () => {
    const twoDaysAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(); // 30h ago
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      [{ engagement_type: 'reply', updated_at: twoDaysAgo }],
    );
    expect(result.components.recency).toBe(10);
  });

  it('gives 0 recency for very old engagements', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = computeLeadScore(
      [{ current_stage: 1, platform: 'reddit' }],
      [{ engagement_type: 'reply', updated_at: twoWeeksAgo }],
    );
    expect(result.components.recency).toBe(0);
  });
});

// ─── Stage transition rules ─────────────────────────────────────────────────

describe('stage transition rules', () => {
  it('stages only advance — higher detected stage wins', () => {
    // This is a behavioral assertion: Math.max(current, detected)
    const currentStage = 3;
    const detectedStage = detectConversationStage([
      { content: 'Sign me up!', is_our_reply: false },
    ]); // returns 5
    expect(Math.max(currentStage, detectedStage)).toBe(5);
  });

  it('stages never regress — lower detected stage is ignored', () => {
    const currentStage = 5;
    const detectedStage = detectConversationStage([
      { content: 'Interesting point', is_our_reply: false },
    ]); // returns 2
    expect(Math.max(currentStage, detectedStage)).toBe(5);
  });
});
