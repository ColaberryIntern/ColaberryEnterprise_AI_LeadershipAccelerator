/**
 * The list card wears the project INTERIOR's clothes.
 *
 * Ali: "the cards on the pre project select screen look different from the post
 * project select screen. they should look like the latter."
 *
 * These assertions are on CLASS NAMES rather than on rendered pixels, and that is
 * deliberate: the requirement is not "looks similar", it is "reuses the
 * interior's implementation instead of a parallel one", because two
 * implementations of one look is exactly how the two screens drifted apart. A
 * visual test would pass on a second copy of the styles; a class-name test only
 * passes when the interior's own classes are what render.
 *
 * The paired negative assertions matter as much as the positive ones. Keeping
 * `.pj-bc-cover` alongside a new `.pjt-card` would satisfy every positive check
 * while leaving the old banner treatment on screen.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { StudentProject, ProjectTask } from '../projectsStore';

jest.mock('../../useIsExplorer', () => ({ useIsExplorer: () => false }));
jest.mock('../NextSessionStrip', () => ({ __esModule: true, default: () => null }));
jest.mock('../ProjectsNextStepHero', () => ({ __esModule: true, default: () => null }));
jest.mock('../../today/PortalShell', () => ({ __esModule: true, default: () => null }));
jest.mock('react-router-dom', () => ({ useNavigate: () => () => {} }));

import { BuildCard } from '../ProjectsPage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: string, state: ProjectTask['state'] = 'todo'): ProjectTask =>
  ({ id, title: id, storyId: id, state, due: state === 'done' ? 'done' : 'up' });

function project(over: Partial<StudentProject> = {}): StudentProject {
  return {
    id: 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef',
    name: 'Student Early Warning',
    slug: 'student-early-warning',
    descriptor: 'watches who is falling behind',
    accent: '#367895', cover: 'linear-gradient(120deg,#367895,#5BA63C)', icon: 'M5 4h11l4 4v12H5z',
    status: 'ready', createdAt: 1, stage: 'Release 0 · Trust Spine', curStep: 2, size: 'project',
    idea: 'x',
    reqs: [
      { id: 'REQ-001', name: 'REQ-001', kind: 'FUNC', state: 'verified' },
      { id: 'REQ-002', name: 'REQ-002', kind: 'FUNC', state: 'planned' },
    ],
    lists: [{
      id: 'l1', step: 2, name: 'Release 0', sub: '',
      tasks: [task('STORY-000', 'done'), task('STORY-001'), task('STORY-002')],
    }],
    activity: [], preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
    origin: 'pipeline', pipelineProjectId: 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef',
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;
let opened = 0;
let removeClicked = 0;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  opened = 0;
  removeClicked = 0;
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount(p: StudentProject, withRemove = true) {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <div className="pj-root">
        <BuildCard
          p={p}
          onOpen={() => { opened += 1; }}
          onRemove={withRemove ? () => { removeClicked += 1; } : null}
        />
      </div>,
    );
  });
}

const byText = (label: string) => Array.from(container.querySelectorAll('button'))
  .find((b) => (b.textContent || '').trim() === label) as HTMLButtonElement | undefined;

// ─── it uses the interior's classes ──────────────────────────────────────────
describe('the list card renders the interior treatment', () => {
  it('is a .pjt-card with the interior head/icon/main structure', async () => {
    await mount(project());

    expect(container.querySelector('.pjt-card')).not.toBeNull();
    expect(container.querySelector('.pjt-head')).not.toBeNull();
    expect(container.querySelector('.pjt-ic')).not.toBeNull();
    expect(container.querySelector('.pjt-main')).not.toBeNull();
  });

  it('has the uppercase eyebrow row with a small coloured dot', async () => {
    await mount(project());

    const eyebrow = container.querySelector('.pjt-src');
    expect(eyebrow).not.toBeNull();
    // The dot is `.chip > .sw`, exactly as TaskCard renders it.
    expect(eyebrow!.querySelector('.chip .sw')).not.toBeNull();
  });

  it('uses the interior chip vocabulary for state', async () => {
    await mount(project());

    // `.pj-st` is the interior's requirement chip; `.pj-due` its due chip.
    expect(container.querySelector('.pjt-src .pj-st')).not.toBeNull();
    expect(container.querySelector('.pjt-src .pj-due')).not.toBeNull();
  });

  it('renders the name as .pjt-title and the description as .pjt-sub', async () => {
    await mount(project());

    expect(container.querySelector('.pjt-title')!.textContent).toBe('Student Early Warning');
    expect(container.querySelector('.pjt-sub')!.textContent).toBe('watches who is falling behind');
  });

  it('puts its actions in the interior .pjt-foot / .pw-acts group', async () => {
    await mount(project());

    const foot = container.querySelector('.pjt-foot');
    expect(foot).not.toBeNull();
    expect(foot!.querySelector('.pw-acts')).not.toBeNull();
    expect(foot!.querySelector('.pw-act.open')).not.toBeNull();
  });
});

// ─── it has dropped the old banner treatment ─────────────────────────────────
describe('the old banner-card treatment is gone', () => {
  it('renders no gradient cover banner', async () => {
    await mount(project());
    expect(container.querySelector('.pj-bc-cover')).toBeNull();
    expect(container.querySelector('.pj-bc-stage')).toBeNull();
  });

  it('renders no 48px icon tile and no grey pill stat row', async () => {
    await mount(project());
    expect(container.querySelector('.pj-bc-ic')).toBeNull();
    expect(container.querySelector('.pj-bc-mid')).toBeNull();
    expect(container.querySelector('.pj-bc-stats')).toBeNull();
    expect(container.querySelector('.pj-bc-pad')).toBeNull();
  });

  it('is no longer one big role="button" click target', async () => {
    await mount(project());
    // A card-wide button cannot safely contain a Remove control inside it.
    expect(container.querySelector('[role="button"]')).toBeNull();
  });
});

// ─── it keeps the information the interior does not carry ────────────────────
describe('it keeps the list-only information', () => {
  it('shows the task progress counts', async () => {
    await mount(project());
    expect((container.textContent || '')).toContain('1/3 tasks');
  });

  it('still renders a progress bar', async () => {
    await mount(project());
    const bar = container.querySelector('.pjb-bar > i') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.width).toBe('33%');
  });

  it('shows the verified-requirement count when the build has requirements', async () => {
    await mount(project());
    expect((container.textContent || '')).toContain('1/2 verified');
  });

  it('omits the verified chip entirely when the build has no requirements', async () => {
    // Rather than rendering "0/0 verified", which is noise on a plan whose
    // stories cite no requirement keys — a common shape, not an error.
    await mount(project({ reqs: [] }));
    expect(container.querySelector('.pj-due')).toBeNull();
    expect((container.textContent || '')).not.toContain('verified');
  });

  it('keeps the origin chip that distinguishes a real plan from a template', async () => {
    await mount(project());
    expect((container.textContent || '')).toContain('your tailored plan');
  });

  it('shows the creating state without claiming progress', async () => {
    await mount(project({ status: 'creating' }));
    expect((container.textContent || '')).toContain('Creating…');
  });
});

// ─── the remove control ──────────────────────────────────────────────────────
describe('the remove control sits in the new treatment without being easy to hit', () => {
  it('is a separate button from Open build, and both work', async () => {
    await mount(project());

    const open = byText('Open build');
    const remove = byText('Remove');
    expect(open).toBeDefined();
    expect(remove).toBeDefined();
    expect(open).not.toBe(remove);

    await act(async () => { open!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(opened).toBe(1);
    expect(removeClicked).toBe(0);

    await act(async () => { remove!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(removeClicked).toBe(1);
    expect(opened).toBe(1);
  });

  it('carries an accessible label naming the build it would remove', async () => {
    await mount(project());
    expect(byText('Remove')!.getAttribute('aria-label')).toBe('Remove Student Early Warning');
  });

  it('is absent entirely when removal is not offered', async () => {
    await mount(project(), false);
    expect(byText('Remove')).toBeUndefined();
    // Open build is still there — hiding removal must not disable the card.
    expect(byText('Open build')).toBeDefined();
  });

  it('does not open the build when Remove is clicked', async () => {
    await mount(project());
    await act(async () => { byText('Remove')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // The regression this guards: a card-wide onClick would fire too, opening
    // the build behind the confirmation dialog.
    expect(opened).toBe(0);
  });
});
