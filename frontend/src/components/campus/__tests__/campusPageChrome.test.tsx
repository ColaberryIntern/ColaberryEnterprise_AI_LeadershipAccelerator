/**
 * C11b campus chrome on a building's page: the dark page bar (trail with building color, Step outside / Where to / Next), the
 * first-visit hint (dismissed once), the left column's rooms of this building, and the right rail's campus sections (who is
 * here, today's plan, help desk) from real campus data only; nothing at all when the campus is off.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

let mockFlag = true;
jest.mock('../campusApi', () => ({
  fetchCampusFlags: () => Promise.resolve({ campus: mockFlag }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({ commons: { count: 2, people: [{ enrollment_id: 'e1', display_name: 'Avery Stone', avatar_url: null, rung_name: 'AI Aware I' }, { anonymous: true }] } }),
  postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false,
  fetchLook: () => Promise.resolve({ points: 0, rung_name: 'AI Aware I', equipped: {}, catalog: [] }),
}));
jest.mock('../campusPeopleApi', () => ({
  fetchStaffDesks: () => Promise.resolve([{ id: 'reese', name: 'Reese', title: 'Mentor', building: 'commons', ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] }]),
  fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }),
}));
jest.mock('../useCampusView', () => {
  const actual = jest.requireActual('../useCampusView');
  return { ...actual, useCampusView: () => actual.campusViewFor('member', { isStaff: false, hasFullAccess: true, isExplorer: false }) };
});

// eslint-disable-next-line import/first
import { CampusProvider } from '../CampusContext';
// eslint-disable-next-line import/first
import CampusBanner, { PAGE_HINT_KEY } from '../CampusBanner';
// eslint-disable-next-line import/first
import CampusNav from '../CampusNav';
// eslint-disable-next-line import/first
import CampusRail from '../CampusRail';
// eslint-disable-next-line import/first
import { CAMPUS_SETTINGS_KEY } from '../campusSettings';
// eslint-disable-next-line import/first
import { ParticipantAuthProvider } from '../../../contexts/ParticipantAuthContext';
// eslint-disable-next-line import/first
import { PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.setTimeout(15000);

let container: HTMLDivElement;
let root: Root;
const flush = async () => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
const q = (s: string) => container.querySelector(s);

async function mount(path: string): Promise<void> {
  window.localStorage.setItem(CAMPUS_SETTINGS_KEY, JSON.stringify({ nav: 'campus', workplaceNames: false, motion: 'on' }));
  window.localStorage.setItem(PARTICIPANT_TOKEN_KEY, 'h.eyJlbWFpbCI6ImxlYXJuZXJAZXhhbXBsZS5jb20ifQ.s'); // gitleaks:allow (fake, unsigned)
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter initialEntries={[path]}><ParticipantAuthProvider><CampusProvider>
      <CampusBanner /><CampusNav active={path} /><CampusRail />
    </CampusProvider></ParticipantAuthProvider></MemoryRouter>);
  });
  await flush();
}
beforeEach(() => { mockFlag = true; });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); });

describe('the page bar and its hint', () => {
  it('is the dark page bar with the building color in the trail', async () => {
    await mount('/portal/rooms');
    expect(q('[data-testid="cm-banner"]')!.getAttribute('class')).toContain('cm-pagebar');
    expect(q('.cm-trail .cm-crumb-b.cm-b-commons')).not.toBeNull();
    expect(q('.cm-trail .cm-crumb-home')).not.toBeNull();
  });

  it('the first-visit hint shows until it is dismissed once', async () => {
    await mount('/portal/rooms');
    expect(q('[data-testid="cm-page-hint"]')!.textContent).toContain('still on campus');
    act(() => { (q('.cm-page-hint-x') as HTMLButtonElement).click(); });
    expect(q('[data-testid="cm-page-hint"]')).toBeNull();
    expect(window.localStorage.getItem(PAGE_HINT_KEY)).toBe('1');
  });
});

describe('the left column', () => {
  it('lists the rooms of the building you are in, the current one marked', async () => {
    await mount('/portal/rooms');
    const side = q('[data-testid="cm-page-side"]')!;
    expect(side.textContent).toContain('In Community Lounge');
    expect(side.querySelector('[aria-current="page"]')!.getAttribute('href')).toBe('/portal/rooms');
  });
  it('on a page outside any building, no rooms section', async () => {
    await mount('/portal/settings');
    expect(q('[data-testid="cm-page-side"]')).toBeNull();
  });
});

describe('the right rail', () => {
  it('who is here (named people and the staff desk), and the help desk, from campus data', async () => {
    await mount('/portal/rooms');
    const rail = q('[data-testid="cm-page-rail"]')!;
    expect(rail.textContent).toContain('In Community Lounge · 2 + staff');
    expect(rail.textContent).toContain('Avery');
    expect(rail.textContent).toContain('Reese');
    expect(rail.textContent).toContain('Help desk');
    expect(rail.textContent).not.toContain('anonymous');
  });
  it('nothing at all when the campus is off', async () => {
    mockFlag = false;
    await mount('/portal/rooms');
    expect(q('[data-testid="cm-page-rail"]')).toBeNull();
  });
});
