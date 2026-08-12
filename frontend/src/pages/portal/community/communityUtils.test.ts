import { initials, timeAgo, countdown, isVideoUrl } from './communityUtils';

// Pure-function coverage for the shared Community formatters. Runs under CRA's
// jest in CI (react-scripts test). Deterministic — timeAgo/countdown take an
// explicit `now` so there is no wall-clock flake.
describe('initials', () => {
  it('takes first + last initial for a full name', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });
  it('takes a single initial for a mononym', () => {
    expect(initials('Prince')).toBe('P');
  });
  it('collapses extra whitespace', () => {
    expect(initials('  grace   hopper ')).toBe('GH');
  });
  it('falls back to ? for an empty name', () => {
    expect(initials('')).toBe('?');
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('reads "just now" under a minute', () => {
    expect(timeAgo(ago(30_000), now)).toBe('just now');
  });
  it('reads minutes then hours then days', () => {
    expect(timeAgo(ago(5 * 60_000), now)).toBe('5m');
    expect(timeAgo(ago(3 * 3_600_000), now)).toBe('3h');
    expect(timeAgo(ago(2 * 86_400_000), now)).toBe('2d');
  });
  it('switches to an absolute date past a week', () => {
    const result = timeAgo(ago(10 * 86_400_000), now);
    expect(result).not.toMatch(/^\d+[mhd]$/);
    expect(result).not.toBe('just now');
  });
});

describe('countdown', () => {
  const now = Date.parse('2026-07-19T12:00:00.000Z');
  const ahead = (ms: number) => new Date(now + ms).toISOString();

  it('counts minutes, hours, and days to an upcoming event', () => {
    expect(countdown(ahead(45 * 60_000), now)).toBe('in 45m');
    expect(countdown(ahead(3 * 3_600_000), now)).toBe('in 3h');
    expect(countdown(ahead(2 * 86_400_000), now)).toBe('in 2d');
  });
  it('reads "now" for an event already started', () => {
    expect(countdown(ahead(-1000), now)).toBe('now');
  });
});

describe('isVideoUrl', () => {
  it('detects video extensions, including with a query string', () => {
    expect(isVideoUrl('https://cdn.example.com/clip.mp4')).toBe(true);
    expect(isVideoUrl('https://cdn.example.com/clip.MP4?token=abc')).toBe(true);
    expect(isVideoUrl('https://cdn.example.com/pic.png')).toBe(false);
  });
});
