import {
  judgeRecordingSubstance,
  isSubstantiveRecording,
  durationSecondsBetween,
  durationFromResourceMetadata,
  shouldListResource,
  MIN_SUBSTANTIVE_RECORDING_SECONDS,
} from '../../services/recordingSubstance';

describe('recordingSubstance', () => {
  describe('the floor', () => {
    it('refuses the join-and-leave clips actually found on production', () => {
      // Every one of these is a real file: a complete, valid 640x360 MP4 left
      // behind by somebody opening a meeting link and closing it again.
      for (const seconds of [3.88, 4.36, 7.17, 9.05, 12.93, 15.8, 28.5, 30.3, 44.9, 95.2]) {
        const verdict = judgeRecordingSubstance({ durationSeconds: seconds });
        expect(verdict.substantive).toBe(false);
        expect(verdict.reason).toBe('too_short');
        expect(verdict.durationSeconds).toBe(seconds);
      }
    });

    it('keeps the real sessions found on production', () => {
      // Short study-room sessions through to a 3-hour class.
      for (const seconds of [166.6, 192.2, 213.1, 278.3, 315.9, 376.1, 892.2, 10634.86]) {
        expect(isSubstantiveRecording({ durationSeconds: seconds })).toBe(true);
      }
    });

    it('is exclusive at the boundary, so the floor itself is substantive', () => {
      expect(isSubstantiveRecording({ durationSeconds: MIN_SUBSTANTIVE_RECORDING_SECONDS })).toBe(true);
      expect(isSubstantiveRecording({ durationSeconds: MIN_SUBSTANTIVE_RECORDING_SECONDS - 0.001 })).toBe(false);
    });
  });

  describe('unknown is not short', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['a non-numeric string', 'later'],
      ['a negative number', -5],
    ])('treats %s as substantive rather than withholding the recording', (_label, value) => {
      const verdict = judgeRecordingSubstance({ durationSeconds: value as never });
      expect(verdict.substantive).toBe(true);
      expect(verdict.reason).toBeNull();
      expect(verdict.durationSeconds).toBeNull();
    });

    it('accepts a numeric string, because jsonb round-trips are not to be trusted', () => {
      expect(judgeRecordingSubstance({ durationSeconds: '9.05' as never })).toEqual({
        substantive: false, reason: 'too_short', durationSeconds: 9.05,
      });
      expect(isSubstantiveRecording({ durationSeconds: '3600' as never })).toBe(true);
    });

    it('treats a zero-length recording as short, not as unmeasured', () => {
      expect(judgeRecordingSubstance({ durationSeconds: 0 })).toEqual({
        substantive: false, reason: 'too_short', durationSeconds: 0,
      });
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

    it('feeds the floor directly: a 5-second instance is refused', () => {
      const seconds = durationSecondsBetween(
        new Date('2026-11-18T18:02:12Z'),
        new Date('2026-11-18T18:02:17Z'),
      );
      expect(isSubstantiveRecording({ durationSeconds: seconds })).toBe(false);
    });
  });

  describe('durationFromResourceMetadata', () => {
    it('reads the field attachRecording writes', () => {
      expect(durationFromResourceMetadata({ duration_seconds: 9.045333 })).toBe(9.045333);
    });

    it('ignores the rest of the row metadata', () => {
      expect(durationFromResourceMetadata({
        zoom_uuid: 'abc==', source: 'class_session', part: 1, parts: 2,
        video_width: 1920, video_height: 1080, duration_seconds: 10634.86,
      })).toBe(10634.86);
    });

    it.each([
      ['null metadata', null],
      ['undefined metadata', undefined],
      ['empty metadata, as every pre-probe row carries', {}],
      ['a string where an object belongs', 'duration_seconds=10'],
      ['an array', []],
      ['a null duration', { duration_seconds: null }],
    ])('returns null for %s', (_label, metadata) => {
      expect(durationFromResourceMetadata(metadata)).toBeNull();
    });

    it('leaves a pre-probe row listed, since nothing was measured', () => {
      // The whole point: an unmeasured legacy row must not vanish from a room.
      expect(isSubstantiveRecording({ durationSeconds: durationFromResourceMetadata({}) })).toBe(true);
    });
  });

  describe('shouldListResource', () => {
    it('hides the 9-second clip that was served as the 29 Oct Open House', () => {
      expect(shouldListResource({
        resource_type: 'recording',
        metadata: { video_width: 640, video_height: 360, duration_seconds: 9.045333 },
      })).toBe(false);
    });

    it('lists a real class recording', () => {
      expect(shouldListResource({
        resource_type: 'recording',
        metadata: { video_width: 1920, video_height: 1080, duration_seconds: 10634.86 },
      })).toBe(true);
    });

    it('lists a recording whose length was never measured', () => {
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
          metadata: { duration_seconds: 1 },
        })).toBe(true);
      },
    );
  });
});
