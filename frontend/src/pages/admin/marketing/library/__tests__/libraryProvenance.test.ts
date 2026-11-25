import {
  formatViews,
  showsViews,
  uploaderClassName,
  uploaderPrefix,
  viewsLabel,
} from '../libraryProvenance';

describe('formatViews', () => {
  it('shows the exact number while it is still readable', () => {
    expect(formatViews(0)).toBe('0');
    expect(formatViews(7)).toBe('7');
    expect(formatViews(1448)).toBe('1,448');
    expect(formatViews(9999)).toBe('9,999');
  });

  it('abbreviates once the exact number stops being useful', () => {
    expect(formatViews(10_000)).toBe('10K');
    expect(formatViews(12_400)).toBe('12.4K');
    // Rounding must promote the unit, not print '1000K'.
    expect(formatViews(999_999)).toBe('1M');
    expect(formatViews(1_500_000)).toBe('1.5M');
    expect(formatViews(2_000_000_000)).toBe('2B');
  });

  it('keeps "no answer" distinct from "no views"', () => {
    // A private or deleted video has no count. Rendering it as 0 would call it a flop.
    expect(formatViews(null)).toBeNull();
    expect(formatViews(undefined)).toBeNull();
    expect(formatViews(Number.NaN)).toBeNull();
    expect(formatViews(-1)).toBeNull();
    expect(formatViews(0)).toBe('0');
  });
});

describe('viewsLabel', () => {
  it('agrees with itself about singular and plural', () => {
    expect(viewsLabel(1)).toBe('1 view');
    expect(viewsLabel(0)).toBe('0 views');
    expect(viewsLabel(1448)).toBe('1,448 views');
  });

  it('says nothing when there is nothing to say', () => {
    expect(viewsLabel(null)).toBeNull();
  });
});

describe('showsViews', () => {
  it('is true only for a link', () => {
    expect(showsViews({ kind: 'link', sourceUrl: 'https://youtu.be/abc' })).toBe(true);
  });

  it('is false for a hosted file, which has no counter anywhere', () => {
    expect(showsViews({ kind: 'file', sourceUrl: null })).toBe(false);
    expect(showsViews({ kind: 'link', sourceUrl: null })).toBe(false);
  });
});

describe('uploader presentation', () => {
  it('distinguishes a person from a batch job', () => {
    expect(uploaderPrefix('member')).toBe('Uploaded by');
    expect(uploaderPrefix('admin')).toBe('Uploaded by');
    expect(uploaderPrefix('system')).toBe('Added by');
    expect(uploaderPrefix('none')).toBe('Uploader');
  });

  it('flags the cases an operator should look at twice', () => {
    expect(uploaderClassName('admin')).toBe('text-body-secondary');
    expect(uploaderClassName('system')).toBe('text-info-emphasis');
    expect(uploaderClassName('unknown')).toBe('text-warning-emphasis');
    expect(uploaderClassName('none')).toBe('text-warning-emphasis');
  });
});
