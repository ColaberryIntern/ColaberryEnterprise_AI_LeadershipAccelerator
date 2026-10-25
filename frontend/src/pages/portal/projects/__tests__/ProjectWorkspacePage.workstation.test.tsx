/**
 * Campus C19 (round 3 §2.3 + v6 D1): with the campus on, a story opens in the WORKSTATION, and the page's own logic is untouched.
 *  - the shell: trail "Your desk · STORY-001 · …", "📺 All of Project Studio", "← Stand up", the bench "Pinned above your desk"
 *    with the release's stories, two monitor bezels (left: the repo terminal, right: the card itself), the desk strip, Cory on the
 *    right ("Your mentor for STORY-001"), the status bar with the build's numbers;
 *  - the centre is the SAME centre the classic page renders (the story, Done means, How to build it, the repo panel first);
 *  - Stand up asks the home to stand you inside the Studio and goes to the campus; All of goes to the section; a queued ticket
 *    opens that story's workstation;
 *  - with the campus off the classic layout renders exactly as before (no shell).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

let mockProject: StudentProject | null = null;
let mockActive = true;
const mockNav: Array<[string, unknown]> = [];
const mockOpenMap: Array<[unknown, unknown]> = [];

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ projectId: 'p1', taskId: 'STORY-001' }),
  useNavigate: () => (to: string, opts?: unknown) => { mockNav.push([to, opts]); },
  useLocation: () => ({ state: { from: '/portal/projects' } }),
}));
jest.mock('../projectSync', () => ({ __esModule: true, refreshProjectsFromBackend: () => Promise.resolve(), syncProjectsWithBackend: () => Promise.resolve() }));
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: () => Promise.resolve({ data: { reply: 'ok' } }), get: () => Promise.resolve({ data: {} }) } }));
jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  getWorkspaceRepo: () => Promise.resolve({
    connected: true, provisioned: true, repo_url: 'https://github.com/ali/salon', repo_owner: 'ali', repo_name: 'salon',
    student_github_login: 'ali', file_count: 3, last_sync: '2026-10-24T15:00:00Z', connect: null,
    recent_commits: [{ sha: 'abc1234def', message: 'feat: booking page', author: 'ali', date: '2026-10-24T14:00:00Z' }],
  }),
  provisionWorkspaceRepo: () => Promise.resolve(null),
  syncWorkspaceRepo: () => Promise.resolve(null),
  startRepoConnect: () => Promise.resolve(null),
  confirmRepoConnect: () => Promise.resolve(null),
  downloadDocsBundle: () => Promise.resolve({ blob: new Blob(), filename: 'x.zip' }),
  connectErrorOf: (_e: unknown, fallback: string) => ({ error: fallback, error_class: null }),
  getStoryVerification: () => Promise.reject(new Error('404')),
  getWebhookSetup: () => Promise.reject(new Error('not configured')),
}));
jest.mock('../projectsStore', () => ({ ...jest.requireActual('../projectsStore'), getProject: () => mockProject }));
jest.mock('../../../../components/campus/CampusContext', () => ({
  __esModule: true,
  useCampus: () => ({ active: mockActive, settings: { workplaceNames: false }, openMap: (b: unknown, how: unknown) => { mockOpenMap.push([b, how]); }, planStops: null }),
}));
jest.mock('../../../../components/campus/home/useHomeFacts', () => ({ __esModule: true, useHomeFacts: () => ({ firstName: 'Ali', fullName: 'Ali Muwwakkil', initials: 'AM' }) }));

import ProjectWorkspacePage from '../ProjectWorkspacePage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => { /* no layout in jsdom */ };

let container: HTMLDivElement;
let root: Root;
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const t = (s: string) => q(`[data-testid="${s}"]`);
const click = (el: HTMLElement | null) => act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

const task = (n: number, o: Partial<ProjectTask> = {}): ProjectTask => ({
  id: `p1-STORY-00${n}`, storyId: `STORY-00${n}`, title: `Story ${n}`, what: `As a client I can do thing ${n}`, prompt: `Build story ${n}`,
  state: 'todo', due: 'today', acceptance: ['It renders'], ...o,
});
const project = (): StudentProject => ({
  id: 'p1', name: 'Salon Booking', slug: 'salon', descriptor: '', accent: '#367895', cover: '', icon: 'M0 0h1', status: 'ready', createdAt: 1,
  stage: 'Release 1', curStep: 3, size: 'project', idea: '', reqs: [],
  lists: [{ id: 'L1', step: 2, name: 'Release 1', sub: '', tasks: [task(0, { state: 'done', verifiedAt: '2026-10-20' }), task(1, { title: 'A client books an appointment' }), task(2)] }],
  activity: [], preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
});

