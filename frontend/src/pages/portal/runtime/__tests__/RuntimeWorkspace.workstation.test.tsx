/**
 * Campus C19 (round 3 §2.3 + v6 D1): with the campus on, a lesson card opens in the WORKSTATION.
 *  - trail "Your seat · ‹card›", "All of Classroom", Stand up (stands you inside the Classroom on the campus);
 *  - the bench is today's plan with this card "On your desk";
 *  - left monitor: the notebook, which lists this card's earlier notes only and saves a new one through the notebook API;
 *  - right monitor: the card itself with its own completion; Cory on the right; the readiness numbers in the status bar;
 *  - with the campus off: the classic layout, no shell.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockActive = true;
const mockNav: string[] = [];
const mockOpenMap: Array<[unknown, unknown]> = [];
let mockLocState: { from?: string; at?: string } | null = { from: '/portal/classroom' };
const mockSaved: Array<[string, string]> = [];

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ cardId: 'c2' }),
  useNavigate: () => (to: string) => { mockNav.push(to); },
  useLocation: () => ({ state: mockLocState }),
}));
jest.mock('../runtimeApi', () => ({
  __esModule: true,
  runtimeApi: {
    open: () => Promise.resolve({
      card: { id: 'c2', title: 'claude code basics', type: 'lesson', render_band: 'overview', student_label: 'Deep Dive', estimated_time: 6,
        description: 'Work through the basics of Claude Code.', content: { title: 'Claude Code Basics' }, points: { learning: 15 } },
      progress: { status: 'available', completed_at: null },
    }),
    readiness: () => Promise.resolve({
      employment: { overall: 62, band: 'Developing', employer_gaps: [], skills: [] },
      certification: { pass_probability: 0.4 }, journey: { focus_stage: 'Foundations' },
      evidence: { github: { commits: 3, repos: 1, prs: 0 }, portfolio: { entries: 2, artifacts: 1 } },
      progression: { xp: { builder: 120, learning: 300, community: 10 } },
    }),
    nudge: () => Promise.resolve({ message: null }),
    comments: () => Promise.resolve({ comments: [] }),
    comment: () => Promise.reject(new Error('unused')),
    notes: () => Promise.resolve([
      { id: 'n1', card_id: 'c2', kind: 'note', title: null, body: 'Plan mode first', created_at: '2026-10-24' },
      { id: 'n2', card_id: 'other', kind: 'note', title: null, body: 'Someone else card', created_at: '2026-10-24' },
    ]),
    saveNote: (cardId: string, body: string) => { mockSaved.push([cardId, body]); return Promise.resolve({ id: 'n3', card_id: cardId, kind: 'note', title: null, body, created_at: '2026-10-24' }); },
    watch: () => Promise.resolve(null),
    mentor: () => Promise.resolve({ reply: 'ok', kind: 'coach' }),
  },
}));
jest.mock('../../../../components/campus/CampusContext', () => ({
  __esModule: true,
  useCampus: () => ({
    active: mockActive, settings: { workplaceNames: false }, openMap: (b: unknown, how: unknown) => { mockOpenMap.push([b, how]); },
    planStops: [
      { key: 'k1', title: 'Orientation', route: '/portal/runtime/c1', buildingId: 'lecture', done: true, type: 'lesson', label: 'Overview', minutes: 5, points: 10, ref: 'card:c1' },
      { key: 'k2', title: 'Claude Code Basics', route: '/portal/runtime/c2', buildingId: 'lecture', done: false, type: 'lesson', label: 'Deep Dive', minutes: 6, points: 15, ref: 'card:c2' },
    ],
  }),
}));
jest.mock('../../../../components/campus/home/useHomeFacts', () => ({ __esModule: true, useHomeFacts: () => ({ firstName: 'Ali', fullName: '', initials: 'A' }) }));

import RuntimeWorkspace from '../RuntimeWorkspace';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => { /* no layout in jsdom */ };

