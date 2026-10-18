/**
 * C5 "new message" toast: baseline first, one toast per new message, never repeated, not for my own messages, Open via
 * te-open-dm, auto-hide, and no polling with the campus off or the tab hidden. Fake timers drive the poll (DM_TOAST_POLL_MS).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

type Convo = { roomId: string; peerId: string; peerName: string; peerAvatar: null; lastMessage: string; lastAt: string; unread: boolean };
let mockConvos: Convo[] = [];
let mockReads = 0;
let mockFail = false;
jest.mock('../campusPeopleApi', () => ({
  fetchConversationsQuiet: () => { mockReads += 1; return mockFail ? Promise.reject(new Error('down')) : Promise.resolve(mockConvos.map((c) => ({ ...c }))); },
  fetchStaffDesks: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }),
}));
jest.mock('../../../services/dmApi', () => ({ myEnrollmentId: () => 'me' }));
let mockActive = true;

// eslint-disable-next-line import/first
import { DmToastView } from '../CampusDmToast';
// eslint-disable-next-line import/first
import { DM_TOAST_POLL_MS, TOAST_MS, useCampusDmToasts } from '../useCampusDmToasts';
// eslint-disable-next-line import/first
import { registerDmHost } from '../dmHost';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The hook (CampusProvider runs it) + the view, as the app wires them. */
function Harness(): React.ReactElement | null {
  const { toast, dismiss } = useCampusDmToasts(mockActive);
  return <DmToastView toast={toast} onDismiss={dismiss} />;
}

const convo = (roomId: string, peer: string, lastAt: string, unread = true, peerId = 'p-' + roomId): Convo =>
  ({ roomId, peerId, peerName: peer, peerAvatar: null, lastMessage: 'hi', lastAt, unread });

let container: HTMLDivElement;
let root: Root | undefined;
let unhost: (() => void) | null = null;
async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter><Harness /></MemoryRouter>); });
  await flush();
}
const flush = async () => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); }); };
const tick = async () => { await act(async () => { jest.advanceTimersByTime(DM_TOAST_POLL_MS); }); await flush(); };
const toast = () => container.querySelector('[data-testid="cm-dm-toast"]');

beforeEach(() => {
  jest.useFakeTimers();
  mockConvos = []; mockReads = 0; mockFail = false; mockActive = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); unhost?.(); unhost = null; jest.useRealTimers(); });

describe('CampusDmToast', () => {
  it('unread messages already there at the first read raise no toast (baseline)', async () => {
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:00:00Z')];
    await mount();
    expect(mockReads).toBe(1);
    expect(toast()).toBeNull();
  });

  it('a new message after the baseline raises one toast with the sender, and never repeats', async () => {
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:00:00Z', false)];
    await mount();
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:05:00Z')];
    await tick();
    expect(toast()?.textContent).toContain('Mia sent you a message');
    await act(async () => { (toast()!.querySelector('[aria-label="Dismiss"]') as HTMLButtonElement).click(); });
    await tick();
    expect(toast()).toBeNull();
  });

  it('my own reply raises no toast (the real shape: peer is the other person, lastAt moves, unread is false)', async () => {
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:00:00Z', false)];
    await mount();
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:05:00Z', false)];
    await tick();
    expect(toast()).toBeNull();
  });

  it('defensive: a conversation whose peer is me never toasts', async () => {
    await mount();
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:05:00Z', true, 'me')];
    await tick();
    expect(toast()).toBeNull();
  });

  it('Open hands off through te-open-dm with the sender\'s id', async () => {
    unhost = registerDmHost();
    await mount();
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:05:00Z')];
    await tick();
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('te-open-dm', on);
    await act(async () => { (container.querySelector('[data-testid="cm-dm-toast-open"]') as HTMLButtonElement).click(); });
    window.removeEventListener('te-open-dm', on);
    expect(seen).toEqual([{ enrollmentId: 'p-r1', name: 'Mia' }]);
    expect(toast()).toBeNull();
  });

  it('hides itself after 8 seconds', async () => {
    await mount();
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:05:00Z')];
    await tick();
    expect(toast()).not.toBeNull();
    await act(async () => { jest.advanceTimersByTime(TOAST_MS); });
    expect(toast()).toBeNull();
  });

  it('a failed read is silent and the next read still works', async () => {
    await mount();
    mockFail = true;
    await tick();
    expect(toast()).toBeNull();
    mockFail = false;
    mockConvos = [convo('r1', 'Mia', '2026-10-18T10:05:00Z')];
    await tick();
    expect(toast()).not.toBeNull();
  });

  it('campus off: no request at all', async () => {
    mockActive = false;
    await mount();
    await tick(); await tick();
    expect(mockReads).toBe(0);
  });

  it('tab hidden: no request', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    await mount();
    await tick();
    expect(mockReads).toBe(0);
  });
});
