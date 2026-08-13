/**
 * ProjectWorkspacePage — the two things that decide whether this page works at
 * HALF SCREEN (~700px, with the editor in the other half, which is how a
 * student actually builds).
 *
 *  1. The Claude Code prompt is COLLAPSED on arrival. It used to render in a
 *     340px-tall <pre>, which at half width is the entire visible column: the
 *     story, the requirement and the acceptance criteria were all pushed under
 *     the fold, so the page opened on the thing you paste rather than the thing
 *     you have to understand before pasting it. Copy stays visible so
 *     collapsing costs the student nothing.
 *  2. The Command Center link appears if and only if the backend gave us a URL.
 *     It is blank for the whole of week one, and a dead link on the header of
 *     the page a student lives in is worse than no link at all.
 *
 * Uses the `createRoot` + `act` pattern already proven in this repo — there is
 * no `@testing-library/*` dependency here and adding one for a test would be a
 * drive-by install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

// Swapped per test. `mock`-prefixed so babel-plugin-jest-hoist allows the
// factory below to close over it.
let mockProject: StudentProject | null = null;

jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ projectId: 'p1', taskId: 'STORY-004' }),
  useNavigate: () => () => { /* the page never navigates in these tests */ },
  useLocation: () => ({ state: null }),
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
  // No repo on day one is the normal state, not an error — same as production.
  getWorkspaceRepo: () => Promise.resolve(null),
  provisionWorkspaceRepo: () => Promise.resolve(null),
  syncWorkspaceRepo: () => Promise.resolve(null),
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

const PROMPT = [
  'Build the deposit-taking slice end to end.',
  'Wire Stripe in test mode, store the intent id, and prove the refund path.',
  'Add a failure-path test for a declined card.',
].join('\n');

const TASK: ProjectTask = {
  id: 'p1-STORY-004', storyId: 'STORY-004', title: 'STORY-004 · Take a deposit',
  what: 'A client pays a deposit when they book, so no-shows cost the salon nothing.',
  req: 'R2', prompt: PROMPT, state: 'todo', due: 'today',
  acceptance: ['Given a booking, when the client pays, then the slot is held', 'A declined card leaves no held slot'],
};

const project = (over: Partial<StudentProject> = {}): StudentProject => ({
  id: 'p1', name: 'Hair Salon Booking', slug: 'salon', descriptor: '',
  accent: '#367895', cover: '', icon: 'M0 0h1', status: 'ready', createdAt: 1,
  stage: 'Release 1', curStep: 3, size: 'project', idea: '', reqs: [],
  lists: [{ id: 'L1', step: 2, name: 'Release 1 · Payments', sub: '', tasks: [TASK] }],
  activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
  ...over,
});

const buttonSaying = (text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button'))
    .find((b) => (b.textContent || '').trim() === text);

const commandCenterLink = (): HTMLAnchorElement | undefined =>
  Array.from(container.querySelectorAll('a'))
    .find((a) => (a.textContent || '').includes('Command Center'));

// ── the prompt does not own the column ────────────────────────────────────────
describe('the Claude Code prompt is collapsed until asked for', () => {
  beforeEach(() => { mockProject = project(); });

  it('renders no full prompt body on arrival', async () => {
    await mount();

    expect(container.querySelector('.rt-prompt-full')).toBeNull();
    expect(container.querySelector('pre')).toBeNull();
    // The prompt is still recognisable — a clamped peek, not a 340px slab.
    expect(container.querySelector('.rt-prompt-peek')!.textContent).toContain('Build the deposit-taking slice');
  });

  it('offers "Show the full prompt", reporting collapsed state to assistive tech', async () => {
    await mount();

    const toggle = buttonSaying('Show the full prompt');
    expect(toggle).toBeTruthy();
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands to the whole prompt on request, and collapses back', async () => {
    await mount();

    await act(async () => {
      buttonSaying('Show the full prompt')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const full = container.querySelector('.rt-prompt-full');
    expect(full).toBeTruthy();
    expect(full!.textContent).toContain('Add a failure-path test for a declined card.');
    expect(buttonSaying('Hide the full prompt')!.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      buttonSaying('Hide the full prompt')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.rt-prompt-full')).toBeNull();
  });

  it('keeps Copy reachable while collapsed — collapsing must not cost the student the action', async () => {
    await mount();

    const copy = buttonSaying('Copy');
    expect(copy).toBeTruthy();
    expect(copy!.disabled).toBe(false);
  });
});

// ── the story leads, and acceptance is something you tick ─────────────────────
describe('the page reads story first, then done means, then how to build it', () => {
  beforeEach(() => { mockProject = project(); });

  it('puts the story above the build section', async () => {
    await mount();

    const lead = container.querySelector('.rt-lead');
    const build = container.querySelector('.rt-prompt-h');
    expect(lead!.textContent).toContain('no-shows cost the salon nothing');
    expect(lead!.compareDocumentPosition(build!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders acceptance as a checkable list with a live count', async () => {
    await mount();

    const boxes = container.querySelectorAll<HTMLInputElement>('.rt-acc input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(container.querySelector('.rt-step-c')!.textContent).toBe('0 of 2');

    await act(async () => { boxes[0].click(); });
    expect(container.querySelector('.rt-step-c')!.textContent).toBe('1 of 2');
  });
});

// ── the Command Center link ───────────────────────────────────────────────────
describe('the Command Center link', () => {
  it('opens the student\'s Command Center in a new tab when the backend has a URL', async () => {
    mockProject = project({ commandCenterUrl: 'https://salon-cc.example.com/' });
    await mount();

    const link = commandCenterLink();
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('https://salon-cc.example.com/');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toBe('noreferrer');
  });

  it('renders nothing at all before the student has deployed one', async () => {
    mockProject = project();          // field absent — the whole of week one
    await mount();

    expect(commandCenterLink()).toBeUndefined();
  });

  it('renders nothing when the backend explicitly reports null', async () => {
    mockProject = project({ commandCenterUrl: null });
    await mount();

    expect(commandCenterLink()).toBeUndefined();
  });
});
