import {
  reviewDraft, quoteIsVerbatim, chapterHasFooting, describeExternal, UNVERIFIED_BADGE,
} from '../showcaseDraft';

/**
 * A showcase summary is read by an employer months later, with nobody in the room.
 *
 * That makes the bar higher than the deck's. An invented metric in a deck is an
 * awkward moment the student can correct while standing there; an invented metric
 * here is a claim on a page with their name on it that they will never see again.
 */

const SOURCES = ['We route 1,200 deliveries a week and cut manual routing by 4 hours a day.'];
const TRANSCRIPT = 'So the dispatcher picks the route automatically, and that used to take me four hours.';

describe('a figure in the summary must come from the student', () => {
  it('accepts a summary built from their own words', () => {
    const v = reviewDraft({
      summary: 'Routes 1,200 deliveries a week, cutting 4 hours of manual work a day.',
      sources: SOURCES, transcript: TRANSCRIPT,
    });
    expect(v.publishable).toBe(true);
    expect(v.unsupportedFigures).toEqual([]);
  });

  it('refuses a summary with an invented figure, and names it', () => {
    const v = reviewDraft({
      summary: 'Saved the business $400,000 a year.',
      sources: SOURCES, transcript: TRANSCRIPT,
    });
    expect(v.publishable).toBe(false);
    expect(v.unsupportedFigures.map((f) => f.normalized)).toContain('400000');
    expect(v.notices[0]).toMatch(/does not appear in anything you wrote/);
  });

  it('checks the chapter titles too, not only the summary', () => {
    const v = reviewDraft({
      summary: 'A routing demo.',
      chapters: ['Cutting costs by 73%'],
      sources: SOURCES, transcript: TRANSCRIPT,
    });
    expect(v.publishable).toBe(false);
    expect(v.unsupportedFigures.map((f) => f.normalized)).toContain('73');
  });
});

/**
 * A paraphrase inside quotation marks is the student being made to say something they
 * did not say. "Close enough" is exactly the standard that lets that through.
 */
describe('a quote must be the student\'s actual words', () => {
  it('accepts a quote that is in the transcript', () => {
    expect(quoteIsVerbatim('that used to take me four hours', TRANSCRIPT)).toBe(true);
  });

  it('ignores differences in whitespace and smart quotes', () => {
    expect(quoteIsVerbatim('“that  used to take   me four hours”', TRANSCRIPT)).toBe(true);
  });

  it('refuses a paraphrase, however close', () => {
    expect(quoteIsVerbatim('it used to take me about four hours', TRANSCRIPT)).toBe(false);
  });

  it('refuses any quote when there is no transcript to check against', () => {
    expect(quoteIsVerbatim('anything at all', null)).toBe(false);
  });

  it('blocks the draft and says what to do instead', () => {
    const v = reviewDraft({
      summary: 'A routing demo.',
      quotes: ['I rebuilt the whole dispatch system in a weekend'],
      sources: SOURCES, transcript: TRANSCRIPT,
    });
    expect(v.publishable).toBe(false);
    expect(v.notices.join(' ')).toMatch(/not in the transcript/);
    expect(v.notices.join(' ')).toMatch(/remove the quotation marks/);
  });
});

/**
 * A chapter is a label, not an assertion, so the rule is deliberately generous. The
 * strict standard is reserved for the things that CLAIM.
 */
describe('chapters are held to a looser standard than claims', () => {
  it('accepts a chapter with lexical footing in the recording', () => {
    expect(chapterHasFooting('The dispatcher', TRANSCRIPT)).toBe(true);
  });

  it('flags a chapter about something the recording never mentions', () => {
    expect(chapterHasFooting('Kubernetes autoscaling', TRANSCRIPT)).toBe(false);
  });

  // No transcript is not evidence the chapter is wrong.
  it('does not flag chapters when there is no transcript at all', () => {
    expect(chapterHasFooting('Anything', null)).toBe(true);
    const v = reviewDraft({ summary: 'A demo.', chapters: ['Anything'], sources: SOURCES, transcript: null });
    expect(v.unsupportedChapters).toEqual([]);
  });
});

describe('the draft gives the student an ordered list of what to fix', () => {
  it('lists every problem rather than only the first', () => {
    const v = reviewDraft({
      summary: 'Saved $90,000 and cut costs 50%.',
      quotes: ['I never said this'],
      chapters: ['Kubernetes autoscaling'],
      sources: SOURCES, transcript: TRANSCRIPT,
    });
    expect(v.notices.length).toBeGreaterThanOrEqual(4);
    expect(v.publishable).toBe(false);
  });

  it('says nothing when there is nothing to fix', () => {
    const v = reviewDraft({ summary: 'A dispatcher that routes automatically.', sources: SOURCES, transcript: TRANSCRIPT });
    expect(v.notices).toEqual([]);
    expect(v.publishable).toBe(true);
  });
});

/**
 * A gallery that presents external work identically to verified work is quietly
 * lending it the platform's credibility.
 */
describe('external work is discoverable without the platform vouching for it', () => {
  const ext = describeExternal({ url: 'https://github.com/someone/thing', label: 'My side project' });

  it('is never marked as platform-verified', () => {
    expect(ext.platformVerified).toBe(false);
  });

  it('carries a visible badge, not a tooltip', () => {
    expect(ext.badge).toBe(UNVERIFIED_BADGE);
    expect(ext.badge.length).toBeGreaterThan(0);
  });

  it('says plainly that we have not reviewed it', () => {
    expect(ext.note).toMatch(/have not reviewed it/i);
    expect(ext.note).toMatch(/make no claim/i);
  });

  it('keeps the link and the label the student gave', () => {
    expect(ext.url).toBe('https://github.com/someone/thing');
    expect(ext.label).toBe('My side project');
  });

  // There must be no code path that flips this to true.
  it('has no way to become verified', () => {
    const anotherOne = describeExternal({ url: 'https://example.test', label: 'x' });
    expect(anotherOne.platformVerified).toBe(false);
    expect(Object.keys(anotherOne)).not.toContain('verify');
  });
});
