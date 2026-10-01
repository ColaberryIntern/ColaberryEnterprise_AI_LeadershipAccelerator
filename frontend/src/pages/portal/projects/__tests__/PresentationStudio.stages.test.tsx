import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PresentationStudio from '../presentation/PresentationStudio';
import { PRESENTATION_STAGES, readSavedStage, studentTitleFor } from '../presentation/presentationStages';
import type { ProjectTask } from '../projectsStore';

jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../projectSync', () => ({ refreshProjectsFromBackend: jest.fn().mockResolvedValue(undefined) }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

function mount(storyId: string, extra: Partial<ProjectTask> = {}) {
  const task = { id: 't1', storyId, title: 'x', state: 'todo', due: 'today', ...extra } as unknown as ProjectTask;
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<PresentationStudio task={task} projectId="p1" taskId={storyId} points={40} />);
  });
}

const click = (el: Element | null) => act(() => {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

const stageBtn = (id: string) => container.querySelector(`[data-testid="ps-stage-${id}"]`);
const currentStage = () => container.querySelector('[aria-current="step"]')?.textContent || '';

/**
 * The Studio is a workspace laid OVER a demo-prep task. The thing most worth proving
 * is not that the new chrome renders — it is that none of the old guarantees were
 * quietly dropped on the way: the evidence panel still does the handing in, PREP-6 is
 * still staff-only, and a stage with no machinery yet offers no button that lies.
 */
describe('Presentation Studio — six stages over the existing prep task', () => {
  it('renders all six stages, in order, as a navigable rail', () => {
    mount('PREP-3');
    const labels = Array.from(container.querySelectorAll('.ps-rail button'))
      .map((b) => (b.textContent || '').replace(/Step \d+/, '').trim());
    expect(labels).toEqual(['Learn', 'Prepare', 'Build', 'Practice', 'Present', 'Reflect & Share']);
    expect(PRESENTATION_STAGES).toHaveLength(6);
  });

  it.each([
    ['PREP-1', 'Prepare'],
    ['PREP-3', 'Build'],
    ['PREP-4', 'Practice'],
    ['PREP-6', 'Present'],
  ])('%s opens on the stage that matches what it actually asks for (%s)', (storyId, expected) => {
    mount(storyId);
    expect(currentStage()).toContain(expected);
  });

  it('the evidence panel — the thing that actually hands work in — is mounted on the opening stage', () => {
    mount('PREP-3');
    // The guide heading and the submit control both come from DemoEvidencePanel.
    expect(container.textContent).toContain('Hand it in');
    expect(container.querySelector('input, textarea')).not.toBeNull();
  });

  it('PREP-6 stays staff-marked inside the Studio — no form appears anywhere on it', () => {
    // The whole point of PREP-6 is that nobody can vouch for themselves. Wrapping it
    // in a nicer workspace must not hand the student a box to type into.
    mount('PREP-6');
    expect(container.querySelector('input, textarea')).toBeNull();
    expect(container.textContent).toMatch(/staff/i);
  });

  it('moving between stages works, and coming back resumes where the student left off', () => {
    mount('PREP-3');
    expect(currentStage()).toContain('Build');

    click(stageBtn('learn'));
    expect(currentStage()).toContain('Learn');
    expect(readSavedStage('p1', 'PREP-3')).toBe('learn');

    // Remount, as a page refresh would.
    act(() => root?.unmount());
    root = null;
    mount('PREP-3');
    expect(currentStage()).toContain('Learn');
  });

  it('a stage whose machinery has not shipped says so and offers NO control', () => {
    mount('PREP-3');
    click(stageBtn('present'));
    const pending = container.querySelector('[data-testid="ps-pending"]');
    expect(pending).not.toBeNull();
    // Nothing clickable inside the honest placeholder — a dead button teaches a
    // student the platform is broken; a plain sentence does not.
    expect(pending!.querySelector('button, a, input')).toBeNull();
  });

  it('boundary: an unrecognised story id still renders a usable workspace', () => {
    mount('PREP-99');
    expect(currentStage()).toContain('Learn');
    expect(container.querySelector('.ps-rail')).not.toBeNull();
  });

  it('failure path: localStorage throwing does not take the workspace down', () => {
    const spy = jest.spyOn(window.localStorage.__proto__ as Storage, 'getItem')
      .mockImplementation(() => { throw new Error('private window'); });
    try {
      expect(() => mount('PREP-3')).not.toThrow();
      expect(currentStage()).toContain('Build');
    } finally {
      spy.mockRestore();
    }
  });

  it('shows the student-facing title AND keeps the PREP id visible', () => {
    // The title is a DISPLAY override — the stored task, its id, its evidence and its
    // points are untouched. The id stays on screen so a student saying "PREP-3" to a
    // mentor and a mentor searching for it still meet in the middle.
    mount('PREP-3', { title: 'Build the slides — what it does, who for, the number it moves' } as any);
    expect(container.textContent).toContain('Build Your AI Presentation');
    expect(container.textContent).toContain('PREP-3');
  });

  it.each([
    ['PREP-1', "Tell Your Project's Story"],
    ['PREP-2', 'Your First Recorded Walkthrough'],
    ['PREP-4', 'Rehearse With an Audience'],
    ['PREP-5', 'Create Your Portfolio Demo'],
    ['PREP-6', 'Present Your Project Live'],
  ])('%s shows its student-facing title', (storyId, expected) => {
    mount(storyId);
    expect(container.textContent).toContain(expected);
  });

  it('falls back to the stored title rather than inventing one', () => {
    // An unknown id has no override. Showing a made-up name would be worse than
    // showing the real stored one.
    expect(studentTitleFor('PREP-99')).toBeNull();
    mount('PREP-99', { title: 'Some stored task name' } as any);
    expect(container.textContent).toContain('Some stored task name');
  });

  it('every stage button is reachable and labelled for assistive tech', () => {
    mount('PREP-1');
    const nav = container.querySelector('nav[aria-label="Presentation stages"]');
    expect(nav).not.toBeNull();
    const buttons = container.querySelectorAll('.ps-rail button');
    expect(buttons).toHaveLength(6);
    buttons.forEach((b) => {
      expect(b.tagName).toBe('BUTTON');            // focusable natively, not a div
      expect((b.textContent || '').trim().length).toBeGreaterThan(0);
    });
    // Exactly one current step at a time.
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });
});
