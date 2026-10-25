/**
 * WP-7, the Me panel and photo: the entrance setting (daily / every time / never, and the old "skip" read as never), the share
 * setting (Q14) through settings and the presence write, the progress bar from the last unlock, the locker tiles, the panel's
 * header, settings and non-earner note, the photo prompt and upload guard, the account-type switch (Ali's ask, 2026-10-23), the
 * live Classroom (Q2) and auto check-in.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import type { CampusLook } from '../campusApi';

const mockUpdate = jest.fn();
const mockSave = jest.fn(() => Promise.resolve());
const mockSetViewAs = jest.fn();
let mockCampus: Record<string, unknown> = {};
jest.mock('../CampusContext', () => ({ ...jest.requireActual('../CampusContext'), useCampus: () => mockCampus }));
const mockJoin = jest.fn();
jest.mock('../../../services/onboardingApi', () => ({ ...jest.requireActual('../../../services/onboardingApi'), joinSession: (...a: unknown[]) => mockJoin(...a) }));
const mockUpload = jest.fn();
jest.mock('../../../services/portalSettingsApi', () => ({
  ...jest.requireActual('../../../services/portalSettingsApi'),
  uploadAvatar: (...a: unknown[]) => mockUpload(...a),
  downscaleImageToSquare: () => Promise.resolve('data:image/jpeg;base64,AAAA'),
}));
let mockReadOnly = false;
const mockPost = jest.fn(() => Promise.resolve());
jest.mock('../campusApi', () => ({
  ...jest.requireActual('../campusApi'),
  isReadOnlySession: () => mockReadOnly,
  postCampusHere: (...a: unknown[]) => mockPost(...(a as [])),
  fetchCampusPresence: () => Promise.resolve({}),
}));

/* eslint-disable import/first */
import { readEntrance, writeEntrance, gateSeen, markGateSeen, centralDay, GATE_SEEN_KEY, ENTRANCE_KEY } from '../home/campusEntrance';
import { readCampusSettings, writeCampusSettings, DEFAULT_CAMPUS_SETTINGS, CAMPUS_SETTINGS_KEY } from '../campusSettings';
import { useCampusPresencePoll } from '../useCampusPresencePoll';
import { progressOf } from '../home/MeHeader';
import LockerGrid, { tileState } from '../LockerGrid';
import CampusMePanel from '../home/CampusMePanel';
import PhotoPrompt from '../home/PhotoPrompt';
import AccountChip from '../home/AccountChip';
import { effectiveAudience, readViewAs, writeViewAs, VIEW_AS_KEY } from '../campusAudienceSwitch';
import { PREVIEW_SIGNALS, campusViewFor } from '../useCampusView';
import { liveBuildingOf, roomRoute, headlineBroadcast, onAirBuildings } from '../campusOnAir';
import { shouldCheckIn, useLiveCheckIn, CHECKED_KEY } from '../home/useLiveCheckIn';
import { AVATAR_CACHE_KEY } from '../../../services/portalSettingsApi';
import type { DiscoveryBroadcast } from '../../../hooks/useBroadcastDiscovery';
import type { CampusLiveNow } from '../campusOnAir';
/* eslint-enable import/first */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;
const render = (el: React.ReactElement) => { act(() => { root = createRoot(host); root.render(<MemoryRouter>{el}</MemoryRouter>); }); };
const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

const LOOK = (points: number, equipped: Record<string, string> = {}): CampusLook => ({
  points, rung_name: 'AI Enabled II', equipped,
  catalog: [
    { id: 'cap', name: 'Red cap', slot: 'head', threshold: 150, unlocked: points >= 150 },
    { id: 'board', name: 'Skateboard', slot: 'ride', threshold: 150, unlocked: points >= 150 },
    { id: 'hoodie', name: 'Hoodie', slot: 'body', threshold: 400, unlocked: points >= 400 },
    { id: 'chain', name: 'Gold chain', slot: 'neck', threshold: 900, unlocked: points >= 900 },
  ],
});
const SETTINGS = { nav: 'campus', workplaceNames: false, motion: 'device', shareBuilding: true, reduceMotion: false };
const bc = (o: Partial<DiscoveryBroadcast> = {}): DiscoveryBroadcast => ({
  id: 'occ-1', title: 'Week 9 live', access_mode: 'paid', editorial_state: 'live', room_id: null, content_started_at: 1, scheduled_start_at: 1,
  can_watch: true, reason: 'enrolled', offer_upgrade: false, preview_seconds_remaining: null, ...o,
});

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host);
  window.localStorage.clear(); window.sessionStorage.clear();
  mockUpdate.mockReset(); mockSave.mockClear(); mockSetViewAs.mockReset(); mockJoin.mockReset(); mockUpload.mockReset(); mockPost.mockClear();
  mockReadOnly = false;
  mockCampus = { settings: SETTINGS, updateSettings: mockUpdate, openList: jest.fn(), look: LOOK(500), lookError: false, saveLook: mockSave,
    audienceSwitch: false, viewAs: null, setViewAs: mockSetViewAs };
});
afterEach(() => { act(() => root?.unmount()); root = null; host.remove(); });

