import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ShowcaseGalleryPage, { type ShowcaseCard } from '../ShowcaseGalleryPage';
import portalApi from '../../../../utils/portalApi';

jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));
const api = portalApi as unknown as { get: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

const card = (over: Partial<ShowcaseCard> = {}): ShowcaseCard => ({
  id: 'a', title: 'Courier routing', summary: 'Routes couriers automatically.',
  authorName: 'Dana', audience: 'community', ...over,
});

async function mount() {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<ShowcaseGalleryPage />);
  });
}

const text = () => container.textContent || '';

describe('the gallery renders what the SERVER decided it may show', () => {
  /**
   * The page does no audience filtering, deliberately. A gallery that fetched
   * everything and hid the private ones in the browser would be one view-source away
   * from leaking them — and the search index would still contain them.
   */
  it('asks the server for the list and renders exactly that', async () => {
    api.get.mockResolvedValue({ data: { items: [card(), card({ id: 'b', title: 'Invoice triage' })] } });
    await mount();
    expect(api.get).toHaveBeenCalledWith('/api/portal/showcases');
    expect(container.querySelectorAll('[data-testid^="sc-card-"]')).toHaveLength(2);
  });

  it('never requests a private item or filters one client-side', async () => {
    // Whatever the server returns is what is shown; there is no audience logic here
    // to get wrong.
    api.get.mockResolvedValue({ data: { items: [card({ audience: 'cohort' })] } });
    await mount();
    expect(container.querySelectorAll('[data-testid^="sc-card-"]')).toHaveLength(1);
    expect(JSON.stringify(api.get.mock.calls)).not.toMatch(/private/i);
  });
});

/**
 * Seeing a half-finished thing is how people learn what building looks like. But a
 * visitor must never mistake it for finished, and the author must never feel their
 * unfinished work was passed off as done.
 */
describe('work in progress is labelled on the card', () => {
  it('says so in the card itself, not a tooltip', async () => {
    api.get.mockResolvedValue({ data: { items: [card({ workInProgress: true })] } });
    await mount();
    expect(container.querySelector('[data-testid="sc-wip-a"]')).not.toBeNull();
    expect(text()).toContain('Work in progress');
  });

  it('does not label a finished piece', async () => {
    api.get.mockResolvedValue({ data: { items: [card({ workInProgress: false })] } });
    await mount();
    expect(container.querySelector('[data-testid="sc-wip-a"]')).toBeNull();
  });

  it('can be filtered out without hiding anything else', async () => {
    api.get.mockResolvedValue({ data: { items: [card({ workInProgress: true }), card({ id: 'b', title: 'Done thing' })] } });
    await mount();
    expect(container.querySelectorAll('[data-testid^="sc-card-"]')).toHaveLength(2);
    const toggle = container.querySelector('[data-testid="sc-wip-toggle"]') as HTMLInputElement;
    // React tracks the value internally; assigning `.checked` directly is not seen.
    const setChecked = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')!.set!;
    act(() => {
      setChecked.call(toggle, false);
      toggle.dispatchEvent(new Event('click', { bubbles: true }));
    });
    expect(container.querySelectorAll('[data-testid^="sc-card-"]')).toHaveLength(1);
    expect(text()).toContain('Done thing');
  });
});

/**
 * A gallery that presents work built elsewhere identically to work we watched being
 * built is quietly lending it our credibility.
 */
describe('external work carries its badge where it is read', () => {
  it('shows the unverified badge on the card', async () => {
    api.get.mockResolvedValue({
      data: { items: [card({ external: { url: 'https://x.test', badge: 'Not verified by Colaberry', note: 'We have not reviewed it.' } })] },
    });
    await mount();
    expect(container.querySelector('[data-testid="sc-external-a"]')).not.toBeNull();
    expect(text()).toContain('Not verified by Colaberry');
    expect(text()).toContain('have not reviewed it');
  });

  it('shows no badge on work built in the programme', async () => {
    api.get.mockResolvedValue({ data: { items: [card({ external: null })] } });
    await mount();
    expect(container.querySelector('[data-testid="sc-external-a"]')).toBeNull();
  });
});

describe('search narrows without hiding the reason', () => {
  it('matches title, author and tags', async () => {
    api.get.mockResolvedValue({
      data: { items: [card({ id: 'a', title: 'Courier routing', authorName: 'Dana', tags: ['logistics'] }),
        card({ id: 'b', title: 'Invoice triage', authorName: 'Sam', tags: ['finance'] })] },
    });
    await mount();
    const input = container.querySelector('#sc-q') as HTMLInputElement;
    const set = (v: string) => act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    set('logistics');
    expect(container.querySelectorAll('[data-testid^="sc-card-"]')).toHaveLength(1);
    set('Sam');
    expect(text()).toContain('Invoice triage');
  });

  it('says a search matched nothing, differently from an empty gallery', async () => {
    api.get.mockResolvedValue({ data: { items: [card()] } });
    await mount();
    const input = container.querySelector('#sc-q') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'zzzz');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(text()).toContain('Nothing matches that search');
  });
});

describe('the four states say different things', () => {
  it('an empty gallery invites you to be the first', async () => {
    api.get.mockResolvedValue({ data: { items: [] } });
    await mount();
    expect(text()).toContain('Nothing has been shared with you yet');
  });

  // A failed fetch must never read as "the gallery is empty".
  it('a failed load says so and offers a retry', async () => {
    api.get.mockRejectedValue(new Error('network'));
    await mount();
    expect(container.querySelector('[data-testid="sc-error"]')).not.toBeNull();
    expect(text()).toContain('does not mean it is empty');
    expect(text()).not.toContain('Nothing has been shared');
  });

  it('the retry refetches and recovers', async () => {
    api.get.mockRejectedValueOnce(new Error('network'));
    await mount();
    api.get.mockResolvedValue({ data: { items: [card()] } });
    const retry = Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Try again'))!;
    await act(async () => { retry.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Courier routing');
  });
});
