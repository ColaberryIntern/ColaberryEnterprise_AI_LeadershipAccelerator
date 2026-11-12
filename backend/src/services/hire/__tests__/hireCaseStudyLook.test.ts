/**
 * lookOf / toHireCaseStudyCard: what makes one Hire case-study card look like itself (Ali,
 * 2026-11-11: Kes's nine cards "on the surface they all look the same"). Pure; the input is
 * the record's own public projection, so nothing here can expose a field that page hides.
 */
import { lookOf, toHireCaseStudyCard, withUnit } from '../hireTalentProjection';
import type { PublicCaseStudyDetail } from '../../../types/caseStudyPublic';

const detail = (over: Record<string, unknown> = {}): PublicCaseStudyDetail => ({
  slug: 'a', title: 'A', standfirst: 'S', industry: 'education', primaryCapability: 'operational-ai-call-intent-routing',
  verificationClass: 'verified', heroImageUrl: '/site-v2/thumb-a.jpg?v=1',
  walkthroughVideo: { url: '/v.mp4', title: 'W', captionsUrl: null, posterUrl: '/site-v2/poster-a.jpg', durationSeconds: 101.4, narrationSource: null, embedUrl: null, provider: null, watchUrl: null },
  visualStory: { kind: 'workflow' }, decisions: [{}, {}, {}], repositories: [{}], privateRepositoryCount: 1,
  heroMetrics: [{ valueDisplay: '97%', unit: null, label: 'of lost events resolved' }],
  ...over,
} as unknown as PublicCaseStudyDetail);

describe('lookOf', () => {
  it('reads every differentiator the public page already shows (happy path)', () => {
    expect(lookOf(detail())).toEqual({
      coverImageUrl: '/site-v2/thumb-a.jpg?v=1', walkthroughSeconds: 101, capability: 'operational-ai-call-intent-routing',
      verified: true, workflowDiagram: true, decisions: 3, repositories: 2,
    });
  });

  it('falls back from the cover to the video poster, then to nothing', () => {
    expect(lookOf(detail({ heroImageUrl: null })).coverImageUrl).toBe('/site-v2/poster-a.jpg');
    expect(lookOf(detail({ heroImageUrl: '  ', walkthroughVideo: null })).coverImageUrl).toBeNull();
  });

  it('reads an empty record as empty, never as a guess (the not-yet-finished record)', () => {
    const bare = lookOf(detail({
      heroImageUrl: null, walkthroughVideo: null, primaryCapability: null, verificationClass: 'illustrative',
      visualStory: null, decisions: undefined, repositories: null, privateRepositoryCount: undefined,
    }));
    expect(bare).toEqual({ coverImageUrl: null, walkthroughSeconds: null, capability: null, verified: false, workflowDiagram: false, decisions: 0, repositories: 0 });
  });

  it('drops a zero, negative or missing video length (boundary)', () => {
    const v = (d: unknown) => detail({ walkthroughVideo: { ...(detail() as any).walkthroughVideo, durationSeconds: d } });
    expect(lookOf(v(0)).walkthroughSeconds).toBeNull();
    expect(lookOf(v(-5)).walkthroughSeconds).toBeNull();
    expect(lookOf(v(null)).walkthroughSeconds).toBeNull();
    expect(lookOf(v(1)).walkthroughSeconds).toBe(1);
  });

  it('is pure: same input, same output, input untouched', () => {
    const d = detail();
    const before = JSON.stringify(d);
    expect(lookOf(d)).toEqual(lookOf(d));
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('toHireCaseStudyCard', () => {
  it('carries the look next to the headline figure', () => {
    const card = toHireCaseStudyCard(detail(), { featured: false, publishedAt: '2026-11-01' });
    expect(card.heroMetric).toEqual({ value: '97%', label: 'of lost events resolved' });
    expect(card.look.coverImageUrl).toBe('/site-v2/thumb-a.jpg?v=1');
  });
});

// Quincy, 2026-11-12: his profile's headline card read "Recovered in 1m31s seconds".
describe('withUnit', () => {
  it.each([
    ['Recovered in 1m31s', 'seconds', 'Recovered in 1m31s'],
    ['1 of 6 sources live', 'sources', '1 of 6 sources live'],
    ['448', 'tests', '448 tests'],
    ['41%', 'percentage points', '41% percentage points'],
    ['97%', null, '97%'],
  ])('%s + %s -> %s', (v, u, want) => {
    expect(withUnit(v, u)).toBe(want);
  });

  it('the card carries the phrase without a doubled unit', () => {
    const card = toHireCaseStudyCard(
      detail({ heroMetrics: [{ valueDisplay: 'Recovered in 1m31s', unit: 'seconds', label: 'once the failure was confirmed' }] }),
      { featured: false, publishedAt: '2026-11-12T00:00:00.000Z' },
    );
    expect(card.heroMetric).toEqual({ value: 'Recovered in 1m31s', label: 'once the failure was confirmed' });
  });
});
