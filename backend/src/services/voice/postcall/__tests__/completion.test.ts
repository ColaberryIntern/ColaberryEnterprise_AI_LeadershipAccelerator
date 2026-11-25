import { completionPatch, fromSynthflowPayload, transcriptState, MIN_TRANSCRIPT_CHARS } from '../completion';

describe('fromSynthflowPayload (shared normalizer)', () => {
  it('reads the V2 nested shape', () => {
    const c = fromSynthflowPayload({ call: { call_id: 'c1', status: 'completed', duration: 65, transcript: 'T', recording_url: 'r', end_call_reason: 'hangup' }, analysis: { a: 1 }, metadata: { source: 'x' } });
    expect(c).toEqual({ provider: 'synthflow', providerCallId: 'c1', status: 'completed', completed: true, durationSeconds: 65, transcript: 'T', recordingUrl: 'r', disposition: 'hangup', analysis: { a: 1 }, metadata: { source: 'x' } });
  });
  it('falls back to top-level fields and _id', () => {
    const c = fromSynthflowPayload({ _id: 'c2', status: 'no-answer', disposition: 'voicemail', duration: '12' });
    expect(c).toMatchObject({ providerCallId: 'c2', status: 'no-answer', completed: false, durationSeconds: 12, disposition: 'voicemail', transcript: '' });
  });
  it('no id means no completion; junk shapes never throw', () => {
    expect(fromSynthflowPayload({ call: { status: 'completed' } })).toBeNull();
    expect(fromSynthflowPayload(null)).toBeNull();
    expect(fromSynthflowPayload('x')).toBeNull();
    expect(fromSynthflowPayload({ call_id: 'c3', analysis: [1, 2], metadata: 'm', duration: -5 })).toMatchObject({ analysis: {}, metadata: {}, durationSeconds: null });
  });
});

describe('transcriptState: a null transcript never counts as success', () => {
  it.each([
    [true, '', 'pending_review'],
    [true, '   ', 'pending_review'],
    [true, 'x'.repeat(MIN_TRANSCRIPT_CHARS - 1), 'pending_review'],
    [true, 'x'.repeat(MIN_TRANSCRIPT_CHARS), 'present'],
    [false, '', 'not_applicable'],
  ])('completed=%s transcript=%j -> %s', (completed, transcript, state) => expect(transcriptState({ completed, transcript })).toBe(state));

  it('the patch carries the state for the row', () => {
    const c = fromSynthflowPayload({ call: { call_id: 'c1', status: 'completed', transcript: '' } })!;
    expect(completionPatch(c)).toMatchObject({ call_status: 'completed', transcript_state: 'pending_review' });
    expect(completionPatch(c)).not.toHaveProperty('completed_at');
  });
});
