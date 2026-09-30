/**
 * "ACTIVE BUILDS" COUNTS THE STUDENT'S BUILDS, NOT THE TRAINING FIXTURE.
 *
 * `read()` in projectsStore re-seeds `sample-salon` whenever it is missing, so
 * the array behind the page ALWAYS carries the training example. The sidebar
 * stat rendered `projects.length` straight, which meant the number was one too
 * high at every value: 0 real builds read "1", 1 read "2", 2 read "3".
 *
 * That is the "Active builds: 2 while the API returned 1" report. It was never a
 * stale cache — it was a fixture being counted as a build the student owns.
 *
 * The second assertion is the other half of the same problem: sitting unlabelled
 * in a panel headed "Your builds", the example reads as the student's own work.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject } from '../projectsStore';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../ProjectsNextStepHero', () => ({ __esModule: true, default: () => null }));
// PortalShell supports a render-prop `children` ((condensed) => node), and the
// overview branch of ProjectsPage uses exactly that form. A mock that only
// handles the node form renders nothing and every assertion below fails for the
// wrong reason.
jest.mock('../../today/PortalShell', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode | ((c: boolean) => React.ReactNode) }) => (
    <div>{typeof children === 'function' ? children(false) : children}</div>
  ),
}));
jest.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));
// No network from a unit test: the page kicks a backend sync on mount.
jest.mock('../projectSync', () => ({
  syncProjectsWithBackend: jest.fn(() => Promise.resolve()),
  refreshProjectsFromBackend: jest.fn(() => Promise.resolve()),
  hydrateProjectById: jest.fn(() => Promise.resolve(null)),
}));

let mockList: StudentProject[] = [];
jest.mock('../projectsStore', () => ({
  ...jest.requireActual('../projectsStore'),
  useProjectsList: () => mockList,
}));

import ProjectsPage from '../ProjectsPage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function project(id: string, over: Partial<StudentProject> = {}): StudentProject {
  return {
    id, name: id, slug: id, descriptor: 'd',
    accent: '#367895', cover: 'linear-gradient(120deg,#367895,#5BA63C)', icon: 'M5 4h11l4 4v12H5z',
    status: 'ready', createdAt: 1, stage: 'Release 0', curStep: 2, size: 'project', idea: 'x',
    reqs: [],
    lists: [{ id: `${id}-l1`, step: 2, name: 'Release 0', sub: '', tasks: [] }],
    activity: [], preview: { toolName: id, summary: '', tools: [], dataSources: [], guardrails: [] },
    origin: 'pipeline', pipelineProjectId: id,
    ...over,
  };
}

const trainingExample = () => project('sample-salon', {
  name: 'Hair Salon Booking & Payments', sample: true, origin: undefined, pipelineProjectId: undefined,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => act(() => { root.render(<ProjectsPage />); });

/** The rendered value of the "Active builds" stat. */
function activeBuildsStat(): string {
  const labels = Array.from(container.querySelectorAll('.te-stat .lab'));
  const stat = labels.find((el) => el.textContent === 'Active builds');
  if (!stat) throw new Error('no "Active builds" stat rendered');
  return stat.parentElement!.querySelector('.num')!.textContent ?? '';
}

describe('the "Active builds" counter', () => {
  it('reads 0 when the student has no builds of their own', () => {
    mockList = [trainingExample()];
    render();
    expect(activeBuildsStat()).toBe('0');
  });

  it('reads 1 when the student has one build', () => {
    mockList = [project('11111111-1111-4111-8111-111111111111'), trainingExample()];
    render();
    expect(activeBuildsStat()).toBe('1');
  });

  it('reads 2 when the student has two builds — the Quincy report', () => {
    mockList = [
      project('11111111-1111-4111-8111-111111111111'),
      project('22222222-2222-4222-8222-222222222222'),
      trainingExample(),
    ];
    render();
    expect(activeBuildsStat()).toBe('2');
  });
});

describe('the training example in the "Your builds" panel', () => {
  it('is still listed — it is a worked build a student can open', () => {
    mockList = [project('11111111-1111-4111-8111-111111111111'), trainingExample()];
    render();
    const names = Array.from(container.querySelectorAll('.pj-sidebuild .nm')).map((n) => n.textContent);
    expect(names.some((n) => n?.includes('Hair Salon Booking & Payments'))).toBe(true);
  });

  it('is NAMED as an example, so it does not read as the student\'s own work', () => {
    mockList = [project('11111111-1111-4111-8111-111111111111'), trainingExample()];
    render();
    const rows = Array.from(container.querySelectorAll('.pj-sidebuild'));
    const sampleRow = rows.find((r) => r.textContent?.includes('Hair Salon'))!;
    const ownRow = rows.find((r) => r.textContent?.includes('11111111'))!;
    expect(sampleRow.querySelector('.pj-sb-tag')?.textContent).toBe('example');
    expect(ownRow.querySelector('.pj-sb-tag')).toBeNull();
  });
});
