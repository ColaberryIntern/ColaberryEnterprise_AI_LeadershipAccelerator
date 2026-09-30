import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentWorkV2Stepper from '../AgentWorkV2Stepper';

let container: HTMLDivElement;
let root: Root;

function render(status: string) {
  act(() => { root.render(<AgentWorkV2Stepper status={status} />); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('AgentWorkV2Stepper', () => {
  it.each([
    ['backlog', ['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']],
    ['todo', ['✓ Backlog', 'To Do', 'In Progress', 'In Review', 'Done']],
    ['in_progress', ['✓ Backlog', '✓ To Do', 'In Progress', 'In Review', 'Done']],
    ['in_review', ['✓ Backlog', '✓ To Do', '✓ In Progress', 'In Review', 'Done']],
    ['done', ['✓ Backlog', '✓ To Do', '✓ In Progress', '✓ In Review', 'Done']],
  ])('status "%s": marks steps strictly before it done (checkmark), the matching step current (no checkmark), later ones untouched', (status, expectedText) => {
    render(status);
    const steps = Array.from(container.querySelectorAll('.adv2-step'));
    expect(steps.map((s) => s.textContent)).toEqual(expectedText);
  });

  it('the step matching the real current status carries the current class, real labels only (never fabricated stage names)', () => {
    render('in_progress');
    const steps = Array.from(container.querySelectorAll('.adv2-step'));
    expect(steps[2].className).toContain('adv2-step-current');
    expect(steps[0].className).toContain('adv2-step-done');
    expect(steps[3].className).not.toContain('adv2-step-done');
    expect(steps[3].className).not.toContain('adv2-step-current');
    for (const label of ['Assess', 'Plan', 'Handoff', 'Verify', 'Complete']) {
      expect(container.textContent).not.toContain(label);
    }
  });

  it('a cancelled ticket renders a plain Cancelled badge, no stepper at all', () => {
    render('cancelled');
    expect(container.querySelector('.adv2-steps')).toBeNull();
    expect(container.textContent).toBe('Cancelled');
  });

  it('an unrecognized status renders the stepper with every step in its future (untouched) state, never crashes', () => {
    render('some_future_status');
    const steps = Array.from(container.querySelectorAll('.adv2-step'));
    expect(steps).toHaveLength(5);
    for (const step of steps) {
      expect(step.className).not.toContain('adv2-step-done');
      expect(step.className).not.toContain('adv2-step-current');
    }
  });
});
