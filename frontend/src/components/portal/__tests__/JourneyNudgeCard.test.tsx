/**
 * JourneyNudgeCard (Growth Journey OS, Phase 5 T514). Rendered into a real
 * jsdom container with react-dom/client (no testing-library in this repo's
 * dependencies), so the dismiss button can actually be clicked; the empty
 * state is asserted as `null` output, not an empty box.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import JourneyNudgeCard, { safeNudgeHref, type JourneyNudge } from '../JourneyNudgeCard';

const two: JourneyNudge[] = [
  { id: 'n-1', title: 'Answer three discovery questions', href: '/portal/discovery', purpose: 'discovery_questions' },
  { id: 'n-2', title: 'Book a 15-minute review', href: 'https://www.refactored.ai/book', purpose: 'scheduling_offer' },
];

// createRoot under act() needs this flag or React warns that the environment is not act-aware.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('acceptance 5: two nudges, dismiss, and nothing for none', () => {
  it('renders two nudges with their titles and hrefs as plain attributes, under the deploy marker', () => {
    const onDismiss = jest.fn();
    act(() => root.render(<JourneyNudgeCard nudges={two} onDismiss={onDismiss} />));
    const card = container.querySelector('[data-testid="gj-journey-nudge-card"]');
    expect(card).not.toBeNull();
    const items = container.querySelectorAll('[data-testid="gj-journey-nudge"]');
    expect(items).toHaveLength(2);
    const links = Array.from(container.querySelectorAll('a')).map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([['/portal/discovery', 'Answer three discovery questions'], ['https://www.refactored.ai/book', 'Book a 15-minute review']]);
  });

  it('fires onDismiss with the nudge id when its Dismiss button is clicked, and only that id', () => {
    const onDismiss = jest.fn();
    act(() => root.render(<JourneyNudgeCard nudges={two} onDismiss={onDismiss} />));
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1].getAttribute('aria-label')).toBe('Dismiss: Book a 15-minute review');
    act(() => { buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('n-2');
  });

  it('renders null for none: no card, no empty state, no marker', () => {
    expect(renderToStaticMarkup(<JourneyNudgeCard nudges={[]} onDismiss={() => undefined} />)).toBe('');
    act(() => root.render(<JourneyNudgeCard nudges={[]} onDismiss={() => undefined} />));
    expect(container.innerHTML).toBe('');
    expect(container.querySelector('[data-testid="gj-journey-nudge-card"]')).toBeNull();
  });
});

describe('the href rule, the browser\'s own copy', () => {
  it('links a portal path or an https URL, and shows the title without a link for anything else', () => {
    expect(safeNudgeHref('/portal/next')).toBe('/portal/next');
    expect(safeNudgeHref('https://www.refactored.ai/x')).toBe('https://www.refactored.ai/x');
    for (const bad of ['//evil.example', '/\\evil', 'http://plain.example', 'javascript:alert(1)', 'data:text/html,x', 'mailto:a@b.c', '', null]) {
      expect(safeNudgeHref(bad)).toBeNull();
    }
    const html = renderToStaticMarkup(<JourneyNudgeCard nudges={[{ id: 'n-3', title: 'Plain', href: 'javascript:alert(1)', purpose: null }]} onDismiss={() => undefined} />);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Plain');
  });
});