describe('the entrance setting (A1.23)', () => {
  const now = new Date('2026-10-23T15:00:00Z');
  it('defaults to daily: the gate once per Central day', () => {
    expect(readEntrance()).toBe('daily');
    expect(gateSeen(now)).toBe(false);
    markGateSeen(now);
    expect(gateSeen(now)).toBe(true);
    expect(window.localStorage.getItem(GATE_SEEN_KEY)).toBe(centralDay(now));
  });
  it('"Every time" shows it even after today\'s visit; "Never" never does', () => {
    markGateSeen(now);
    writeEntrance('always');
    expect(gateSeen(now)).toBe(false);
    writeEntrance('never');
    expect(gateSeen(now)).toBe(true);
  });
  it('MIGRATION: the old "Skip the gate" (seen = always) reads as Never, and choosing again clears the old sentinel', () => {
    window.localStorage.setItem(GATE_SEEN_KEY, 'always');
    expect(readEntrance()).toBe('never');
    expect(gateSeen(now)).toBe(true);
    writeEntrance('daily');
    expect(window.localStorage.getItem(GATE_SEEN_KEY)).toBeNull();
    expect(window.localStorage.getItem(ENTRANCE_KEY)).toBe('daily');
    expect(gateSeen(now)).toBe(false);
  });
});

describe('"Show which building I\'m in" (Q14)', () => {
  it('is on by default, and an old settings blob without it reads as on', () => {
    expect(DEFAULT_CAMPUS_SETTINGS.shareBuilding).toBe(true);
    window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'device' }));
    expect(readCampusSettings().shareBuilding).toBe(true);
  });
  it('round-trips off', () => {
    writeCampusSettings({ ...DEFAULT_CAMPUS_SETTINGS, shareBuilding: false });
    expect(readCampusSettings().shareBuilding).toBe(false);
  });
  it('off: the presence write asks the server to forget the building', async () => {
    window.history.pushState({}, '', '/portal/library');
    const Probe = ({ share }: { share: boolean }) => { useCampusPresencePoll(true, share); return null; };
    render(<Probe share={false} />);
    await flush();
    expect(mockPost).toHaveBeenCalledWith('library', false);
    window.history.pushState({}, '', '/');
  });
});

describe('the bar from the last unlock to the next (E M2)', () => {
  it('runs from the previous unlock, names the next item with its icon', () => {
    expect(progressOf(LOOK(275))).toEqual({ pct: 50, left: 125, icon: '🧥', name: 'Hoodie' });
    expect(progressOf(LOOK(0))).toMatchObject({ pct: 0, left: 150, name: 'Red cap' });
  });
  it('null when everything is unlocked', () => { expect(progressOf(LOOK(900))).toBeNull(); });
});

