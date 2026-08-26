import React from 'react';
import { ARTIFACT_TYPE_LABELS } from '../../config/caseStudySurfaces';
import type { StorySlide } from './storyMediaModel';

/**
 * StoryFigure - one approved picture, met while the reading is still going on.
 *
 * IT SITS BETWEEN TWO SECTIONS AND BELONGS TO NEITHER. `storyFigurePlacement`
 * decided which gap this is; the band's job is to make that placement legible,
 * which means the caption has to do all the claiming. The type label
 * ("Screenshot", "Photograph") comes first and the publisher's title second, so
 * a reader knows what KIND of thing they are looking at before they read what it
 * is called - the same order the artifacts list uses, for the same reason.
 *
 * THE ALT TEXT IS EMPTY, DELIBERATELY. The wire carries an approved image and no
 * alt text for it. Writing a sentence describing a picture this code has never
 * seen is exactly the fabrication the evidence/atmosphere split exists to
 * prevent, so the image is decorative and the caption beside it - real text, in
 * the accessibility tree, never hidden - carries the meaning. A screen reader
 * gets the type and the title, which is everything the record actually knows.
 *
 * NO TRACKING ZONE, AND THAT IS A CHOICE. The page's delegated handler finds an
 * artifact by counting `.cbv2-cs-artifact` siblings, so a figure - which is not
 * one of those - would emit an artifact-click row with no kind on it. A row that
 * says less than nothing is worse than no row; every artifact is still tracked
 * where it is listed, in the artifacts band.
 *
 * IT DISAPPEARS RATHER THAN EMPTIES. No figures, no band - no frame, no
 * placeholder, no "images coming soon". A record with no approved pictures
 * renders this component zero times and reads as though it never wanted any.
 */

export interface StoryFigureBandProps {
  /** Already chosen by `placeStoryFigures`; empty means render nothing. */
  figures: readonly StorySlide[];
}

export function StoryFigureBand({ figures }: StoryFigureBandProps): React.ReactElement | null {
  if (figures.length === 0) return null;

  return (
    <div className="cbv2-rv cbv2-story-figures" data-testid="story-figures">
      <div className="cbv2-wrap">
        {figures.map((figure, index) => (
          <figure
            className="cbv2-story-figure"
            key={`${figure.href}-${index}`}
            data-presentation={figure.presentation}
            data-artifact-kind={figure.artifactType}
          >
            <a
              className="cbv2-story-figure__link"
              href={figure.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="cbv2-story-figure__image"
                src={figure.imageUrl}
                alt=""
                loading="lazy"
              />
              <span className="cbv2-cs-sr-only">
                {`Open ${ARTIFACT_TYPE_LABELS[figure.artifactType].toLowerCase()}: `}
                {figure.title}
                {' (opens in a new tab)'}
              </span>
            </a>
            <figcaption className="cbv2-story-figure__caption">
              <span className="cbv2-story-figure__kind">
                {ARTIFACT_TYPE_LABELS[figure.artifactType]}
              </span>
              <span className="cbv2-story-figure__title">{figure.title}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

export default StoryFigureBand;
