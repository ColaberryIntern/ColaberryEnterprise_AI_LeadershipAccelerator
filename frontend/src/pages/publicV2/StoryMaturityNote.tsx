import React from 'react';
import type { StoryMaturity } from './storyMaturityModel';

/**
 * StoryMaturityNote - the slot a headline figure would take, when there is
 * none to take it.
 *
 * A shipped record with no measured result used to leave this slot empty and
 * let "Shipped" and "Verified" in the masthead stand in for an outcome; now
 * the slot says which of the two the record is. Same card as a metric, so it
 * reads as the same kind of fact at the same width, with the label carrying
 * the weight so "Capability demonstration" is what a scanning reader keeps.
 *
 * Never rendered beside a figure: `StoryContextStrip` mounts it only when its
 * metrics are empty, and `evidenceMaturity` is null whenever they are not.
 */
export function StoryMaturityNote({ maturity }: { maturity: StoryMaturity }): React.ReactElement {
  return (
    <p className="cbv2-story__maturity" data-testid="story-maturity">
      <strong className="cbv2-story__maturity-label">{maturity.label}</strong>
      <span className="cbv2-story__maturity-statement">{maturity.statement}</span>
    </p>
  );
}

export default StoryMaturityNote;
