import { contentFromMetadata, normalizeCapabilities } from '../../services/timeline/timelineService';

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

// normalizeCapabilities feeds each card its type's Parts. Junk in the JSONB
// blob must never reach the render as a truthy "Part" (it would wrongly gate
// sections), and a missing/garbage blob must be an empty list (⇒ show all).
describe('normalizeCapabilities', () => {
  it('returns [] for non-arrays', () => {
    expect(normalizeCapabilities(null)).toEqual([]);
    expect(normalizeCapabilities(undefined)).toEqual([]);
    expect(normalizeCapabilities('ai_chat')).toEqual([]);
    expect(normalizeCapabilities({ ai_chat: true })).toEqual([]);
  });

  it('keeps only trimmed non-empty strings', () => {
    expect(normalizeCapabilities(['ai_chat', ' quiz ', '', '  ', 3, null, 'reflection']))
      .toEqual(['ai_chat', 'quiz', 'reflection']);
  });
});
