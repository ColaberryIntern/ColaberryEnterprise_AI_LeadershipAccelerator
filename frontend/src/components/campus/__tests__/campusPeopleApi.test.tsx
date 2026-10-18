/**
 * C5 client contracts, the campus-off guarantee (criterion 6: no desks or inbox request from campus code), and the
 * PortalShell DM wiring moved into useShellDms (te-open-dm still opens a dock; the shell registers as the DM host).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockCalls: Array<{ method: string; url: string; body?: unknown }> = [];
let mockGet: (url: string) => Promise<unknown> = async () => ({ data: {} });
let mockPost: (url: string, body: unknown) => Promise<unknown> = async () => ({ data: {} });
jest.mock('axios', () => {
  const client = {
    get: (url: string) => { mockCalls.push({ method: 'get', url }); return mockGet(url); },
    post: (url: string, body: unknown) => { mockCalls.push({ method: 'post', url, body }); return mockPost(url, body); },
  };
  // The shared portal client (axios.create) records into the same log, so ANY request path is visible to the test.
  const created = { ...client, interceptors: { request: { use: () => 0 }, response: { use: () => 0 } }, defaults: { headers: { common: {} } } };
  return { __esModule: true, default: { ...client, create: () => created } };
});
let mockOpenDm: (id: string) => Promise<string> = async () => 'room-7';
jest.mock('../../../services/dmApi', () => ({ openDm: (id: string) => mockOpenDm(id), myEnrollmentId: () => 'me', sendDmMessage: () => Promise.resolve({}) }));

// eslint-disable-next-line import/first
import { fetchStaffDesks, postWave, fetchConversationsQuiet } from '../campusPeopleApi';
// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusLayers from '../CampusLayers';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
// eslint-disable-next-line import/first
import { useShellDms } from '../../../pages/portal/today/useShellDms';
// eslint-disable-next-line import/first
import { hasDmHost } from '../dmHost';
// eslint-disable-next-line import/first
import { useStaffDesks } from '../useStaffDesks';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reese = { id: 'reese', name: 'Reese', title: 'Mentor desk', building: 'commons', ai: true, on_duty: true, enrollment_id: 'r-1', opens: null, prompts: ['a', 'b', 'c'] };
const httpErr = (status: number, error?: string) => Object.assign(new Error('http ' + status), { response: { status, data: error ? { error } : {} } });

beforeEach(() => { mockCalls.length = 0; mockGet = async () => ({ data: {} }); mockPost = async () => ({ data: {} }); mockOpenDm = async () => 'room-7'; });

describe('client', () => {
  it('fetchStaffDesks returns well-formed desks', async () => {
    mockGet = async () => ({ data: { desks: [reese] } });
    await expect(fetchStaffDesks()).resolves.toEqual([reese]);
    expect(mockCalls[0].url).toMatch(/\/api\/portal\/campus\/staff-desks$/);
  });
  it.each([
    ['a 403 (not in the pilot)', async () => { throw httpErr(403); }],
    ['a 500', async () => { throw httpErr(500); }],
    ['a timeout', async () => { throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }); }],
    ['a malformed body', async () => ({ data: { desks: [{ id: 'cory' }] } })],
  ])('fetchStaffDesks throws on %s (failed is not the same as empty)', async (_n, impl) => {
    mockGet = impl as () => Promise<unknown>;
    await expect(fetchStaffDesks()).rejects.toThrow();
  });
  it('postWave sends {to} and returns the server outcome', async () => {
    mockPost = async () => ({ data: { sent: false, reason: 'already_waved', roomId: 'x' } });
    await expect(postWave('e-1')).resolves.toEqual({ sent: false, reason: 'already_waved' });
    expect(mockCalls[0]).toMatchObject({ method: 'post', body: { to: 'e-1' } });
  });
  it('postWave rejects with the server\'s own message (e.g. the cohort rule)', async () => {
    mockPost = async () => { throw httpErr(400, 'You can only message people in your cohort'); };
    await expect(postWave('e-1')).rejects.toThrow('You can only message people in your cohort');
  });
  it('postWave outside the pilot (403) rejects with the server message', async () => {
    mockPost = async () => { throw httpErr(403, 'The campus is not enabled for this account'); };
    await expect(postWave('e-1')).rejects.toThrow('The campus is not enabled for this account');
  });
  it('fetchConversationsQuiet returns the list; a malformed body throws', async () => {
    mockGet = async () => ({ data: { conversations: [] } });
    await expect(fetchConversationsQuiet()).resolves.toEqual([]);
    mockGet = async () => ({ data: {} });
    await expect(fetchConversationsQuiet()).rejects.toThrow();
  });
});

describe('campus off: campus code makes no desks or inbox request (criterion 6)', () => {
  let container: HTMLDivElement; let root: Root;
  afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); jest.useRealTimers(); });
  it('flag off: only the flag is read; never staff-desks, never dm/conversations, even after a minute', async () => {
    jest.useFakeTimers();
    mockGet = async (url: string) => ({ data: url.endsWith('/campus/flags') ? { campus: false } : {} });
    window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
    container = document.createElement('div'); document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<MemoryRouter><ParticipantAuthProvider><CampusProvider><CampusLayers /></CampusProvider></ParticipantAuthProvider></MemoryRouter>); });
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(65_000); });
    const urls = mockCalls.map((c) => c.url);
    expect(urls.some((u) => u.endsWith('/campus/flags'))).toBe(true);
    expect(urls.filter((u) => /staff-desks|dm\/conversations|campus\/presence/.test(u))).toEqual([]);
  });
});

describe('useShellDms (moved out of PortalShell)', () => {
  let container: HTMLDivElement; let root: Root;
  let api: ReturnType<typeof useShellDms> | null = null;
  function Probe(): null { api = useShellDms(); return null; }
  afterEach(() => { container.remove(); });
  it('registers as the DM host while mounted, and te-open-dm opens a dock for that room', async () => {
    container = document.createElement('div'); document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<Probe />); });
    expect(hasDmHost()).toBe(true);
    await act(async () => { window.dispatchEvent(new CustomEvent('te-open-dm', { detail: { enrollmentId: 'e-9', name: 'Sam' } })); });
    await act(async () => { await Promise.resolve(); });
    expect(api!.chats).toEqual([expect.objectContaining({ roomId: 'room-7', name: 'Sam' })]);
    await act(async () => { api!.closeChat('room-7'); });
    expect(api!.chats).toEqual([]);
    act(() => root.unmount());
    expect(hasDmHost()).toBe(false);
  });
  it('a refused open flashes the server message instead of failing silently', async () => {
    mockOpenDm = async () => { throw httpErr(400, 'You can only message people in your cohort'); };
    container = document.createElement('div'); document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<Probe />); });
    await act(async () => { window.dispatchEvent(new CustomEvent('te-open-dm', { detail: { enrollmentId: 'e-9' } })); });
    await act(async () => { await Promise.resolve(); });
    expect(api!.dmError).toBe('You can only message people in your cohort');
    act(() => root.unmount());
  });
});

describe('useStaffDesks', () => {
  let container: HTMLDivElement; let root: Root;
  let state: ReturnType<typeof useStaffDesks> | null = null;
  function Probe({ active }: { active: boolean }): null { state = useStaffDesks(active); return null; }
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const mountProbe = async (active: boolean) => {
    container = document.createElement('div'); document.body.appendChild(container);
    await act(async () => { root = createRoot(container); root.render(<Probe active={active} />); });
    for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
  };
  it('reads the desks once while active', async () => {
    mockGet = async () => ({ data: { desks: [reese] } });
    await mountProbe(true);
    expect(state).toEqual({ staffDesks: [reese], staffDesksError: false });
    expect(mockCalls.filter((c) => c.url.endsWith('/staff-desks'))).toHaveLength(1);
  });
  it('a failed read hides the desks (empty) and flags the error; the map is never blocked', async () => {
    mockGet = async () => { throw httpErr(500); };
    await mountProbe(true);
    expect(state).toEqual({ staffDesks: [], staffDesksError: true });
  });
  it('inactive: no request', async () => {
    await mountProbe(false);
    expect(mockCalls).toHaveLength(0);
  });
});
