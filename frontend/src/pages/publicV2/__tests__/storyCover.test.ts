import { coverFor } from '../storyCover';
import type { PublicCaseStudyDetail } from '../../../services/caseStudyPublicTypes';

/**
 * The masthead cover, and the one rule that keeps it honest.
 *
 * `heroImageUrl` is already gated on the server: `resolveHeroImage` refuses a
 * URL that is not an approved, publicly viewable artifact. This resolver exists
 * for the OTHER half of the problem - alt text. A cover on this page is a
 * screenshot of delivered work, so it says something, and the projection has
 * exactly one human-written string for it: the artifact's title. Matching by URL
 * is how that title is found, and a URL no artifact claims yields no cover
 * rather than a picture nobody can describe.
 */

const IMG = 'https://enterprise.colaberry.ai/site-v2/shot.png';

const artifact = (over: Record<string, unknown> = {}) =>
  ({
    access: 'open',
    artifactType: 'screenshot',
    presentation: 'evidence',
    title: 'Requirements traceability',
    description: null,
    url: IMG,
    previewUrl: null,
    ...over,
  }) as never;

const record = (over: Record<string, unknown> = {}) =>
  ({ heroImageUrl: IMG, artifacts: [artifact()], ...over }) as unknown as PublicCaseStudyDetail;

describe('coverFor', () => {
  it('returns nothing when the record names no cover', () => {
    expect(coverFor(record({ heroImageUrl: null }))).toBeNull();
  });

  it('takes its alt text from the artifact that owns the URL', () => {
    expect(coverFor(record())).toEqual({ src: IMG, alt: 'Requirements traceability' });
  });

  it('matches on previewUrl too, because the server accepts either', () => {
    const c = coverFor(
      record({
        artifacts: [artifact({ url: 'https://x.test/full.png', previewUrl: IMG, title: 'Guardrails' })],
      }),
    );
    expect(c).toEqual({ src: IMG, alt: 'Guardrails' });
  });

  it('picks the right artifact when several are approved', () => {
    const c = coverFor(
      record({
        artifacts: [
          artifact({ url: 'https://x.test/other.png', title: 'Something else' }),
          artifact({ title: 'The one named as cover' }),
        ],
      }),
    );
    expect(c?.alt).toBe('The one named as cover');
  });

  it('REFUSES a URL no artifact claims, rather than shipping an undescribed picture', () => {
    expect(coverFor(record({ artifacts: [artifact({ url: 'https://x.test/other.png' })] }))).toBeNull();
  });

  it('REFUSES a request-only artifact, which carries no url and no permission to show one', () => {
    const requestOnly = {
      access: 'request',
      artifactType: 'screenshot',
      presentation: 'evidence',
      title: 'Private capture',
      description: null,
    } as never;
    expect(coverFor(record({ artifacts: [requestOnly] }))).toBeNull();
  });
});
