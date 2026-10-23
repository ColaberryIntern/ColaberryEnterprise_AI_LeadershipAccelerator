import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockPost = jest.fn();
const mockFetch = jest.fn();
let mockReadOnly = false;
jest.mock('../campusApi', () => ({
  postCampusHere: (...a: unknown[]) => mockPost(...a),
  fetchCampusPresence: (...a: unknown[]) => mockFetch(...a),
  isReadOnlySession: () => mockReadOnly,
}));

// eslint-disable-next-line import/first
import { useCampusPresencePoll, PRESENCE_POLL_MS, CampusPresenceState } from '../useCampusPresencePoll';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let seen: CampusPresenceState = { presence: null, presenceError: false };
function Probe({ active }: { active: boolean }): null { seen = useCampusPresencePoll(active); return null; }

let container: HTMLDivElement;
let root: Root;
let visibility: DocumentVisibilityState = 'visible';

async function mount(active: boolean): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<Probe active={active} />); });
  await flush();
}
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const setVisibility = async (v: DocumentVisibilityState) => {
  visibility = v;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await flush();
};

beforeAll(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility }); });
beforeEach(() => {
  jest.useFakeTimers();
  visibility = 'visible';
  mockReadOnly = false;
  mockPost.mockResolvedValue(undefined);
  mockFetch.mockResolvedValue({ library: { count: 2, people: [{ anonymous: true }] } });
  window.history.pushState({}, '', '/portal/library');
  seen = { presence: null, presenceError: false };
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

describe('useCampusPresencePoll', () => {
  it('inactive campus: makes no request at all', async () => {
    await mount(false);
    await act(async () => { jest.advanceTimersByTime(PRESENCE_POLL_MS * 3); });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(seen).toEqual({ presence: null, presenceError: false });
  });

  it('active: records the building for this page, then reads presence, every 30 s', async () => {
    await mount(true);
    expect(mockPost).toHaveBeenCalledWith('library', true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.invocationCallOrder[0]).toBeLessThan(mockFetch.mock.invocationCallOrder[0]);
    expect(seen.presence).toEqual({ library: { count: 2, people: [{ anonymous: true }] } });
    await act(async () => { jest.advanceTimersByTime(PRESENCE_POLL_MS); });
    await flush();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('pauses while the tab is hidden and catches up when it is visible again', async () => {
    await mount(true);
    await setVisibility('hidden');
    await act(async () => { jest.advanceTimersByTime(PRESENCE_POLL_MS * 2); });
    await flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await setVisibility('visible');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('a read-only "view as" session reads but never records', async () => {
    mockReadOnly = true;
    await mount(true);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('a page that belongs to no building records nothing but still reads', async () => {
    window.history.pushState({}, '', '/portal/settings');
    await mount(true);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('a failed read is the broken state (never an empty campus); a failed write does not block the read', async () => {
    mockPost.mockRejectedValue(new Error('500'));
    mockFetch.mockRejectedValue(new Error('500'));
    await mount(true);
    expect(seen).toEqual({ presence: null, presenceError: true });
    mockFetch.mockResolvedValue({});
    await act(async () => { jest.advanceTimersByTime(PRESENCE_POLL_MS); });
    await flush();
    expect(seen).toEqual({ presence: {}, presenceError: false });
  });

  it('turning the campus off stops polling and clears the data', async () => {
    await mount(true);
    await act(async () => { root.render(<Probe active={false} />); });
    await act(async () => { jest.advanceTimersByTime(PRESENCE_POLL_MS * 2); });
    await flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({ presence: null, presenceError: false });
  });
});
