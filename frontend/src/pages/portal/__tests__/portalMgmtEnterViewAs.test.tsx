/**
 * AF2.7 item 1 — the bridge landing refuses inside a read-only view-as tab.
 *
 * The nav no longer offers the link there, so this is the belt for a same-tab arrival: a typed
 * URL, a `?next=` deep link, the back button. It matters that the refusal happens BEFORE the
 * POST — `requireParticipant` would reject the request anyway, but only with the generic
 * read-only 403, which reads to the viewer as a broken page rather than a deliberate answer.
 *
 * So the assertion is "the request was never made", not "an error was displayed". An
 * implementation that POSTed and then rendered the 403 would show the same text and still be the
 * thing this test exists to prevent.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { VIEW_AS_TOKEN_KEY, PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import { MGMT_BRIDGE_BLOCKED_REASON } from '../mgmtBridgeGate';

// `mock`-prefixed on purpose: a jest.mock factory may not close over any other out-of-scope
// variable, and Jest's guard rejects the suite outright rather than failing a test.
const mockPost = jest.fn();
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a), get: jest.fn() } }));

import PortalMgmtEnterPage from '../PortalMgmtEnterPage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tok = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims))}.s`;

// jsdom implements no navigation, so the success path's window.location.replace would otherwise
// raise "Not implemented". Stubbed, and also asserted on: landing somewhere is the success path.
const replace = jest.fn();

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { admin_token: 'a.b.c', role: 'ops' } });
  replace.mockReset();
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost/portal/mgmt-enter', search: '', hash: '', replace },
    writable: true,
    configurable: true,
  });
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => { root.unmount(); }); document.body.removeChild(container); });

async function mount() {
  await act(async () => { root = createRoot(container); root.render(<PortalMgmtEnterPage />); });
}

describe('arriving at the bridge inside a view-as tab', () => {
  beforeEach(() => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: 'admin-sub' }));
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok({ sub: 'member-sub', read_only: true }));
  });

  it('never calls the bridge', async () => {
    await mount();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('never writes an admin session, and does not navigate anywhere', async () => {
    await mount();
    expect(localStorage.getItem('admin_token')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('says why', async () => {
    await mount();
    expect(container.textContent).toContain(MGMT_BRIDGE_BLOCKED_REASON);
  });
});

/**
 * THE CONTROL. A page that refused unconditionally would satisfy all three assertions above and
 * break the Management Portal for every employee.
 */
describe('arriving at the bridge in the employee\'s own session', () => {
  beforeEach(() => { localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: 'admin-sub' })); });

  it('calls the bridge exactly once, stores the admin session, and lands in /admin', async () => {
    await mount();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/api/portal/mgmt/enter');
    expect(localStorage.getItem('admin_token')).toBe('a.b.c');
    expect(replace).toHaveBeenCalledWith('/admin/dashboard');
  });
});
