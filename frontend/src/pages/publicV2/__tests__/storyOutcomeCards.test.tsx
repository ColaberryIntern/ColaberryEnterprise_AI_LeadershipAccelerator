import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { StoryOutcomeCards } from '../StoryOutcomeCards';
import { outcomeCardsFor } from '../storyVisualModel';
import type { PublicCaseStudyMetric, PublicCaseStudyVisualStory } from '../../../services/caseStudyPublicTypes';

/**
 * The true figure is in the first render, the animated digits are hidden from
 * assistive tech until they settle, and only a whole number ever animates.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const metric = (label: string, valueDisplay: string, baseline: string | null = null): PublicCaseStudyMetric => ({
  label, valueDisplay, unit: null, verificationClass: 'verified', verificationMethod: 'internal',
  baseline, sample: null, methodology: null, limitations: [], shape: null, payload: null, plain: { counts: 'Counts recovered calls.', from: 'x', cannotShow: 'y' }, collection: null,
} as unknown as PublicCaseStudyMetric);

const story = (outcomeCards: PublicCaseStudyMetric[]): PublicCaseStudyVisualStory => ({
  schemaVersion: 1, presentationVersion: 'v2', motion: 'auto', workflow: null, outcomeCards, charts: [],
});

const cards = outcomeCardsFor(story([
  metric('Missing events resolved', '97%', '46% (245 of 533) during the incident'),
  metric('Time to recovery', '34.2 min'),
  metric('Duplicate replays', '0 of 339'),
  metric('Fourth', '5'),
]));

describe('StoryOutcomeCards', () => {
  it('renders the final wording in the static markup, three cards at most, the first as lead', () => {
    const out = renderToStaticMarkup(<StoryOutcomeCards cards={cards} />);
    const root = document.createElement('div');
    root.innerHTML = out;
    const articles = root.querySelectorAll('[data-testid="story-outcome-card"]');
    expect(articles).toHaveLength(3);
    expect(articles[0].classList.contains('cbv2-story-visual__card--lead')).toBe(true);
    expect(out).toContain('97%');
    expect(out).toContain('34.2 min');
    expect(out).toContain('0 of 339');
    expect(out).not.toContain('Fourth');
    expect(out).toContain('46% (245 of 533) during the incident');
    expect(out).toContain('Counts recovered calls.');
    expect(out).toContain('data-verification-class="verified"');
    expect(out).not.toMatch(/style="/);
  });

  it('animates only the whole-number card, with its true wording visible to assistive tech from the start', () => {
    (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn().mockReturnValue({ matches: false });
    // An observer that never fires, so the pre-settle state can be inspected;
    // without one the hook settles at mount (jsdom has no IntersectionObserver).
    const observe = jest.fn();
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe = observe;
      disconnect = jest.fn();
      unobserve = jest.fn();
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => { root.render(<StoryOutcomeCards cards={cards} />); });
    const animated = container.querySelectorAll('[data-animate="true"]');
    expect(animated).toHaveLength(1);
    const lead = animated[0];
    expect(lead.querySelector('.cbv2-sr-only')!.textContent).toBe('97%');
    const digits = lead.querySelector('[data-testid="story-card-digits"]')!;
    // Before the observer fires the digits are at zero and hidden from assistive tech.
    expect(digits.getAttribute('aria-hidden')).toBe('true');
    expect(digits.textContent).toBe('0%');
    const plain = container.querySelectorAll('[data-animate="false"]');
    expect(plain).toHaveLength(2);
    expect(plain[0].querySelector('[data-testid="story-card-digits"]')).toBeNull();
    expect(plain[0].querySelector('.cbv2-story-visual__card-figure')!.textContent).toBe('34.2 min');
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    document.body.removeChild(container);
    delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  it('renders nothing for no cards', () => {
    expect(renderToStaticMarkup(<StoryOutcomeCards cards={[]} />)).toBe('');
  });
});
