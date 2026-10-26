/**
 * C61 (Ali, 2026-10-26: "talk to people that are in the room without sending me to Today"): the campus home mounts a DM host, so a
 * Message click opens the chat dock in place, and every campus control sees a host (hasDmHost) instead of falling back to Today.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockChats: { roomId: string; name: string }[] = [];
let mockError: string | null = null;
jest.mock('../../../pages/portal/today/useShellDms', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerDmHost } = require('../dmHost');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactLib = require('react');
  return {
    useShellDms: () => {
      ReactLib.useEffect(() => registerDmHost(), []);
      return { chats: mockChats, closeChat: jest.fn(), dmError: mockError };
    },
  };
});
jest.mock('../../../pages/portal/today/ChatDock', () => ({ __esModule: true, default: ({ target }: { target: { name: string } }) => <div data-testid="chat-dock">{target.name}</div> }));
// eslint-disable-next-line import/first
import CampusDmDock from '../CampusDmDock';
// eslint-disable-next-line import/first
import { hasDmHost } from '../dmHost';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockChats = []; mockError = null; });
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('mounting it makes the campus a DM host (no "Message from Today" fallback)', () => {
  expect(hasDmHost()).toBe(false);
  act(() => { root.render(<CampusDmDock />); });
  expect(hasDmHost()).toBe(true);
  act(() => root.unmount());
  root = createRoot(container);
  expect(hasDmHost()).toBe(false);
});

it('an open chat renders in a dock on the campus, inside the Today shell scope', () => {
  mockChats = [{ roomId: 'r1', name: 'Pat Lee' }];
  act(() => { root.render(<CampusDmDock />); });
  expect(container.querySelector('[data-testid="cm-dm-host"]')!.className).toContain('te-shell');
  expect(container.querySelector('.te-dmdock [data-testid="chat-dock"]')!.textContent).toBe('Pat Lee');
});

it('a failed open shows the error; nothing open renders nothing', () => {
  act(() => { root.render(<CampusDmDock />); });
  expect(container.innerHTML).toBe('');
  mockError = 'Could not open the chat.';
  act(() => { root.render(<CampusDmDock />); });
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Could not open the chat.');
});
