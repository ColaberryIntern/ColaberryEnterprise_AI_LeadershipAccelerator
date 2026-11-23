import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CheckinLiveController, { LiveClient } from '../CheckinLiveController';
import type { CompanionState } from '../../../services/onboardingApi';

// "Run it here" (2026-11-23): the slide's prompt runs on the class page and the answer shows
// under it, so a phone never has to leave the page.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROMPT = 'Make me a small practice table.';
const STATE: CompanionState = {
  phase: 'prompt', title: 'Class', question: null, my_pulse: null,
  prompt: { label: 'Hands-on 2', prompt: PROMPT },
};

function client(run?: jest.Mock): LiveClient {
  return {
    getState: jest.fn().mockResolvedValue(STATE),
    pulse: jest.fn().mockResolvedValue(undefined),
    ask: jest.fn().mockResolvedValue(undefined),
    vote: jest.fn().mockResolvedValue(undefined),
    ...(run ? { run } : {}),
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const settle = async () => { await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };

async function mount(c: LiveClient, width = 390) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  await act(async () => {
    root.render(<CheckinLiveController title="Class" meta="m" eyebrow="in" signedOut={{ body: 'x', action: 'y', onAction: () => undefined }} client={c} />);
  });
  await settle();
}

async function type(id: string, value: string) {
  const el = q(id) as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Run it here', () => {
  it('runs the prompt on the page and shows the answer, then sends a reply with the whole conversation', async () => {
    const run = jest.fn().mockResolvedValueOnce('Question 1: what is the task?').mockResolvedValueOnce('Question 2: when does it happen?');
    await mount(client(run));

    await act(async () => { q('run-start')!.click(); });
    await settle();
    expect(run).toHaveBeenCalledWith([{ role: 'user', content: PROMPT }]);
    expect(q('run-answer')!.textContent).toContain('Question 1');

    await type('run-reply-input', 'I check the orders file');
    await act(async () => { q('run-reply-send')!.click(); });
    await settle();
    expect(run).toHaveBeenLastCalledWith([
      { role: 'user', content: PROMPT },
      { role: 'assistant', content: 'Question 1: what is the task?' },
      { role: 'user', content: 'I check the orders file' },
    ]);
    expect(host.textContent).toContain('Question 2');
  });

  it("shows the server's message when a run fails, and lets them run again", async () => {
    const run = jest.fn().mockRejectedValueOnce({ response: { data: { error: 'Press Run again.' } } }).mockResolvedValueOnce('ok');
    await mount(client(run));
    await act(async () => { q('run-start')!.click(); });
    await settle();
    expect(q('run-error')!.textContent).toBe('Press Run again.');
    expect(q('run-start')).not.toBeNull();
    await act(async () => { q('run-start')!.click(); });
    await settle();
    expect(q('run-answer')!.querySelector('.cbrun-text')!.textContent).toBe('ok');
  });

  it('on a phone, does not offer Open in Claude (it would leave the class page)', async () => {
    await mount(client(jest.fn()), 390);
    expect(q('run-start')).not.toBeNull();
    expect(q('open-in-claude')).toBeNull();
  });

  it('on a computer, keeps Open in Claude beside Run it here', async () => {
    await mount(client(jest.fn()), 1400);
    expect(q('run-start')).not.toBeNull();
    expect(q('open-in-claude')).not.toBeNull();
  });

  it('without a run client (signed-in path), shows the copy buttons only', async () => {
    await mount(client(), 390);
    expect(q('run-start')).toBeNull();
    expect(q('open-in-claude')).not.toBeNull();
  });
});
