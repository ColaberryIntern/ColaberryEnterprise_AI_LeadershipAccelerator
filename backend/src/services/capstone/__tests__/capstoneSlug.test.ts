/**
 * capstoneSlug — the public URL segment.
 *
 * The safety cases are the point: this is built from a student's own name and
 * project title, which are free text, and the result goes straight into a URL.
 */
import { buildCapstoneSlug, resolveUniqueSlug, slugify } from '../capstoneSlug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Meridian Intake Agent')).toBe('meridian-intake-agent');
  });

  it('keeps the letter when stripping accents rather than dropping it', () => {
    // A name with diacritics must not become a shorter, stranger word.
    expect(slugify('Zoë Okonjo-Iwéala')).toBe('zoe-okonjo-iweala');
  });

  it('collapses anything that could carry a path or a query', () => {
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('a?b=c&d=e')).toBe('a-b-c-d-e');
    expect(slugify('a/b#fragment')).toBe('a-b-fragment');
  });

  it('never leaves a leading or trailing hyphen', () => {
    expect(slugify('  --Hello--  ')).toBe('hello');
  });

  it('caps length and does not end mid-hyphen', () => {
    const out = slugify('x'.repeat(40) + ' ' + 'y'.repeat(40));
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith('-')).toBe(false);
  });

  it('returns empty for input with nothing usable', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
  });
});

describe('buildCapstoneSlug', () => {
  it('joins the student and their project', () => {
    expect(buildCapstoneSlug('Dana Okoye', 'Meridian Intake Agent'))
      .toBe('dana-okoye-meridian-intake-agent');
  });

  it('works from a name alone', () => {
    expect(buildCapstoneSlug('Dana Okoye', null)).toBe('dana-okoye');
  });

  it('works from a project alone', () => {
    expect(buildCapstoneSlug(null, 'Meridian Intake')).toBe('meridian-intake');
  });

  it('never returns empty — an unnamed student still needs an address', () => {
    expect(buildCapstoneSlug(null, null)).toBe('capstone');
    expect(buildCapstoneSlug('!!!', '???')).toBe('capstone');
  });
});

describe('resolveUniqueSlug', () => {
  it('returns the candidate untouched when it is free', () => {
    expect(resolveUniqueSlug('dana-okoye', ['someone-else'])).toBe('dana-okoye');
  });

  it('appends a readable counter rather than a random suffix', () => {
    // A person reading the URL can still tell whose it is.
    expect(resolveUniqueSlug('dana-okoye', ['dana-okoye'])).toBe('dana-okoye-2');
    expect(resolveUniqueSlug('dana-okoye', ['dana-okoye', 'dana-okoye-2'])).toBe('dana-okoye-3');
  });

  it('is deterministic for the same inputs', () => {
    const taken = ['dana-okoye', 'dana-okoye-2'];
    expect(resolveUniqueSlug('dana-okoye', taken)).toBe(resolveUniqueSlug('dana-okoye', taken));
  });

  it('skips a gap rather than reusing a freed slug', () => {
    // -2 is gone but -3 is taken; the next free one is -2, and reusing it is
    // correct: nothing published ever holds a slug that is absent from `taken`.
    expect(resolveUniqueSlug('a', ['a', 'a-3'])).toBe('a-2');
  });
});
