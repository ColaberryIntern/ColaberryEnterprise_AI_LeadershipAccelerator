import {
  resolve, resolveOrThrow, allTypes, mapLegacyType, CARD_TYPES,
} from '../typeRegistry';

/**
 * Mirror of the keys of the frontend BAND map in
 * frontend/src/components/timeline/TimelineCard.tsx. A render_band outside this
 * set has no explicit Classroom visual, so it falls back to the generic 'reading'
 * card — and the Experience Studio demo (which renders through the same
 * component) and the real timeline event would BOTH lose the type's intended
 * format. The authoritative cross-check is the frontend test
 * curriculumFormatContract.test.ts, which reads THIS registry and asserts the
 * frontend renders every band; this list gives backend devs the same guard with
 * fast local feedback.
 */
const SUPPORTED_RENDER_BANDS = new Set<string>([
  'media', 'live_class', 'video_feedback', 'event', 'overview', 'deepdive', 'reading',
  'question', 'announcement', 'discussion', 'community', 'study', 'warmup', 'survey',
  'reflection', 'quiz', 'exam', 'evaluation', 'promptlab', 'task', 'artifact',
  'presentation', 'demo', 'interview', 'build_story', 'github', 'skills_jar',
  'milestone', 'achievement', 'badge', 'streak', 'setup_lab',
]);

describe('typeRegistry', () => {
  it('registers the 51 canonical curriculum types', () => {
    // 39 base (36 + testimonial/podcast/blog) + setup_lab (Claude Code enablement) + 11 intelligence-pipeline types (community_live_session + 10 generators).
    expect(CARD_TYPES.length).toBe(51);
    expect(allTypes().length).toBeGreaterThanOrEqual(51);
  });

  it('resolves a known type with its metadata', () => {
    const t = resolve('prompt_lab');
    expect(t?.slug).toBe('prompt_lab');
    expect(t?.evidence_required).toBe(true);
    expect(t?.builder_xp).toBeGreaterThan(0);
    expect(t?.competencies).toContain('prompt_engineering');
  });

  it('FAILS LOUD on an unknown type (never silently skips)', () => {
    expect(() => resolveOrThrow('does_not_exist')).toThrow(/unknown card type/);
    expect(resolve('does_not_exist')).toBeUndefined();
  });

  it('resolveOrThrow returns a registered type', () => {
    expect(resolveOrThrow('milestone').system).toBe(true);
  });

  it('maps legacy curriculum types onto the new taxonomy', () => {
    expect(mapLegacyType('prompt_template')).toEqual({ slug: 'prompt_lab', fallback: false });
    expect(mapLegacyType('executive_reality_check').slug).toBe('overview');
    expect(mapLegacyType('knowledge_check')).toEqual({ slug: 'knowledge_check', fallback: false });
  });

  it('maps unknown legacy types to overview with a fallback flag', () => {
    const r = mapLegacyType('some_weird_legacy_type');
    expect(r.slug).toBe('overview');
    expect(r.fallback).toBe(true);
    expect(mapLegacyType(null).fallback).toBe(true);
  });

  it('system and event types award no XP (they reflect/deliver, never award)', () => {
    for (const t of CARD_TYPES.filter((x) => x.system || x.event)) {
      expect(t.builder_xp).toBe(0);
      expect(t.learning_xp).toBe(0);
      expect(t.community_xp).toBe(0);
    }
  });

  it('every type maps to a render band and a bucket', () => {
    for (const t of CARD_TYPES) {
      expect(t.render_band).toBeTruthy();
      expect(t.bucket).toBeTruthy();
    }
  });

  it('every type declares a non-negative default duration (est_minutes)', () => {
    for (const t of CARD_TYPES) {
      expect(typeof t.est_minutes).toBe('number');
      expect(Number.isFinite(t.est_minutes)).toBe(true);
      expect(t.est_minutes).toBeGreaterThanOrEqual(0);
    }
    // System types have no duration; content/live types have a positive default.
    for (const t of CARD_TYPES.filter((x) => x.system)) expect(t.est_minutes).toBe(0);
    expect(resolve('live_class')!.est_minutes).toBe(120);
    expect(resolve('anthropic_skills_jar')!.est_minutes).toBeGreaterThan(0);
    expect(resolve('blog')!.est_minutes).toBeGreaterThan(0);
  });

  it('every render_band is one the Classroom can render (so the Studio demo == the timeline event)', () => {
    const unsupported = CARD_TYPES
      .filter((t) => !SUPPORTED_RENDER_BANDS.has(t.render_band))
      .map((t) => `${t.slug} -> ${t.render_band}`);
    expect(unsupported).toEqual([]);
  });
});
