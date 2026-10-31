import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The panel reaches the real chat endpoints only through the two injected props, but the
// module graph still pulls in the API layer. Stubbed at the transport so no axios instance
// is built, while MAX_CHAT_LENGTH stays the real number the server enforces.
jest.mock('../../../utils/portalApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

import SessionChatPanel from '../SessionChatPanel';
import { MAX_CHAT_LENGTH, type SessionChatResult } from '../../../services/onboardingApi';

/**
 * The class chat — the first reader this thread has ever had.
 *
 * WHAT THESE TESTS ARE REALLY ABOUT. A chat has three ways to betray the person using it, and
 * all three are silent: it loses what they typed, it blanks mid-class so it looks like the
 * class ended, or it drags them back to the bottom while they are reading up the thread. Each
 * has a test here. The permission behaviour is the fourth: a viewer outside the cohort gets a
 * 404 and the panel must vanish and STOP ASKING, rather than retrying a question whose answer
 * will never change.
 */

const LINE = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  sender_name: 'Dara',
  content: 'how do I run that?',
  created_at: '2026-10-31T15:00:00.000Z',
  ...over,
});

const OK = (messages = [LINE()], active = 0): SessionChatResult => ({
  outcome: 'ok', messages, active_count: active,
});

let container: HTMLDivElement;
let root: Root;
let loadThread: jest.Mock;
let sendMessage: jest.Mock;

async function render(first: SessionChatResult = OK()) {
  loadThread = jest.fn().mockResolvedValue(first);
  sendMessage = jest.fn().mockResolvedValue(undefined);

  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <SessionChatPanel sessionId="s1" loadThread={loadThread} sendMessage={sendMessage} />,
    );
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = () => container.textContent || '';

/** Let a chained promise land — sending re-reads the thread, which is a second microtask. */
const flush = async () => { await act(async () => undefined); };

async function click(id: string) {
  await act(async () => { find(id)!.click(); });
  await flush();
}

async function type(value: string) {
  const ta = find('session-chat-input') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function press(key: string, shift = false) {
  const ta = find('session-chat-input') as HTMLTextAreaElement;
  await act(async () => {
    // `cancelable` matters: the handler calls preventDefault on Enter.
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key, shiftKey: shift, bubbles: true, cancelable: true,
    }));
  });
}

describe('who gets a chat at all', () => {
  it('renders nothing for a viewer whose cohort does not own the session', async () => {
    await render({ outcome: 'forbidden' });

    expect(find('session-chat')).toBeNull();
  });

  it('STOPS asking once the answer is forbidden', async () => {
    // A permanent no polled every five seconds is a 404 every five seconds for the whole
    // class, from every signed-in viewer on the wrong session.
    jest.useFakeTimers();
    await render({ outcome: 'forbidden' });

    await act(async () => { jest.advanceTimersByTime(20_000); });

    expect(loadThread).toHaveBeenCalledTimes(1);
  });

  it('renders nothing before the first read succeeds', async () => {
    // Showing an empty chat box and then taking it away is worse than a beat of nothing.
    await render({ outcome: 'failed' });

    expect(find('session-chat')).toBeNull();
  });

  it('CONTROL: one successful read is enough to render', async () => {
    await render(OK());

    expect(find('session-chat')).not.toBeNull();
  });
});

describe('reading the thread', () => {
  it('shows each message with who sent it', async () => {
    await render(OK([
      LINE({ id: 'a', sender_name: 'Dara', content: 'first question' }),
      LINE({ id: 'b', sender_name: 'Sam', content: 'second question' }),
    ]));

    expect(text()).toContain('Dara');
    expect(text()).toContain('first question');
    expect(text()).toContain('Sam');
    expect(text()).toContain('second question');
  });

  it('says so plainly when nobody has asked anything', async () => {
    await render(OK([]));

    expect(find('session-chat-empty')).not.toBeNull();
  });

  it('shows who is talking when somebody is', async () => {
    await render(OK([LINE()], 3));

    expect(find('session-chat-active')!.textContent).toContain('3 talking');
  });

  it('CONTROL: shows nothing in a quiet room rather than "0 talking"', async () => {
    await render(OK([LINE()], 0));

    expect(find('session-chat-active')).toBeNull();
  });

  it('renders no clock for a timestamp it cannot parse', async () => {
    // The service passes an unparseable value through rather than blanking it; the client
    // must not render "Invalid Date" at somebody.
    await render(OK([LINE({ created_at: 'not a date' })]));

    expect(text()).not.toContain('Invalid');
  });

  it('keeps the thread on screen when a refresh fails, and says it is reconnecting', async () => {
    // A blank chat mid-class reads as "the class ended".
    jest.useFakeTimers();
    await render(OK([LINE({ content: 'still here' })]));

    loadThread.mockResolvedValue({ outcome: 'failed' } as SessionChatResult);
    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(text()).toContain('still here');
    expect(find('session-chat-stale')).not.toBeNull();
  });

  it('clears the reconnecting note once a read lands again', async () => {
    jest.useFakeTimers();
    await render(OK([LINE()]));

    loadThread.mockResolvedValue({ outcome: 'failed' } as SessionChatResult);
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(find('session-chat-stale')).not.toBeNull();

    loadThread.mockResolvedValue(OK([LINE()]));
    await act(async () => { jest.advanceTimersByTime(5000); });

    expect(find('session-chat-stale')).toBeNull();
  });
});

