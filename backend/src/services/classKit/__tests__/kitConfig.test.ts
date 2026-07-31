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

  it('merges individual interaction slots independently, defaulting the ones not present', () => {
    const merged = mergeKitConfig({ interactions: { mondayTrivia: { enabled: false, override: null } } });
    expect(merged.interactions.mondayTrivia).toEqual({ enabled: false, override: null });
    expect(merged.interactions.mondayPoll).toEqual(DEFAULT_KIT_CONFIG.interactions.mondayPoll);
    expect(merged.interactions.thursdayTrivia).toEqual(DEFAULT_KIT_CONFIG.interactions.thursdayTrivia);
  });

  it('accepts a full interaction override object', () => {
    const custom = { kind: 'trivia' as const, q: 'Custom question?', options: ['A', 'B'], answer: 0 };
    const merged = mergeKitConfig({ interactions: { thursdayTrivia: { enabled: true, override: custom } } });
    expect(merged.interactions.thursdayTrivia.override).toEqual(custom);
  });

  it('ignores a malformed interaction slot (non-object) and falls back to default', () => {
    const merged = mergeKitConfig({ interactions: { mondayPoll: 'not an object' } });
    expect(merged.interactions.mondayPoll).toEqual(DEFAULT_KIT_CONFIG.interactions.mondayPoll);
  });
});
