import React from 'react';
import { StoryIndicatorRail } from './StoryIndicators';
import { StoryHeroMetrics } from './storyDetailV2Sections';
import type { StoryFact } from './storyDetailV2Model';
import type { StoryIndicator } from './storyIndicatorModel';
import type { PublicCaseStudyMetric } from '../../services/caseStudyPublicTypes';

/**
 * StoryContextStrip - the record's facts, counts and headline figures, on their
 * own ground directly beneath the masthead.
 *
 * WHY THIS EXISTS: THE HERO WAS THE HEAVIEST BAND ON THE PAGE. Measured on the
 * live record rather than estimated - 1142px at 1440px and 2201px at 390px, so a
 * reader met the first sentence of the story at 1211px and 2270px respectively.
 * That is two and a half phone screens of masthead before the argument starts.
 * `STORY_FORMAT_V1.md` section 2.3 names this the single most important
 * constraint on the format and says the productive move is the reverse of adding
 * to it: *"push the facts grid, the indicator rail or the metric block OUT of the
 * hero and into their own bands"*. This is that band.
 *
 * IT IS NOT A NEW SECTION, AND IT DELIBERATELY CARRIES NO `data-section`. The
 * page's section vocabulary is a closed union of ten keys and the suite reads the
 * rendered order straight off `[data-section]`; a strip that carried one would be
 * counted as an eleventh section by every test that walks that list, and would
 * need a key, a heading, a support predicate and a place in `sectionOrder`. This
 * is the `hero` band's second half, moved off the dark ground - a presentation
 * change, not a schema one.
 *
 * THE MOVE IS ALSO A CONTRAST FIX. On the masthead the facts strip needed two
 * scoped overrides to invert its text, and the hero's metric card - painted
 * `--surface-card` - sat inside that inverted region. That collision has shipped
 * here: `.cbv2-pagehero .cbv2-story__term` names a BACKGROUND rather than a
 * component, matched the light card as well as the dark strip, and rendered
 * Sample, Methodology and Limitations white on white at 1.00:1 on the live page.
 * On light ground none of that machinery is needed: term and value use the
 * stylesheet's ordinary colours and there is no inverted region for a light card
 * to be trapped inside.
 *
 * EVERY PIECE STILL HIDES ITSELF, AND SO DOES THE STRIP. The rail renders
 * nothing for a record with nothing countable, the facts list omits every absent
 * row rather than printing a placeholder somebody could mistake for a fact, and
 * `metrics` has already been filtered by `heroMetricsFor` so a figure with no
 * evidence context never reaches here. When all three are empty the band does not
 * render at all - no empty frame under the masthead.
 *
 * WHAT DID NOT CHANGE, AND MUST NOT. `heroMetricsFor` still drops a figure that
 * carries no baseline, sample, methodology or limitation. Moving the block to
 * lighter ground does not make it smaller or quieter, so the rule that stops a
 * bare number being printed at display size is exactly as load-bearing as it was
 * on the masthead. `storyDetailV2HeroInvariant.test.ts` is what keeps that
 * suppression safe, and nothing here touches it.
 */

export interface StoryContextStripProps {
  /** From `storyIndicators`. Empty renders no rail. */
  indicators: readonly StoryIndicator[];
  /** From `heroFacts`. Already consent-resolved and already sparse. */
  facts: readonly StoryFact[];
  /** From `heroMetricsFor`: every one carries evidence context. */
  metrics: readonly PublicCaseStudyMetric[];
}

export function StoryContextStrip({
  indicators,
  facts,
  metrics,
}: StoryContextStripProps): React.ReactElement | null {
  if (indicators.length === 0 && facts.length === 0 && metrics.length === 0) return null;

  return (
    <section
      className="cbv2-rv cbv2-section cbv2-story__context cbv2-story__section--sunken"
      aria-label="About this record"
      data-testid="story-context"
    >
      <div className="cbv2-wrap cbv2-story__context-body">
        {/* Counts, then facts, then figures: three densities in increasing
            order, so a reader scanning stops at whichever one answers them and
            never has to step back up. */}
        <StoryIndicatorRail indicators={indicators} />

        {facts.length > 0 ? (
          <dl className="cbv2-story__facts">
            {facts.map((fact) => (
              <div className="cbv2-story__fact" key={fact.term}>
                <dt className="cbv2-story__term">{fact.term}</dt>
                <dd className="cbv2-story__value">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <StoryHeroMetrics metrics={metrics} />
      </div>
    </section>
  );
}

export default StoryContextStrip;
