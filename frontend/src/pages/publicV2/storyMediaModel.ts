import type {
  PublicCaseStudyArchitecture,
  PublicCaseStudyArtifact,
  CaseStudyArtifactType,
} from '../../services/caseStudyPublicTypes';

/**
 * storyMediaModel - which approved artifacts become pictures on this page.
 *
 * WHY IT IS A SEPARATE MODULE AND NOT PART OF THE SECTIONS FILE. Two reasons,
 * both enforced by tests belonging to other tasks:
 *
 *   1. `storyDetailV2Contract.test.ts` asserts that `storyDetailV2Sections.tsx`
 *      contains no `.filter(` at all. That rule exists so nobody re-filters a
 *      private repository on the client, which would imply the wire could carry
 *      one. Selecting slides IS a filter, so it lives here rather than weakening
 *      a rule that is protecting something else;
 *   2. the same file asserts `storyDetailV2Model.ts` stays under 300 lines, and
 *      it is at 297.
 *
 * PURE. No React, no DOM, no clock. Every function is a total function of its
 * argument, so the carousel's emptiness rule can be tested without mounting
 * anything - which is what stops "hidden unless supported" from quietly becoming
 * "hidden unless this fixture happened to be empty".
 *
 * NOTHING HERE DECIDES WHETHER A PICTURE IS EVIDENCE. The server already did,
 * and it stamped the answer on `presentation`. This module reads that field and
 * never re-derives it from `artifactType`, because two definitions of "is this
 * evidence" is one more than the system can be honest with.
 */

/** The artifact types that render as a still image. `demo` is a video, not an image. */
export const IMAGE_ARTIFACT_TYPES: readonly CaseStudyArtifactType[] = Object.freeze([
  'screenshot', 'architecture', 'photo',
]);

/**
 * The number of pictures below which a carousel is theatre.
 *
 * One slide in a scroll-snap track with two arrow buttons that cannot move is a
 * control that does nothing, which is the same defect as a fake download button
 * wearing different clothes. Below this floor the artifacts band renders its
 * ordinary list and the page looks deliberate rather than broken - which is also
 * what makes this page usable as a template.
 */
export const CAROUSEL_MINIMUM_SLIDES = 2;

/**
 * One picture in the track.
 *
 * `presentation` is carried through rather than recomputed so a renderer can
 * caption an atmosphere photograph differently without ever being able to
 * disagree with the server about which kind it is.
 */
export interface StorySlide {
  readonly title: string;
  readonly imageUrl: string;
  readonly href: string;
  readonly artifactType: CaseStudyArtifactType;
  readonly presentation: 'evidence' | 'atmosphere';
}

/** An open artifact that is an image and has somewhere to point. */
function toSlide(artifact: PublicCaseStudyArtifact): StorySlide | null {
  if (artifact.access !== 'open') return null;
  if (!IMAGE_ARTIFACT_TYPES.includes(artifact.artifactType)) return null;
  // `previewUrl` is the thumbnail when the publisher supplied one; `url` is the
  // asset itself. Either is an approved, server-validated http(s) address - the
  // projection dropped the row otherwise - so neither is re-validated here.
  const imageUrl = artifact.previewUrl ?? artifact.url;
  if (!imageUrl) return null;
  return {
    title: artifact.title,
    imageUrl,
    href: artifact.url,
    artifactType: artifact.artifactType,
    presentation: artifact.presentation,
  };
}

/**
 * Every approved picture in this record, in the server's order, with no floor.
 *
 * Split out from `carouselSlides` because two callers now need the same
 * selection and only one of them wants the carousel's minimum: the figure
 * placement model asks "which pictures exist" and answers it for a record with a
 * single image, which is precisely the record a carousel must refuse.
 */
export function imageSlides(
  artifacts: readonly PublicCaseStudyArtifact[],
): readonly StorySlide[] {
  const slides: StorySlide[] = [];
  for (const artifact of artifacts ?? []) {
    const slide = toSlide(artifact);
    if (slide) slides.push(slide);
  }
  return slides;
}

/**
 * The slides, or an empty track.
 *
 * Returns `[]` rather than a one-slide track below the floor, so the caller's
 * emptiness check is the ordinary `length === 0` every other band on this page
 * uses. A caller cannot accidentally render a carousel that cannot move.
 *
 * `placedHrefs` is what a picture already shown between two sections leaves
 * behind. The band used to render every image twice within one screen - once in
 * the track, once again in the list beneath it - which reads as a rendering
 * fault rather than as a gallery. Subtracting them here rather than at the call
 * site keeps the floor and the subtraction in the same function, so no caller
 * can apply one without the other and resurrect the one-slide carousel.
 * DEFAULTS TO EMPTY: a caller that places nothing gets exactly the old answer.
 */
export function carouselSlides(
  artifacts: readonly PublicCaseStudyArtifact[],
  placedHrefs: readonly string[] = [],
): readonly StorySlide[] {
  const placed = new Set<string>(placedHrefs);
  const slides = imageSlides(artifacts).filter((slide) => !placed.has(slide.href));
  return slides.length >= CAROUSEL_MINIMUM_SLIDES ? slides : [];
}

/**
 * The human-authored mermaid source, or null.
 *
 * A one-line unwrap with a name, so the band's visibility is a value the page
 * can ask about before it mounts anything - the same discipline
 * `isSectionSupported` applies to every other section.
 */
export function diagramSourceOf(
  architecture: PublicCaseStudyArchitecture | null,
): string | null {
  const source = architecture?.diagramSource;
  return typeof source === 'string' && source.trim().length > 0 ? source : null;
}
