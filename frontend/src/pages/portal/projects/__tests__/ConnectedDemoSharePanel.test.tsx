import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ConnectedDemoSharePanel from '../ConnectedDemoSharePanel';
import * as shareApi from '../connectedDemoShareApi';
import { ConnectedDemoShareRequestError, type ConnectedDemoShareState } from '../connectedDemoShareApi';

/**
 * The student's publish control.
 *
 * Three properties carry this file, and two of them are negative:
 *
 *  1. It renders NO link unless the demo is published. A link that 404s is worse than no link,
 *     and the published state is the only one the backend returns a url for.
 *  2. It cannot be asked to publish a demo that does not exist yet without a data model. The
 *     button stays disabled until a valid file is picked, so the 400 is prevented rather than
 *     handled.
 *  3. Unpublishing does not destroy the demo, which is what makes it reversible. Asserted through
 *     the request it sends and the state it then shows.
 *
 * This repo has no @testing-library; tests render through react-dom/client + act and read
 * `container.textContent` (see `components/admin/agentDetailV2/__tests__`).
 */
jest.mock('../connectedDemoShareApi', () => {
  const actual = jest.requireActual('../connectedDemoShareApi');
  return {
    ...actual,
    getConnectedDemoShare: jest.fn(),
    setConnectedDemoShare: jest.fn(),
  };
});

const PROJECT = '11111111-1111-4111-8111-111111111111';

const state = (over: Partial<ConnectedDemoShareState> = {}): ConnectedDemoShareState => ({
  project_id: PROJECT,
  enabled: false,
  url: null,
  has_spec: false,
  event_count: 0,
  ...over,
});

const PUBLISHED = state({ enabled: true, url: '/api/public/demo/tok-abc', has_spec: true, event_count: 5 });
const GENERATED = state({ enabled: false, url: null, has_spec: true, event_count: 5 });
const NOTHING = state();

let container: HTMLDivElement;
let root: Root;

const api = shareApi as jest.Mocked<typeof shareApi>;

async function render(hasStory = true): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<ConnectedDemoSharePanel projectId={PROJECT} hasConnectedDemoStory={hasStory} />);
  });
}

const links = (): HTMLAnchorElement[] => Array.from(container.querySelectorAll('a[href]'));
const buttonSaying = (text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').toLowerCase().includes(text.toLowerCase())) as HTMLButtonElement | undefined;

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  jest.clearAllMocks();
});

describe('whether it renders at all', () => {
  it('renders nothing for a build with no Connected Demo story, and asks the server nothing', async () => {
    // A control for a story the student does not have would be a promise the board cannot keep.
    await render(false);
    expect(container.textContent).toBe('');
    expect(api.getConnectedDemoShare).not.toHaveBeenCalled();
  });

  it('renders and reads the state for a build that has the story', async () => {
    api.getConnectedDemoShare.mockResolvedValue(NOTHING);
    await render(true);
    expect(api.getConnectedDemoShare).toHaveBeenCalledWith(PROJECT);
    expect(container.textContent).toContain('Your demo link');
  });
});

