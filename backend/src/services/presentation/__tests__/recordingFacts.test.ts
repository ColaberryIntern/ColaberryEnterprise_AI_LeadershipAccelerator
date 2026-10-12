import {
  sharedScreenFromRecordingType,
  audioFromFileList,
  durationSecondsFrom,
  timingFromFileList,
} from '../recordingFacts';

/**
 * These three values decide whether a learner is warned that their take is silent
 * or camera-only before they hand it in. Until 2026-10-11 nothing in the backend
 * wrote any of them, so the warnings could never fire.
 *
 * The load-bearing rule throughout is that NULL IS A REAL ANSWER.
 * `describeTakeContents` raises a warning only on `false`, so a wrong `false` puts
 * "nobody will hear you" in front of someone whose recording is fine. Every test
 * below that asserts `null` is guarding against a default that looks harmless and
 * is not.
 */

describe('shared screen, from the recording type Zoom already gave us', () => {
  it.each(['shared_screen', 'shared_screen_with_speaker_view', 'shared_screen_with_gallery_view'])(
    'is true for %s',
    (t) => expect(sharedScreenFromRecordingType(t)).toBe(true),
  );

  it.each(['active_speaker', 'gallery_view', 'speaker_view'])(
    'is false for %s - these are camera compositions',
    (t) => expect(sharedScreenFromRecordingType(t)).toBe(false),
  );

  it.each(['audio_only', 'chat_file', 'timeline', 'audio_transcript'])(
    'is NULL for %s - not a video composition, so it says nothing either way',
    (t) => expect(sharedScreenFromRecordingType(t)).toBeNull(),
  );

  it('is NULL for an unrecognised type Zoom might add later, never false', () => {
    // A `false` here would tell a learner their demo is invisible on the strength
    // of a composition type this code has not been taught yet.
    expect(sharedScreenFromRecordingType('some_future_composition')).toBeNull();
  });

  it('is NULL for absent or blank input', () => {
    expect(sharedScreenFromRecordingType(null)).toBeNull();
    expect(sharedScreenFromRecordingType(undefined)).toBeNull();
    expect(sharedScreenFromRecordingType('   ')).toBeNull();
  });

  it('is case- and whitespace-insensitive, because these arrive from an API', () => {
    expect(sharedScreenFromRecordingType('  SHARED_SCREEN_WITH_SPEAKER_VIEW ')).toBe(true);
  });
});

describe('audio, from the file list', () => {
  it('is true when an audio-only rendering is present', () => {
    expect(audioFromFileList([{ recording_type: 'audio_only', file_type: 'M4A' }])).toBe(true);
  });

  it('is true when a transcript is present - Zoom only makes one from sound', () => {
    expect(audioFromFileList([{ recording_type: 'audio_transcript', file_type: 'TRANSCRIPT' }])).toBe(true);
  });

  it('is NULL, not false, when neither appears', () => {
    // THE IMPORTANT ONE. A short meeting may get no transcript, and a webhook can
    // deliver a subset of files. Absence is not evidence of silence, and `false`
    // here would warn a learner that their perfectly good take has no audio.
    expect(audioFromFileList([{ recording_type: 'shared_screen_with_speaker_view', file_type: 'MP4' }])).toBeNull();
  });

  it('is NULL for an empty or missing list', () => {
    expect(audioFromFileList([])).toBeNull();
    expect(audioFromFileList(null)).toBeNull();
    expect(audioFromFileList(undefined)).toBeNull();
  });

  it('finds the audio rendering among several files, in any position', () => {
    expect(audioFromFileList([
      { recording_type: 'shared_screen_with_speaker_view', file_type: 'MP4' },
      { recording_type: 'timeline', file_type: 'TIMELINE' },
      { recording_type: 'audio_only', file_type: 'M4A' },
    ])).toBe(true);
  });
});

