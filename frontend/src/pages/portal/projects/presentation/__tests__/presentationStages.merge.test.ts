import {
  PRESENTATION_STAGES,
  STAGE_META,
  openingStageFor,
  resolveStage,
  isPresentationStage,
  readSavedStage,
  saveStage,
} from '../presentationStages';

/**
 * SIX STEPS BECAME FIVE, AND `reflect` HAD TO KEEP WORKING.
 *
 * Present and Reflect & Share were two placeholder steps that each rendered a
 * "not built yet" notice and read and wrote nothing. They are one step now.
 *
 * Deleting the id would have been the easy half. Three things still point at it,
 * and only one of them is bookmarks:
 *
 *   - every learner's saved cursor, sitting in their own localStorage
 *   - PREP-5's opening stage, which WAS `reflect`
 *   - any link anybody has already shared
 *
 * Each would have silently dropped a student on Learn with no explanation. These
 * tests exist so a later tidy-up that removes the mapping fails loudly.
 */

describe('the stepper is five wide', () => {
  it('has exactly five stages, and reflect is not one of them', () => {
    expect(PRESENTATION_STAGES).toHaveLength(5);
    expect(PRESENTATION_STAGES).not.toContain('reflect');
  });

  it('present is relabelled, because it absorbed the other step', () => {
    // "Present" alone would under-describe a screen that is mostly a portfolio
    // and a sharing decision.
    expect(STAGE_META.present.label).toBe('Present & Share');
  });

  it('every stage still has a label and a blurb', () => {
    for (const id of PRESENTATION_STAGES) {
      expect(STAGE_META[id].label.length).toBeGreaterThan(0);
      expect(STAGE_META[id].blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('the retired id still resolves', () => {
  it('reflect becomes present', () => {
    expect(resolveStage('reflect')).toBe('present');
  });

  it('every live stage resolves to itself', () => {
    for (const id of PRESENTATION_STAGES) {
      expect(resolveStage(id)).toBe(id);
    }
  });

  it('junk resolves to nothing, rather than to a default', () => {
    // Null lets the caller fall back deliberately. Quietly returning 'learn'
    // here would make a typo in a URL look like a working link.
    for (const bad of ['nope', '', null, undefined, 42, {}]) {
      expect(resolveStage(bad)).toBeNull();
    }
  });

  it('isPresentationStage still reports reflect as NOT a stage', () => {
    // The two functions answer different questions and must not be conflated:
    // "is this a stage" is false, "what does this mean now" is 'present'.
    expect(isPresentationStage('reflect')).toBe(false);
    expect(resolveStage('reflect')).toBe('present');
  });
});

describe('PREP-5 used to open on reflect', () => {
  it('now opens on the merged step rather than falling back to learn', () => {
    // The default landing stage for a whole task. Left unmapped, every student
    // opening PREP-5 would have started on Learn.
    expect(openingStageFor('PREP-5')).toBe('present');
  });

  it('PREP-6 still opens on present', () => {
    expect(openingStageFor('PREP-6')).toBe('present');
  });

  it('the other tasks are untouched', () => {
    expect(openingStageFor('PREP-1')).toBe('prepare');
    expect(openingStageFor('PREP-2')).toBe('practice');
    expect(openingStageFor('PREP-3')).toBe('build');
    expect(openingStageFor('PREP-4')).toBe('practice');
  });

  it('an unknown task still opens on learn', () => {
    expect(openingStageFor('PREP-99')).toBe('learn');
    expect(openingStageFor(null)).toBe('learn');
  });
});

describe("a learner's saved cursor survives the merge", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('A STORED `reflect` LOADS AS present, not as nothing', () => {
    // The case that would have hit every student who last had that step open.
    window.localStorage.setItem('cb.studio.stage.p1.PREP-4', 'reflect');
    expect(readSavedStage('p1', 'PREP-4')).toBe('present');
  });

  it('a stored live stage still loads', () => {
    saveStage('p1', 'PREP-4', 'build');
    expect(readSavedStage('p1', 'PREP-4')).toBe('build');
  });

  it('stored junk loads as nothing, so the caller uses the opening stage', () => {
    window.localStorage.setItem('cb.studio.stage.p1.PREP-4', 'banana');
    expect(readSavedStage('p1', 'PREP-4')).toBeNull();
  });

  it('nothing stored is nothing, not an error', () => {
    expect(readSavedStage('p1', 'PREP-4')).toBeNull();
  });
});
