import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * The live link's landing page (L7.2).
 *
 * WHY THIS TEST EXISTS. This URL is promoted, printed and scanned before the class exists, so
 * the state it shows to someone who arrives EARLY is the whole point of the page. The backend
 * already has the moment resolution pinned; what is untested is whether the page renders each
 * moment honestly - and the failure mode is silent, because every state renders a perfectly
 * convincing card.
 *
 * The title lookup is deliberately best-effort. A transient edge failure on `checkin-info`
 * (one was observed on production the day this shipped) must not take the page down with it:
 * the moment is what matters and the class name is a courtesy.
 *
 * Mocks are created inside the factories and read back through the typed import, because babel
 * hoists `jest.mock` above const declarations.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ sessionId: 'sess-1' }) }));

import portalApi from '../../../utils/portalApi';
import LiveSessionPage from '../LiveSessionPage';

const mockGet = (portalApi as unknown as { get: jest.Mock }).get;

const INFO = {
  title: 'Week 12 - Build Day',
  session_date: '2026-10-15',
  start_time: '18:30:00',
  cohort_name: 'Cohort - July 2026',
};

/** Route the two endpoints the page calls; `moment` drives live-moment, `info` the title. */
function wire(moment: string, watchUrl: string | null = null, info: unknown = INFO) {
  mockGet.mockImplementation((url: string) => {
    if (url.includes('live-moment')) return Promise.resolve({ data: { moment, watch_url: watchUrl } });
    if (url.includes('checkin-info')) {
      return info === null ? Promise.reject(new Error('edge blip')) : Promise.resolve({ data: info });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
}

let container: HTMLDivElement;
let root: Root;

async function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<LiveSessionPage />);
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const text = () => container.textContent || '';
const titleOf = () => container.querySelector('[data-testid="live-session-title"]')?.textContent || '';

describe('what someone who clicks the link actually sees', () => {
  it('tells an early arrival the class has not started, and does not look like an error', async () => {
    wire('not_started');
    await render();

    expect(titleOf()).toContain('has not started yet');
    // The reassurance matters as much as the state: this link is clicked days early by design.
    expect(text()).toContain('It will update on its own');
    expect(text()).toContain('the link stays the same for this class');
    expect(container.querySelector('[data-testid="live-session-watch"]')).toBeNull();
  });

  it('offers somewhere to go only when there is something to watch', async () => {
    wire('live', 'https://enterprise.colaberry.ai/portal/live/sess-1');
    await render();

    const watch = container.querySelector('[data-testid="live-session-watch"]') as HTMLAnchorElement | null;
    expect(watch).not.toBeNull();
    expect(watch!.getAttribute('href')).toBe('https://enterprise.colaberry.ai/portal/live/sess-1');
    expect(titleOf()).toContain('is live now');
  });

  it('says ended without offering a dead button', async () => {
    wire('ended');
    await render();

    expect(titleOf()).toContain('has ended');
    expect(container.querySelector('[data-testid="live-session-watch"]')).toBeNull();
  });

  it('does not tell someone their link is broken when the check simply failed', async () => {
    // "Something went wrong" would be a lie about the LINK, and people stop trusting a link
    // they have been told is broken.
    mockGet.mockRejectedValue(new Error('network'));
    await render();

    expect(titleOf()).toContain('cannot check this class right now');
    expect(text()).not.toMatch(/went wrong|error|broken/i);
  });

  it('names the class when it can', async () => {
    wire('not_started');
    await render();

    expect(text()).toContain('Week 12 - Build Day');
    expect(text()).toContain('Cohort - July 2026');
    expect(text()).toContain('6:30 PM');
  });

  it('still renders the moment when the title lookup fails', async () => {
    // Observed on production: checkin-info returned a transient edge 520 while the origin was
    // answering 200. The page must not inherit that failure.
    wire('live', 'https://example.test/watch', null);
    await render();

    expect(titleOf()).toContain('is live now');
    expect(container.querySelector('[data-testid="live-session-watch"]')).not.toBeNull();
    expect(text()).not.toContain('Week 12');
  });
});

describe('it keeps checking', () => {
  it('polls, so a page left open updates itself when the class starts', async () => {
    jest.useFakeTimers();
    wire('not_started');
    await render();
    expect(titleOf()).toContain('has not started yet');

    wire('live', 'https://example.test/watch');
    await act(async () => { jest.advanceTimersByTime(30_000); });

    expect(titleOf()).toContain('is live now');
  });

  it('CONTROL: without the poll firing, the page would still say not started', async () => {
    // Without this, the test above could pass because of a re-render rather than the interval.
    jest.useFakeTimers();
    wire('not_started');
    await render();

    wire('live', 'https://example.test/watch');
    await act(async () => { jest.advanceTimersByTime(29_000); });

    expect(titleOf()).toContain('has not started yet');
  });
});

describe('it looks like Colaberry', () => {
  it('carries the brand lockup, because this URL appears in marketing', async () => {
    wire('not_started');
    await render();

    expect(container.querySelector('.clv-wordmark')).not.toBeNull();
    const logo = container.querySelector('.clv-brand img') as HTMLImageElement | null;
    expect(logo).not.toBeNull();
    expect(logo!.getAttribute('src')).toBe('/colaberry-icon.png');
  });

  it('uses semantic tokens rather than hardcoded colors, so dark mode holds', async () => {
    wire('not_started');
    await render();

    const css = container.querySelector('style')?.textContent || '';
    expect(css).toContain('var(--surface-card)');
    // A hex literal here is what silently breaks one of the two themes.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