describe('published', () => {
  it('shows the link the server gave, opening safely', async () => {
    api.getConnectedDemoShare.mockResolvedValue(PUBLISHED);
    await render();
    expect(links()).toHaveLength(1);
    expect(links()[0].getAttribute('href')).toBe('/api/public/demo/tok-abc');
    expect(links()[0].getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('5 moments');
  });

  it('copies an ABSOLUTE link, because a relative one is useless to whoever it is pasted to', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.getConnectedDemoShare.mockResolvedValue(PUBLISHED);
    await render();
    await act(async () => { buttonSaying('copy link')!.click(); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/api/public/demo/tok-abc`);
    // Not the bare path: that is the mutation an independent verifier left in place unnoticed.
    expect(writeText).not.toHaveBeenCalledWith('/api/public/demo/tok-abc');
  });

  it('offers Unpublish, and says the demo survives it', async () => {
    api.getConnectedDemoShare.mockResolvedValue(PUBLISHED);
    await render();
    expect(buttonSaying('unpublish')).toBeDefined();
    expect(container.textContent).toContain('takes the link away');
  });

  it('unpublishing sends enabled:false with NO data model, and then shows no link', async () => {
    api.getConnectedDemoShare.mockResolvedValue(PUBLISHED);
    api.setConnectedDemoShare.mockResolvedValue(GENERATED);
    await render();
    await act(async () => { buttonSaying('unpublish')!.click(); });
    expect(api.setConnectedDemoShare).toHaveBeenCalledWith(PROJECT, false, undefined);
    // The state it lands in is "built, not published", so the link is gone and Publish is back.
    expect(links()).toHaveLength(0);
    expect(buttonSaying('publish my demo')).toBeDefined();
  });
});

describe('generated but not published', () => {
  it('shows NO link, and says the demo is private', async () => {
    api.getConnectedDemoShare.mockResolvedValue(GENERATED);
    await render();
    expect(links()).toHaveLength(0);
    expect(container.textContent).toContain('built and private');
  });

  it('publishes without asking for a data model again', async () => {
    // Sending it would regenerate a demo the student has already looked at, and a regenerated
    // demo is a different demo.
    api.getConnectedDemoShare.mockResolvedValue(GENERATED);
    api.setConnectedDemoShare.mockResolvedValue(PUBLISHED);
    await render();
    await act(async () => { buttonSaying('publish my demo')!.click(); });
    expect(api.setConnectedDemoShare).toHaveBeenCalledWith(PROJECT, true, undefined);
    expect(links()[0].getAttribute('href')).toBe('/api/public/demo/tok-abc');
  });

  it('offers no file picker, because there is nothing to generate', async () => {
    api.getConnectedDemoShare.mockResolvedValue(GENERATED);
    await render();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(0);
  });
});

describe('no demo yet', () => {
  it('asks for the data model and keeps the button disabled until one is picked', async () => {
    // The 400 prevented rather than handled: the request the server would refuse cannot be sent.
    api.getConnectedDemoShare.mockResolvedValue(NOTHING);
    await render();
    expect(container.textContent).toContain('command-center/data-model.json');
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
    const button = buttonSaying('build and publish')!;
    expect(button.disabled).toBe(true);
    expect(links()).toHaveLength(0);
  });

  it('enables the button and posts the PARSED file once a valid data model is picked', async () => {
    api.getConnectedDemoShare.mockResolvedValue(NOTHING);
    api.setConnectedDemoShare.mockResolvedValue(PUBLISHED);
    await render();

    const model = { app_name: 'Dispatch console', tables: [{ name: 'shift' }] };
    const file = new File([JSON.stringify(model)], 'data-model.json', { type: 'application/json' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      // FileReader is asynchronous; let its onload microtask land before asserting.
      await new Promise((r) => setTimeout(r, 0));
    });

    const button = buttonSaying('build and publish')!;
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });
    // Parsed, not raw text: the backend contract takes a document, not a string.
    expect(api.setConnectedDemoShare).toHaveBeenCalledWith(PROJECT, true, model);
    expect(links()[0].getAttribute('href')).toBe('/api/public/demo/tok-abc');
  });

  it('refuses a file too large to be a data model, before any upload is attempted', async () => {
    /*
     * The guard is a kindness, not a security control: the server would refuse it anyway. What
     * it buys is that nobody waits on a megabytes-long upload that was never going to be
     * accepted. Pinned because an independent verifier turned the condition into `if (false)`
     * and every test stayed green.
     */
    api.getConnectedDemoShare.mockResolvedValue(NOTHING);
    await render();
    const big = new File(['x'.repeat(10)], 'huge.json', { type: 'application/json' });
    Object.defineProperty(big, 'size', { value: 2_000_000 });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [big] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('too large to be a data model');
    expect(buttonSaying('build and publish')!.disabled).toBe(true);
    expect(api.setConnectedDemoShare).not.toHaveBeenCalled();
  });

  it('accepts a file just under the ceiling, so the guard is a bound and not a wall', async () => {
    // The other direction. A guard that refused everything would satisfy the case above.
    api.getConnectedDemoShare.mockResolvedValue(NOTHING);
    await render();
    const ok = new File([JSON.stringify({ app_name: 'x' })], 'data-model.json', { type: 'application/json' });
    Object.defineProperty(ok, 'size', { value: 999_999 });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [ok] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).not.toContain('too large');
    expect(buttonSaying('build and publish')!.disabled).toBe(false);
  });

  it('refuses a file that is not JSON, says so, and leaves the button disabled', async () => {
    api.getConnectedDemoShare.mockResolvedValue(NOTHING);
    await render();
    const file = new File(['not json at all'], 'notes.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('not valid JSON');
    expect(buttonSaying('build and publish')!.disabled).toBe(true);
    expect(api.setConnectedDemoShare).not.toHaveBeenCalled();
  });
});

describe('what it says when the server refuses', () => {
  it('shows the producer refusal as the student\'s problem to fix, not as our failure', async () => {
    api.getConnectedDemoShare.mockResolvedValue(GENERATED);
    api.setConnectedDemoShare.mockRejectedValue(
      new ConnectedDemoShareRequestError('refused_content', 'That data model could not be turned into a demo.'),
    );
    await render();
    await act(async () => { buttonSaying('publish my demo')!.click(); });
    expect(container.textContent).toContain('could not be turned into a demo');
    // And it did not pretend to publish: still no link.
    expect(links()).toHaveLength(0);
  });

  it('stays quiet about a 404, which is just a project with no demo row yet', async () => {
    api.getConnectedDemoShare.mockRejectedValue(
      new ConnectedDemoShareRequestError('not_found', 'This project could not be found.'),
    );
    await render();
    // No error text of ANY kind. Asserting only that one phrase is absent let a mutation that
    // reported every failure, 404 included, survive: it showed a different sentence.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain('could not be found');
    expect(container.textContent).not.toContain('Could not read your demo settings');
    // It still offers the way forward rather than a dead panel.
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(1);
  });

  it('says something when the read genuinely fails', async () => {
    api.getConnectedDemoShare.mockRejectedValue(
      new ConnectedDemoShareRequestError('unknown', 'boom'),
    );
    await render();
    expect(container.textContent).toContain('Could not read your demo settings');
  });
});
