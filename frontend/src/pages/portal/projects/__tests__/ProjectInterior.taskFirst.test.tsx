/**
 * ProjectInterior — the next task comes first, and one drawer serves everyone.
 *
 * Three things a student reported, all on the same screen:
 *
 *  1. Clicking "Open build" on a feed card opened the project with nothing on
 *     the right. The drawer state lived inside this component, so anything
 *     arriving from outside it could not ask for a task.
 *  2. Scrolling behaved differently inside a build than on the overview: the
 *     overview's next task rides up into the page header, the interior's stuck
 *     halfway down (`.pj-nexthero-pinned`, now removed).
 *  3. The project's cover and name came first, so the thing to actually DO was
 *     below the fold on a small screen.
 *
 * Uses the `createRoot` + `act` pattern already proven in this repo — there is
 * no `@testing-library/*` dependency here and adding one for a test would be a
 * drive-by install.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../ProjectWorkspaceDrawer', () => ({
  __esModule: true,
  default: ({ task, open }: any) => (
    open ? <div data-testid="drawer">{task ? task.title : 'no task'}</div> : null
  ),
}));

import ProjectInterior from '../ProjectInterior';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount(ui: React.ReactElement) {
  await act(async () => { root = createRoot(container); root.render(ui); });
}

const task = (id: string, title: string, over: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id, title, storyId: id, state: 'todo', due: 'up', what: `do ${id}`, ...over });

const PROJECT: StudentProject = {
  id: 'p1', name: 'Client Onboarding Concierge', slug: 'coc',
  descriptor: 'runs a new client\'s first week',
  accent: '#367895', cover: 'linear-gradient(#000,#111)', icon: 'M0 0h1',
  status: 'ready', createdAt: 1, stage: 'Release 0', curStep: 2, size: 'project',
  idea: 'x', reqs: [],
  lists: [{
    id: 'L0', step: 2, name: 'Release 0 · Initial Setup', sub: '',
    tasks: [task('STORY-000', 'Build your Command Center'), task('STORY-001', 'Read and approve agreements')],
  }],
  activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
};

const noop = () => { /* */ };

describe('the next task is the first thing on the page', () => {
  it('renders the next action ABOVE the project header', async () => {
    await mount(
      <ProjectInterior project={PROJECT} onBack={noop} openTaskId={null} onOpenTask={noop} />,
    );

    const hero = container.querySelector('.te-hero');
    const header = container.querySelector('.pj-head');
    expect(hero).toBeTruthy();
    expect(header).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING === the header comes after the hero.
    expect(hero!.compareDocumentPosition(header!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('names the actual next task in the hero, not the project', async () => {
    await mount(
      <ProjectInterior project={PROJECT} onBack={noop} openTaskId={null} onOpenTask={noop} />,
    );

    expect(container.querySelector('.te-hero h2')!.textContent).toBe('Build your Command Center');
  });

  it('condenses with the page header, the same mechanism the overview uses', async () => {
    await mount(
      <ProjectInterior project={PROJECT} onBack={noop} openTaskId={null} onOpenTask={noop} condensed />,
    );

    const body = container.querySelector('.te-condense-body');
    expect(body).toBeTruthy();
    expect(body!.className).toContain('is-condensed');
    // The rule that pinned it halfway down the page is gone.
    expect(container.querySelector('.pj-nexthero-pinned')).toBeNull();
  });
});

describe('one drawer, driven from anywhere', () => {
  it('opens the task the PAGE asked for — the feed-card case', async () => {
    // Arriving from "Open build" on a feed card about STORY-001.
    await mount(
      <ProjectInterior project={PROJECT} onBack={noop} openTaskId="STORY-001" onOpenTask={noop} />,
    );

    expect(container.querySelector('[data-testid="drawer"]')!.textContent)
      .toBe('Read and approve agreements');
  });

  it('shows nothing on the right when no task was asked for', async () => {
    await mount(
      <ProjectInterior project={PROJECT} onBack={noop} openTaskId={null} onOpenTask={noop} />,
    );

    expect(container.querySelector('[data-testid="drawer"]')).toBeNull();
  });

  it('reports a task the student opens back up to the page', async () => {
    const opened: (string | null)[] = [];
    await mount(
      <ProjectInterior project={PROJECT} onBack={noop} openTaskId={null} onOpenTask={(id) => opened.push(id)} />,
    );

    // The button carries an icon alongside its label, so match on trimmed text.
    const open = Array.from(container.querySelectorAll('button'))
      .find((b) => (b.textContent || '').trim().toLowerCase() === 'open');
    expect(open).toBeTruthy();
    await act(async () => { open!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(opened).toEqual(['STORY-000']);
  });

  it('refuses to open a blocked task, even when asked directly', async () => {
    // The release gate is the point; arriving from a stale link must not bypass it.
    const gated: StudentProject = {
      ...PROJECT,
      lists: [{
        ...PROJECT.lists[0],
        tasks: [task('STORY-000', 'Build your Command Center'),
          task('STORY-009', 'Optimise performance', { blockedBy: ['STORY-000'] })],
      }],
    };

    await mount(
      <ProjectInterior project={gated} onBack={noop} openTaskId="STORY-009" onOpenTask={noop} />,
    );

    expect(container.querySelector('[data-testid="drawer"]')).toBeNull();
  });
});
