/**
 * T16 - Maya is on every page of the V2 site, and mounting her did not reopen the pre-consent
 * exposure `PublicLayoutV2` deliberately closed.
 *
 * V2 has been the whole public site since 3 Sep 2026 and its own line-32 comment said it did not
 * mount the widget. So she was absent from /, /services, /platform, /proof, /how-it-works,
 * /accelerator, /demo, /contact and /lab, and present only on the dozen legacy-layout pages.
 *
 * The two halves this file pins are the two halves of the decision:
 *
 *   1. SHE IS THERE. The floating launcher renders inside this layout.
 *   2. SHE RECORDS NOTHING ABOUT A VISITOR WHO HAS NOT CONSENTED. Before consent,
 *      `cb_visitor_fp` does not exist - `initTracker()` is what writes it and this layout gates
 *      that - so the proactive poll returns at its first guard and opening the launcher starts no
 *      server conversation. The widget reads that key; it never mints one.
 *
 * The second half is the one worth having. It would be easy to "fix" by gating the launcher on
 * consent, which would hide the only surface on which a visitor can ask a question in the name of
 * a protection the widget does not need.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const apiCalls: Array<{ method: string; url: string }> = [];
jest.mock('../../../utils/api', () => ({
  __esModule: true,
  default: {
    get: (url: string) => { apiCalls.push({ method: 'get', url }); return Promise.resolve({ data: {} }); },
    post: (url: string) => {
      apiCalls.push({ method: 'post', url });
      return Promise.resolve({ data: { conversation_id: 'conv-1' } });
    },
  },
}));

const trackerCalls: string[] = [];
jest.mock('../../../utils/tracker', () => ({ initTracker: () => { trackerCalls.push('init'); } }));
jest.mock('../../../services/utmService', () => ({ captureUTMFromURL: () => undefined }));
jest.mock('../../../services/campaignAttributionService', () => ({ captureCampaignFromURL: () => undefined }));

// Prefixed `mock` because jest's module factory may not close over anything else.
let mockConsented = false;
jest.mock('../../../config/v2Consent', () => ({ trackingAllowed: () => mockConsented }));

// The chrome is not what this file is about, and the real header pulls in the whole nav.
jest.mock('../PublicHeaderV2', () => ({ __esModule: true, default: () => <header /> }));
jest.mock('../PublicFooterV2', () => ({ __esModule: true, default: () => <footer /> }));
jest.mock('../ConsentBanner', () => ({ __esModule: true, default: () => <div data-testid="consent" /> }));
jest.mock('../useReveal', () => ({ __esModule: true, default: () => undefined }));

// eslint-disable-next-line import/first
import PublicLayoutV2 from '../PublicLayoutV2';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no scrollIntoView; the widget scrolls to Maya's newest message.
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;

let container: HTMLDivElement;
let root: Root | undefined;

/** The widget is lazy, so the Suspense boundary needs flushing before the launcher exists. */
async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={['/services']}><PublicLayoutV2 /></MemoryRouter>);
  });
  for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); });
}

const launcher = () => container.querySelector('button[aria-label^="Chat with Maya"]');

beforeEach(() => {
  apiCalls.length = 0;
  trackerCalls.length = 0;
  mockConsented = false;
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container?.remove();
  jest.useRealTimers();
  window.localStorage.clear();
});

describe('T16 Maya is mounted in the V2 shell', () => {
  it('renders her launcher, after the widget\'s own 3 second delay', async () => {
    jest.useFakeTimers();
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    await render();
    // CONTROL on the delay: absent at first, which is also how we know the selector is real
    // rather than matching nothing in both states.
    expect(launcher()).toBeNull();
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(launcher()).not.toBeNull();
  });

  it('CONTROL - the layout itself rendered, so a null launcher would mean something', async () => {
    await render();
    expect(container.querySelector('#cbv2-main')).not.toBeNull();
    expect(container.querySelector('[data-testid="consent"]')).not.toBeNull();
  });
});

describe('T16 a visitor who has not consented is not recorded', () => {
  it('starts no tracker and mints no fingerprint on mount', async () => {
    await render();
    expect(trackerCalls).toEqual([]);
    expect(window.localStorage.getItem('cb_visitor_fp')).toBeNull();
  });

  it('polls nothing proactively, because there is no visitor id to poll with', async () => {
    jest.useFakeTimers();
    await render();
    await act(async () => { jest.advanceTimersByTime(30000); });
    expect(apiCalls.some((c) => c.url.includes('/api/chat/proactive-check'))).toBe(false);
  });

  it('CONTROL - WITH a fingerprint it does poll, so the assertion above is about consent', async () => {
    // The mirror of the test above. Without this pair, "no poll" could be passing because the
    // widget never polls at all in this harness.
    jest.useFakeTimers();
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    await render();
    await act(async () => { jest.advanceTimersByTime(3000); });
    await act(async () => { jest.advanceTimersByTime(5100); });
    expect(apiCalls.some((c) => c.url.includes('/api/chat/proactive-check'))).toBe(true);
  });

  it('opening the launcher starts no server conversation before consent', async () => {
    jest.useFakeTimers();
    await render();
    await act(async () => { jest.advanceTimersByTime(3000); });
    const button = launcher();
    expect(button).not.toBeNull();
    await act(async () => { (button as HTMLElement).click(); });
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
    // She introduces herself locally and says she is AI. Nothing is posted.
    expect(apiCalls.some((c) => c.method === 'post')).toBe(false);
    expect(container.textContent).toContain('Maya');
  });
});
