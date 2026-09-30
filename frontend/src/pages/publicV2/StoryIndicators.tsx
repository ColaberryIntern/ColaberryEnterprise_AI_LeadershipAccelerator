import React from 'react';
import type { StoryIndicator } from './storyIndicatorModel';

/**
 * StoryIndicators - the record's countable facts, rendered so a page can be
 * scanned in three seconds instead of read in six minutes.
 *
 * A LIST, NOT A DASHBOARD. Each indicator is a count and the noun it counted,
 * and the markup is a `dl` because that is what a term-and-value pair is. No
 * icons: an icon beside "4 sections" is decoration that has to be learned, and
 * this rail exists to be understood without being learned. No colour coding
 * either - colour here would have to mean good or bad, and a count of
 * technologies is neither.
 *
 * THE RAIL IS NOT A SUMMARY OF QUALITY. It says how much of a record is here,
 * never how good the work was. The one quality judgement this page makes has its
 * own component, its own two axes and its own vocabulary
 * (`CaseStudyVerificationBadge`), and keeping the two apart is what stops a
 * long record from looking like a verified one.
 *
 * BOTH PIECES HIDE WHEN EMPTY. `storyIndicators` never emits a zero, so an empty
 * array is the honest answer for a thin record and the rail renders nothing at
 * all - no frame with dashes in it. `StorySectionCount` does the same for a
 * single heading. That is what lets one template carry a record with eight
 * sections and a record with one.
 */

export interface StoryIndicatorRailProps {
  /** Already filtered by `storyIndicators`: empty means render nothing. */
  indicators: readonly StoryIndicator[];
  /** Names the rail for assistive technology, since a list needs a name. */
  label?: string;
}

export function StoryIndicatorRail({
  indicators,
  label = 'What this record contains',
}: StoryIndicatorRailProps): React.ReactElement | null {
  if (indicators.length === 0) return null;

  return (
    <dl className="cbv2-story__indicators" aria-label={label} data-testid="story-indicators">
      {indicators.map((indicator) => (
        <div
          className="cbv2-story__indicator"
          key={indicator.key}
          data-indicator={indicator.key}
        >
          {/* The count is the `dd` and the noun is the `dt`, which reads
              backwards on screen and correctly to a screen reader: the term is
              "sections" and the value is "4". Source order follows the semantics
              and the stylesheet puts the number first, because reversing them in
              the markup to save a CSS rule would hand a reader the number with
              nothing to attach it to. */}
          <dt className="cbv2-story__indicator-label">{indicator.label}</dt>
          <dd className="cbv2-story__indicator-count">{indicator.count}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface StorySectionCountProps {
  /** `null` from `sectionCount` means this heading gets no chip. */
  count: number | null;
  /** Read aloud after the number, so the chip is not a bare digit in the tree. */
  noun: string;
}

/**
 * The count beside one section heading.
 *
 * The visible text is the digit alone, because the heading it sits beside
 * already says what is being counted to anyone who can see them together. A
 * screen reader gets the noun as well, since it meets the two as separate
 * strings and "Artifacts, 3" is a sentence while "Artifacts, three" alone is a
 * riddle.
 */
export function StorySectionCount({
  count,
  noun,
}: StorySectionCountProps): React.ReactElement | null {
  if (count === null || count < 1) return null;
  return (
    <span className="cbv2-story__count" data-testid="story-section-count">
      <span aria-hidden="true">{count}</span>
      <span className="cbv2-cs-sr-only">{`${count} ${noun}`}</span>
    </span>
  );
}

export default StoryIndicatorRail;