describe('duration', () => {
  it('is whole seconds between the two ends', () => {
    expect(durationSecondsFrom(
      new Date('2026-10-11T10:00:00Z'),
      new Date('2026-10-11T10:02:30Z'),
    )).toBe(150);
  });

  it('is NULL when either end is missing', () => {
    expect(durationSecondsFrom(null, new Date())).toBeNull();
    expect(durationSecondsFrom(new Date(), null)).toBeNull();
    expect(durationSecondsFrom(undefined, undefined)).toBeNull();
  });

  it('is NULL for a zero or negative span, which is a clock problem not a video', () => {
    // Storing 0 would print "0 seconds" beside a take the learner can watch.
    const t = new Date('2026-10-11T10:00:00Z');
    expect(durationSecondsFrom(t, t)).toBeNull();
    expect(durationSecondsFrom(new Date('2026-10-11T10:05:00Z'), t)).toBeNull();
  });

  it('is NULL for an unparseable date rather than NaN', () => {
    expect(durationSecondsFrom(new Date('nonsense'), new Date())).toBeNull();
  });
});

describe('timing, the rule the polling path already used', () => {
  it('takes the earliest start and the latest end across files', () => {
    const r = timingFromFileList([
      { recording_start: '2026-10-11T10:05:00Z', recording_end: '2026-10-11T10:09:00Z' },
      { recording_start: '2026-10-11T10:00:00Z', recording_end: '2026-10-11T10:07:00Z' },
    ]);
    expect(r.startedAt?.toISOString()).toBe('2026-10-11T10:00:00.000Z');
    expect(r.endedAt?.toISOString()).toBe('2026-10-11T10:09:00.000Z');
  });

  it('falls back to the meeting start and duration when files carry no timings', () => {
    const r = timingFromFileList([{ recording_type: 'shared_screen' }], '2026-10-11T10:00:00Z', 30);
    expect(r.startedAt?.toISOString()).toBe('2026-10-11T10:00:00.000Z');
    expect(r.endedAt?.toISOString()).toBe('2026-10-11T10:30:00.000Z');
  });

  it('returns nulls rather than Invalid Date when it knows nothing', () => {
    const r = timingFromFileList([], null, null);
    expect(r.startedAt).toBeNull();
    expect(r.endedAt).toBeNull();
  });

  it('ignores unparseable timestamps instead of poisoning the min/max', () => {
    const r = timingFromFileList([
      { recording_start: 'not a date', recording_end: 'not a date' },
      { recording_start: '2026-10-11T10:00:00Z', recording_end: '2026-10-11T10:04:00Z' },
    ]);
    expect(r.startedAt?.toISOString()).toBe('2026-10-11T10:00:00.000Z');
    expect(durationSecondsFrom(r.startedAt, r.endedAt)).toBe(240);
  });
});

describe('end to end, the shape the rehearsal actually produced', () => {
  it('turns a real Zoom delivery into a fully described take', () => {
    // The composition Zoom sent for the 2026-10-11 practice session: a transcript,
    // the shared-screen MP4 the selector picks, and an audio-only rendering.
    const files = [
      { recording_type: 'audio_transcript', file_type: 'TRANSCRIPT', recording_start: '2026-10-11T18:46:00Z', recording_end: '2026-10-11T18:49:00Z' },
      { recording_type: 'shared_screen_with_speaker_view', file_type: 'MP4', recording_start: '2026-10-11T18:46:00Z', recording_end: '2026-10-11T18:49:00Z' },
      { recording_type: 'audio_only', file_type: 'M4A', recording_start: '2026-10-11T18:46:00Z', recording_end: '2026-10-11T18:49:00Z' },
    ];
    const timing = timingFromFileList(files);

    expect(audioFromFileList(files)).toBe(true);
    expect(sharedScreenFromRecordingType('shared_screen_with_speaker_view')).toBe(true);
    expect(durationSecondsFrom(timing.startedAt, timing.endedAt)).toBe(180);
    // Which is exactly what the picker needs in order to stop offering a take with
    // no length and an empty warnings list.
  });
});
