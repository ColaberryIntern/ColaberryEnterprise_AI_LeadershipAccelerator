import React from 'react';
import { CaseStudyVerificationBadge } from '../../components/caseStudy/CaseStudyVerificationBadge';
import useCountUp from '../../components/publicV2/useCountUp';
import type { OutcomeCardView } from './storyVisualModel';

/**
 * StoryOutcomeCards - up to three headline figures, counting up on scroll.
 *
 * THE FINAL WORDING IS IN THE FIRST RENDER. Each card carries the metric's
 * `valueDisplay` verbatim in a visually hidden span from the first paint, so
 * assistive tech, a crawler and a screenshot taken before the animation all
 * read the true figure. The animated digits are `aria-hidden` until they
 * settle, exactly as `Accolades` does with the same hook.
 *
 * ONLY A WHOLE NUMBER COUNTS UP. The model decided `animate` for each card:
 * "97%" may tick; "34.2 min" and "0 of 339" render as plain text, because a
 * count-up through 0.2, 1.2, ... would show a wrong figure on the way. The
 * two shapes are two components so the hook is never called conditionally.
 *
 * EVERY CARD SHOWS ITS BASELINE AND BADGE. A figure at display size with no
 * context is the thing the page's hero invariant forbids; these are the same
 * metrics the hero would have shown, with the same verification badge.
 */

function CountingFigure({ wording }: { wording: string }): React.ReactElement {
  const { ref, display, settled } = useCountUp(wording);
  return (
    <p className="cbv2-story-visual__card-figure" ref={ref as React.RefObject<HTMLParagraphElement>}>
      <span className="cbv2-sr-only">{wording}</span>
      <span aria-hidden={!settled} data-settled={settled} data-testid="story-card-digits">{display}</span>
    </p>
  );
}

function PlainFigure({ wording }: { wording: string }): React.ReactElement {
  return <p className="cbv2-story-visual__card-figure">{wording}</p>;
}

function OutcomeCard({ card, emphasis }: { card: OutcomeCardView; emphasis: boolean }): React.ReactElement {
  const m = card.metric;
  return (
    <article
      className={`cbv2-rv cbv2-story-visual__card${emphasis ? ' cbv2-story-visual__card--lead' : ''}`}
      data-testid="story-outcome-card"
      data-animate={card.animate}
    >
      {card.animate ? <CountingFigure wording={m.valueDisplay} /> : <PlainFigure wording={m.valueDisplay} />}
      <h3 className="cbv2-story-visual__card-label">{m.label}</h3>
      {m.baseline ? (
        <p className="cbv2-story-visual__card-baseline">
          <span className="cbv2-story-visual__card-term">Baseline</span>
          {m.baseline}
        </p>
      ) : null}
      {m.plain?.counts ? <p className="cbv2-story-visual__card-plain">{m.plain.counts}</p> : null}
      <CaseStudyVerificationBadge
        verificationClass={m.verificationClass}
        verificationMethod={m.verificationMethod}
        className="cbv2-story-visual__card-badge"
      />
    </article>
  );
}

export interface StoryOutcomeCardsProps {
  cards: readonly OutcomeCardView[];
}

export function StoryOutcomeCards({ cards }: StoryOutcomeCardsProps): React.ReactElement | null {
  if (cards.length === 0) return null;
  return (
    <div className="cbv2-story-visual__cards" data-testid="story-outcome-cards" data-count={cards.length}>
      {cards.map((card, i) => <OutcomeCard key={card.key} card={card} emphasis={i === 0} />)}
    </div>
  );
}

export default StoryOutcomeCards;
