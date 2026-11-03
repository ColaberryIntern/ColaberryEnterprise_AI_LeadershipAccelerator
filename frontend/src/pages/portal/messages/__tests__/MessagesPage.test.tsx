/**
 * The messages page — a direct message at its own URL.
 *
 * The property worth pinning hardest is that the thread renders IN THE PAGE and
 * not through the bottom-right dock. `TodayShell.css` ends with
 * `@media(max-width:820px){.te-dmdock{display:none}}`, so a version of this page
 * that opened the dock instead would work on a laptop and silently do nothing on
 * a phone — and the whole point of this page is to be the destination of an email
 * button, on whatever device the reader opened their mail on.
 *
 * PortalShell and ChatDock are stubbed: both reach the network on mount, and
 * neither one's internals are what this page is responsible for. What IS this
 * page's responsibility is resolving a room id to a peer, handling the ids that
 * do not resolve, and clearing the unread the notification set.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const mockFetchConversations = jest.fn();
const mockMarkDmRead = jest.fn();

jest.mock('../../today/PortalShell', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));
jest.mock('../../today/ChatDock', () => ({
  __esModule: true,
  default: ({ target }: { target: { roomId: string; name: string } }) => (
    <div data-testid="chat" data-room={target.roomId}>{target.name}</div>
  ),
}));
jest.mock('../../../../services/dmApi', () => ({
  fetchConversations: (...a: unknown[]) => mockFetchConversations(...a),
  markDmRead: (...a: unknown[]) => mockMarkDmRead(...a),
}));
jest.mock('../../../../services/cohortPresenceApi', () => ({
  colorFor: () => '#FB2832',
}));

import MessagesPage from '../MessagesPage';

// Same declaration campusShellSwap.test.tsx makes: without it React warns on every
// act() call that the environment is not configured for it, burying real output.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM = '6316fb8d-b362-4b02-b180-2cfb4a8ff800';

const conversation = (over: Record<string, unknown> = {}) => ({
  roomId: ROOM,
  peerId: 'enr-peer',
  peerName: 'Tashima Diah',
  peerAvatar: null,
  lastMessage: 'hello',
  lastAt: '2026-11-03T10:00:00Z',
  unread: true,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function mount(path = `/portal/messages/${ROOM}`): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/portal/messages/:roomId" element={<MessagesPage />} />
          <Route path="/portal/today" element={<div data-testid="today">today</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchConversations.mockResolvedValue([conversation()]);
  mockMarkDmRead.mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('MessagesPage', () => {
  it('opens the conversation named by the URL, with the peer resolved from the server', async () => {
    await mount();

    const chat = container.querySelector('[data-testid="chat"]');
    expect(chat).not.toBeNull();
    expect(chat?.getAttribute('data-room')).toBe(ROOM);
    expect(chat?.textContent).toBe('Tashima Diah');
  });

  it('renders the thread INLINE, never through the dock that phones hide', async () => {
    await mount();

    // `.te-dmdock` carries the max-width:820px display:none. The thread must not
    // be inside one, or this page does nothing on the device email is read on.
    expect(container.querySelector('.te-dmdock')).toBeNull();
    expect(container.querySelector('[data-testid="pm-thread"] [data-testid="chat"]')).not.toBeNull();
  });

  it('clears the unread the notification set — arriving here IS reading it', async () => {
    await mount();

    expect(mockMarkDmRead).toHaveBeenCalledWith(ROOM);
  });

  it('a room the viewer is not a member of is simply not in the list, and says so', async () => {
    // Membership is enforced server-side: the conversations endpoint is
    // participant-scoped, so a room that is not yours never comes back. This page
    // never has to decide who may read what.
    mockFetchConversations.mockResolvedValue([conversation({ roomId: 'someone-elses-room' })]);
    await mount();

    expect(container.querySelector('[data-testid="pm-missing"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat"]')).toBeNull();
  });

  it('does not mark anything read when the conversation did not resolve', async () => {
    mockFetchConversations.mockResolvedValue([]);
    await mount();

    expect(mockMarkDmRead).not.toHaveBeenCalled();
  });

  it('a failed load says so rather than sitting on a spinner forever', async () => {
    mockFetchConversations.mockRejectedValue(new Error('offline'));
    await mount();

    expect(container.querySelector('[data-testid="pm-failed"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat"]')).toBeNull();
  });

  it('a failed mark-read never costs the reader the thread', async () => {
    mockMarkDmRead.mockRejectedValue(new Error('nope'));
    await mount();

    expect(container.querySelector('[data-testid="chat"]')).not.toBeNull();
  });
});
