/**
 * C57: Cory follows the story on screen. Moving between stories on the pinned strip keeps the page mounted (only the URL changes):
 * the greeting names the new story (it used to keep the previous story's), each story has its own conversation, and an answer that
 * lands after you moved on is not shown on the new story.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

let mockProject: StudentProject | null = null;
let mockTaskId = 'STORY-001';
const mockReplies: Array<(v: unknown) => void> = [];
let mockActive = true;
const mockNav: Array<[string, unknown]> = [];
const mockOpenMap: Array<[unknown, unknown]> = [];
let mockLocState: { from?: string } | null = { from: '/portal/projects?project=p1' };

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ projectId: 'p1', taskId: mockTaskId }),
  useNavigate: () => (to: string, opts?: unknown) => { mockNav.push([to, opts]); },
  useLocation: () => ({ state: mockLocState }),
}));
jest.mock('../projectSync', () => ({ __esModule: true, refreshProjectsFromBackend: () => Promise.resolve(), syncProjectsWithBackend: () => Promise.resolve() }));
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: () => new Promise((res) => { mockReplies.push(res); }), get: () => Promise.resolve({ data: {} }) } }));
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
  mockTaskId = 'STORY-001';
  mockReplies.length = 0;
  mockNav.length = 0;
  mockOpenMap.length = 0;
  mockLocState = { from: '/portal/projects?project=p1' };
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
const render = async () => { await act(async () => { root.render(<ProjectWorkspacePage />); }); };
const cory = () => t('cm-ws-cory')!.textContent ?? '';

it('the greeting names the story on screen, and moving to the next story greets for that one', async () => {
  root = createRoot(container);
  await render();
  expect(cory()).toContain('your mentor for "A client books an appointment"');
  mockTaskId = 'STORY-002';
  await render(); // same mounted page, new URL
  expect(cory()).toContain('Your mentor for STORY-002');
  expect(cory()).toContain('your mentor for "Story 2"');
  expect(cory()).not.toContain('A client books an appointment');
});

it('one conversation per story: an answer that lands after you moved on is not shown on the new story', async () => {
  root = createRoot(container);
  await render();
  await act(async () => { (container.querySelector('.rt-chip') as HTMLButtonElement).click(); });
  expect(mockReplies).toHaveLength(1);
  mockTaskId = 'STORY-002';
  await render();
  await act(async () => { mockReplies[0]({ data: { reply: 'LATE ANSWER FOR STORY ONE' } }); await Promise.resolve(); });
  expect(cory()).not.toContain('LATE ANSWER FOR STORY ONE');
  expect(cory()).toContain('your mentor for "Story 2"');
});

it('staying on one story, the answer arrives as before', async () => {
  root = createRoot(container);
  await render();
  await act(async () => { (container.querySelector('.rt-chip') as HTMLButtonElement).click(); });
  await act(async () => { mockReplies[0]({ data: { reply: 'Here is a hint' } }); await Promise.resolve(); });
  expect(cory()).toContain('Here is a hint');
});
