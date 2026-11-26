/**
 * Is the demo publish control actually ON the student's project page?
 *
 * `ConnectedDemoSharePanel.test.tsx` proves what the panel does. It proves nothing about whether
 * anything renders it, and an independent verifier showed the gap by replacing the element in
 * `ProjectInterior.tsx` with `<span />`: the panel's 14 tests, the page's 19, the admin page's 15
 * and both `tsc --noEmit` gates all stayed green while the feature was gone from the product.
 *
 * That is the whole deliverable of this task, so it gets its own assertions, in every direction:
 * present for a build that carries STORY-900, present for a platform-built one that carries no
 * such row but does have a demo, absent when there is nothing to publish, and absent for the
 * seeded sample and for a local build regardless of what the server says.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';
import ProjectInterior from '../ProjectInterior';
import { CONNECTED_DEMO_STORY_ID } from '../connectedDemoStoryId';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
// The readiness card beside the panel makes its own request; silence it so a rejected promise
// from an unrelated card cannot read as this one failing.
jest.mock('../CaseStudyReadinessCard', () => ({ __esModule: true, default: () => null }));

const mockGetShare = jest.fn();
jest.mock('../connectedDemoShareApi', () => {
  const actual = jest.requireActual('../connectedDemoShareApi');
  return {
    ...actual,
    getConnectedDemoShare: (...a: unknown[]) => mockGetShare(...a),
    setConnectedDemoShare: jest.fn(),
  };
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: string, title: string): ProjectTask =>
  ({ id, title, storyId: id, state: 'todo', due: 'up', what: `do ${id}`, points: 57 } as ProjectTask);

function project(over: Partial<StudentProject> = {}, tasks: ProjectTask[] = [task('STORY-001', 'Pick a location')]): StudentProject {
  return {
    id: 'p1', name: 'PropertyPulse AI', slug: 'ppa', descriptor: 'scores properties',
    accent: '#367895', cover: 'linear-gradient(#000,#111)', icon: 'M0 0h1',
    status: 'ready', createdAt: 1, stage: 'Release 0', curStep: 2, size: 'project',
    idea: 'x', reqs: [],
    origin: 'pipeline',
    pipelineProjectId: '11111111-1111-4111-8111-111111111111',
    lists: [{ id: 'L0', step: 2, name: 'Release 0', sub: '', tasks }],
    activity: [],
    preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
    ...over,
  } as unknown as StudentProject;
}

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  root = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  mockGetShare.mockResolvedValue({
    project_id: 'p1', enabled: true, url: '/api/public/demo/tok-abc', has_spec: true, event_count: 3,
  });
});

afterEach(() => {
  // Guarded, so a throwing mount is not buried under a second error from the unmount.
  if (root) act(() => { root!.unmount(); });
  document.body.removeChild(container);
  jest.clearAllMocks();
});

async function mount(p: StudentProject): Promise<void> {
  const noop = () => { /* */ };
  await act(async () => {
    root = createRoot(container);
    root.render(<ProjectInterior project={p} onBack={noop} onOpenTask={noop} />);
  });
}

const panel = () => container.querySelector('[data-testid="connected-demo-share"]');

describe('the publish control is on the page, for the builds that have the story', () => {
  it('renders for a pipeline build whose board carries STORY-900', async () => {
    await mount(project({}, [task('STORY-001', 'Pick a location'), task(CONNECTED_DEMO_STORY_ID, 'Build your connected demo')]));
    expect(panel()).not.toBeNull();
    expect(container.textContent).toContain('Your demo link');
  });

  it('shows the public link once the demo is published', async () => {
    // The end of the chain the whole task exists for: a link on the page that opens the demo.
    await mount(project({}, [task(CONNECTED_DEMO_STORY_ID, 'Build your connected demo')]));
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/api/public/demo/tok-abc');
  });

  it('renders with NO STORY-900 row when the server says this project has a demo', async () => {
    /*
     * The platform-built shape, and the reason the page no longer decides this alone. L13.4
     * retires STORY-900 on projects the platform builds, and those projects have a demo in the
     * artifact store. Gating on the board would mean the projects the platform builds are
     * exactly the projects that can never get a permanent public link.
     */
    await mount(project());
    expect(panel()).not.toBeNull();
    expect(container.textContent).toContain('Your demo link');
  });

  it('does NOT render for a build with no story AND nothing the server can publish', async () => {
    // The negative still has teeth: it is the ANSWER that withholds the card now, not the prop.
    mockGetShare.mockResolvedValue({
      project_id: 'p1', enabled: false, url: null, has_spec: false, event_count: 0,
      can_publish_without_data_model: false, platform_demo_version: null,
    });
    await mount(project());
    expect(panel()).toBeNull();
  });

  it('does NOT render on the seeded sample build, which has no real project to publish', async () => {
    await mount(project({ sample: true } as Partial<StudentProject>, [task(CONNECTED_DEMO_STORY_ID, 'Build your connected demo')]));
    expect(panel()).toBeNull();
  });

  it('does NOT render on a local build, which never went through the pipeline', async () => {
    await mount(project({ origin: 'local' } as Partial<StudentProject>, [task(CONNECTED_DEMO_STORY_ID, 'Build your connected demo')]));
    expect(panel()).toBeNull();
  });

  it('reads the story from the BOARD rather than a flag, using the pipeline project id', async () => {
    // The id matters: the panel talks to an API keyed on the pipeline project, not the local one.
    await mount(project({}, [task(CONNECTED_DEMO_STORY_ID, 'Build your connected demo')]));
    expect(mockGetShare).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
  });
});
