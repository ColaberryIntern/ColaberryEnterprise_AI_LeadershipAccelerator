/**
 * C61 (Ali, 2026-10-26: "talk to people that are in the room without sending me to Today"): the campus home mounts a DM host, so a
 * Message click opens the chat dock in place, and every campus control sees a host (hasDmHost) instead of falling back to Today.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockChats: { roomId: string; name: string }[] = [];
let mockError: string | null = null;
const mockOpenTarget = jest.fn();
type MockConvo = { roomId: string; peerId: string; peerName: string; peerAvatar: string | null; lastMessage: string; lastAt: string; unread: boolean };
let mockConvos: MockConvo[] | null = null;
const mockRefresh = jest.fn();
const mockMarkRead = jest.fn();
jest.mock('../CampusContext', () => ({ useCampus: () => ({ dmConversations: mockConvos, refreshDms: mockRefresh, staffDesks: [{ id: 'reese', enrollment_id: 'reese-1' }] }) }));
jest.mock('../../../services/dmApi', () => ({ markDmRead: (...a: unknown[]) => { mockMarkRead(...a); return Promise.resolve(); } }));
jest.mock('../../../pages/portal/today/useShellDms', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerDmHost } = require('../dmHost');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ReactLib = require('react');
  return {
    useShellDms: () => {
      ReactLib.useEffect(() => registerDmHost(), []);
      return { chats: mockChats, closeChat: jest.fn(), dmError: mockError, openChatTarget: mockOpenTarget };
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
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockChats = []; mockError = null; mockConvos = null; mockOpenTarget.mockReset(); mockRefresh.mockReset(); mockMarkRead.mockClear(); });
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

describe('C23 phase 3: chat heads, and an open chat is marked read', () => {
  const convo = (roomId: string, peerId: string, peerName: string, unread: boolean): MockConvo => ({ roomId, peerId, peerName, peerAvatar: null, lastMessage: 'hi', lastAt: '2026-10-29T10:00:00Z', unread });
  it('a head for each conversation with unread that is not open (max 4), a dot never a number, staff ringed; a press opens it', () => {
    mockConvos = [convo('r1', 'reese-1', 'Reese', true), convo('r2', 'p2', 'Pat Lee', true), convo('r3', 'p3', 'Sam', false),
      convo('r4', 'p4', 'Ana', true), convo('r5', 'p5', 'Bo', true), convo('r6', 'p6', 'Cy', true)];
    act(() => { root.render(<CampusDmDock />); });
    const heads = Array.from(container.querySelectorAll('[data-testid="cm-heads"] .cm-head'));
    expect(heads.map((h) => h.getAttribute('title'))).toEqual(['Reese', 'Pat Lee', 'Ana', 'Bo']);
    expect(heads[0].className).toContain('is-staff');
    expect(heads[1].textContent).toBe('PL');
    act(() => { (heads[1] as HTMLButtonElement).click(); });
    expect(mockOpenTarget).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'r2', name: 'Pat Lee' }));
  });
  it('no heads while a chat is open (the dock is bottom right); the open chat with unread is marked read and the list refreshed', async () => {
    mockChats = [{ roomId: 'r2', name: 'Pat Lee' }];
    mockConvos = [convo('r1', 'p1', 'Jo', true), convo('r2', 'p2', 'Pat Lee', true)];
    await act(async () => { root.render(<CampusDmDock />); });
    expect(container.querySelector('[data-testid="cm-heads"]')).toBeNull();
    expect(mockMarkRead).toHaveBeenCalledWith('r2');
    expect(mockMarkRead).not.toHaveBeenCalledWith('r1');
    await act(async () => { await Promise.resolve(); });
    expect(mockRefresh).toHaveBeenCalled();
  });
  it('nothing unread and nothing open renders nothing', () => {
    mockConvos = [convo('r1', 'p1', 'Jo', false)];
    act(() => { root.render(<CampusDmDock />); });
    expect(container.innerHTML).toBe('');
  });
});
