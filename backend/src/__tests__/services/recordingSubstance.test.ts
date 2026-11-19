import {
  judgeRecordingSubstance,
  isSubstantiveRecording,
  isScreenComposition,
  durationSecondsBetween,
  durationFromResourceMetadata,
  substanceFromResourceMetadata,
  shouldListResource,
  MIN_SUBSTANTIVE_RECORDING_SECONDS,
  ACTIVE_SPEAKER_MAX_HEIGHT,
} from '../../services/recordingSubstance';

/**
 * Every length and shape asserted here is a real file on production, measured by
 * probing all 179 recordings we hold on 2026-11-18. The look-ins are what Zoom
 * leaves behind when somebody opens a meeting link and closes it again; the
 * practice recordings are students rehearsing a presentation, and they are the
 * reason a duration floor alone is not the rule.
 */
describe('recordingSubstance', () => {
  describe('look-ins: short, 640x360, nobody sharing anything', () => {
    it.each([3.88, 4.36, 7.17, 9.05, 12.93, 15.8, 22.2, 28.5, 29.9, 44.9, 70.3, 95.2])(
      'refuses a %ss active-speaker clip at 640x360',
      (seconds) => {
        const verdict = judgeRecordingSubstance({
          durationSeconds: seconds, videoHeight: 360, recordingType: 'active_speaker',
        });
        expect(verdict.substantive).toBe(false);
        expect(verdict.reason).toBe('short_and_empty');
        expect(verdict.durationSeconds).toBe(seconds);
      },
    );

    it('refuses the 9-second clip that was served as the 29 Oct Open House', () => {
      expect(isSubstantiveRecording({
        durationSeconds: 9.045333, videoHeight: 360, recordingType: 'active_speaker',
      })).toBe(false);
    });

    it('refuses a short clip when neither height nor composition is known', () => {
      // Zoom's listing gives no resolution, and a look-in's composition is
      // active_speaker, so duration is all there is — and all there needs to be.
      expect(isSubstantiveRecording({ durationSeconds: 5 })).toBe(false);
    });
  });

  describe('short but real: the three recordings that broke the first version of this rule', () => {
    // 1920x1080 shared_screen_with_speaker_view, 63.5s / 70.6s / 78.9s, all in
    // "Practice: Regional Medical Courier System". Students rehearsing. A flat
    // duration floor hid every one of them.
    it.each([63.5, 70.6, 78.9])('keeps a %ss 1080p practice presentation', (seconds) => {
      const verdict = judgeRecordingSubstance({
        durationSeconds: seconds,
        videoHeight: 1080,
        recordingType: 'shared_screen_with_speaker_view',
      });
      expect(verdict.substantive).toBe(true);
      expect(verdict.reason).toBeNull();
    });

    it('keeps a short recording on the strength of its screen share alone', () => {
      // The selection vantage point: Zoom's listing has no resolution at all.
      expect(isSubstantiveRecording({
        durationSeconds: 63.5, recordingType: 'shared_screen_with_speaker_view',
      })).toBe(true);
    });

    it('keeps a short recording on the strength of its resolution alone', () => {
      // The listing vantage point for a legacy row: geometry, but no composition.
      expect(isSubstantiveRecording({ durationSeconds: 63.5, videoHeight: 1080 })).toBe(true);
    });

    it.each(['shared_screen', 'shared_screen_with_speaker_view', 'shared_screen_with_gallery_view'])(
      'treats %s as evidence somebody was presenting',
      (recordingType) => {
        expect(isScreenComposition(recordingType)).toBe(true);
        expect(isSubstantiveRecording({ durationSeconds: 4, recordingType })).toBe(true);
      },
    );

    it.each(['active_speaker', 'gallery_view', 'audio_only', '', null, undefined])(
      'treats %s as no evidence of content',
      (recordingType) => {
        expect(isScreenComposition(recordingType as never)).toBe(false);
        expect(isSubstantiveRecording({ durationSeconds: 4, recordingType: recordingType as never })).toBe(false);
      },
    );
  });

  describe('long recordings are never judged on anything else', () => {
    it.each([166.6, 192.2, 213.1, 278.3, 315.9, 376.1, 892.2, 10634.86])(
      'keeps a %ss recording even at 640x360 with no screen share',
      (seconds) => {
        expect(isSubstantiveRecording({
          durationSeconds: seconds, videoHeight: 360, recordingType: 'active_speaker',
        })).toBe(true);
      },
    );

    it('is exclusive at the boundary, so the floor itself is substantive', () => {
      const base = { videoHeight: 360, recordingType: 'active_speaker' };
      expect(isSubstantiveRecording({ ...base, durationSeconds: MIN_SUBSTANTIVE_RECORDING_SECONDS })).toBe(true);
      expect(isSubstantiveRecording({ ...base, durationSeconds: MIN_SUBSTANTIVE_RECORDING_SECONDS - 0.001 })).toBe(false);
    });

    it('is exclusive at the height boundary too', () => {
      const base = { durationSeconds: 10, recordingType: 'active_speaker' };
      expect(isSubstantiveRecording({ ...base, videoHeight: ACTIVE_SPEAKER_MAX_HEIGHT })).toBe(false);
      expect(isSubstantiveRecording({ ...base, videoHeight: ACTIVE_SPEAKER_MAX_HEIGHT + 1 })).toBe(true);
    });
  });

  describe('unknown is not short', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['whitespace', '   '],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['a non-numeric string', 'later'],
      ['a negative number', -5],
    ])('treats a %s duration as substantive rather than withholding the recording', (_label, value) => {
      const verdict = judgeRecordingSubstance({ durationSeconds: value as never, videoHeight: 360 });
      expect(verdict.substantive).toBe(true);
      expect(verdict.reason).toBeNull();
      expect(verdict.durationSeconds).toBeNull();
    });

    it('accepts a numeric string, because jsonb round-trips are not to be trusted', () => {
      expect(judgeRecordingSubstance({ durationSeconds: '9.05' as never, videoHeight: 360 })).toEqual({
        substantive: false, reason: 'short_and_empty', durationSeconds: 9.05,
      });
      expect(isSubstantiveRecording({ durationSeconds: '3600' as never })).toBe(true);
    });

    it('treats a zero-length recording as short, not as unmeasured', () => {
      expect(judgeRecordingSubstance({ durationSeconds: 0, videoHeight: 360 })).toEqual({
        substantive: false, reason: 'short_and_empty', durationSeconds: 0,
      });
    });

    it('ignores an unmeasurable height rather than reading it as small', () => {
      // A junk height must not become content evidence, nor condemn the recording
      // on its own; duration still decides.
      for (const height of [null, undefined, '', NaN, -1, 'tall']) {
        expect(isSubstantiveRecording({ durationSeconds: 5, videoHeight: height as never })).toBe(false);
        expect(isSubstantiveRecording({ durationSeconds: 500, videoHeight: height as never })).toBe(true);
      }
    });
  });

  describe('durationSecondsBetween', () => {
    it('measures a Zoom instance from its start and end', () => {
      expect(durationSecondsBetween(
        new Date('2026-11-18T18:02:12Z'),
        new Date('2026-11-18T18:02:17Z'),
      )).toBe(5);
      expect(durationSecondsBetween(
        new Date('2026-11-17T16:00:58Z'),
        new Date('2026-11-17T18:30:03Z'),
      )).toBe(8945);
    });

    it('returns null when either end is missing, so the caller does not guess', () => {
      expect(durationSecondsBetween(null, new Date())).toBeNull();
      expect(durationSecondsBetween(new Date(), null)).toBeNull();
      expect(durationSecondsBetween(undefined, undefined)).toBeNull();
    });

    it('returns null rather than a negative length when the pair is inverted', () => {
      expect(durationSecondsBetween(
        new Date('2026-11-18T18:05:00Z'),
        new Date('2026-11-18T18:02:00Z'),
      )).toBeNull();
    });

    it('feeds the rule directly: a 5-second active-speaker instance is refused', () => {
      const seconds = durationSecondsBetween(
        new Date('2026-11-18T18:02:12Z'),
        new Date('2026-11-18T18:02:17Z'),
      );
      expect(isSubstantiveRecording({ durationSeconds: seconds, recordingType: 'active_speaker' })).toBe(false);
    });
  });

  describe('substanceFromResourceMetadata', () => {
    it('reads the three fields the ingest paths write', () => {
      expect(substanceFromResourceMetadata({
        zoom_uuid: 'abc==', source: 'room_booking', part: 1, parts: 1,
        recording_type: 'shared_screen_with_speaker_view',
        video_width: 1920, video_height: 1080, duration_seconds: 78.9,
      })).toEqual({
        durationSeconds: 78.9, videoHeight: 1080, recordingType: 'shared_screen_with_speaker_view',
      });
    });

    it.each([
      ['null metadata', null],
      ['undefined metadata', undefined],
      ['empty metadata, as every pre-probe row carries', {}],
      ['a string where an object belongs', 'duration_seconds=10'],
      ['an array', []],
    ])('yields nothing measurable for %s', (_label, metadata) => {
      expect(durationFromResourceMetadata(metadata)).toBeNull();
      expect(isSubstantiveRecording(substanceFromResourceMetadata(metadata))).toBe(true);
    });

    it('ignores a non-string recording_type', () => {
      expect(substanceFromResourceMetadata({ recording_type: 42 }).recordingType).toBeNull();
    });
  });

  describe('shouldListResource', () => {
    it('hides the 9-second clip that was served as the 29 Oct Open House', () => {
      expect(shouldListResource({
        resource_type: 'recording',
        metadata: { video_width: 640, video_height: 360, duration_seconds: 9.045333 },
      })).toBe(false);
    });

    it('keeps the 79-second practice presentation in the same sweep', () => {
      expect(shouldListResource({
        resource_type: 'recording',
        metadata: {
          video_width: 1920, video_height: 1080, duration_seconds: 78.9,
          recording_type: 'shared_screen_with_speaker_view',
        },
      })).toBe(true);
    });

    it('keeps a real class recording', () => {
      expect(shouldListResource({
        resource_type: 'recording',
        metadata: { video_width: 1920, video_height: 1080, duration_seconds: 10634.86 },
      })).toBe(true);
    });

    it('keeps a recording whose length was never measured', () => {
      expect(shouldListResource({ resource_type: 'recording', metadata: {} })).toBe(true);
      expect(shouldListResource({ resource_type: 'recording', metadata: null })).toBe(true);
    });

    it.each(['file', 'link', 'note', 'transcript', undefined, null])(
      'never judges the length of a %s, because a person chose to put it there',
      (resourceType) => {
        // A short upload is not clutter; it is somebody's file. The rule must not
        // leak off recordings and start hiding what learners just added.
        expect(shouldListResource({
          resource_type: resourceType as never,
          metadata: { duration_seconds: 1, video_height: 360 },
        })).toBe(true);
      },
    );
  });
});
