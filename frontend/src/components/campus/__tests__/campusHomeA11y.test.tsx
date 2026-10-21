/**
 * C11b accessibility: an axe-core sweep (zero wcag2a/wcag2aa violations, nothing new left unchecked) of the new surfaces in both
 * themes: the campus home (top bar, concierge, map), the entry gate, the Me panel, and an arrival (panel + interior).
 * Contrast is campusContrast.test.ts (jsdom has no paint).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';

jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({ commons: { count: 2, people: [{ enrollment_id: 'e1', display_name: 'Avery Stone', avatar_url: null }, { anonymous: true }] } }),
  postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 120, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
}));
jest.mock('../campusPeopleApi', () => ({
  fetchStaffDesks: () => Promise.resolve([{ id: 'reese', name: 'Reese', title: 'Mentor', building: 'commons', ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] }]),
  fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }),
}));
jest.mock('../../../services/onboardingApi', () => ({
  ...jest.requireActual('../../../services/onboardingApi'),
  fetchOnboardingProfile: () => Promise.resolve({ profile: { full_name: 'Avery Learner' } }),
  fetchStreak: () => Promise.resolve({ count: 2, claimed_today: true, week: [], total_streak_points: 0, next_points: 0 }),
  fetchPortalFlags: () => Promise.resolve({}),
}));
jest.mock('../../../services/communityApi', () => ({ ...jest.requireActual('../../../services/communityApi'), fetchUnreadNotificationCount: () => Promise.resolve(0) }));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('explorer', { isStaff: false, hasFullAccess: false, isExplorer: true }) };
});

// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusHomePage from '../../../pages/portal/campus/CampusHomePage';
// eslint-disable-next-line import/first
import CampusGate from '../home/CampusGate';
// eslint-disable-next-line import/first
import { GATE_SEEN_KEY } from '../home/CampusGate';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(30000);

const WCAG = ['wcag2a', 'wcag2aa'];
const KNOWN_UNCHECKED: ReadonlyArray<string> = ['color-contrast'];
async function audit(el: Element): Promise<{ violations: string[]; unchecked: string[] }> {
  const r = await axe.run(el, { runOnly: { type: 'tag', values: WCAG } });
  return {
    violations: r.violations.map((v) => `${v.id} [${v.impact ?? 'n/a'}] ${v.nodes.map((n) => n.html.slice(0, 120)).join(' | ')}`),
    unchecked: r.incomplete.map((x) => x.id).filter((id) => !KNOWN_UNCHECKED.includes(id)).sort(),
  };
}

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => container.querySelector(s);

async function mountHome(): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  window.localStorage.setItem(GATE_SEEN_KEY, 'always');
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={['/portal/campus']}><ParticipantAuthProvider><CampusProvider>
      <Routes><Route path="/portal/campus" element={<CampusHomePage />} /></Routes>
    </CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe.each([['light', null], ['dark', 'dark']])('axe on the new campus surfaces (%s)', (_label, theme) => {
  beforeEach(() => { if (theme) document.documentElement.setAttribute('data-theme', theme); });

  it('the campus home: top bar, concierge with the Explorer pass, the map', async () => {
    await mountHome();
    expect(q('[data-testid="cm-cc-pass"]')).not.toBeNull();
    expect(await audit(q('[data-testid="cm-home"]')!)).toEqual({ violations: [], unchecked: [] });
  });

  it('an arrival: the arrival panel over the interior', async () => {
    await mountHome();
    act(() => { q('[data-testid="cm-bld-commons"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(q('[data-testid="cm-inside"]')).not.toBeNull();
    expect(await audit(q('[data-testid="cm-home"]')!)).toEqual({ violations: [], unchecked: [] });
  });

  it('the Me panel', async () => {
    await mountHome();
    act(() => { (q('[data-testid="cm-stats-me"]') as HTMLButtonElement).click(); });
    await flush();
    expect(await audit(q('[data-testid="cm-me"]')!)).toEqual({ violations: [], unchecked: [] });
  });

  it('the entry gate', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(<CampusGate audience="member" firstName="Avery" fullName="Avery Learner" initials="AL" rung="AI Aware I" points={120} streak={2} online={3}
        workplace={false} hasTour reduceMotion now={new Date('2026-10-20T20:00:00Z')} onEnter={() => undefined} />);
    });
    expect(await audit(q('[data-testid="cm-gate"]')!)).toEqual({ violations: [], unchecked: [] });
  });
});
