import { contentFromMetadata } from '../../services/timeline/timelineService';

// contentFromMetadata is what decides whether AI-generated content reaches the
// student feed. It must ignore empty/garbage and surface only real fields.
describe('contentFromMetadata', () => {
  it('returns null when there is no content', () => {
    expect(contentFromMetadata(null)).toBeNull();
    expect(contentFromMetadata({})).toBeNull();
    expect(contentFromMetadata({ video: { url: 'x' } })).toBeNull();
    expect(contentFromMetadata({ content: {} })).toBeNull();
    expect(contentFromMetadata({ content: { summary: '   ' } })).toBeNull();
  });

  it('surfaces only the non-empty fields', () => {
    const out = contentFromMetadata({
      content: { summary: 'A summary', body_html: '<p>Body</p>', questions: ['Q1', 'Q2'], reflection: '', extra: 'ignored' },
    });
    expect(out).toEqual({ summary: 'A summary', body_html: '<p>Body</p>', questions: ['Q1', 'Q2'] });
  });

  it('coerces question entries to strings and drops empty body/summary', () => {
    const out = contentFromMetadata({ content: { summary: '', body_html: '  ', questions: [1, 2] } });
    expect(out).toEqual({ questions: ['1', '2'] });
  });
});
