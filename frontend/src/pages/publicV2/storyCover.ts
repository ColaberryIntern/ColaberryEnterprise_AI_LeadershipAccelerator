import type { PublicCaseStudyDetail } from '../../services/caseStudyPublicTypes';

/**
 * The masthead cover picture.
 *
 * WHY THIS EXISTS AT ALL. `heroImageUrl` has been on the public projection, and
 * on the index card, since the projection was written. The DETAIL page never
 * read it - so the one page a reader lands on from a share link was the one page
 * with no picture, while the card that linked them there had one. The masthead
 * also left its whole right half empty at desktop widths, so the page was
 * simultaneously missing an image and holding a column-shaped hole for one.
 *
 * ALT TEXT IS RESOLVED, NEVER INVENTED. A cover on this page is a screenshot of
 * delivered work, so it carries meaning and an empty `alt` would be a lie of
 * omission. The projection already ships the artifact list with a human-written
 * `title`, so the alt is THAT title, matched by URL. When no approved artifact
 * claims the URL the picture is not rendered at all - the same rule the server's
 * `resolveHeroImage` gate applies, restated on the client so a projection that
 * somehow carried an unmatched URL cannot put an uncaptioned image on the page.
 *
 * Both `url` and `previewUrl` are matched because `resolveHeroImage` accepts
 * either when it validates the chosen cover, and a cover picked as a preview
 * would otherwise resolve to no title and be dropped.
 */
export interface StoryCover {
  readonly src: string;
  readonly alt: string;
}

export function coverFor(record: PublicCaseStudyDetail): StoryCover | null {
  const src = record.heroImageUrl;
  if (!src) return null;

  const owner = record.artifacts.find(
    (artifact) =>
      artifact.access === 'open' && (artifact.url === src || artifact.previewUrl === src),
  );
  // No approved artifact claims this URL: render nothing rather than an
  // unattributed picture with no honest alt text.
  if (!owner) return null;

  return { src, alt: owner.title };
}

export default coverFor;
