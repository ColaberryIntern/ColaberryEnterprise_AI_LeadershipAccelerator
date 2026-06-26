import {
  isTrackedCourseUrl,
  normalizeCourseUrl,
  TRACKED_COURSE_URLS,
} from '../skilljarCourseMatch';

describe('normalizeCourseUrl', () => {
  it('reduces a canonical URL to host/path', () => {
    expect(normalizeCourseUrl('https://anthropic.skilljar.com/claude-code-101')).toBe(
      'anthropic.skilljar.com/claude-code-101',
    );
  });

  it('strips trailing slash, query, hash, protocol, and casing', () => {
    expect(normalizeCourseUrl('https://anthropic.skilljar.com/claude-code-101/')).toBe(
      'anthropic.skilljar.com/claude-code-101',
    );
    expect(
      normalizeCourseUrl('HTTP://Anthropic.Skilljar.COM/Claude-Code-101?utm=x#top'),
    ).toBe('anthropic.skilljar.com/claude-code-101');
  });

  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeCourseUrl(null)).toBe('');
    expect(normalizeCourseUrl(undefined)).toBe('');
    expect(normalizeCourseUrl('   ')).toBe('');
  });
});

describe('isTrackedCourseUrl', () => {
  it('matches the exact tracked URL', () => {
    expect(isTrackedCourseUrl('https://anthropic.skilljar.com/claude-code-101')).toBe(true);
  });

  // This is the regression the PR #85 review flagged: the live API can return the
  // same course with a trailing slash / different casing / query param / protocol,
  // which an exact Set.has() match silently dropped (courses_synced:0, error:null).
  it('matches tracked URLs that differ only by incidental URL parts', () => {
    expect(isTrackedCourseUrl('https://anthropic.skilljar.com/claude-code-101/')).toBe(true);
    expect(isTrackedCourseUrl('http://anthropic.skilljar.com/claude-code-101')).toBe(true);
    expect(isTrackedCourseUrl('https://anthropic.skilljar.com/Claude-Code-101?ref=portal')).toBe(
      true,
    );
    expect(
      isTrackedCourseUrl('https://anthropic.skilljar.com/claude-with-the-anthropic-api/'),
    ).toBe(true);
  });

  it('does not match a non-tracked course or junk input', () => {
    expect(isTrackedCourseUrl('https://anthropic.skilljar.com/some-other-course')).toBe(false);
    expect(isTrackedCourseUrl('https://evil.example.com/claude-code-101')).toBe(false);
    expect(isTrackedCourseUrl('')).toBe(false);
    expect(isTrackedCourseUrl(null)).toBe(false);
  });

  it('tracks all 5 canonical course URLs', () => {
    expect(TRACKED_COURSE_URLS).toHaveLength(5);
    for (const url of TRACKED_COURSE_URLS) {
      expect(isTrackedCourseUrl(url)).toBe(true);
    }
  });
});
