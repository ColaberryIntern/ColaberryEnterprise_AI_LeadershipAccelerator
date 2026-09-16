/**
 * isGradedCardType — the "graded card" of ladder decision D3. Kept in its own
 * file (typeRegistry.test.ts is CI-ignored for reading model metadata) with
 * the env mocked so the registry loads without a database.
 */
jest.mock('../../../config/env', () => ({ env: {} }));

import { isGradedCardType, isCurriculumRequired, CARD_TYPES } from '../typeRegistry';

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

// D8 (Ali, 2026-09-16): "A, but only for this batch because I added it late.
// Future batches it will count." Claude Studio was published 2026-09-08.
describe('isCurriculumRequired (D8)', () => {
  it('Claude Studio is the only type with a required-from date, and it is 2026-11-01', () => {
    const dated = CARD_TYPES.filter((d) => d.curriculum_required_from);
    expect(dated.map((d) => [d.slug, d.curriculum_required_from])).toEqual([['claude_studio', '2026-11-01']]);
  });
  it('is not required of the July 2026 (2026-07-23) or April 2026 cohorts', () => {
    expect(isCurriculumRequired('claude_studio', '2026-07-23')).toBe(false);
    expect(isCurriculumRequired('claude_studio', '2026-04-14')).toBe(false);
    expect(isCurriculumRequired('claude_studio', new Date('2026-10-31'))).toBe(false);
  });
  it('is required of the November 2026 cohort (2026-11-12) and anything later', () => {
    expect(isCurriculumRequired('claude_studio', '2026-11-12')).toBe(true);
    expect(isCurriculumRequired('claude_studio', '2026-11-01')).toBe(true);
    expect(isCurriculumRequired('claude_studio', '2027-02-01')).toBe(true);
  });
  it('a student with no cohort start is held to everything', () => {
    expect(isCurriculumRequired('claude_studio', null)).toBe(true);
    expect(isCurriculumRequired('claude_studio', 'not a date')).toBe(true);
  });
  it('every other graded type is required whatever the cohort start', () => {
    for (const def of CARD_TYPES.filter((d) => isGradedCardType(d.slug) && !d.curriculum_required_from)) {
      expect(isCurriculumRequired(def.slug, '2026-04-14')).toBe(true);
    }
  });
  it('an ungraded type is never required', () => {
    expect(isCurriculumRequired('video', '2027-01-01')).toBe(false);
    expect(isCurriculumRequired('no_such_type', null)).toBe(false);
  });
});
