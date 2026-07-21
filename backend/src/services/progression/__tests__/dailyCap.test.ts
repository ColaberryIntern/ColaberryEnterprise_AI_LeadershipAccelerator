import {
  applyDailyCap,
  isAmbientLearningType,
  isCommunityEventType,
  AMBIENT_LEARNING_CAP,
  COMMUNITY_CAP,
  AMBIENT_LEARNING_TYPES,
  COMMUNITY_EVENT_TYPES,
  AMBIENT_LEARNING_EVENT_TYPE,
} from '../dailyCap';

describe('applyDailyCap (pure)', () => {
  it('under cap: awards the full proposed amount', () => {
    expect(applyDailyCap({ alreadyAwardedToday: 20, proposedAward: 10, cap: 100 })).toBe(10);
  });

  it('partial: clamps to the remaining room under the cap', () => {
    expect(applyDailyCap({ alreadyAwardedToday: 95, proposedAward: 10, cap: 100 })).toBe(5);
  });

  it('at the cap: awards 0', () => {
    expect(applyDailyCap({ alreadyAwardedToday: 100, proposedAward: 10, cap: 100 })).toBe(0);
  });

  it('over the cap: awards 0 (never negative)', () => {
    expect(applyDailyCap({ alreadyAwardedToday: 130, proposedAward: 10, cap: 100 })).toBe(0);
  });

  it('boundary: a proposal that exactly fills the cap is awarded in full', () => {
    expect(applyDailyCap({ alreadyAwardedToday: 90, proposedAward: 10, cap: 100 })).toBe(10);
  });

  it('boundary: one point of room clamps a larger proposal to 1', () => {
    expect(applyDailyCap({ alreadyAwardedToday: 99, proposedAward: 10, cap: 100 })).toBe(1);
  });

  it('defensive: floors negative inputs to 0 (deterministic, never negative)', () => {
    expect(applyDailyCap({ alreadyAwardedToday: -5, proposedAward: 10, cap: 100 })).toBe(10);
    expect(applyDailyCap({ alreadyAwardedToday: 20, proposedAward: -10, cap: 100 })).toBe(0);
  });
});

describe('category membership + constants', () => {
  it('AMBIENT_LEARNING_TYPES is exactly the six low-value ambient feed types', () => {
    expect([...AMBIENT_LEARNING_TYPES].sort()).toEqual(
      [
        'ai_news_flash',
        'ai_quote_of_the_day',
        'ai_research_digest',
        'ai_tool_of_the_day',
        'ai_video_stream',
        'market_intelligence',
      ].sort(),
    );
  });

  it('isAmbientLearningType is true only for ambient types (real coursework is never capped)', () => {
    expect(isAmbientLearningType('ai_news_flash')).toBe(true);
    expect(isAmbientLearningType('market_intelligence')).toBe(true);
    expect(isAmbientLearningType('implementation_task')).toBe(false);
    expect(isAmbientLearningType('deep_dive')).toBe(false);
    expect(isAmbientLearningType('prompt_lab')).toBe(false);
    // higher-value intel types are deliberately excluded from the ambient cap
    expect(isAmbientLearningType('ai_architecture_breakdown')).toBe(false);
    expect(isAmbientLearningType('claude_code_technique')).toBe(false);
  });

  it('isCommunityEventType is true only for the community action event types', () => {
    expect(isCommunityEventType('community_post')).toBe(true);
    expect(isCommunityEventType('community_comment')).toBe(true);
    expect(isCommunityEventType('community_like')).toBe(true);
    expect(isCommunityEventType('card_complete')).toBe(false);
    expect(isCommunityEventType('daily_streak')).toBe(false);
  });

  it('exposes the cap values and the dedicated ambient ledger event type', () => {
    expect(AMBIENT_LEARNING_CAP).toBe(100);
    expect(COMMUNITY_CAP).toBe(75);
    expect(AMBIENT_LEARNING_EVENT_TYPE).toBe('ambient_learning');
    expect([...COMMUNITY_EVENT_TYPES]).toEqual(['community_post', 'community_comment', 'community_like']);
  });
});
