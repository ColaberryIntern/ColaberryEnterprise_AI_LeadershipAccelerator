import { mergeKitConfig, DEFAULT_KIT_CONFIG } from '../kitConfig';

describe('mergeKitConfig', () => {
  it('returns full defaults for null/undefined/non-object input', () => {
    expect(mergeKitConfig(null)).toEqual(DEFAULT_KIT_CONFIG);
    expect(mergeKitConfig(undefined)).toEqual(DEFAULT_KIT_CONFIG);
    expect(mergeKitConfig('not an object')).toEqual(DEFAULT_KIT_CONFIG);
    expect(mergeKitConfig(42)).toEqual(DEFAULT_KIT_CONFIG);
  });

  it('is backward-compatible with an old saved config missing the newer categories', () => {
    // Shape saved before `teach`/`prompts`/`interactions` existed.
    const old = { storyBeats: { enabled: false, max: 2, overrides: null }, theaterEnabled: false };
    const merged = mergeKitConfig(old);
    expect(merged.storyBeats).toEqual({ enabled: false, max: 2, overrides: null });
    expect(merged.theaterEnabled).toBe(false);
    // Fields absent from the old saved shape fall back to defaults, not crash.
    expect(merged.buildBayDetail).toBe(DEFAULT_KIT_CONFIG.buildBayDetail);
    expect(merged.teach).toEqual(DEFAULT_KIT_CONFIG.teach);
    expect(merged.prompts).toEqual(DEFAULT_KIT_CONFIG.prompts);
    expect(merged.interactions).toEqual(DEFAULT_KIT_CONFIG.interactions);
  });

  it('merges a partial teach/prompts config, defaulting untouched sub-fields', () => {
    const merged = mergeKitConfig({ teach: { enabled: false }, prompts: { max: 2 } });
    expect(merged.teach).toEqual({ enabled: false, max: null, overrides: null });
    expect(merged.prompts).toEqual({ enabled: true, max: 2, overrides: null });
  });

  it('preserves a full teach override array', () => {
    const customSlide = { segment: 'guided-build', eyebrow: 'x', title: 'Custom step', body: 'b' };
    const merged = mergeKitConfig({ teach: { enabled: true, max: null, overrides: [customSlide] } });
    expect(merged.teach.overrides).toEqual([customSlide]);
  });

  it('merges a partial interactions config (survey questions), defaulting untouched sub-fields', () => {
    const merged = mergeKitConfig({ interactions: { enabled: false } });
    expect(merged.interactions).toEqual({ enabled: false, max: null, overrides: null });
  });

  it('preserves a full interactions override array (arbitrary, segment-taggable questions)', () => {
    const q1 = { segment: 'checkin', kind: 'poll' as const, q: 'Custom poll?', options: ['A', 'B'] };
    const q2 = { segment: 'trivia', kind: 'trivia' as const, q: 'Custom trivia?', options: ['A', 'B'], answer: 0 };
    const merged = mergeKitConfig({ interactions: { enabled: true, max: null, overrides: [q1, q2] } });
    expect(merged.interactions.overrides).toEqual([q1, q2]);
  });

  it('is backward-compatible with the old 3-named-slot interactions shape (pre-restructure)', () => {
    // Shape saved by the Customize modal before interactions became a list —
    // has no enabled/max/overrides fields at all, so it must fall through to
    // the new list defaults cleanly rather than crash or resurrect the old shape.
    const oldShape = {
      interactions: {
        mondayPoll: { enabled: false, override: null },
        mondayTrivia: { enabled: true, override: null },
        thursdayTrivia: { enabled: true, override: null },
      },
    };
    const merged = mergeKitConfig(oldShape);
    expect(merged.interactions).toEqual(DEFAULT_KIT_CONFIG.interactions);
  });

  it('is backward-compatible with a config saved before `opening` existed', () => {
    const merged = mergeKitConfig({ storyBeats: { enabled: false, max: null, overrides: null } });
    expect(merged.opening).toEqual(DEFAULT_KIT_CONFIG.opening);
  });

  it('merges a partial opening config, defaulting untouched slots', () => {
    const merged = mergeKitConfig({ opening: { coldOpen: { enabled: false, override: null } } });
    expect(merged.opening.coldOpen).toEqual({ enabled: false, override: null });
    expect(merged.opening.hook).toEqual(DEFAULT_KIT_CONFIG.opening.hook);
    expect(merged.opening.resultPreview).toEqual(DEFAULT_KIT_CONFIG.opening.resultPreview);
  });

  it('preserves a full opening slot override', () => {
    const custom = { headline: 'Custom hook', caption: 'Custom caption' };
    const merged = mergeKitConfig({ opening: { hook: { enabled: true, override: custom } } });
    expect(merged.opening.hook.override).toEqual(custom);
  });

  it('ignores a malformed opening slot (non-object) and falls back to default', () => {
    const merged = mergeKitConfig({ opening: { coldOpen: 'not an object' } });
    expect(merged.opening.coldOpen).toEqual(DEFAULT_KIT_CONFIG.opening.coldOpen);
  });
});
