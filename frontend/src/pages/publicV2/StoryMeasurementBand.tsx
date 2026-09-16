import React from 'react';
import CaseStudyMeasurement from '../../components/caseStudy/CaseStudyMeasurement';
import type { PublicCaseStudyMeasurement, PublicCaseStudyVisualStory } from '../../services/caseStudyPublicTypes';

/**
 * StoryMeasurementBand - "The measurement", with its cards folded when the
 * visual story band above already shows the figures.
 *
 * WHY. With the band live on the first pilot, the page printed the same
 * numbers twice within two screens: 97%, 96%, 334 of 347 as outcome cards and
 * charts under the hero, then again as nine metric cards here with their own
 * bars. Two visible sets of one figure read as a rendering fault. The prose of
 * this section stays, because it is the argument; the cards fold under a
 * disclosure, because the full notes on each metric (what it counts, where it
 * came from, what it does not tell you, its limitations) are still owed to the
 * reader who wants them, and the format's rule that they render in full is
 * kept: they are in the document, one click away, not removed.
 *
 * A record without a visual story is untouched: the cards print as before.
 */
export interface StoryMeasurementBandProps {
  measurement: PublicCaseStudyMeasurement | null;
  visualStory: PublicCaseStudyVisualStory | null;
}

export function StoryMeasurementBand({ measurement, visualStory }: StoryMeasurementBandProps): React.ReactElement | null {
  if (!measurement) return null;
  const folded = Boolean(visualStory && (visualStory.outcomeCards.length > 0 || visualStory.charts.length > 0));
  if (!folded) return <CaseStudyMeasurement measurement={measurement} />;
  const count = measurement.metrics.length;
  return (
    <>
      {/* The prose, drawn here rather than through the component with an empty
          metric list, which would leave the grid's spacing beneath it. */}
      {measurement.narrative.length > 0 ? (
        <div className="cbv2-cs-arch__prose">
          {measurement.narrative.map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {count > 0 ? (
        <details className="cbv2-story__proof" data-testid="story-measurement-notes">
          <summary className="cbv2-story__proof-summary">
            {`Full notes on all ${count} ${count === 1 ? 'metric' : 'metrics'}`}
          </summary>
          <div className="cbv2-story__proof-body">
            <CaseStudyMeasurement measurement={{ ...measurement, narrative: [] }} />
          </div>
        </details>
      ) : null}
    </>
  );
}

export default StoryMeasurementBand;
