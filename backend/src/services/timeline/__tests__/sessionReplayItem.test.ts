import { sessionReplayItem } from '../todayAnchoredSources';

// Live Sessions build-out Phase 4 (Session CC-20260721-s7h4).
// Pure mapper: completed LiveSession → Today "you missed it" replay item.

const base = {
  id: 'sess-1',
  title: 'RAG Deep-Dive',
  session_number: 4,
  recap_json: null,
  recording_url: null,
} as any;

describe('sessionReplayItem', () => {
  it('maps ref, type, render_band, and title', () => {
    const item = sessionReplayItem(base);
    expect(item.ref).toBe('session:sess-1');
    expect(item.type).toBe('live_class');
    expect(item.render_band).toBe('live_class');
    expect(item.title).toBe('You missed it — RAG Deep-Dive');
  });

  it('uses the recap summary as the description when present', () => {
    const item = sessionReplayItem({ ...base, recap_json: { summary: 'We covered RAG.' } });
    expect(item.description).toBe('We covered RAG.');
  });

  it('falls back to a placeholder description when no recap yet', () => {
    expect(sessionReplayItem(base).description).toBe('Recap coming soon.');
  });

  it('sets video only when a recording_url exists (self-heal target)', () => {
    expect(sessionReplayItem(base).video).toBeNull();
    const withRec = sessionReplayItem({ ...base, recording_url: 'https://x/rec' });
    expect(withRec.video).toEqual({ url: 'https://x/rec', presenter: null, poster: null });
  });

  it('is an anchored item that has not been interacted with', () => {
    const item = sessionReplayItem(base);
    expect(item.kind).toBe('anchored');
    expect(item.interacted).toBe(false);
  });
});
