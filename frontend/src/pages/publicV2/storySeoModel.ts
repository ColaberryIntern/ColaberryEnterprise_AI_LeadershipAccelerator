import type {
  PublicCaseStudyDetail,
  PublicSurfaceView,
} from '../../services/caseStudyPublicTypes';

/**
 * storySeoModel - what `/stories/:slug` is allowed to tell a crawler.
 *
 * WHY IT IS ITS OWN MODULE. It was the last section of `storyDetailV2Model.ts`,
 * which reached 300 lines - the ceiling `storyDetailV2Contract.test.ts` holds it
 * to, and the one CLAUDE.md's Modular Composition Rule says must be split before
 * the next addition rather than after it. The seam is real rather than
 * convenient: everything left behind answers "what does this record contain and
 * what may we say about it on the page", and this answers "what do we hand to a
 * machine that will never read the page". Nothing else imports it; the page is
 * the only caller.
 */

/**
 * The OpenGraph card and the structured-data block, or `null`.
 *
 * BOTH ARE GATED ON APPROVED MEDIA, on the same gate. Spec section 28 allows
 * OpenGraph "when approved media exists" and section 25 forbids presenting
 * anything else as a product image, so a card with no approved image has
 * nothing truthful to show. The schema.org Article block is gated with it
 * because `image` is required for an Article rich result: without one it can
 * never produce the result it exists for. `ogImageUrl` is the server's
 * decision, from the media priority list in section 25; nothing here selects.
 */
export interface StorySeoExtras {
  readonly ogImage: string;
  readonly ogType: string;
  readonly jsonLd: Record<string, unknown>;
}

export function storySeoExtras(
  detail: PublicCaseStudyDetail,
  surface: PublicSurfaceView,
): StorySeoExtras | null {
  const image = detail.seo.ogImageUrl;
  if (!image) return null;
  return {
    ogImage: image,
    ogType: detail.seo.ogType,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: detail.title,
      description: detail.seo.description,
      url: detail.seo.canonicalUrl,
      image: [image],
      datePublished: detail.publishedAt,
      dateModified: detail.updatedAt,
      // The organisation, never a person: contributor consent is per-record and
      // structured data is the one place a name would outlive its withdrawal.
      publisher: { '@type': 'Organization', name: surface.brandLabel },
    },
  };
}
