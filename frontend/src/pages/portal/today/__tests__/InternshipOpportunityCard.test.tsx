import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import InternshipOpportunityCard from '../InternshipOpportunityCard';
import type { InternshipStatus } from '../../../../services/internshipApi';

/**
 * The card's accessibility and attention contract.
 *
 * react-dom/client + act, not @testing-library/react — RTL is NOT a dependency of
 * this repo, and adding one to write a test would be a lockfile change for
 * convenience. Same convention as StatCard.test.tsx / OutreachJourneyFlow.test.tsx.
 *
 * The reduced-motion assertion is a stated required test ("Reduced-motion users
 * do not receive animation"), and it is the one that is easy to get wrong: a CSS
 * media query alone still leaves the JS timer running and the class being
 * applied, which is invisible in a browser but regresses silently the moment
 * someone adds a transform to the rule.
 */

// Partial mock: spread the real module so every export we do NOT override stays
// intact. Enumerating exports here would silently delete the rest of the module,
// and the failure would surface inside the component rather than here.
jest.mock('../../../../services/internshipApi', () => ({
  ...jest.requireActual('../../../../services/internshipApi'),
  recordInternshipCardImpression: jest.fn(),
  recordInternshipCardOpened: jest.fn(),
  startInternshipApplication: jest.fn().mockResolvedValue({ application_id: 'a1', state: 'started', created: true }),
  dismissInternshipCard: jest.fn().mockResolvedValue(undefined),
}));

import {
  dismissInternshipCard,
  recordInternshipCardImpression,
  recordInternshipCardOpened,
} from '../../../../services/internshipApi';

const baseStatus: InternshipStatus = {
  card_state: 'eligible',
  render: true,
  may_pulse: true,
  actionable: true,
  title: 'AI Internship',
  cta: 'Apply for the AI Internship',
  application: null,
};

// React 18 requires this flag before act() drives a concurrent root; without it
// every act() call logs a warning that buries the real output.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

function mount(status: Partial<InternshipStatus> = {}) {
  act(() => {
    root.render(
      <MemoryRouter>
        <InternshipOpportunityCard status={{ ...baseStatus, ...status }} />
      </MemoryRouter>,
    );
  });
}

/** Find a button by its visible text or aria-label. */
function button(match: RegExp): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => (
    match.test(b.textContent || '') || match.test(b.getAttribute('aria-label') || '')
  )) as HTMLButtonElement | undefined;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Let queued promise callbacks run. */
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  jest.clearAllMocks();
  setReducedMotion(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.useRealTimers();
});

describe('rendering', () => {
  it('renders nothing when the server says not to', () => {
    mount({ render: false });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for the none state', () => {
    mount({ card_state: 'none', title: '', cta: null });
    expect(container.innerHTML).toBe('');
  });

  it('exposes the card as a labelled region for screen readers', () => {
    mount();
    const region = container.querySelector('section[aria-labelledby]');
    expect(region).not.toBeNull();
    const labelId = region!.getAttribute('aria-labelledby')!;
    expect(container.querySelector(`#${labelId}`)!.textContent).toContain('AI Internship');
  });

  it('records an impression once it is shown', () => {
    mount();
    expect(recordInternshipCardImpression).toHaveBeenCalledWith('eligible');
  });

  it('shows a status line instead of a button when there is nothing to do', () => {
    mount({ card_state: 'under_review', cta: null, may_pulse: false, actionable: false, title: 'Application under review' });
    expect(button(/apply/i)).toBeUndefined();
    expect(container.textContent).toMatch(/reading your application/i);
  });

  it('announces waiting states politely rather than silently', () => {
    mount({ card_state: 'under_review', cta: null, may_pulse: false, title: 'Application under review' });
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('the pulse', () => {
  it('does not animate for a reduced-motion user, even after the interval', () => {
    setReducedMotion(true);
    jest.useFakeTimers();
    mount();

    act(() => { jest.advanceTimersByTime(10 * 60 * 1000); });

    expect(container.querySelector('.te-intern--pulse')).toBeNull();
  });

  it('pulses for everyone else, but only after a few minutes — never immediately', () => {
    jest.useFakeTimers();
    mount();

    // Nothing on first paint: an immediate pulse would read as a blink.
    expect(container.querySelector('.te-intern--pulse')).toBeNull();

    act(() => { jest.advanceTimersByTime(4 * 60 * 1000); });
    expect(container.querySelector('.te-intern--pulse')).not.toBeNull();
  });

  it('stops the burst on its own rather than blinking continuously', () => {
    jest.useFakeTimers();
    mount();

    act(() => { jest.advanceTimersByTime(4 * 60 * 1000); });
    expect(container.querySelector('.te-intern--pulse')).not.toBeNull();

    act(() => { jest.advanceTimersByTime(3000); });
    expect(container.querySelector('.te-intern--pulse')).toBeNull();
  });

  it('never pulses a card the server marked non-pulsing', () => {
    jest.useFakeTimers();
    mount({ card_state: 'under_review', may_pulse: false, cta: null });

    act(() => { jest.advanceTimersByTime(20 * 60 * 1000); });

    expect(container.querySelector('.te-intern--pulse')).toBeNull();
  });

  it('stops pulsing for the rest of the session once the student interacts', () => {
    jest.useFakeTimers();
    mount();

    click(button(/apply/i)!);
    act(() => { jest.advanceTimersByTime(30 * 60 * 1000); });

    expect(container.querySelector('.te-intern--pulse')).toBeNull();
  });
});

describe('interaction', () => {
  it('records the open event when the CTA is pressed', () => {
    mount();
    click(button(/apply/i)!);
    expect(recordInternshipCardOpened).toHaveBeenCalledWith('eligible');
  });

  it('offers "Not now" only on the recruiting card', () => {
    mount();
    expect(button(/not now/i)).toBeDefined();
  });

  it('does not offer "Not now" once the student has applied', () => {
    mount({ card_state: 'under_review', cta: null, may_pulse: false });
    expect(button(/not now/i)).toBeUndefined();
  });

  it('hides the card and tells the server when dismissed', async () => {
    mount();
    click(button(/not now/i)!);
    await flush();

    expect(dismissInternshipCard).toHaveBeenCalled();
    expect(container.querySelector('.te-intern')).toBeNull();
  });

  it('puts the card back if the server refuses the dismissal', async () => {
    (dismissInternshipCard as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    mount();

    click(button(/not now/i)!);
    await flush();

    // Optimistic hide, then restored — better than silently pretending it stuck.
    expect(container.querySelector('.te-intern')).not.toBeNull();
  });

  it('gives the dismiss control a label that makes sense out of context', () => {
    mount();
    const el = button(/not now/i)!;
    expect(el.getAttribute('aria-label')).toMatch(/hide the AI Internship card for two weeks/i);
  });
});
