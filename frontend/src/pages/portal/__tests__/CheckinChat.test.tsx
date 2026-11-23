import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CheckinChat from '../CheckinChat';
import type { LiveChatMessage } from '../../../services/guestCheckinApi';

// The class live chat (2026-11-23): docked on a wide screen, a button and panel on a phone.

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const M = (id: string, kind: 'guest' | 'assistant', name: string, content: string): LiveChatMessage => ({ id, kind, display_name: name, content, reply_to: null, created_at: 'now' });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const settle = async () => { await act(async () => { await Promise.resolve(); }); await act(async () => { await Promise.resolve(); }); };

async function mount(load: jest.Mock, send: jest.Mock, width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  await act(async () => { root.render(<CheckinChat load={load} send={send} />); });
  await settle();
}

async function typeAndSend(text: string) {
  const el = q('chat-input') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { q('chat-send')!.click(); });
  await settle();
}

describe('class live chat', () => {
  it('on a computer, is docked open and shows guest and assistant messages', async () => {
    const load = jest.fn().mockResolvedValue([M('1', 'guest', 'Ana R.', 'Where do I save it?'), M('2', 'assistant', 'Class assistant', '@Ana R. In a note.')]);
    await mount(load, jest.fn(), 1400);
    expect(q('chat-panel')).not.toBeNull();
    expect(q('chat-open')).toBeNull();
    expect(q('chat-guest')!.textContent).toContain('Where do I save it?');
    expect(q('chat-assistant')!.textContent).toContain('Class assistant');
  });

  it('on a phone, is a Chat button with an unread count that opens the panel', async () => {
    const load = jest.fn().mockResolvedValue([M('1', 'guest', 'Ana R.', 'hi'), M('2', 'guest', 'Ben K.', 'hello')]);
    await mount(load, jest.fn(), 390);
    expect(q('chat-panel')).toBeNull();
    expect(q('chat-open')!.textContent).toContain('2');
    await act(async () => { q('chat-open')!.click(); });
    expect(q('chat-panel')).not.toBeNull();
    await act(async () => { q('chat-close')!.click(); });
    expect(q('chat-panel')).toBeNull();
    expect(q('chat-open')!.textContent).toBe('Chat');
  });

  it('sends a message and shows it straight away', async () => {
    const send = jest.fn().mockResolvedValue(M('9', 'guest', 'Ana R.', 'my question'));
    await mount(jest.fn().mockResolvedValue([]), send, 1400);
    await typeAndSend('my question');
    expect(send).toHaveBeenCalledWith('my question');
    expect(q('chat-guest')!.textContent).toContain('my question');
    expect((q('chat-input') as HTMLInputElement).value).toBe('');
  });

  it("keeps the text and shows the server's reason when a send fails", async () => {
    const send = jest.fn().mockRejectedValue({ response: { data: { error: 'One moment, then send again.' } } });
    await mount(jest.fn().mockResolvedValue([]), send, 1400);
    await typeAndSend('too fast');
    expect(q('chat-error')!.textContent).toBe('One moment, then send again.');
    expect((q('chat-input') as HTMLInputElement).value).toBe('too fast');
  });
});