describe('the locker tiles (E M6)', () => {
  it('says ✓ Wearing / Wear it / Ride it / 🔒 n pts', () => {
    const l = LOOK(500, { head: 'cap' });
    expect(tileState(l.catalog[0], true)).toBe('✓ Wearing');
    expect(tileState(l.catalog[2], false)).toBe('Wear it');
    expect(tileState(l.catalog[1], false)).toBe('Ride it');
    expect(tileState(l.catalog[3], false)).toBe('🔒 900 pts');
  });
  it('wears an item, takes it off, and a locked one cannot be pressed', async () => {
    render(<LockerGrid look={LOOK(500, { head: 'cap' })} onSave={mockSave} />);
    expect(($('cm-look-item-chain') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { $('cm-look-item-hoodie')!.click(); });
    expect(mockSave).toHaveBeenLastCalledWith({ head: 'cap', body: 'hoodie' });
    await act(async () => { $('cm-look-item-cap')!.click(); });
    expect(mockSave).toHaveBeenLastCalledWith({ head: null });
  });
});

describe('the Me panel', () => {
  it('a learner: figure, Lv chip, the bar to the next unlock, the locker, the settings', () => {
    render(<CampusMePanel audience="member" fullName="Ada Lovelace" initials="AL" photo={null} onClose={jest.fn()} />);
    expect($('cm-me-figure')).not.toBeNull();
    expect($('cm-me-level')!.textContent).toContain('AI Enabled II · 500 pts');
    expect($('cm-me-next')!.textContent).toContain('400 pts to');
    expect($('cm-me-next')!.textContent).toContain('Gold chain');
    expect($('cm-locker')).not.toBeNull();
    expect($('cm-me-photo')!.textContent).toContain('Add a photo');
    expect(($('cm-me-entrance') as HTMLSelectElement).options.length).toBe(3);
  });
  it('everything unlocked says so with the crown', () => {
    mockCampus.look = LOOK(900);
    render(<CampusMePanel audience="explorer" fullName="E" initials="E" photo="data:x" onClose={jest.fn()} />);
    expect($('cm-me-all')!.textContent).toContain('Everything unlocked');
    expect($('cm-me-photo')!.textContent).toContain('Change photo');
  });
  it('staff: the all-access line and the earners note, no locker', () => {
    render(<CampusMePanel audience="staff" fullName="S" initials="S" photo={null} onClose={jest.fn()} />);
    expect($('cm-me-staff')!.textContent).toBe('Program staff · all-access');
    expect($('cm-me-earners')).not.toBeNull();
    expect($('cm-locker')).toBeNull();
  });
  it('the share switch flips the setting', () => {
    render(<CampusMePanel audience="member" fullName="A" initials="A" photo={null} onClose={jest.fn()} />);
    expect($('cm-me-share')!.getAttribute('aria-checked')).toBe('true');
    act(() => { $('cm-me-share')!.click(); });
    expect(mockUpdate).toHaveBeenCalledWith({ shareBuilding: false });
  });
  it('a read-only "view as" session cannot change the photo', () => {
    mockReadOnly = true;
    render(<CampusMePanel audience="member" fullName="A" initials="A" photo={null} onClose={jest.fn()} />);
    act(() => { $('cm-me-photo')!.click(); });
    expect($('cm-me-photo-error')!.textContent).toContain('read-only');
  });
});

describe('the photo prompt (A3.5)', () => {
  it('shows only when we KNOW there is no photo; never to staff; × hides it for the visit', () => {
    render(<PhotoPrompt audience="member" photo={null} />);
    expect($('cm-photo-prompt')).toBeNull(); // nothing cached yet: unknown, so no flash
    act(() => root?.unmount()); root = null;
    window.localStorage.setItem(AVATAR_CACHE_KEY, '');
    render(<PhotoPrompt audience="staff" photo={null} />);
    expect($('cm-photo-prompt')).toBeNull();
    act(() => root?.unmount()); root = null;
    render(<PhotoPrompt audience="business" photo={null} />);
    expect($('cm-photo-prompt')!.textContent).toContain('your team');
    act(() => { $('cm-photo-no')!.click(); });
    expect($('cm-photo-prompt')).toBeNull();
  });
  it('uploads the 128 px crop and cheers', async () => {
    window.localStorage.setItem(AVATAR_CACHE_KEY, '');
    mockUpload.mockResolvedValue({});
    render(<PhotoPrompt audience="member" photo={null} />);
    const input = $('cm-photo-input') as HTMLInputElement;
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(mockUpload).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA');
  });
});

describe('the account-type switch (Ali, 2026-10-23)', () => {
  it('not allowed: a plain chip (none for a member), no menu', () => {
    render(<AccountChip audience="business" />);
    expect($('cm-stats-acct-business')!.tagName).toBe('SPAN');
    act(() => root?.unmount()); root = null;
    render(<AccountChip audience="member" />);
    expect(host.textContent).toBe('');
  });
  it('allowed: the chip opens the account types and picking one previews it; "Back to my account" ends it', () => {
    mockCampus.audienceSwitch = true;
    render(<AccountChip audience="business" />);
    act(() => { $('cm-stats-acct-business')!.click(); });
    expect($('cm-acct-menu')).not.toBeNull();
    act(() => { $('cm-acct-pick-explorer')!.click(); });
    expect(mockSetViewAs).toHaveBeenCalledWith('explorer');
    mockCampus.viewAs = 'explorer';
    act(() => root?.unmount()); root = null;
    render(<AccountChip audience="explorer" />);
    act(() => { $('cm-stats-acct-explorer')!.click(); });
    act(() => { $('cm-acct-reset')!.click(); });
    expect(mockSetViewAs).toHaveBeenLastCalledWith(null);
  });
  it('the preview applies only while the server allows it, and draws with that account\'s locks', () => {
    expect(effectiveAudience('business', true, 'explorer')).toBe('explorer');
    expect(effectiveAudience('business', false, 'explorer')).toBe('business');
    expect(effectiveAudience('staff', true, null)).toBe('staff');
    writeViewAs('member'); expect(readViewAs()).toBe('member');
    window.localStorage.setItem(VIEW_AS_KEY, 'admin'); expect(readViewAs()).toBeNull();
    const explorer = campusViewFor('explorer', PREVIEW_SIGNALS.explorer);
    const lecture = explorer.buildings.find((b) => b.id === 'lecture')!;
    expect(explorer.accessOf(lecture)).not.toBe('open');
  });
});

describe('the live Classroom (Q2) and auto check-in', () => {
  it('C28 (v7 R1): every broadcast airs in the Events Hall, never the commons; a class session still joins on its live page', () => {
    expect(liveBuildingOf(bc({ session_id: 'ses-1', room_id: 'r1' }))).toBe('amphi');
    expect(liveBuildingOf(bc({ room_id: 'r1' }))).toBe('amphi');
    expect(liveBuildingOf(bc())).toBe('amphi');
    expect(roomRoute(bc({ session_id: 'ses-1' }))).toBe('/portal/live/ses-1');
    expect(roomRoute(bc({ room_id: 'r1' }))).toBe('/portal/rooms/r1');
    expect(headlineBroadcast([bc({ id: 'a' }), bc({ id: 'b', session_id: 's' })])!.id).toBe('b');
    expect([...onAirBuildings([bc({ session_id: 's' }), bc({ room_id: 'r' })])].sort()).toEqual(['amphi']);
  });
  const live = (o: Partial<CampusLiveNow> = {}): CampusLiveNow => ({ b: bc({ session_id: 'ses-1' }), state: 'live', now: 0, polledAt: 0, building: 'lecture', ...o });
  it('checks in only a member, only in the live building, only while on air', () => {
    expect(shouldCheckIn('member', live(), 'lecture')).toBe('ses-1');
    expect(shouldCheckIn('explorer', live(), 'lecture')).toBeNull();
    expect(shouldCheckIn('member', live(), 'library')).toBeNull();
    expect(shouldCheckIn('member', live({ state: 'reconnecting' }), 'lecture')).toBeNull();
    expect(shouldCheckIn('member', live({ b: bc({ room_id: 'r' }), building: 'amphi' }), 'amphi')).toBeNull();
  });
  it('joins once per session (idempotent on our side too), remembers a 404, retries other failures on the next arrival', async () => {
    mockJoin.mockResolvedValue({ ok: true, status: 'present', awarded: true, points: 25 });
    const Probe = ({ here }: { here: string }) => { useLiveCheckIn('member', live(), here as 'lecture'); return null; };
    render(<Probe here="lecture" />);
    await flush();
    act(() => root?.render(<MemoryRouter><Probe here="library" /></MemoryRouter>));
    act(() => root?.render(<MemoryRouter><Probe here="lecture" /></MemoryRouter>));
    await flush();
    expect(mockJoin).toHaveBeenCalledTimes(1);
    expect(mockJoin).toHaveBeenCalledWith('ses-1', 'classroom');

    window.sessionStorage.removeItem(CHECKED_KEY);
    mockJoin.mockReset(); mockJoin.mockRejectedValue({ response: { status: 500 } });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    act(() => root?.render(<MemoryRouter><Probe here="library" /></MemoryRouter>));
    act(() => root?.render(<MemoryRouter><Probe here="lecture" /></MemoryRouter>));
    await flush();
    expect(JSON.parse(window.sessionStorage.getItem(CHECKED_KEY) || '[]')).not.toContain('ses-1');
    mockJoin.mockReset(); mockJoin.mockRejectedValue({ response: { status: 404 } });
    act(() => root?.render(<MemoryRouter><Probe here="library" /></MemoryRouter>));
    act(() => root?.render(<MemoryRouter><Probe here="lecture" /></MemoryRouter>));
    await flush();
    expect(JSON.parse(window.sessionStorage.getItem(CHECKED_KEY) || '[]')).toContain('ses-1');
    warn.mockRestore();
  });
  it('a read-only session never checks in', async () => {
    mockReadOnly = true;
    const Probe = () => { useLiveCheckIn('member', live(), 'lecture'); return null; };
    render(<Probe />);
    await flush();
    expect(mockJoin).not.toHaveBeenCalled();
  });
});
