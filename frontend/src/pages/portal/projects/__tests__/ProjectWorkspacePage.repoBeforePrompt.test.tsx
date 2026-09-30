/**
 * "How to build it" puts CONNECTING THE REPO above PASTING THE PROMPT.
 *
 * ── WHY THIS ORDER IS A CORRECTNESS PROPERTY, NOT A PREFERENCE ───────────────
 *
 * STORY-000's prompt opens with "Step 1 — let the platform see your pushes",
 * and that step instructs the student's agent to go and find the panel titled
 * **Let the platform see your pushes** in the project workspace. That panel is
 * rendered by WorkspaceRepoPanel in its `connected` branch ONLY. On a project
 * with no repo connected it is not on the page at all.
 *
 * So with the prompt rendered ABOVE the connect panel, a student reading the
 * column top-to-bottom — which is how the page asks to be read, and how the
 * prompt's own Copy button invites them to use it — copies a prompt whose first
 * instruction points at a panel the page has not drawn yet. The instruction
 * cannot be followed at the moment it is given.
 *
 * Swati Raman, who owns the curriculum and was running STORY-000 herself, hit
 * this on 2026-08-19 and asked for repository setup first, then the build
 * prompt. Connect first and Step 1 has something to find.
 *
 * These tests fail against the ordering as it shipped: on unmodified main the
 * prompt card precedes the connect panel in the DOM.
 *
 * Uses the `createRoot` + `act` pattern already proven in
 * ProjectWorkspacePage.halfwidth.test.tsx — there is no `@testing-library/*`
 * dependency in this package and adding one for a test would be a drive-by
 * install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

let mockProject: StudentProject | null = null;
let mockTaskId = 'STORY-000';

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ projectId: 'p1', taskId: mockTaskId }),
  useNavigate: () => () => { /* the page never navigates in these tests */ },
  useLocation: () => ({ state: null }),
}));
jest.mock('../projectSync', () => ({
  __esModule: true,
  refreshProjectsFromBackend: () => Promise.resolve(),
  syncProjectsWithBackend: () => Promise.resolve(),
}));
// Plain functions, not jest.fn(): CRA sets `resetMocks: true`, which strips the
// implementation off every jest.fn before each test and would leave these
// returning undefined where the page expects a promise.
jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { post: () => Promise.resolve({ data: { reply: 'ok' } }) },
}));
jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  // No repo connected — the exact state a student is in when they first open
  // STORY-000, and the state in which the ordering actually matters.
  getWorkspaceRepo: () => Promise.resolve(null),
  provisionWorkspaceRepo: () => Promise.resolve(null),
  syncWorkspaceRepo: () => Promise.resolve(null),
  startRepoConnect: () => Promise.resolve(null),
  confirmRepoConnect: () => Promise.resolve(null),
  downloadDocsBundle: () => Promise.resolve({ blob: new Blob(), filename: 'x.zip' }),
  connectErrorOf: (_e: unknown, fallback: string) => ({ error: fallback, error_class: null }),
  getStoryVerification: () => Promise.reject(new Error('404')),
  // The connect panel only mounts the webhook block once connected, so this is
  // never reached here. Present so the module surface is complete.
  getWebhookSetup: () => Promise.reject(new Error('not configured')),
}));
jest.mock('../projectsStore', () => ({
  ...jest.requireActual('../projectsStore'),
  getProject: () => mockProject,
}));

import ProjectWorkspacePage from '../ProjectWorkspacePage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout, so the mentor rail's auto-scroll would throw.
(Element.prototype as any).scrollIntoView = () => { /* no layout in jsdom */ };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  mockTaskId = 'STORY-000';
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount() {
  await act(async () => { root = createRoot(container); root.render(<ProjectWorkspacePage />); });
}

const TASK: ProjectTask = {
  id: 'p1-STORY-000',
  storyId: 'STORY-000',
  title: 'STORY-000 · Build your Command Center',
  what: 'One page that shows what you are building and how far along you are.',
  req: null as unknown as string,
  prompt: '## Step 1 — let the platform see your pushes (2 minutes, do it now)',
  state: 'todo',
  due: 'today',
  acceptance: ['The Command Center renders', 'It reads your plan'],
};

const project = (): StudentProject => ({
  id: 'p1', name: 'SupplyMind AI', slug: 'supplymind', descriptor: '',
  accent: '#367895', cover: '', icon: 'M0 0h1', status: 'ready', createdAt: 1,
  stage: 'Release 1', curStep: 3, size: 'project', idea: '', reqs: [],
  lists: [{ id: 'L1', step: 2, name: 'Release 1', sub: '', tasks: [TASK] }],
  activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
});

/**
 * The "How to build it" section, which owns both halves of this ordering.
 *
 * Selected by its HEADING TEXT, not by position or by `.rt-step` alone: the
 * acceptance checklist renders as a `<section className="rt-step">` too, so
 * `querySelector('.rt-step')` returns "Done means" and every assertion below
 * would be measuring the wrong section.
 */
const buildSection = (): HTMLElement => {
  const section = Array.from(container.querySelectorAll('section.rt-step'))
    .find((s) => (s.querySelector('.rt-step-t')?.textContent || '').includes('How to build it'));
  if (!section) throw new Error('no "How to build it" section rendered');
  return section as HTMLElement;
};

/**
 * The element carrying some text, searched inside the build section only.
 *
 * Deliberately not `container`-wide: the acceptance checklist and the mentor
 * rail both mention building, and an ordering assertion that accidentally
 * anchored on one of those would pass or fail for the wrong reason.
 */
const nodeSaying = (text: string): HTMLElement => {
  const hit = Array.from(buildSection().querySelectorAll('*'))
    .reverse()
    .find((el) => (el.textContent || '').includes(text)) as HTMLElement | undefined;
  if (!hit) throw new Error(`nothing in the build section says "${text}"`);
  return hit;
};

describe('the repo is connected before the prompt is offered', () => {
  beforeEach(() => { mockProject = project(); });

  it('renders the connect panel ahead of the Claude Code prompt', async () => {
    await mount();

    const connect = nodeSaying('Connect your project folder');
    const promptCard = nodeSaying('Your Claude Code prompt');

    // DOCUMENT_POSITION_FOLLOWING === 4: `promptCard` comes after `connect`.
    // Asserted on the bitmask rather than on index arithmetic so the test does
    // not quietly depend on how many wrapper divs each half happens to use.
    // eslint-disable-next-line no-bitwise
    const promptIsAfterConnect = Boolean(
      connect.compareDocumentPosition(promptCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(promptIsAfterConnect).toBe(true);
  });

  it('still renders both halves under the one "How to build it" heading', async () => {
    await mount();

    // The reorder must not have split the section into two peers of the story —
    // that grouping was a deliberate earlier decision and is not what was wrong.
    const section = buildSection();
    expect(section.textContent).toContain('How to build it');
    expect(section.textContent).toContain('Connect your project folder');
    expect(section.textContent).toContain('Your Claude Code prompt');
  });

  it('keeps the prompt collapsed, so connecting is what the fold shows', async () => {
    await mount();

    // The ordering fix is worthless if the prompt still occupies the column.
    expect(container.querySelector('.rt-prompt-full')).toBeNull();
    expect(container.querySelector('.rt-prompt-peek')).toBeTruthy();
  });
});