beforeEach(() => {
  localStorage.clear();
  mockProject = project();
  mockActive = true;
  mockNav.length = 0;
  mockOpenMap.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
async function mount() { await act(async () => { root = createRoot(container); root.render(<ProjectWorkspacePage />); }); }

it('draws the workstation: trail, both buttons, bench, two bezels, the desk, Cory and the status bar', async () => {
  await mount();
  expect(t('cm-ws')).not.toBeNull();
  expect(t('cm-ws-trail')!.textContent).toBe('Your desk · STORY-001 · A client books an appointment');
  expect(t('cm-ws-crumb-building')!.textContent).toBe('Project Studio');
  expect(t('cm-ws-head')!.textContent).toBe('Release 1STORY-001 · A client books an appointment');
  expect(t('cm-ws-focus')!.textContent).toBe('25:00');
  expect(t('cm-ws-section')!.textContent).toContain('All of Project Studio');
  expect(t('cm-ws-standup')!.textContent).toContain('Stand up');
  expect(container.querySelectorAll('.cm-ws-bezel')).toHaveLength(2);
  expect(t('cm-ws-desk')).not.toBeNull();
  expect(t('cm-ws-namecard')!.textContent).toBe('ALI M.');
  expect(t('cm-ws-cory')!.textContent).toContain('Your mentor for STORY-001');
  const status = t('cm-ws-status')!.textContent || '';
  expect(status).toContain('Salon Booking');
  expect(status).toContain('Release 1');
  expect(status).toContain('1/3');
});

it('pins the release on the bench: done by commit, on your desk, queued', async () => {
  await mount();
  expect(t('cm-ws-bench')!.getAttribute('aria-label')).toBe('Pinned above your desk');
  const tickets = Array.from(container.querySelectorAll('[data-testid="cm-ws-ticket"]'));
  expect(tickets.map((x) => x.className)).toEqual(['cm-ws-ticket is-done', 'cm-ws-ticket is-active', 'cm-ws-ticket is-queued']);
  expect(tickets[0].textContent).toContain('Done by commit');
  expect(tickets[1].textContent).toContain('On your desk');
});

it('keeps the page itself on the main monitor (story, Done means, How to build it) and the repo on the left', async () => {
  await mount();
  const main = q('.cm-ws-mon.main')!;
  expect(main.textContent).toContain('As a client I can do thing 1');
  expect(main.textContent).toContain('How to build it');
  const term = t('cm-ws-term')!;
  expect(q('.cm-ws-mon.side')!.contains(term)).toBe(true);
  expect(term.textContent).toContain('ali/salon');
  expect(term.textContent).toContain('abc1234');
  expect(term.textContent).toContain('watching .colaberry/progress.json');
});

it('Stand up stands you inside the Studio on the campus; All of opens the section; a queued ticket opens that story', async () => {
  await mount();
  click(t('cm-ws-standup'));
  expect(mockOpenMap).toEqual([['studio', 'inside']]);
  expect(mockNav[mockNav.length - 1][0]).toBe('/portal/campus');
  click(t('cm-ws-crumb-building')); // the building crumb in the trail does the same
  expect(mockOpenMap).toEqual([['studio', 'inside'], ['studio', 'inside']]);
  click(t('cm-ws-section'));
  expect(mockNav[mockNav.length - 1][0]).toBe('/portal/projects');
  const queued = container.querySelector('.cm-ws-ticket.is-queued') as HTMLElement;
  click(queued);
  expect(mockNav[mockNav.length - 1][0]).toBe('/portal/projects/workspace/p1/STORY-002');
});

it('with the campus off renders the classic workspace and no shell', async () => {
  mockActive = false;
  await mount();
  expect(t('cm-ws')).toBeNull();
  expect(q('.rt-top')).not.toBeNull();
  expect(q('.rt-body > main.rt-mid')!.textContent).toContain('How to build it');
  expect(q('.rt-mentor-sub')).toBeNull();
});
