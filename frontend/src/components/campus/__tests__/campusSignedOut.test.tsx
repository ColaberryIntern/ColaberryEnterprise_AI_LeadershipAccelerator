/**
 * Campus C2 safety: the campus provider lives in the portal layout, which also wraps
 * /portal/login, signup, verify, handoff and class-checkin. The flags endpoint requires a
 * participant, and the shared portalApi client answers any 401 by deleting the token and
 * redirecting to /portal/login. Unguarded, that would loop the login page and bounce
 * signed-out students, with the campus switched off.
 *
 * Two guards, each pinned here:
 *  (a) CampusProvider makes no request at all when nobody is signed in;
 *  (b) the flags request does not go through portalApi, so even a 401 cannot clear the
 *      session or navigate.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

// One fake axios for every importer. Implementations are set in beforeEach because
// react-scripts sets resetMocks: true.
// The plain axios.get and the shared portalApi instance (made by axios.create) get DIFFERENT fakes,
// so the suite can prove the flags request never goes through portalApi and its redirecting
// 401 interceptor.
// C5: the provider reads staff desks and polls the inbox while the campus is on; stubbed so no test touches the network.
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));
jest.mock('axios', () => {
  const get = jest.fn();
  const instanceGet = jest.fn();
  const instance = { get: instanceGet, post: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } }, defaults: { headers: { common: {} } } };
  return { __esModule: true, default: { get, create: () => instance, isAxiosError: () => false, __instance: instance } };
});

// eslint-disable-next-line import/first
import axios from 'axios';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { CampusProvider, useCampus } from '../CampusContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const get = axios.get as unknown as jest.Mock;
const instanceGet = (axios as unknown as { __instance: { get: jest.Mock } }).__instance.get;
const flagCalls = () => get.mock.calls.filter((c) => String(c[0]).includes('/api/portal/campus/flags'));
const portalApiFlagCalls = () => instanceGet.mock.calls.filter((c) => String(c[0]).includes('/api/portal/campus/flags'));

let seen: { enabled: boolean; ready: boolean } = { enabled: false, ready: false };
function Probe(): null { const c = useCampus(); seen = { enabled: c.enabled, ready: c.ready }; return null; }

async function mountAt(path: string): Promise<() => void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(container);
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ParticipantAuthProvider><CampusProvider><Probe /></CampusProvider></ParticipantAuthProvider>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
  return () => { act(() => { root?.unmount(); }); container.remove(); };
}

// C11b: the illustrated map is ~5x the DOM of the C2 outlines (377 vs 77 nodes; trees, paths, windows), and these suites mount
// the whole campus (up to three maps) and some run axe over it; a cold first render under parallel jest can pass 5 s.
jest.setTimeout(15000);

describe('campus flags and signed-out visitors', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    seen = { enabled: false, ready: false };
  });

  it.each(['/portal/login', '/portal/signup', '/portal/verify', '/portal/class-checkin/abc'])(
    'makes NO flags request and does not navigate at %s when signed out', async (path) => {
      get.mockResolvedValue({ data: { campus: true } });
      const before = window.location.href;
      const unmount = await mountAt(path);
      expect(flagCalls()).toHaveLength(0);
      expect(window.location.href).toBe(before);
      expect(seen).toEqual({ enabled: false, ready: true });
      unmount();
    });

  it('makes exactly one flags request when signed in, with the token, and honors the answer', async () => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-123');
    get.mockResolvedValue({ data: { campus: true } });
    const unmount = await mountAt('/portal/today');
    expect(flagCalls()).toHaveLength(1);
    expect(portalApiFlagCalls()).toHaveLength(0); // never through the redirecting shared client
    expect(flagCalls()[0][1]).toMatchObject({ headers: { Authorization: 'Bearer tok-123' } });
    expect(seen).toEqual({ enabled: true, ready: true });
    unmount();
  });

  it('a 401 from the flags request keeps the session and does not navigate (campus off)', async () => {
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'tok-expired');
    get.mockRejectedValue(Object.assign(new Error('Request failed with status code 401'), { response: { status: 401 } }));
    const before = window.location.href;
    const unmount = await mountAt('/portal/today');
    expect(flagCalls()).toHaveLength(1);
    expect(window.localStorage.getItem(PARTICIPANT_TOKEN_KEY)).toBe('tok-expired');
    expect(window.location.href).toBe(before);
    expect(seen).toEqual({ enabled: false, ready: true });
    unmount();
  });
});
