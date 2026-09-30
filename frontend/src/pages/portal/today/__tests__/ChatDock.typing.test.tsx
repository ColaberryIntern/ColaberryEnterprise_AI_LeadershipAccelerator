/**
 * Real incident, 2026-09-17: Ali live-tested a DM with Dara, asked a real
 * question, and got no reply with zero on-screen signal that anything was
 * happening — indistinguishable from broken. The backend fix (a bounded
 * retry + an honest fallback message when the agent's reply pipeline fails)
 * lives in daraReplyService.ts; this covers the frontend half — a real,
 * visible "typing" indicator for exactly as long as the send request (which,
 * for an AI-agent DM, IS the agent's reply-generation window — see
 * ChatDock.tsx's own header comment) is actually in flight.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { DmMessage } from '../../../../services/dmApi';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom doesn't implement scrollIntoView — ChatDock calls it on every
// message-list update (autoscroll), unrelated to what this file tests.
(window.HTMLElement.prototype as any).scrollIntoView = () => {};

let mockSendResolvers: Array<{ resolve: (m: DmMessage) => void; reject: (e: Error) => void }> = [];
const mockSendCalls: Array<{ roomId: string; text: string }> = [];

// CRA sets `resetMocks: true` — plain functions closing over module-level
// state are this repo's own established pattern (see ArchiveProjectDialog.test.tsx),
// not jest.fn() factories that would reset to undefined stubs each test.
jest.mock('../../../../services/dmApi', () => ({
  __esModule: true,
  fetchDmMessages: async () => [],
  myEnrollmentId: () => 'me-enrollment-1',
  sendDmMessage: (roomId: string, text: string) =>
    new Promise((resolve, reject) => {
      mockSendCalls.push({ roomId, text });
      mockSendResolvers.push({ resolve, reject });
    }),
}));

import ChatDock, { type DmTarget } from '../ChatDock';

const TARGET: DmTarget = { roomId: 'room-1', name: 'Dara', color: '#c0392b' };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  mockSendResolvers = [];
  mockSendCalls.length = 0;
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(<ChatDock target={TARGET} onClose={() => {}} />);
  });
  // Let the initial poll() promise (mocked fetchDmMessages) settle.
  await act(async () => { await Promise.resolve(); });
}

// The composer also renders AttachButton's own hidden file <input> — target
// the real text field by its aria-label, not just "input" (which would match
// the file input first, since it comes earlier in the DOM).
const input = () => container.querySelector(`.te-dm-composer input[aria-label="Message ${TARGET.name}"]`) as HTMLInputElement;
const sendBtn = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Send') as HTMLButtonElement;
const typingIndicator = () => container.querySelector('.te-dm-typing');

async function typeAndSend(text: string) {
  await act(async () => {
    const el = input();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    sendBtn().click();
  });
}

describe('ChatDock — typing indicator while a send is in flight', () => {
  it('happy path: shows "<name> is typing" the moment Send is clicked, and it disappears once the reply-window request resolves', async () => {
    await mount();
    await typeAndSend('What curriculum items would help with MCP Server skills?');

    expect(mockSendCalls).toEqual([{ roomId: 'room-1', text: 'What curriculum items would help with MCP Server skills?' }]);
    expect(typingIndicator()?.textContent).toContain('Dara is typing');

    await act(async () => {
      mockSendResolvers[0].resolve({
        id: 'msg-1', room_id: 'room-1', enrollment_id: 'me-enrollment-1', sender_name: 'Me',
        content: 'What curriculum items would help with MCP Server skills?', kind: 'text', created_at: new Date().toISOString(),
      });
      await Promise.resolve();
    });

    expect(typingIndicator()).toBeNull();
  });

  it('the composer is disabled while a send is in flight — no double-send possible', async () => {
    await mount();
    await typeAndSend('Hello');

    expect(input().disabled).toBe(true);
    expect(sendBtn().disabled).toBe(true);

    await act(async () => {
      mockSendResolvers[0].resolve({
        id: 'msg-1', room_id: 'room-1', enrollment_id: 'me-enrollment-1', sender_name: 'Me',
        content: 'Hello', kind: 'text', created_at: new Date().toISOString(),
      });
      await Promise.resolve();
    });

    expect(input().disabled).toBe(false);
  });

  it('boundary: the typing indicator clears even when the send itself fails (never stuck showing "typing" forever)', async () => {
    await mount();
    await typeAndSend('Hello');

    expect(typingIndicator()).not.toBeNull();

    await act(async () => {
      mockSendResolvers[0].reject(new Error('network down'));
      await Promise.resolve();
    });

    expect(typingIndicator()).toBeNull();
    expect(input().disabled).toBe(false);
    // Failure restores the draft so nothing typed is lost — the existing,
    // pre-existing contract this test also protects from regressing.
    expect(input().value).toBe('Hello');
  });

  it('no indicator at all before a send is triggered', async () => {
    await mount();
    expect(typingIndicator()).toBeNull();
  });
});
