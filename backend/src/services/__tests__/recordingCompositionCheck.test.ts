/**
 * The question asked the night a class recording is ingested: does it show the
 * screen? On 2026-09-10 the answer was no for 2.5 hours and nobody knew for
 * four days. These pin the judgement; the ingest site only forwards it.
 */
import { isScreenComposition, judgeClassRecording } from '../recordingCompositionCheck';

const base = { sessionId: 's-16', sessionNumber: 16, title: 'Week 8 · Architecture Day', durationMinutes: 125, part: 1, parts: 1 };

describe('isScreenComposition', () => {
  it('accepts every shared_screen* composition and nothing else', () => {
    expect(isScreenComposition('shared_screen_with_speaker_view')).toBe(true);
    expect(isScreenComposition('shared_screen_with_gallery_view')).toBe(true);
    expect(isScreenComposition('shared_screen')).toBe(true);
    expect(isScreenComposition('active_speaker')).toBe(false);
    expect(isScreenComposition('gallery_view')).toBe(false);
    expect(isScreenComposition(null)).toBe(false);
    expect(isScreenComposition(undefined)).toBe(false);
  });
});

describe('judgeClassRecording', () => {
  it('is silent for Monday 14 Sep, which recorded the screen', () => {
    expect(judgeClassRecording({ ...base, recordingType: 'shared_screen_with_speaker_view' })).toBeNull();
  });

  it('names the session, the composition and the fix for Thursday 10 Sep', () => {
    const f = judgeClassRecording({ ...base, sessionNumber: 15, title: 'Week 7 · Architecture + Build Day', recordingType: 'active_speaker', durationMinutes: 151 });
    expect(f).not.toBeNull();
    expect(f!.key).toBe('no_screen_share');
    expect(f!.title).toBe('Class recording has no screen share: Session 15 · Week 7 · Architecture + Build Day');
    expect(f!.description).toMatch(/"active_speaker" composition \(151 min\)/);
    expect(f!.description).toMatch(/Record active speaker with shared screen/);
    expect(f!.metadata).toEqual(expect.objectContaining({ session_id: 's-16', session_number: 15, recording_type: 'active_speaker', duration_minutes: 151 }));
  });

  it('treats an unknown composition as a finding, never as fine', () => {
    const f = judgeClassRecording({ ...base, recordingType: null, durationMinutes: null });
    expect(f).not.toBeNull();
    expect(f!.description).toMatch(/"unknown" composition\. Zoom produced/);
  });

  it('says which part when a class was recorded in several', () => {
    const f = judgeClassRecording({ ...base, recordingType: 'active_speaker', part: 2, parts: 3 });
    expect(f!.description).toMatch(/\(part 2 of 3\)/);
  });
});
