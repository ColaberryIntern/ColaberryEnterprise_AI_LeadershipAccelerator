/**
 * isGradedCardType — the "graded card" of ladder decision D3. Kept in its own
 * file (typeRegistry.test.ts is CI-ignored for reading model metadata) with
 * the env mocked so the registry loads without a database.
 */
jest.mock('../../../config/env', () => ({ env: {} }));

import { isGradedCardType, CARD_TYPES } from '../typeRegistry';

describe('isGradedCardType', () => {
  it('labs, build tasks, checks, evaluations, reflections, demos and presentations are graded', () => {
    for (const slug of ['prompt_lab', 'prompt_challenge', 'implementation_task', 'project_task', 'knowledge_check', 'evaluation', 'certification_exercise', 'claude_studio', 'demo', 'presentation', 'mock_interview', 'setup_lab', 'artifact_submission', 'reflection', 'architect_mindset', 'ai_video_feedback']) {
      expect([slug, isGradedCardType(slug)]).toEqual([slug, true]);
    }
  });
  it('consumption and ambient cards are not', () => {
    for (const slug of ['video', 'blog', 'deep_dive', 'warmup', 'survey', 'live_class', 'announcement', 'podcast', 'testimonial', 'ai_news_flash', 'ai_tool_of_the_day', 'market_intelligence', 'discussion', 'anthropic_skills_jar', 'question', 'study_session']) {
      expect([slug, isGradedCardType(slug)]).toEqual([slug, false]);
    }
  });
  it('an unknown type is not graded (fail closed)', () => {
    expect(isGradedCardType('no_such_type')).toBe(false);
  });
  it('is exactly evidence_required OR ai_evaluation over the whole registry', () => {
    for (const def of CARD_TYPES) {
      expect(isGradedCardType(def.slug)).toBe(def.evidence_required === true || def.ai_evaluation === true);
    }
  });
});
