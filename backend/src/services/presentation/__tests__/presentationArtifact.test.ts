import {
  buildPresentationArtifact,
  summarize,
  formatDuration,
  PRESENTATION_ARTIFACT_KIND,
  type PresentationArtifactInput,
} from '../presentationArtifact';

/**
 * The artifact is what makes a handed-in rehearsal exist anywhere a learner or an
 * employer looks. Until now one earned points and then appeared nowhere: the
 * platform's portfolio store already listed `presentation` as a kind and nothing
 * ever wrote one.
 *
 * Two properties carry the weight here.
 *
 * NULL IS NOT FALSE AND NOT ZERO. A take whose length or capture flags Zoom never
 * reported must say nothing about them, not claim a confident wrong fact. The same
 * rule the modality work established, carried into the thing a stranger reads.
 *
 * THE ARTIFACT HOLDS A REFERENCE, NEVER THE VIDEO. Portfolio visibility must never
 * become video visibility by accident — the bytes stay behind the ticketed route.
 */

const base = (over: Partial<PresentationArtifactInput> = {}): PresentationArtifactInput => ({
  recordingRef: 'recording:4269e9d3-7ffd-4089-b64e-1a176159aa71',
  storyId: 'PREP-4',
  projectName: 'Regional Medical Courier System',
  taskTitle: 'Rehearse with one other person and take their notes',
  attemptNo: 1,
  durationSeconds: 169,
  hasAudio: true,
  hasSharedScreen: true,
  mode: 'practice_solo',
  recordedAt: '2026-10-12T18:15:00.000Z',
  ...over,
});

describe('duration is stated only when known', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(169)).toBe('2:49');
    expect(formatDuration(64)).toBe('1:04');
  });

  it('is NULL for unknown, zero or negative — never "0:00"', () => {
    // "0:00" beside a watchable take is a lie, and a reader cannot tell it from a
    // genuinely empty file.
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(-5)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});

describe('the summary says what is known and nothing more', () => {
  it('leads with the length and the project', () => {
    expect(summarize(base())).toBe('2:49 recorded rehearsal of Regional Medical Courier System with the demo on screen.');
  });

  it('omits the length entirely when it is unknown', () => {
    const s = summarize(base({ durationSeconds: null }));
    expect(s).toContain('Recorded rehearsal');
    expect(s).not.toMatch(/\d+:\d\d/);
    expect(s).not.toContain('0:00');
  });

  it('says camera-only when we KNOW the screen was not shared', () => {
    expect(summarize(base({ hasSharedScreen: false }))).toContain('camera only, no demo on screen');
  });

  it('says NOTHING about the screen when we do not know', () => {
    // THE LOAD-BEARING CASE. Zoom does not always report it, and guessing either
    // way puts a wrong fact in a portfolio a stranger reads.
    const s = summarize(base({ hasSharedScreen: null }));
    expect(s).not.toContain('on screen');
    expect(s).not.toContain('camera only');
  });
});

describe('the artifact row', () => {
  it('is kind "presentation" — the value the store already listed', () => {
    expect(PRESENTATION_ARTIFACT_KIND).toBe('presentation');
  });

  it('titles itself from the task, which is what a reader recognises', () => {
    expect(buildPresentationArtifact(base()).title).toBe('Rehearse with one other person and take their notes');
  });

  it('falls back to the project when the task has no title', () => {
    expect(buildPresentationArtifact(base({ taskTitle: null })).title)
      .toBe('Regional Medical Courier System — rehearsal');
  });

  it('still produces a title when it knows neither', () => {
    // An untitled row in a portfolio list is worse than a generic one.
    expect(buildPresentationArtifact(base({ taskTitle: null, projectName: null })).title)
      .toBe('Recorded rehearsal');
  });

  it('truncates an overlong title to the column width', () => {
    const row = buildPresentationArtifact(base({ taskTitle: 'x'.repeat(600) }));
    expect(row.title.length).toBe(400);
  });

  it('CARRIES A REFERENCE, NEVER THE VIDEO', () => {
    // Portfolio visibility must not become video visibility. The bytes stay behind
    // the ticketed playback route; this row only names which recording it was.
    const content = buildPresentationArtifact(base()).content as Record<string, unknown>;
    expect(content.recordingRef).toBe('recording:4269e9d3-7ffd-4089-b64e-1a176159aa71');
    const asText = JSON.stringify(content);
    expect(asText).not.toMatch(/\.mp4/);
    expect(asText).not.toMatch(/storage_key|storageKey|downloadUrl|download_url/);
    expect(asText).not.toMatch(/https?:\/\//);
  });

  it('keeps the capture flags tri-state rather than flattening them', () => {
    const content = buildPresentationArtifact(base({ hasAudio: null, hasSharedScreen: false })).content as Record<string, unknown>;
    expect(content.hasAudio).toBeNull();
    expect(content.hasSharedScreen).toBe(false);
  });

  it('claims only competencies the learner demonstrably exercised', () => {
    // They prepared a presentation and delivered it out loud. Nothing about the
    // quality of the thing, which no model here is entitled to judge.
    expect(buildPresentationArtifact(base()).competencies).toEqual(['communication', 'presentation']);
  });
});
