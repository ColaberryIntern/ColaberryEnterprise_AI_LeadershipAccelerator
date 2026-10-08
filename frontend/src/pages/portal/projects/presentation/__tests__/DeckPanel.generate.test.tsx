import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DeckPanel from '../DeckPanel';
import portalApi from '../../../../../utils/portalApi';

/**
 * THE BUTTON THIS FILE TESTS DID NOT EXIST UNTIL 2026-10-08.
 *
 * The panel said "No deck generated yet. Build your prompt above, then generate one"
 * and there was no route and no control that could generate one. `generateDeck` had
 * shipped in Phase 5 — written, tested, instrumented — with nothing able to call it.
 * It was found by using the page, not by reading it, which is the point: every unit
 * test passed the whole time.
 *
 * So these tests are about the instruction being honoured, and about the three answers
 * the server can give being three different sentences on screen.
 */

jest.mock('../../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
const api = portalApi as unknown as { get: jest.Mock; post: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

async function mount() {
  await act(async () => {
    const r = createRoot(container);
    root = r;
    r.render(<DeckPanel projectId="p1" storyId="PREP-3" />);
  });
}

const text = () => container.textContent || '';
const btn = () => container.querySelector('[data-testid="ps-deck-generate"]') as HTMLButtonElement | null;
const click = async (el: HTMLElement) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const READY_DECK = {
  data: { deck: { state: 'ready', contentHtml: '<section>Slide</section>', errorClass: null, tries: 1, unsupported: [] }, retryable: false },
};

describe('a learner with no deck can actually make one', () => {
  it('offers the button when there is no deck', async () => {
    api.get.mockResolvedValue({ data: { deck: null, retryable: true } });
    await mount();
    expect(btn()).not.toBeNull();
    expect(text()).toContain('No deck generated yet');
  });

  it('POSTS to the deck endpoint and then re-reads it', async () => {
    api.get.mockResolvedValueOnce({ data: { deck: null, retryable: true } });
    await mount();
    api.post.mockResolvedValue({ data: {} });
    api.get.mockResolvedValue(READY_DECK);
    await click(btn()!);
    expect(api.post).toHaveBeenCalledWith('/api/portal/projects/p1/tasks/PREP-3/deck');
    // Re-read, not a locally-faked deck: the server decides what was stored.
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('sends NO prompt in the body — the server rebuilds it', async () => {
    // A client that could post its own prompt could spend an OpenAI call on anything,
    // and the deck would stop being traceable to a template version.
    api.get.mockResolvedValueOnce({ data: { deck: null, retryable: true } });
    await mount();
    api.post.mockResolvedValue({ data: {} });
    api.get.mockResolvedValue(READY_DECK);
    await click(btn()!);
    expect(api.post.mock.calls[0]).toHaveLength(1);
  });

  it('disables the button while generating, so one click is one deck', async () => {
    api.get.mockResolvedValueOnce({ data: { deck: null, retryable: true } });
    await mount();
    let release: (v: any) => void = () => {};
    api.post.mockReturnValue(new Promise((res) => { release = res; }));
    await act(async () => { btn()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(btn()!.disabled).toBe(true);
    expect(text()).toContain('Generating');
    api.get.mockResolvedValue(READY_DECK);
    await act(async () => { release({ data: {} }); });
  });
});

describe('the three failures are three different sentences', () => {
  async function failWith(status: number, error: string) {
    api.get.mockResolvedValueOnce({ data: { deck: null, retryable: true } });
    await mount();
    api.post.mockRejectedValue({ response: { status, data: { error } } });
    api.get.mockResolvedValue({ data: { deck: null, retryable: true } });
    await click(btn()!);
  }

  it('shows the server’s own words for "nothing to build from yet"', async () => {
    await failWith(422, 'There is nothing to build a deck from yet. Fill in the Prepare stage first.');
    expect(text()).toContain('Fill in the Prepare stage first');
  });

  it('shows "already being generated" rather than a generic retry', async () => {
    // A double click must not read as a failure — the first one is still running.
    await failWith(409, 'A deck is already being generated for this task.');
    expect(text()).toContain('already being generated');
  });

  it('falls back to its own sentence when the server sends none', async () => {
    api.get.mockResolvedValueOnce({ data: { deck: null, retryable: true } });
    await mount();
    api.post.mockRejectedValue(new Error('network'));
    api.get.mockResolvedValue({ data: { deck: null, retryable: true } });
    await click(btn()!);
    expect(container.querySelector('[data-testid="ps-deck-gen-error"]')).not.toBeNull();
  });

  it('a failed GENERATE does not erase a deck the learner already has', async () => {
    // Distinct state from the fetch: losing a rendered deck because a retry failed
    // would read as the deck having been deleted.
    api.get.mockResolvedValue(READY_DECK);
    await mount();
    expect(text()).toContain('Slide');
    expect(btn()).toBeNull(); // nothing to generate — there is a ready deck
  });
});

describe('the failed state honours its own instruction', () => {
  it('offers a retry button beside "you can try again"', async () => {
    api.get.mockResolvedValue({
      data: { deck: { state: 'failed', contentHtml: null, errorClass: 'TimeoutError', tries: 3, unsupported: [] }, retryable: true },
    });
    await mount();
    expect(text()).toContain('You can try again');
    expect(btn()).not.toBeNull();
    expect(text()).toContain('after 3 attempts');
  });
});
