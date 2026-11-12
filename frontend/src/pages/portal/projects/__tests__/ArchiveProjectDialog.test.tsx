/**
 * The confirmation a student reads before deleting their own build.
 *
 * The property under test is that the copy is SPECIFIC and TRUE. "Are you sure?"
 * would pass no test worth writing; "This removes 21 tasks across 6 lists, your
 * published plan, 3 stories the platform has confirmed" can be checked against
 * the live counts it claims to be quoting, and is checked here.
 *
 * The points paragraph gets its own tests because it is the one place the dialog
 * could easily lie by omission. `evidence_records` and `xp_events` are
 * ENROLLMENT-scoped with no `project_id`, so awarded points really do survive an
 * archive and really do NOT come back on restore — they never left. Both
 * directions are asserted, because a student who expects either behaviour and
 * gets the other has been misled.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { ArchivePreview } from '../projectArchiveApi';

const PROJECT_ID = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

let mockPreviewResult: { ok: true; value: ArchivePreview } | { ok: false; error: { message: string; status?: number } };
let mockArchiveResult: { ok: true; value: any } | { ok: false; error: { message: string; status?: number } };
const mockArchiveCalls: { projectId: string; confirmName: string }[] = [];

// CRA sets `resetMocks: true`, so a factory returning `jest.fn()` is reset to an
// undefined-returning stub before each test. Plain functions closing over
// module-level state are the pattern this repo uses instead.
jest.mock('../projectArchiveApi', () => ({
  __esModule: true,
  fetchArchivePreview: async () => mockPreviewResult,
  archiveProject: async (projectId: string, confirmName: string) => {
    mockArchiveCalls.push({ projectId, confirmName });
    return mockArchiveResult;
  },
}));

import ArchiveProjectDialog, {
  buildLossLines, buildActiveLine, buildPointsLine,
} from '../ArchiveProjectDialog';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function preview(over: Partial<ArchivePreview> = {}): ArchivePreview {
  return {
    project_id: PROJECT_ID,
    name: 'Student Early Warning',
    is_active: true,
    task_count: 21,
    completed_task_count: 1,
    task_list_count: 6,
    confirmed_story_count: 3,
    has_published_plan: true,
    points_awarded: 53,
    repo_connected: true,
    repo_full_name: 'ColaberryIntern/AcceleratorTesting',
    next_active_project_id: null,
    next_active_project_name: null,
    ...over,
  };
}

let container: HTMLDivElement;
let root: Root;
let archivedWith: string[] = [];
let cancelled = 0;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  mockPreviewResult = { ok: true, value: preview() };
  mockArchiveResult = { ok: true, value: { changed: true } };
  mockArchiveCalls.length = 0;
  archivedWith = [];
  cancelled = 0;
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(
      <div className="pj-root">
        <ArchiveProjectDialog
          projectId={PROJECT_ID}
          fallbackName="Your build"
          onCancel={() => { cancelled += 1; }}
          onArchived={(id) => { archivedWith.push(id); }}
        />
      </div>,
    );
  });
}

const text = () => (container.textContent || '').replace(/\s+/g, ' ');
const input = () => container.querySelector('.pja-input') as HTMLInputElement;
const deleteBtn = () => Array.from(container.querySelectorAll('button'))
  .find((b) => (b.textContent || '').trim().startsWith('Delete this build')) as HTMLButtonElement;
const keepBtn = () => Array.from(container.querySelectorAll('button'))
  .find((b) => (b.textContent || '').trim() === 'Keep it') as HTMLButtonElement;

async function type(value: string) {
  const el = input();
  await act(async () => {
    // React tracks the value on the DOM node; setting `.value` directly is
    // invisible to it, so the native setter has to be used before dispatching.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// ─── the copy quotes the live counts ─────────────────────────────────────────
describe('the confirmation names exactly what the student is giving up', () => {
  it('quotes the tasks, lists, plan, confirmed stories and repo from the preview', async () => {
    await mount();
    const t = text();

    expect(t).toContain('21 tasks across 6 lists');
    expect(t).toContain('your published plan');
    expect(t).toContain('3 stories the platform has confirmed');
    expect(t).toContain('ColaberryIntern/AcceleratorTesting');
  });

  it('leads with reversibility, because it changes how carefully the rest is read', async () => {
    await mount();
    // The wording changed when the control was renamed to Delete: "Nothing is deleted" would now
    // contradict the button. The PROPERTY is unchanged and is what is asserted - the dialog leads
    // with recoverability and says where to get it back from.
    expect(text()).toContain('It is recoverable');
    expect(text()).toContain('nothing is erased');
    expect(text()).toContain('Deleted builds');
  });

  it('names the project in the heading', async () => {
    await mount();
    const heading = container.querySelector('#pja-title');
    expect(heading!.textContent).toBe('Delete “Student Early Warning”?');
  });

  it('does NOT claim a published plan when there is none', async () => {
    mockPreviewResult = { ok: true, value: preview({ has_published_plan: false }) };
    await mount();
    expect(text()).not.toContain('your published plan');
  });

  it('does NOT claim a repo when none is connected', async () => {
    mockPreviewResult = { ok: true, value: preview({ repo_connected: false, repo_full_name: null }) };
    await mount();
    expect(text()).not.toContain('its link to');
  });

  it('says the build is empty rather than listing nothing at all', () => {
    const lines = buildLossLines(preview({
      task_count: 0, task_list_count: 0, completed_task_count: 0,
      confirmed_story_count: 0, has_published_plan: false, repo_connected: false, repo_full_name: null,
    }));
    expect(lines).toEqual(['nothing yet — this build is empty']);
  });

  it('uses singular wording for a one-task, one-list, one-story build', () => {
    const lines = buildLossLines(preview({
      task_count: 1, task_list_count: 1, completed_task_count: 0, confirmed_story_count: 1,
      has_published_plan: false, repo_connected: false, repo_full_name: null,
    }));
    expect(lines[0]).toBe('1 task across 1 list');
    expect(lines[1]).toBe('1 story the platform has confirmed');
  });

  it('mentions completions only when there are some', () => {
    expect(buildLossLines(preview({ completed_task_count: 0 }))[0])
      .toBe('21 tasks across 6 lists');
    expect(buildLossLines(preview({ completed_task_count: 7 }))[0])
      .toBe('21 tasks across 6 lists — 7 you have completed');
  });
});

// ─── one vocabulary, end to end ──────────────────────────────────────────────
describe('the dialog speaks one word for the action, everywhere', () => {
  // THIS IS THE TEST THAT WAS MISSING. The first rename changed the heading, the
  // lead paragraph and the confirm word, and left the BUTTON saying "Remove this
  // build" and the hint telling the student to restore from "Removed builds" - a
  // section that had just been renamed to "Deleted builds". It shipped to
  // production green, because every test that touched the old wording was
  // matching the old wording, including the helper that finds the button.
  //
  // Asserting the absence of the old vocabulary is what makes a partial rename
  // fail. Asserting the presence of the new wording never could: both can be
  // true at once, and for one deploy they were.
  it('never shows the word Remove anywhere a student can read it', async () => {
    await mount();
    const t = text();

    expect(t).not.toMatch(/Remove/);
    expect(t).not.toMatch(/Removing/);
    expect(t).not.toMatch(/Removed/);
  });

  it('names the restore section exactly as the Projects page labels it', async () => {
    await mount();
    // ProjectsPage renders <div className="pjb-archived-h">Deleted builds</div>.
    // An instruction pointing at any other label sends the student looking for
    // something that is not on the page.
    expect(text()).toContain('Deleted builds');
    expect(text()).not.toContain('Removed builds');
  });

  it('labels the confirm button with the same verb as the heading', async () => {
    await mount();
    const heading = container.querySelector('#pja-title')!.textContent || '';
    const button = deleteBtn().textContent || '';

    expect(heading).toContain('Delete');
    expect(button).toContain('Delete');
  });

  it('uses the same verb in the two sentences built outside the markup', () => {
    // buildActiveLine is pure, so this needs no mounting and no fake timers -
    // which is the point: the earlier version of this test staged an in-flight
    // request it never actually inspected.
    expect(buildActiveLine(preview({
      next_active_project_id: 'x', next_active_project_name: 'Older Build',
    }))).toContain('Deleting it');
    expect(buildActiveLine(preview())).toContain('Deleting it');
    expect(buildActiveLine(preview())).not.toContain('Removing');
  });
});

// ─── the points truth ────────────────────────────────────────────────────────
describe('it is truthful about points, in both directions', () => {
  it('says the points stay, and that restoring does not re-award them', async () => {
    await mount();
    const t = text();

    expect(t).toContain('Your 53 points stay yours');
    expect(t).toContain('banked to your account rather than to a project');
    expect(t).toContain('putting it back does not award them again');
  });

  it('says nothing about points when none were awarded', () => {
    expect(buildPointsLine(preview({ points_awarded: 0 }))).toBeNull();
  });

  it('never claims points will be removed', async () => {
    await mount();
    const t = text().toLowerCase();
    expect(t).not.toContain('lose your points');
    expect(t).not.toContain('points will be removed');
  });
});

// ─── what happens to the current build ───────────────────────────────────────
describe('it says where the student lands afterwards', () => {
  it('names the build they will be moved to', () => {
    const line = buildActiveLine(preview({
      next_active_project_id: '40a5cea6-ace8-4734-8220-7e62df2111e5',
      next_active_project_name: 'Older Build',
    }));
    expect(line).toBe('This is your current build. Deleting it moves you to Older Build.');
  });

  it('warns when this is their only build', () => {
    expect(buildActiveLine(preview())).toContain('leaves you with no active build');
  });

  it('says nothing when the build is not the active one', () => {
    expect(buildActiveLine(preview({ is_active: false }))).toBeNull();
  });
});

// ─── the deliberate act ──────────────────────────────────────────────────────
describe('deletion requires typing the project name', () => {
  it('keeps the remove button disabled until the name matches', async () => {
    await mount();
    expect(deleteBtn().disabled).toBe(true);

    await type('Student Early');
    expect(deleteBtn().disabled).toBe(true);

    await type('Student Early Warning');
    expect(deleteBtn().disabled).toBe(false);
  });

  it('accepts a different case but not a different name', async () => {
    await mount();
    await type('student early warning');
    expect(deleteBtn().disabled).toBe(false);

    await type('Some Other Build');
    expect(deleteBtn().disabled).toBe(true);
  });

  it('does not call the API at all while the name does not match', async () => {
    await mount();
    await type('nope');
    await act(async () => { deleteBtn().dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mockArchiveCalls).toEqual([]);
  });

  it('archives once the name matches, and reports back', async () => {
    await mount();
    await type('Student Early Warning');
    await act(async () => { deleteBtn().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(mockArchiveCalls).toHaveLength(1);
    expect(mockArchiveCalls[0].projectId).toBe(PROJECT_ID);
    expect(archivedWith).toEqual([PROJECT_ID]);
  });

  it('asks for the literal word DELETE when the build has no name', async () => {
    mockPreviewResult = { ok: true, value: preview({ name: null }) };
    await mount();

    expect(text()).toContain('This build has no name yet');
    expect(deleteBtn().disabled).toBe(true);
    await type('DELETE');
    expect(deleteBtn().disabled).toBe(false);
  });

  it('offers a way out that does not remove anything', async () => {
    await mount();
    await act(async () => { keepBtn().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(cancelled).toBe(1);
    expect(mockArchiveCalls).toEqual([]);
  });
});

// ─── failure paths ───────────────────────────────────────────────────────────
describe('it surfaces the server’s refusal rather than a spinner', () => {
  it("shows the platform-project refusal message verbatim", async () => {
    mockPreviewResult = {
      ok: false,
      error: { status: 403, message: 'This project is part of the platform itself and cannot be archived.' },
    };
    await mount();

    expect(text()).toContain('This project is part of the platform itself and cannot be archived.');
    // And there is no way to proceed from that state.
    expect(deleteBtn()).toBeUndefined();
    expect(input()).toBeNull();
  });

  it('keeps the dialog open and reports the error when the archive itself fails', async () => {
    mockArchiveResult = { ok: false, error: { status: 500, message: 'Something went wrong.' } };
    await mount();
    await type('Student Early Warning');
    await act(async () => { deleteBtn().dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(archivedWith).toEqual([]);
    expect(container.querySelector('.pja-err')!.textContent).toBe('Something went wrong.');
    // Re-armed, not stuck on "Deleting…".
    expect(deleteBtn().disabled).toBe(false);
  });
});
