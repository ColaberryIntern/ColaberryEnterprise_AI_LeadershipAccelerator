import { selectNextLiveSession } from '../participantService';

// Live Sessions build-out Phase 2 (Session CC-20260721-s7h4).
// Pure selection logic for the Today "Next live class" card.

type S = { status: string; session_number: number; id?: string };

describe('selectNextLiveSession', () => {
  it('picks the lowest-numbered scheduled session', () => {
    const sessions: S[] = [
      { id: 'a', session_number: 1, status: 'completed' },
      { id: 'b', session_number: 2, status: 'scheduled' },
      { id: 'c', session_number: 3, status: 'scheduled' },
    ];
    expect(selectNextLiveSession(sessions)?.id).toBe('b');
  });

  it('prefers a live session that is earliest among active ones', () => {
    const sessions: S[] = [
      { id: 'a', session_number: 1, status: 'completed' },
      { id: 'b', session_number: 2, status: 'live' },
      { id: 'c', session_number: 3, status: 'scheduled' },
    ];
    expect(selectNextLiveSession(sessions)?.id).toBe('b');
  });

  it('is order-independent (sorts by session_number first)', () => {
    const sessions: S[] = [
      { id: 'c', session_number: 3, status: 'scheduled' },
      { id: 'a', session_number: 1, status: 'completed' },
      { id: 'b', session_number: 2, status: 'scheduled' },
    ];
    expect(selectNextLiveSession(sessions)?.id).toBe('b');
  });

  it('returns null when every session is completed', () => {
    const sessions: S[] = [
      { id: 'a', session_number: 1, status: 'completed' },
      { id: 'b', session_number: 2, status: 'completed' },
    ];
    expect(selectNextLiveSession(sessions)).toBeNull();
  });

  it('never selects a cancelled session', () => {
    const sessions: S[] = [{ id: 'a', session_number: 1, status: 'cancelled' }];
    expect(selectNextLiveSession(sessions)).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(selectNextLiveSession([])).toBeNull();
  });

  it('does not mutate the input array order', () => {
    const sessions: S[] = [
      { id: 'c', session_number: 3, status: 'scheduled' },
      { id: 'a', session_number: 1, status: 'scheduled' },
    ];
    selectNextLiveSession(sessions);
    expect(sessions.map((s) => s.id)).toEqual(['c', 'a']);
  });
});
