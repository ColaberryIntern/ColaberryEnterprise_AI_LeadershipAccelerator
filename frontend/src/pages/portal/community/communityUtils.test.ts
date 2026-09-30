import { initials, timeAgo, countdown, isVideoUrl, linkify } from './communityUtils';

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

describe('linkify', () => {
  // The two shapes Jackie reported on 2026-08-18: an Eventbrite link in an
  // event announcement, and an inbox on an AI Internship announcement.
  it('links an Eventbrite URL inside an event announcement', () => {
    const body = 'Open House is Thursday. Register: https://www.eventbrite.com/e/ai-open-house-tickets-12345';
    expect(linkify(body)).toEqual([
      { kind: 'text', value: 'Open House is Thursday. Register: ' },
      {
        kind: 'url',
        value: 'https://www.eventbrite.com/e/ai-open-house-tickets-12345',
        href: 'https://www.eventbrite.com/e/ai-open-house-tickets-12345',
      },
    ]);
  });

  it('turns an email address into a mailto link', () => {
    expect(linkify('Send your resume to internships@colaberry.com today')).toEqual([
      { kind: 'text', value: 'Send your resume to ' },
      { kind: 'email', value: 'internships@colaberry.com', href: 'mailto:internships@colaberry.com' },
      { kind: 'text', value: ' today' },
    ]);
  });

  it('gives a bare www host an https scheme', () => {
    const [seg] = linkify('www.colaberry.com');
    expect(seg).toEqual({ kind: 'url', value: 'www.colaberry.com', href: 'https://www.colaberry.com' });
  });

  it('leaves trailing sentence punctuation outside the href', () => {
    expect(linkify('Register at https://evt.br/x.')).toEqual([
      { kind: 'text', value: 'Register at ' },
      { kind: 'url', value: 'https://evt.br/x', href: 'https://evt.br/x' },
      { kind: 'text', value: '.' },
    ]);
    expect(linkify('Mail jackie@colaberry.com, please')).toEqual([
      { kind: 'text', value: 'Mail ' },
      { kind: 'email', value: 'jackie@colaberry.com', href: 'mailto:jackie@colaberry.com' },
      { kind: 'text', value: ', please' },
    ]);
  });

  it('does not swallow a closing parenthesis that wraps the link', () => {
    expect(linkify('(see https://evt.br/x)')).toEqual([
      { kind: 'text', value: '(see ' },
      { kind: 'url', value: 'https://evt.br/x', href: 'https://evt.br/x' },
      { kind: 'text', value: ')' },
    ]);
  });

  it('handles several links in one body', () => {
    const segs = linkify('Register https://evt.br/a or email hi@colaberry.com or see www.colaberry.com');
    expect(segs.filter((s) => s.kind === 'url')).toHaveLength(2);
    expect(segs.filter((s) => s.kind === 'email')).toHaveLength(1);
  });

  // Security boundary: only http(s) and mailto can ever be produced, so a
  // scheme payload pasted into a post body stays inert text.
  it('never builds a javascript: href', () => {
    const segs = linkify('click javascript:alert(1) now');
    expect(segs.every((s) => s.kind === 'text')).toBe(true);
  });

  it('does not mistake a URL path for an email address', () => {
    const segs = linkify('https://x.com/@colaberry');
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('url');
  });

  // Boundary cases.
  it('returns a single text segment when there is nothing to link', () => {
    expect(linkify('Just a normal announcement with no links')).toEqual([
      { kind: 'text', value: 'Just a normal announcement with no links' },
    ]);
  });

  it('returns nothing for an empty body', () => {
    expect(linkify('')).toEqual([]);
  });

  it('preserves the newlines the card renders with pre-wrap', () => {
    const segs = linkify('Line one\n\nRegister: https://evt.br/x');
    expect(segs[0]).toEqual({ kind: 'text', value: 'Line one\n\nRegister: ' });
  });

  // The matcher is a module-level /g regex; without an explicit lastIndex
  // reset the second call would start mid-string and silently drop links.
  it('is stable across repeated calls', () => {
    const body = 'Register: https://evt.br/x and email hi@colaberry.com';
    expect(linkify(body)).toEqual(linkify(body));
    expect(linkify(body)).toEqual(linkify(body));
  });
});
