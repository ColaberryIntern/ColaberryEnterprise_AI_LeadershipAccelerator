import {
  resolve, resolveOrThrow, allTypes, mapLegacyType, CARD_TYPES,
} from '../typeRegistry';

describe('typeRegistry', () => {
  it('registers the 36 canonical curriculum types', () => {
    expect(CARD_TYPES.length).toBe(36);
    expect(allTypes().length).toBeGreaterThanOrEqual(36);
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
});
