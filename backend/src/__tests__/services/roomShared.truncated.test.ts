/**
 * truncated() (2026-07-31) — LiveSession.description is unbounded TEXT but
 * CommunityRoom.topic is VARCHAR(255); found live in production that
 * ensureRoomForSession had silently failed for 25 of 30 real sessions
 * because of this, so a room never got created for them.
 */
import { truncated } from '../../services/communityRooms/roomShared';

describe('truncated', () => {
  it('passes a value under the limit through unchanged', () => {
    expect(truncated('short', 255)).toBe('short');
  });

  it('passes a value exactly at the limit through unchanged', () => {
    const exact = 'x'.repeat(255);
    expect(truncated(exact, 255)).toBe(exact);
  });

  it('truncates a value over the limit and appends an ellipsis, staying within maxLength', () => {
    const long = 'x'.repeat(300);
    const result = truncated(long, 255);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(255);
    expect(result!.endsWith('…')).toBe(true);
  });

  it('returns null for null/undefined/empty input', () => {
    expect(truncated(null, 255)).toBeNull();
    expect(truncated(undefined, 255)).toBeNull();
    expect(truncated('', 255)).toBeNull();
  });
});
