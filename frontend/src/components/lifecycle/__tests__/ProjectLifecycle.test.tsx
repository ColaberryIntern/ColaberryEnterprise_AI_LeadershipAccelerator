import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes } from 'react-router-dom';
import ProjectLifecycleHeader from '../ProjectLifecycleHeader';
import ProjectStageNav from '../ProjectStageNav';
import lifecycleRoutes, { LIFECYCLE_PATH } from '../../../routes/lifecycleRoutes';
import type { LifecycleStatus } from '../../../services/projectLifecycleApi';

jest.mock('../../../utils/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../utils/api').default as { get: jest.Mock };

const STAGES = ['discovery', 'requirements_ready', 'process_ready', 'allocation_ready'];

const status = (over: Partial<LifecycleStatus> = {}): LifecycleStatus => ({
  projectId: 'p-1',
  kind: 'delivery',
  stage: 'requirements_ready',
  condition: null,
  conditionReason: null,
  completedStages: ['discovery'],
  stages: STAGES,
  nextStage: 'process_ready',
  blockers: [],
  nextActorRole: 'architect',
  nextAction: '1 thing must be resolved.',
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockReset();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const render = (ui: React.ReactElement) => { act(() => { root.render(ui); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

describe('BLOCKED and NOT ASSESSED are rendered DIFFERENTLY', () => {
  // The whole reason a gap carries a `kind`. "The graph has no start node" and "nobody has read
  // the graph" are different findings and lead to different actions; both still block. A merged
  // list would make the second indistinguishable from the first.

  it('an unmet gap renders in the blocked section and NOT in the not-assessed one', () => {
    render(<ProjectLifecycleHeader status={status({
      blockers: [{ rule: 'process_without_tasks', message: 'Process P-1 has no tasks.', subject: 'P-1', kind: 'unmet' }],
    })} />);

    expect(q('lifecycle-state-blocked')).not.toBeNull();
    expect(q('lifecycle-blocked-section')).not.toBeNull();
    expect(q('lifecycle-blocked-gaps')!.textContent).toContain('no tasks');

    expect(q('lifecycle-state-not-assessed')).toBeNull();
    expect(q('lifecycle-not-assessed-section')).toBeNull();
    expect(q('lifecycle-state-ready')).toBeNull();
  });

  it('a not-assessed gap renders in the not-assessed section and NOT in the blocked one', () => {
    render(<ProjectLifecycleHeader status={status({
      blockers: [{ rule: 'graph_unread', message: 'Nobody has read the process graph.', kind: 'not_assessed' }],
    })} />);

    expect(q('lifecycle-state-not-assessed')).not.toBeNull();
    expect(q('lifecycle-not-assessed-section')).not.toBeNull();
    expect(q('lifecycle-not-assessed-gaps')!.textContent).toContain('Nobody has read');

    expect(q('lifecycle-state-blocked')).toBeNull();
    expect(q('lifecycle-blocked-section')).toBeNull();
    expect(q('lifecycle-state-ready')).toBeNull();
  });

  it('both kinds at once render in SEPARATE sections, never merged', () => {
    render(<ProjectLifecycleHeader status={status({
      blockers: [
        { rule: 'a', message: 'measured and failing', kind: 'unmet' },
        { rule: 'b', message: 'nobody looked', kind: 'not_assessed' },
      ],
    })} />);

    expect(q('lifecycle-blocked-gaps')!.textContent).toContain('measured and failing');
    expect(q('lifecycle-blocked-gaps')!.textContent).not.toContain('nobody looked');
    expect(q('lifecycle-not-assessed-gaps')!.textContent).toContain('nobody looked');
    expect(q('lifecycle-not-assessed-gaps')!.textContent).not.toContain('measured and failing');
  });

  it('READY is its own state, not the absence of a badge', () => {
    render(<ProjectLifecycleHeader status={status({ blockers: [] })} />);
    expect(q('lifecycle-state-ready')).not.toBeNull();
    expect(q('lifecycle-state-blocked')).toBeNull();
    expect(q('lifecycle-state-not-assessed')).toBeNull();
  });

  it('names the next actor, because "who acts next" is the question the header answers', () => {
    render(<ProjectLifecycleHeader status={status({ nextActorRole: 'architect' })} />);
    expect(q('lifecycle-next-actor')!.textContent).toContain('architect');
    expect(q('lifecycle-next-action')!.textContent).toContain('must be resolved');
  });
});

describe('the stage ladder comes from the server', () => {
  it('marks current, complete and pending distinctly', () => {
    render(<ProjectStageNav status={status()} stages={STAGES} />);
    expect(q('lifecycle-stage-requirements_ready')!.getAttribute('data-stage-state')).toBe('current');
    expect(q('lifecycle-stage-discovery')!.getAttribute('data-stage-state')).toBe('complete');
    expect(q('lifecycle-stage-process_ready')!.getAttribute('data-stage-state')).toBe('pending');
  });

  it('takes completed stages from the status, not from an index into the ladder', () => {
    // A project that took a return edge has a history an index cannot reconstruct: it sits at an
    // early stage having completed a later one.
    render(<ProjectStageNav
      status={status({ stage: 'discovery', completedStages: ['discovery', 'allocation_ready'] })}
      stages={STAGES}
    />);
    expect(q('lifecycle-stage-allocation_ready')!.getAttribute('data-stage-state')).toBe('complete');
    expect(q('lifecycle-stage-requirements_ready')!.getAttribute('data-stage-state')).toBe('pending');
  });
});

describe('the route is REACHABLE, which is a different claim from the file existing', () => {
  // A component under `pages/` can sit unrouted and look finished. This mounts the real route
  // fragment and asserts the path resolves to the page.

  it('resolves the lifecycle path and renders the page', async () => {
    api.get.mockResolvedValue({ data: status() });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-1?kind=delivery']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
    expect(q('lifecycle-page')).not.toBeNull();
    expect(q('lifecycle-header')).not.toBeNull();
  });

  it('CALLS AN /api PATH — without the prefix the dev server returns index.html with a 200', async () => {
    expect(api.get).not.toHaveBeenCalled();
    // AWAITED, not `return act().then()`. The `.then()` form let jest finish this test while
    // the component effect promise was still pending, and the leak made whichever
    // rejection-based test ran next fail — the failure moved when the tests were reordered,
    // which is what identified it.
    api.get.mockResolvedValue({ data: status() });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/admin/project-lifecycle/p-9?kind=student']}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
    const [url, config] = api.get.mock.calls[0];
    expect(url).toContain('/api/admin/project-lifecycle/');
    expect(url.startsWith('/api/')).toBe(true);
    expect(config.params.kind).toBe('student');
  });

  it('surfaces a failure instead of swallowing it into an empty page', async () => {
    api.get.mockImplementation(() => Promise.reject({ response: { data: { error: 'boom' } } }));
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/admin/project-lifecycle/p-1`]}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
    expect(q('lifecycle-error')!.textContent).toContain('boom');
    expect(q('lifecycle-page')).toBeNull();
  });

  it('renders the DISABLED answer explicitly, never an empty state', async () => {
    // A disabled feature showing nothing is indistinguishable from a project with nothing to show.
    // `mockImplementation` rather than `mockRejectedValue`: the latter builds ONE already-
    // rejected promise at setup time, and this suite leaves a pending call in flight from the
    // preceding test, which was enough to stop it settling inside `act`. A fresh rejection per
    // call has no such history.
    api.get.mockImplementation(() => Promise.reject({
      response: { data: { lifecycleDisabled: true, error: 'not enabled', remedy: 'set ENABLE_PROJECT_LIFECYCLE=true' } },
    }));
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/admin/project-lifecycle/p-1`]}>
          <Routes>{lifecycleRoutes}</Routes>
        </MemoryRouter>,
      );
    });
    // One more flush: the rejection settles a microtask after the render, and the preceding
    // test leaves a resolved promise in flight on the same root.
    await act(async () => { await Promise.resolve(); });
    expect(q('lifecycle-disabled')!.textContent).toContain('ENABLE_PROJECT_LIFECYCLE');
    expect(q('lifecycle-page')).toBeNull();
  });

  it('the exported path is the one adminRoutes mounts', () => {
    expect(LIFECYCLE_PATH).toBe('/admin/project-lifecycle/:projectId');
  });
});
