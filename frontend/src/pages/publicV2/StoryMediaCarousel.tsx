import React, { useCallback, useRef } from 'react';
import { ARTIFACT_TYPE_LABELS } from '../../config/caseStudySurfaces';
import type { StorySlide } from './storyMediaModel';

/**
 * StoryMediaCarousel - the approved images, side by side, in the space of one.
 *
 * IT IS CSS, NOT A LIBRARY. The track is a flex row with
 * `scroll-snap-type: x mandatory` and the browser does the scrolling. A carousel
 * dependency would be a governance escalation in this repository, and it would
 * also be a worse carousel: native scroll-snap already gives touch momentum,
 * trackpad gestures, focus-follows-scroll and a scrollbar for free, and it
 * degrades to a plain horizontal scroller when JavaScript has not run.
 *
 * THE ARROWS ARE AN ENHANCEMENT, NOT THE INTERFACE. Every slide holds a real
 * anchor, so a keyboard reaches all of them by tabbing whether or not the arrows
 * are pressed - and the browser scrolls a focused anchor into view by itself.
 * That is deliberate: a carousel whose only keyboard path is two buttons hides
 * its content from anyone who tabs, and it is the most common way this component
 * is built wrong.
 *
 * NOTHING IS TRAPPED AND NOTHING IS HIDDEN. No slide gets `aria-hidden`, no
 * slide gets `tabindex="-1"`, focus is never moved programmatically and the
 * track is not a focus scope. Tab enters the track, walks the slides in DOM
 * order and leaves. An offscreen slide is offscreen, not removed - hiding it
 * would make the page's content depend on scroll position, which no assistive
 * technology should have to reason about.
 *
 * MOTION IS A PREFERENCE, ASKED AT PRESS TIME. `scroll-behavior: smooth` lives
 * in the stylesheet behind a `prefers-reduced-motion` query, and the arrow
 * handler asks `matchMedia` again before choosing its own behaviour, because a
 * programmatic `scrollBy` carries its own and ignores the stylesheet.
 *
 * THE ARROWS ARE `--secondary`, NOT `--ghost`. `cbv2-btn--ghost` is a
 * dark-background variant: it paints `--text-on-inverse` on a transparent
 * ground. This band sits on `cbv2-section`, which is light, so a ghost arrow
 * here would be near-white on near-white - the same 1.06:1 failure the /stories
 * masthead shipped and had to be fixed.
 */

export interface StoryMediaCarouselProps {
  /** Already floored by `carouselSlides`: an empty array means render nothing. */
  slides: readonly StorySlide[];
  /** Names the track for a screen reader, since a region needs a name. */
  label?: string;
}

/** How much of the viewport one press moves. Just under a full width leaves a hinge. */
const STEP_FRACTION = 0.9;

/**
 * Whether this reader asked for less motion.
 *
 * Guarded rather than called directly: jsdom ships no `matchMedia`, and an
 * unguarded call would turn every test that presses an arrow into a crash
 * unrelated to the behaviour under test. Absent the API, "no stated preference"
 * is the honest default.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function StoryMediaCarousel({
  slides,
  label = 'Approved images from this project',
}: StoryMediaCarouselProps): React.ReactElement | null {
  const trackRef = useRef<HTMLUListElement>(null);

  /**
   * One press, one viewport-ish step.
   *
   * `scrollBy` is feature-detected and falls back to assigning `scrollLeft`,
   * which is the property jsdom actually implements. That is not a test
   * accommodation: it is the same fallback an older browser needs, and it means
   * the control still moves the track when the smooth-scroll API is missing
   * rather than silently doing nothing.
   */
  const step = useCallback((direction: -1 | 1): void => {
    const track = trackRef.current;
    if (!track) return;
    const distance = Math.max(1, Math.round(track.clientWidth * STEP_FRACTION)) * direction;
    if (typeof track.scrollBy === 'function') {
      track.scrollBy({
        left: distance,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      return;
    }
    track.scrollLeft = Math.max(0, track.scrollLeft + distance);
  }, []);

  if (slides.length === 0) return null;

  return (
    <div className="cbv2-story-carousel" data-testid="story-carousel">
      <ul
        className="cbv2-story-carousel__track"
        ref={trackRef}
        aria-label={label}
        data-testid="story-carousel-track"
      >
        {slides.map((slide, index) => (
          <li
            className="cbv2-story-carousel__slide"
            key={`${slide.href}-${index}`}
            data-presentation={slide.presentation}
            data-artifact-kind={slide.artifactType}
          >
            <a
              className="cbv2-story-carousel__link"
              href={slide.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* Decorative, exactly as `CaseStudyArtifacts` treats a preview:
                  the contract carries an approved image and no alt text for it,
                  the title sits immediately beneath, and inventing a sentence
                  about a picture this code has never seen is the thing the whole
                  atmosphere/evidence rule exists to prevent. */}
              <img
                className="cbv2-story-carousel__image"
                src={slide.imageUrl}
                alt=""
                loading="lazy"
              />
              <span className="cbv2-story-carousel__caption">
                <span className="cbv2-story-carousel__kind">
                  {ARTIFACT_TYPE_LABELS[slide.artifactType]}
                </span>
                <span className="cbv2-story-carousel__title">{slide.title}</span>
              </span>
              <span className="cbv2-cs-sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>

      {/* After the track in DOM order, so tabbing reaches the pictures first and
          a reader who never presses an arrow still meets every slide. */}
      <div className="cbv2-story-carousel__controls">
        <button
          type="button"
          className="cbv2-btn cbv2-btn--secondary cbv2-btn--sm"
          onClick={() => step(-1)}
          data-testid="carousel-prev"
        >
          <span aria-hidden="true">&larr;</span>
          <span className="cbv2-cs-sr-only">Scroll to previous images</span>
        </button>
        <button
          type="button"
          className="cbv2-btn cbv2-btn--secondary cbv2-btn--sm"
          onClick={() => step(1)}
          data-testid="carousel-next"
        >
          <span aria-hidden="true">&rarr;</span>
          <span className="cbv2-cs-sr-only">Scroll to more images</span>
        </button>
      </div>
    </div>
  );
}

export default StoryMediaCarousel;
