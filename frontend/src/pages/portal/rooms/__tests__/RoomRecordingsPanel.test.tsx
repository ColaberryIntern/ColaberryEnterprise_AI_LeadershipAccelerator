import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import RoomRecordingsPanel from '../RoomRecordingsPanel';

jest.mock('../../../../services/roomsApi', () => ({
  fetchRoomResources: jest.fn(),
  downloadRoomResource: jest.fn(),
}));
jest.mock('../../today/shellUtils', () => ({ fmtCentralDateTime: () => 'Nov 20, 7:00 PM CST' }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../services/roomsApi') as { fetchRoomResources: jest.Mock };

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  api.fetchRoomResources.mockReset();
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

function mount() {
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<RoomRecordingsPanel roomId="room-1" />);
  });
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

/**
 * "We could not load your recordings" and "your class was not recorded" are
 * opposite messages. One says try again; the other says stop looking. This panel
 * used to render the second whenever the first was true.
 */
describe('a failed request is not an empty list', () => {
  it('shows an ERROR with a retry when the fetch fails', async () => {
    api.fetchRoomResources.mockRejectedValue(new Error('network'));
    mount();
    await flush();

    expect(q('rec-error')).not.toBeNull();
    expect(q('rec-retry')).not.toBeNull();
    // And crucially NOT the message that says the class was never recorded.
    expect(q('rec-empty')).toBeNull();
    expect(container.textContent).not.toContain('No recordings yet');
  });

  it('says plainly that an error does not mean the class went unrecorded', async () => {
    api.fetchRoomResources.mockRejectedValue(new Error('network'));
    mount();
    await flush();
    expect(q('rec-error')?.textContent).toMatch(/does not mean the class was not recorded/i);
  });

  it('retrying actually re-requests, and recovers', async () => {
    api.fetchRoomResources.mockRejectedValueOnce(new Error('network'));
    mount();
    await flush();
    expect(q('rec-error')).not.toBeNull();

    api.fetchRoomResources.mockResolvedValueOnce([
      { id: 'r1', title: 'Week 1 · Part 1 of 2', storage_key: 'k', url: null, size_bytes: 1048576, created_at: '2026-11-20T19:00:00Z' },
    ]);
    await act(async () => { (q('rec-retry') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();

    expect(api.fetchRoomResources).toHaveBeenCalledTimes(2);
    expect(q('rec-error')).toBeNull();
    expect(container.textContent).toContain('Week 1 · Part 1 of 2');
  });

  it('shows the empty state ONLY when the server really returned nothing', async () => {
    api.fetchRoomResources.mockResolvedValue([]);
    mount();
    await flush();

    expect(q('rec-empty')).not.toBeNull();
    expect(q('rec-error')).toBeNull();
  });

  it('shows loading before the answer arrives, not the empty state', async () => {
    // The initial render must not flash "no recordings" at someone whose
    // recordings are about to appear.
    api.fetchRoomResources.mockReturnValue(new Promise(() => { /* never resolves */ }));
    mount();

    expect(q('rec-loading')).not.toBeNull();
    expect(q('rec-empty')).toBeNull();
    expect(q('rec-error')).toBeNull();
  });

  it('lists each part separately, so a split session is visibly two files', async () => {
    api.fetchRoomResources.mockResolvedValue([
      { id: 'r1', title: 'Study Group · Part 1 of 2', storage_key: 'k1', url: null, size_bytes: 1048576, created_at: '2026-11-20T19:00:00Z' },
      { id: 'r2', title: 'Study Group · Part 2 of 2', storage_key: 'k2', url: null, size_bytes: 2097152, created_at: '2026-11-20T19:40:00Z' },
    ]);
    mount();
    await flush();

    expect(container.textContent).toContain('Part 1 of 2');
    expect(container.textContent).toContain('Part 2 of 2');
  });
});
