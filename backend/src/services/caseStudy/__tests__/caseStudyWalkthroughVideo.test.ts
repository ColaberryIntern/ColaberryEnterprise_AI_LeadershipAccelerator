import { projectWalkthroughVideo, resolveHeroImage } from '../caseStudyPublicSections';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

/**
 * The narrated walkthrough that sits at the top of a record.
 *
 * WHAT THIS IS DEFENDING. A video is the easiest thing in this system to turn into a
 * fabricated claim: it looks like proof, it is hard to check, and `demo` already exists as
 * an artifact type, so the obvious implementation was to attach it as an artifact. That
 * would have put it in the artifacts carousel at a screenshot's aspect ratio AND made it a
 * hero candidate through `HERO_IMAGE_PRIORITY` - and a video that can win the cover is a
 * video that can stand in for a screenshot of the running system. `docs/V2_CUTOVER_CARRYOVER.md`
 * states the rule the whole system inherits: *"a picture presented as evidence of something
 * that did not happen is a fabricated claim, it just happens to be made of pixels."*
 *
 * So the walkthrough is its own field, and these tests pin the three properties that keep
 * it honest and safe:
 *
 *   1. URLS - every one goes through `safeHttpUrl`, because they are admin-editable and
 *      land in `src` attributes;
 *   2. WHOLENESS - no playable url means no player, rather than an empty frame with a
 *      caption track bound to nothing;
 *   3. SEPARATION - it cannot become the cover image, whatever it carries.
 */

const base = (): CaseStudySnapshotContent => ({
  identity: {
    slug: 's', title: 'T',
    organizationIdentityMode: 'hidden', organizationNamingConsent: false,
    builderIdentityMode: 'anonymous', builderNamingConsent: false,
  },
  heroMetrics: [],
  taxonomy: { stack: [], capabilities: [], deliverables: [] },
} as unknown as CaseStudySnapshotContent);

const withVideo = (v: unknown): CaseStudySnapshotContent =>
  ({ ...base(), walkthroughVideo: v } as unknown as CaseStudySnapshotContent);

const VIDEO = 'https://enterprise.colaberry.ai/site-v2/walkthrough.mp4';
const VTT = 'https://enterprise.colaberry.ai/site-v2/walkthrough.vtt';
const POSTER = 'https://enterprise.colaberry.ai/site-v2/poster.jpg';

describe('the walkthrough video reaches the page whole, or not at all', () => {
  it('carries the file, the captions, the poster and the duration', () => {
    const v = projectWalkthroughVideo(withVideo({
      url: VIDEO, title: 'How it works', captionsUrl: VTT, posterUrl: POSTER,
      durationSeconds: 82, narrationSource: 'synthetic',
    }));
    expect(v).toEqual({
      url: VIDEO, title: 'How it works', captionsUrl: VTT, posterUrl: POSTER,
      durationSeconds: 82, narrationSource: 'synthetic',
    });
  });

  it('is null on the ordinary record, which has no walkthrough', () => {
    expect(projectWalkthroughVideo(base())).toBeNull();
  });

  it('is dropped entirely when the file url is missing', () => {
    // Not "a player with no source" - a caption track and a poster with nothing to play
    // is a broken control, and it implies a video that does not exist.
    expect(projectWalkthroughVideo(withVideo({
      title: 'How it works', captionsUrl: VTT, posterUrl: POSTER,
    }))).toBeNull();
  });

  it('is dropped when it has no title, because the player would be unlabelled', () => {
    expect(projectWalkthroughVideo(withVideo({ url: VIDEO }))).toBeNull();
  });
});

describe('every url is gated, because each one lands in a src attribute', () => {
  it('refuses a javascript: file url', () => {
    expect(projectWalkthroughVideo(withVideo({
      // eslint-disable-next-line no-script-url -- the payload under test
      url: 'javascript:alert(1)', title: 'How it works',
    }))).toBeNull();
  });

  it('drops a hostile captions url without losing the video', () => {
    const v = projectWalkthroughVideo(withVideo({
      // eslint-disable-next-line no-script-url -- the payload under test
      url: VIDEO, title: 'How it works', captionsUrl: 'javascript:alert(1)',
    }));
    expect(v?.url).toBe(VIDEO);
    expect(v?.captionsUrl).toBeNull();
  });

  it('drops a hostile poster url without losing the video', () => {
    const v = projectWalkthroughVideo(withVideo({
      url: VIDEO, title: 'How it works', posterUrl: 'data:text/html,<script>',
    }));
    expect(v?.url).toBe(VIDEO);
    expect(v?.posterUrl).toBeNull();
  });
});

describe('what it is allowed to claim', () => {
  it('records only a recognised narration source', () => {
    expect(projectWalkthroughVideo(withVideo({
      url: VIDEO, title: 'T', narrationSource: 'human',
    }))?.narrationSource).toBe('human');
    expect(projectWalkthroughVideo(withVideo({
      url: VIDEO, title: 'T', narrationSource: 'a real person, honest',
    }))?.narrationSource).toBeNull();
  });

  it('refuses a nonsense duration rather than printing it', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, '82']) {
      expect(projectWalkthroughVideo(withVideo({
        url: VIDEO, title: 'T', durationSeconds: bad,
      }))?.durationSeconds).toBeNull();
    }
  });

  it('CANNOT become the cover image, whatever it carries', () => {
    // The load-bearing assertion. Mutating `resolveHeroImage` to consider the walkthrough
    // poster breaks this line, and that mutation is precisely the one that would let a
    // video stand in for a screenshot of the running system.
    const content = withVideo({ url: VIDEO, title: 'T', posterUrl: POSTER });
    expect(resolveHeroImage(content)).toBeNull();
  });
});
