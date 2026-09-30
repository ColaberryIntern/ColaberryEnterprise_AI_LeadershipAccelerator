/**
 * TodayShell — "Open" on a Project Task goes to the project workspace.
 *
 * Reported by Ali 2026-09-10: the Project Task drawer showed only a title and
 * a dead "Enter workspace" button. Root cause was the same as the community
 * post defect in #2394 — a `project:<taskId>` item has `card_id: null`, so the
 * client fell back to the ref and opened a card that cannot exist.
 *
 * The first fix put `useNavigate()` inside TimelineCard. CI rejected it: four
 * suites render that tile with no <Router>, and `useNavigate() may be used
 * only in the context of a <Router>` failed 74 times. The routing decision now
 * lives in TodayShell (always inside the portal Router) as a pure helper, and
 * TimelineCard is back to a presentational tile.
 *
 * Two things are pinned here: the decision itself, and that the tile never
 * grows a Router dependency again.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { projectWorkspacePath } from '../shellUtils';
import TimelineCard, { type TimelineFeedCard } from '../../../../components/timeline/TimelineCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const PROJ = 'a1111111-1111-4111-8111-111111111111';
const TASK = 'b2222222-2222-4222-8222-222222222222';

function card(overrides: Partial<TimelineFeedCard> = {}): TimelineFeedCard {
  return {
    id: 'c1', type: 'warmup', student_label: 'Self Study', render_band: 'warmup',
    title: 'A card', subtitle: null, description: null, week: 1, bucket: 'learn', order: 0,
    difficulty: 'core', estimated_time: 5, points: {}, competencies: [], status: 'available',
    quiz_score: null, completed_at: null, video: null, image: null, content: null, blog: null,
    type_thumbnail: null, capabilities: [], author: null,
    ...overrides,
  };
}

describe('projectWorkspacePath', () => {
  it('routes a project task to its workspace, with both ids in the path', () => {
    expect(projectWorkspacePath({ project_id: PROJ, project_task_id: TASK }))
      .toBe(`/portal/projects/workspace/${PROJ}/${TASK}`);
  });

  it('returns null for anything that is not a project task, so the drawer opens as before', () => {
    expect(projectWorkspacePath({})).toBeNull();
    expect(projectWorkspacePath({ project_id: null, project_task_id: null })).toBeNull();
    // Half an address is no address — never build a route with "null" in it.
    expect(projectWorkspacePath({ project_id: PROJ, project_task_id: null })).toBeNull();
    expect(projectWorkspacePath({ project_id: null, project_task_id: TASK })).toBeNull();
  });
});

describe('TimelineCard stays mountable WITHOUT a Router', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => { root = createRoot(container); });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders a project-task tile with no Router in the tree, and hands Open up to the container', async () => {
    // This is the exact condition that broke four suites: no <MemoryRouter>.
    // If anyone reintroduces useNavigate() into the tile, this throws.
    const onOpen = jest.fn();
    const projectCard = card({
      id: `project:${TASK}`, type: 'project_task', student_label: 'Project Task', render_band: 'task',
      project_id: PROJ, project_task_id: TASK,
    });

    await act(async () => { root.render(<TimelineCard card={projectCard} onOpen={onOpen} onWorkspace={onOpen} />); });

    const open = Array.from(container.querySelectorAll('button')).find((b) => /open|start/i.test(b.textContent || ''));
    expect(open).toBeTruthy();
    await act(async () => { open!.click(); });

    // The tile does not navigate. It reports the card; the container decides.
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].project_task_id).toBe(TASK);
    expect(projectWorkspacePath(onOpen.mock.calls[0][0])).toBe(`/portal/projects/workspace/${PROJ}/${TASK}`);
  });
});
