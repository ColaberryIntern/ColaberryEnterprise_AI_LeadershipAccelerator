import React from 'react';
import { StoryWorkflowGraph } from './StoryWorkflowGraph';
import { StoryOutcomeCards } from './StoryOutcomeCards';
import { StoryCharts } from './StoryCharts';
import { chartsFor, outcomeCardsFor } from './storyVisualModel';
import type { PublicCaseStudyVisualStory } from './storyVisualModel';
/* The band's own sheet, imported by the component that draws its markup, as
   `StoryRelated` does: the public page and the admin preview both mount this
   band through `StoryDetailArticle`, and a side-effect import here follows the
   markup to both without either caller having to know. */
import './storyVisualV2.css';

/**
 * StoryVisualStory - the band a record earns when it carries a visual story.
 *
 * WHAT IT IS. The workflow illustration, then the outcome cards, then the
 * charts, directly under the context strip and above the first prose section,
 * so a reader who scans meets the shape of the system and its measured result
 * before the argument begins. Three pieces, each optional; the band renders
 * when the server sent at least one, and `visualStoryFor` already turned an
 * empty section into null.
 *
 * WHAT IT IS NOT. Not a section: it carries no `data-section`, has no key in
 * the closed section vocabulary and no place in `sectionOrder`, exactly like
 * `StoryContextStrip`. A record without a visual story renders the page it
 * rendered before this file existed, byte for byte.
 *
 * WHERE THE NUMBERS COME FROM. Every card is a projected metric and every
 * chart part was resolved by the server from a verified metric or a literal the
 * record cites evidence for. The band computes nothing; the note at its foot
 * says so in words, beside the graph's own "illustration, not telemetry".
 */

export interface StoryVisualStoryProps {
  story: PublicCaseStudyVisualStory;
}

export function StoryVisualStory({ story }: StoryVisualStoryProps): React.ReactElement | null {
  const cards = outcomeCardsFor(story);
  const charts = chartsFor(story);
  if (!story.workflow && cards.length === 0 && charts.length === 0) return null;
  // A record with no verified outcome still draws how its system works; the
  // band's words must not promise figures it does not show.
  const hasFigures = cards.length > 0 || charts.length > 0;
  return (
    <section
      className="cbv2-rv cbv2-section cbv2-story-visual"
      aria-labelledby="cbv2-story-visual-title"
      data-testid="story-visual"
      data-story-zone="visual"
    >
      <div className="cbv2-wrap cbv2-story-visual__body">
        <header className="cbv2-story-visual__head">
          <p className="cbv2-eyebrow">{hasFigures ? 'How it works, and what it measured' : 'How it works'}</p>
          <h2 id="cbv2-story-visual-title" className="cbv2-story-visual__heading">The system, drawn from its own record</h2>
        </header>
        {story.workflow ? <StoryWorkflowGraph workflow={story.workflow} motion={story.motion} /> : null}
        <StoryOutcomeCards cards={cards} />
        <StoryCharts charts={charts} />
        <p className="cbv2-story-visual__note">
          {hasFigures
            ? "Every figure above is a verified metric on this record, shown with its own verification badge. The drawing is the team's illustration of the flow, not a live view of it."
            : "The drawing is the team's illustration of the flow, drawn from the repository's own evidence, not a live view of it. This record carries no measured outcome yet, so it shows no figures."}
        </p>
      </div>
    </section>
  );
}

export default StoryVisualStory;