let container: HTMLDivElement;
let root: Root;
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const t = (s: string) => q(`[data-testid="${s}"]`);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  mockActive = true; mockNav.length = 0; mockOpenMap.length = 0; mockSaved.length = 0; mockLocState = { from: '/portal/classroom' };
  container = document.createElement('div'); document.body.appendChild(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
async function mount() { await act(async () => { root = createRoot(container); root.render(<RuntimeWorkspace />); }); await flush(); }

it('draws the workstation for a lesson: seat trail, Classroom section, plan bench, two bezels, desk, Cory, readiness bar', async () => {
  await mount();
  expect(t('cm-ws-trail')!.textContent).toBe('Your seat · Claude Code Basics');
  expect(t('cm-ws-section')!.textContent).toContain('All of Classroom');
  expect(container.querySelectorAll('.cm-ws-bezel')).toHaveLength(2);
  expect(t('cm-ws-desk')).not.toBeNull();
  expect(t('cm-ws-namecard')!.textContent).toBe('ALI');
  expect(t('cm-ws-cory')!.textContent).toContain('Your mentor for Claude Code Basics');
  const tickets = Array.from(container.querySelectorAll('[data-testid="cm-ws-ticket"]'));
  expect(tickets.map((x) => x.className)).toEqual(['cm-ws-ticket is-done', 'cm-ws-ticket is-active']);
  const status = t('cm-ws-status')!.textContent || '';
  expect(status).toContain('62');
  expect(status).toContain('Foundations');
  expect(q('.cm-ws-mon.main')!.textContent).toContain('Work through the basics of Claude Code.');
});

it("the notebook shows this card's notes only and saves a new one through the notebook API", async () => {
  await mount();
  const nb = t('cm-ws-notebook')!;
  expect(q('.cm-ws-mon.side')!.contains(nb)).toBe(true);
  expect(nb.textContent).toContain('Plan mode first');
  expect(nb.textContent).not.toContain('Someone else card');
  const ta = nb.querySelector('textarea') as HTMLTextAreaElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    set.call(ta, 'Takeaway: small diffs');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { (nb.querySelector('button') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
  expect(mockSaved).toEqual([['c2', 'Takeaway: small diffs']]);
  expect(nb.textContent).toContain('Saved to your notebook');
});

// Ali, 2026-10-26: back out returns where you came from
it('Stand up returns to the page that opened the workstation (the Classroom page)', async () => {
  await mount();
  act(() => { t('cm-ws-standup')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(mockOpenMap).toEqual([]);
  expect(mockNav[mockNav.length - 1]).toBe('/portal/classroom');
});

it('opened from Today, Stand up returns to Today', async () => {
  mockLocState = { from: '/portal/today' };
  await mount();
  act(() => { t('cm-ws-standup')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(mockNav[mockNav.length - 1]).toBe('/portal/today');
});

it('opened from the campus map, Stand up stands you inside the Classroom on the campus', async () => {
  mockLocState = { from: '/portal/campus' };
  await mount();
  act(() => { t('cm-ws-standup')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(mockOpenMap).toEqual([['lecture', 'inside']]);
  expect(mockNav[mockNav.length - 1]).toBe('/portal/campus');
});

// C79 (Ali 2026-10-27): a Today item opened inside the Schedule said "Classroom" and Stand up went to the Classroom
it('opened inside the Schedule on the campus, it is your planning desk there: All of Schedule, and Stand up stands you in the Schedule', async () => {
  mockLocState = { from: '/portal/campus', at: 'tower' };
  await mount();
  expect(t('cm-ws-section')!.textContent).toContain('All of Schedule');
  expect(t('cm-ws-section')!.textContent).not.toContain('Classroom');
  act(() => { t('cm-ws-standup')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(mockOpenMap).toEqual([['tower', 'inside']]);
});

it('with the campus off renders the classic workspace', async () => {
  mockActive = false;
  await mount();
  expect(t('cm-ws')).toBeNull();
  expect(q('.rt-body > main.rt-mid')!.textContent).toContain('Work through the basics of Claude Code.');
  expect(q('.rt-bar')!.textContent).toContain('Foundations');
});
