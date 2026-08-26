import type { CaseStudySectionKey } from '../../services/caseStudyPublicTypes';
import type { PublicCaseStudyArtifact } from '../../services/caseStudyPublicTypes';
import { imageSlides } from './storyMediaModel';
import type { StorySlide } from './storyMediaModel';

/**
 * storyFigurePlacement - which approved picture a reader meets, and where.
 *
 * THE PROBLEM IT SOLVES. Every image on this page used to arrive in one band
 * near the bottom, after the reading was over. A reader met the argument first
 * and the evidence for it afterwards, in a gallery, which is the wrong order for
 * a record whose whole claim is that the work is real. These functions place
 * pictures BETWEEN narrative sections instead, so a picture arrives while the
 * reading is still going on.
 *
 * BETWEEN, NOT INSIDE - and that is a truth decision, not a layout one. A figure
 * placed INSIDE "The measurement" is captioned by that section whether anybody
 * wrote a caption or not: the reader reads the heading and assumes the picture
 * illustrates the claim under it. A figure placed BETWEEN two sections belongs
 * to neither, carries its own type label and its own title, and claims nothing
 * it cannot support.
 *
 * AN ATMOSPHERE PHOTOGRAPH IS STILL NEVER EVIDENCE. `storyMedia.test.tsx`
 * already pins that a photograph does not render inside the measurement,
 * roadmap or contributor sections. Placement extends the same rule to the gaps
 * next to them: a stock-feeling photograph immediately beneath a verified figure
 * reads as that figure's illustration however neutrally it is captioned, so
 * `ATMOSPHERE_EXCLUDED_AFTER` keeps them apart. The server's `presentation`
 * field is the authority, exactly as it is in `storyMediaModel`; nothing here
 * re-derives it from `artifactType`.
 *
 * PURE. No React, no DOM, no clock. The whole placement is a total function of
 * (artifacts, visible sections), so "a thin record still looks deliberate" is
 * testable without mounting a page - which is the only way that claim stays
 * true as records change.
 */

/**
 * The sections a figure may follow. `hero` and `cta` are excluded because they
 * are the page's opening and closing statements rather than narrative, and
 * `artifacts` and `repositories` because they are the record-keeping bands - a
 * picture placed after the artifacts list is back to being a gallery.
 */
export const FIGURE_GAP_SECTIONS: readonly CaseStudySectionKey[] = Object.freeze([
  'situation', 'build', 'architecture', 'measurement', 'roadmap', 'contributors',
] as CaseStudySectionKey[]);

/**
 * The gaps an ATMOSPHERE photograph may not occupy. Each of these four sections
 * ends on something the record is claiming to have proved - a drawn and verified
 * architecture, a measured figure, a shipped roadmap item, a named contributor -
 * and a photograph directly beneath one borrows its authority.
 */
export const ATMOSPHERE_EXCLUDED_AFTER: readonly CaseStudySectionKey[] = Object.freeze([
  'architecture', 'measurement', 'roadmap', 'contributors',
] as CaseStudySectionKey[]);

export interface StoryFigurePlacement {
  /** Figures to render immediately after each section key. Absent key = none. */
  readonly after: Readonly<Record<string, readonly StorySlide[]>>;
  /**
   * The `href` of every picture that found a gap. The artifacts band subtracts
   * these from its carousel, so no reader meets the same picture twice on one
   * page - which is what the band did before this module existed.
   */
  readonly placedHrefs: readonly string[];
}

const EMPTY: StoryFigurePlacement = Object.freeze({
  after: Object.freeze({}),
  placedHrefs: Object.freeze([]),
});

/** Whether this slide is allowed in the gap after `section`. */
export function figureAllowedAfter(slide: StorySlide, section: CaseStudySectionKey): boolean {
  if (!FIGURE_GAP_SECTIONS.includes(section)) return false;
  if (slide.presentation === 'atmosphere') return !ATMOSPHERE_EXCLUDED_AFTER.includes(section);
  return true;
}

/**
 * Place the pictures.
 *
 * THE CONSTRAINED KIND GOES FIRST, and that ordering is the whole reason this
 * fits in a paragraph. Atmosphere photographs can use a strict subset of the
 * gaps evidence can use, so allocating in record order lets an evidence image
 * take the one gap a photograph could have used and strand the photograph in the
 * leftovers. Allocating the constrained kind first cannot do that: any gap an
 * evidence image loses to a photograph, it can replace with one of the gaps the
 * photograph was never eligible for. Each kind still keeps the SERVER'S order
 * within itself, so the record decides which photograph comes first, not this.
 *
 * `sections` must be the page's already-computed visible list, so a figure can
 * never be placed after a section that is not on the page.
 */
export function placeStoryFigures(
  artifacts: readonly PublicCaseStudyArtifact[],
  sections: readonly CaseStudySectionKey[],
): StoryFigurePlacement {
  const slides = imageSlides(artifacts);
  if (slides.length === 0) return EMPTY;

  const gaps = sections.filter((key) => FIGURE_GAP_SECTIONS.includes(key));
  if (gaps.length === 0) return EMPTY;

  const taken = new Set<CaseStudySectionKey>();
  const after: Record<string, StorySlide[]> = {};
  const placedHrefs: string[] = [];

  const assign = (slide: StorySlide): void => {
    for (const gap of gaps) {
      if (taken.has(gap)) continue;
      if (!figureAllowedAfter(slide, gap)) continue;
      taken.add(gap);
      const bucket = after[gap] ?? [];
      bucket.push(slide);
      after[gap] = bucket;
      placedHrefs.push(slide.href);
      return;
    }
  };

  for (const slide of slides) if (slide.presentation === 'atmosphere') assign(slide);
  for (const slide of slides) if (slide.presentation !== 'atmosphere') assign(slide);

  return { after, placedHrefs };
}

/** The figures for one gap, or an empty list. Saves every caller a lookup. */
export function figuresAfter(
  placement: StoryFigurePlacement,
  section: CaseStudySectionKey,
): readonly StorySlide[] {
  return placement.after[section] ?? [];
}
