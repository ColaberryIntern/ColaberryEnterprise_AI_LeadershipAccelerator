/**
 * Recognising listen-to-earn items. This is the one place the client decides
 * "this Today item is an ambient podcast/testimonial" — the tile, the drawer and
 * the shell's collect dispatch all key off it, so a wrong answer here pays the
 * wrong gate or none.
 */
import { ambientMediaOf, mediaVerb } from '../ambientMedia';

describe('ambientMediaOf', () => {
  it('parses a podcast ref into kind + provider id', () => {
    expect(ambientMediaOf({ id: 'podcast:ep-42' })).toEqual({ kind: 'podcast', id: 'ep-42' });
  });

  it('parses a testimonial ref', () => {
    expect(ambientMediaOf({ id: 'testimonial:a1b2-c3' })).toEqual({ kind: 'testimonial', id: 'a1b2-c3' });
  });

  it('keeps colons inside the provider id intact', () => {
    expect(ambientMediaOf({ id: 'podcast:show:ep:9' })).toEqual({ kind: 'podcast', id: 'show:ep:9' });
  });

  it('returns null for everything that is not ambient media', () => {
    expect(ambientMediaOf({ id: 'c1' })).toBeNull();                       // anchored card uuid
    expect(ambientMediaOf({ id: 'blog:b1' })).toBeNull();                  // blog has its own gate
    expect(ambientMediaOf({ id: 'community:p1' })).toBeNull();
    expect(ambientMediaOf({ id: 'project:t1' })).toBeNull();
    expect(ambientMediaOf({ id: 'podcast:' })).toBeNull();                 // no id
    expect(ambientMediaOf({ id: ':podcast' })).toBeNull();
  });
});

describe('mediaVerb', () => {
  it('says listen for a podcast and watch for a testimonial', () => {
    expect(mediaVerb('podcast')).toBe('listen');
    expect(mediaVerb('testimonial')).toBe('watch');
  });
});
