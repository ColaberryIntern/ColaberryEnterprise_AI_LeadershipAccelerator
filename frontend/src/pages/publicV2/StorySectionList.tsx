import React from 'react';
import { SECTION_HEADINGS } from './storyDetailV2Model';
import { StorySectionBody } from './storyDetailV2Sections';
import { StoryFigureBand } from './StoryFigure';
import { StorySectionCount } from './StoryIndicators';
import { SECTION_COUNT_NOUNS, sectionCount } from './storyIndicatorModel';
import { figuresAfter } from './storyFigurePlacement';
import type { StoryFigurePlacement } from './storyFigurePlacement';
import type {
  CaseStudySectionKey,
  PublicCaseStudyDetail,
} from '../../services/caseStudyPublicTypes';

/**
 * StorySectionList - the body of `/stories/:slug`: every visible section, in the
 * surface's order, each followed by whatever picture was placed after it.
 *
 * WHY IT IS NOT IN THE PAGE. `storyDetailV2Contract.test.ts` holds
 * `StoryDetailV2.tsx` under 400 lines and it was at 369; adding the heading
 * chip, the figure band and the placed-picture hand-off put it at 404. The
 * choice was to delete the reasoning from the comments or to move a whole
 * concern out, and "how one section is drawn" is genuinely a different question
 * from "what state is this page in" - which is all the page has left to answer.
 *
 * THE FIGURE IS A SIBLING OF THE SECTION, NEVER A CHILD. Two reasons, and the
 * first is about truth rather than markup: a picture inside "The measurement" is
 * captioned by that heading whether or not anybody wrote a caption, so an
 * atmosphere photograph placed there would borrow a verified figure's
 * authority. Between two sections it belongs to neither and only its own caption
 * speaks for it. The second is mechanical - `StoryDetailV2.test.tsx` reads the
 * section order off `[data-section]`, so exactly one node per section must carry
 * that attribute, and a band that carried it would be counted as a section.
 *
 * EVERY PIECE HIDES ITSELF. The count chip renders nothing when the section has
 * nothing countable, the band renders nothing when no picture was placed after
 * it. A one-paragraph record with no images walks this list and produces a
 * heading and a paragraph, which is what makes this a template rather than a
 * layout for one record.
 */

/**
 * Which bands sit on sunken ground.
 *
 * `STORY_FORMAT_V1.md` section 5: every VISUAL band sits on sunken ground and
 * every PROSE band on default ground, so a reader learns in two screens that a
 * change of ground means a change of medium. Before this pass every band on the
 * page was default and the body read as one uninterrupted white sheet.
 *
 * ONLY `artifacts` QUALIFIES AMONG THE SECTIONS, and the reason is worth writing
 * down because the list looks suspiciously short. `artifacts` is the only
 * section whose body leads with pictures - `StoryMediaCarousel` above the list.
 * `architecture` carries a drawing, but it carries it BELOW two paragraphs and
 * three tag lists, so toning the whole band would put prose on visual ground to
 * reach a diagram most records do not have. `repositories` is a list of links,
 * which is text. The other visual bands on this page are the figure bands, and
 * they are not sections - they carry their own tone in `StoryFigure`.
 *
 * It is a Set rather than a total Record on purpose: a new section key should
 * default to prose ground, which is the safe answer, rather than failing to
 * compile until somebody picks a tone for it.
 */
const SUNKEN_SECTIONS: ReadonlySet<CaseStudySectionKey> = new Set<CaseStudySectionKey>([
  'artifacts',
]);

export interface StorySectionListProps {
  record: PublicCaseStudyDetail;
  /** Already resolved by `visibleSections`, hero and cta still included. */
  sections: readonly CaseStudySectionKey[];
  /** Where each approved picture goes, and which the artifacts band must skip. */
  figures: StoryFigurePlacement;
}

export function StorySectionList({
  record,
  sections,
  figures,
}: StorySectionListProps): React.ReactElement {
  return (
    <>
      {sections
        .filter((key) => key !== 'hero' && key !== 'cta')
        .map((key) => (
          <React.Fragment key={key}>
            <section
              className={`cbv2-rv cbv2-section cbv2-story__section${
                SUNKEN_SECTIONS.has(key) ? ' cbv2-story__section--sunken' : ''
              }`}
              data-section={key}
              data-tone={SUNKEN_SECTIONS.has(key) ? 'sunken' : 'default'}
              aria-labelledby={`cbv2-story-${key}`}
            >
              <div className="cbv2-wrap cbv2-story__body">
                {/* The chip sits beside the heading rather than inside it: an
                    `h2` whose accessible name ends in a digit reads badly in a
                    heading list, and the chip carries its own noun for the
                    screen reader anyway. */}
                <div className="cbv2-story__heading">
                  <h2 id={`cbv2-story-${key}`}>
                    {key === 'situation' && record.situation?.heading
                      ? record.situation.heading
                      : SECTION_HEADINGS[key]}
                  </h2>
                  <StorySectionCount
                    count={sectionCount(record, key)}
                    noun={SECTION_COUNT_NOUNS[key] ?? 'items'}
                  />
                </div>
                <StorySectionBody
                  sectionKey={key}
                  record={record}
                  placedHrefs={figures.placedHrefs}
                />
              </div>
            </section>
            <StoryFigureBand figures={figuresAfter(figures, key)} />
          </React.Fragment>
        ))}
    </>
  );
}

export default StorySectionList;
