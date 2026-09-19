import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DemoEvidencePanel from '../DemoEvidencePanel';
import { PREP_GUIDE, guideFor, HOW_TO_SHARE } from '../demoPrepGuide';
import type { ProjectTask } from '../projectsStore';

jest.mock('../../../../utils/portalApi', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../projectSync', () => ({ refreshProjectsFromBackend: jest.fn().mockResolvedValue(undefined) }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

function mount(storyId: string, extra: Partial<ProjectTask> = {}) {
  const task = { id: 't1', storyId, title: 'x', state: 'todo', due: 'today', ...extra } as unknown as ProjectTask;
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<DemoEvidencePanel task={task} projectId="p1" taskId={storyId} points={40} />);
  });
}

// A learner who had verified every story in his build wrote in on 2026-09-18
// asking what "Record a first run-through" meant, how to record one, and for a
// sample. The page was the title and a URL box.
describe('a demo-prep task explains itself before it asks for the evidence', () => {
  it('the run-through page says what to record, how to record it, and how to get a link others can open, ABOVE the box', () => {
    mount('PREP-2');
    const text = container.textContent || '';
    expect(text).toContain('What to do');
    expect(text).toContain('the problem, then show the one moment live, then show the guardrail');
    expect(text).toContain('Snipping Tool');
    expect(text).toContain('Anyone with the link can view');
    expect(text).toContain('localhost');
    const guideAt = text.indexOf('What to do');
    const handInAt = text.indexOf('Hand it in');
    expect(guideAt).toBeGreaterThanOrEqual(0);
    expect(handInAt).toBeGreaterThan(guideAt);
    const nums = Array.from(container.querySelectorAll('.rt-step-n')).map((n) => n.textContent);
    expect(nums).toEqual(['1', '2']);
  });

  it('every hand-in prep task has a guide; Demo Day and non-prep ids do not', () => {
    for (const id of ['PREP-1', 'PREP-2', 'PREP-3', 'PREP-4', 'PREP-5']) {
      const g = guideFor(id);
      expect(g && g.what.length > 20 && g.steps.length >= 3).toBe(true);
    }
    expect(guideFor('PREP-6')).toBeNull();
    expect(guideFor('STORY-001')).toBeNull();
    expect(guideFor(undefined)).toBeNull();
  });

  it('both recordings carry the how-to-share step, because a link nobody else can open is not evidence', () => {
    expect(PREP_GUIDE['PREP-2'].steps).toContain(HOW_TO_SHARE);
    expect(PREP_GUIDE['PREP-5'].steps).toContain(HOW_TO_SHARE);
  });

  it('Demo Day stays a staff-marked note with no guide and no form', () => {
    mount('PREP-6');
    expect(container.textContent).not.toContain('What to do');
    expect(container.querySelector('input, textarea')).toBeNull();
  });

  it('a task already handed in shows the confirmation, not the guide', () => {
    mount('PREP-2', { verifiedAt: '2026-09-18T10:00:00Z' } as Partial<ProjectTask>);
    expect(container.textContent).toContain('Handed in');
    expect(container.textContent).not.toContain('What to do');
  });

  it('the guide promises no length the programme has not set', () => {
    const all = Object.values(PREP_GUIDE).flatMap((g) => [g.what, ...g.steps]).join(' ');
    expect(all).not.toMatch(/\b\d+\s*(-|to)?\s*\d*\s*min(ute)?s?\b/i);
  });
});
