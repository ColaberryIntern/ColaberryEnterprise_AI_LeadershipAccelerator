/**
 * Campus HQ: the Management Portal heartbeat. It sends the sidebar room (never a detail route), honors "Show which building
 * I'm in", repeats every 45 s, stops when the layout unmounts, and never runs without a linked staff account or a token.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

const mockPost = jest.fn(async () => ({ status: 204 }));
jest.mock('axios', () => ({ __esModule: true, default: { post: (...a: unknown[]) => (mockPost as unknown as (...x: unknown[]) => unknown)(...a) } }));

// eslint-disable-next-line import/first
import { useAdminCampusPresence, BEAT_MS } from '../useAdminCampusPresence';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
function Probe({ path, enabled }: { path: string; enabled: boolean }) { useAdminCampusPresence(path, enabled); return null; }
async function render(path: string, enabled = true): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<Probe path={path} enabled={enabled} />); });
  await flush();
}
/** The beat starts inside a promise: let it reach the client before asserting. */
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });
// CRA's jest config resets mock implementations before every test, so the implementation is set here.
beforeEach(() => { jest.useFakeTimers(); mockPost.mockReset(); mockPost.mockImplementation(async () => ({ status: 204 })); localStorage.setItem('admin_token', 'admin.jwt'); });
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); localStorage.clear(); jest.useRealTimers(); });

const body = (i = 0) => (mockPost.mock.calls[i] as unknown[])[1];

it('sends the room of the page, with the admin token, on mount', async () => {
  await render('/admin/leads/42');
  expect(mockPost).toHaveBeenCalledTimes(1);
  const [url, b, cfg] = mockPost.mock.calls[0] as unknown as [string, unknown, { headers: Record<string, string>; timeout: number }];
  expect(url).toMatch(/\/api\/admin\/campus\/here$/);
  expect(b).toEqual({ path: '/admin/leads', share: true });
  expect(cfg.headers.Authorization).toBe('Bearer admin.jwt');
  expect(cfg.timeout).toBeGreaterThan(0);
});

it('repeats every 45 s and stops on unmount', async () => {
  await render('/admin/marketing');
  await act(async () => { jest.advanceTimersByTime(BEAT_MS); });
  await flush();
  await act(async () => { jest.advanceTimersByTime(BEAT_MS); });
  await flush();
  expect(mockPost).toHaveBeenCalledTimes(3);
  act(() => root!.unmount()); root = undefined;
  await act(async () => { jest.advanceTimersByTime(BEAT_MS * 2); });
  await flush();
  expect(mockPost).toHaveBeenCalledTimes(3);
});

it('honors "Show which building I am in" off', async () => {
  localStorage.setItem('colaberry.campus.settings.v1', JSON.stringify({ shareBuilding: false }));
  await render('/admin/marketing');
  expect(body()).toEqual({ path: '/admin/marketing', share: false });
});

it('a page with no sidebar entry is sent as the lobby (null)', async () => {
  await render('/admin/apollo');
  expect(body()).toEqual({ path: null, share: true });
});

it('does nothing without a linked staff account, or without a token', async () => {
  await render('/admin/marketing', false);
  expect(mockPost).not.toHaveBeenCalled();
  act(() => root!.unmount()); root = undefined; container.remove();
  localStorage.removeItem('admin_token');
  await render('/admin/marketing', true);
  expect(mockPost).not.toHaveBeenCalled();
});

it('a failed beat never throws into the page', async () => {
  mockPost.mockRejectedValueOnce(new Error('network') as never);
  await render('/admin/marketing');
  await act(async () => { await Promise.resolve(); });
  expect(mockPost).toHaveBeenCalledTimes(1);
});