describe('asking a question', () => {
  it('sends the trimmed text and empties the box', async () => {
    await render(OK([]));
    await type('  how do I run that?  ');
    await click('session-chat-send');

    expect(sendMessage).toHaveBeenCalledWith('s1', 'how do I run that?');
    expect((find('session-chat-input') as HTMLTextAreaElement).value).toBe('');
  });

  it('re-reads the thread so the viewer sees their own message', async () => {
    await render(OK([]));
    const before = loadThread.mock.calls.length;

    await type('anything at all');
    await click('session-chat-send');

    expect(loadThread.mock.calls.length).toBeGreaterThan(before);
  });

  it('GIVES THE MESSAGE BACK when the send fails', async () => {
    // Silently eating what somebody typed during a class is the one unforgivable outcome.
    await render(OK([]));
    sendMessage.mockRejectedValue(new Error('offline'));

    await type('this took me a minute to write');
    await click('session-chat-send');

    expect((find('session-chat-input') as HTMLTextAreaElement).value)
      .toBe('this took me a minute to write');
    expect(find('session-chat-send-failed')).not.toBeNull();
  });

  it('POSTS ONCE when Send is double-clicked', async () => {
    // React batches, so two clicks in one tick both read `sending === false` out of the same
    // closure. Nothing downstream deduplicates a chat message, so without a synchronous gate
    // a double-click posts the question twice and the class sees it twice.
    await render(OK([]));
    await type('did that work for anyone else?');

    const button = find('session-chat-send')!;
    await act(async () => { button.click(); button.click(); });
    await flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('sends on Enter and does not on Shift+Enter', async () => {
    await render(OK([]));
    await type('a real question');

    await press('Enter', true);
    expect(sendMessage).not.toHaveBeenCalled();

    await press('Enter');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('will not send an empty box, or one holding only spaces', async () => {
    await render(OK([]));
    expect((find('session-chat-send') as HTMLButtonElement).disabled).toBe(true);

    await type('   ');
    expect((find('session-chat-send') as HTMLButtonElement).disabled).toBe(true);

    await press('Enter');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('refuses a message over the length the server would reject', async () => {
    // Better to stop it here than to let the server throw after they hit send.
    await render(OK([]));
    await type('x'.repeat(MAX_CHAT_LENGTH + 1));

    expect((find('session-chat-send') as HTMLButtonElement).disabled).toBe(true);
    expect(find('session-chat-count')!.className).toContain('is-over');
  });

  it('CONTROL: a message exactly at the limit still sends', async () => {
    await render(OK([]));
    await type('x'.repeat(MAX_CHAT_LENGTH));

    expect((find('session-chat-send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('counts down only once the limit is close', async () => {
    await render(OK([]));
    expect(find('session-chat-count')).toBeNull();

    await type('x'.repeat(MAX_CHAT_LENGTH - 10));
    expect(find('session-chat-count')!.textContent).toBe('10');
  });
});

describe('what it tells the viewer about who can see this', () => {
  it('says the class can see the message, under the box they type it in', async () => {
    // This thread used to be written into "Ask a question" with only an instructor reading
    // it. The moment classmates can read it, the composer has to say so.
    await render(OK([]));

    expect(text()).toContain('Everyone in this class sees your name and message.');
  });
});

describe('it looks like Colaberry', () => {
  it('uses semantic tokens rather than hardcoded colors, so dark mode holds', async () => {
    await render(OK());
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toContain('var(--surface-card)');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('gives the thread its own scroll rather than growing the page forever', async () => {
    await render(OK());
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toMatch(/\.schat-list\{[^}]*overflow-y:auto/);
  });
});
