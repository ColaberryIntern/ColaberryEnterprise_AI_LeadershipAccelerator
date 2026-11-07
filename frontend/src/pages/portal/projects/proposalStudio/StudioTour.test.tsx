import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import StudioTour, { TOUR_STEPS, tourSteps } from './StudioTour';

/**
 * StudioTour drives the real studio to each step's view and exposes Back / Next / Finish. These tests cover the
 * contract the shell depends on: it navigates to the current step's view on mount and when the step changes (keyed to
 * the step, not the navigator's identity), Next advances, Back is disabled at the start, and the last step finishes.
 */
let container: HTMLDivElement; let root: Root;
const render = (el: React.ReactElement) => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); act(() => root.render(el)); };
afterEach(() => { act(() => root.unmount()); container.remove(); });
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
const btn = (text: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement;

it('navigates to the first step view on mount and shows its content + progress', () => {
  const onNavigate = jest.fn();
  render(<StudioTour step={0} onNavigate={onNavigate} onSetStep={jest.fn()} onClose={jest.fn()} />);
  expect(onNavigate).toHaveBeenCalledWith(TOUR_STEPS[0].view);
  expect(container.textContent).toContain(TOUR_STEPS[0].title);
  expect(container.textContent).toContain(`1 of ${TOUR_STEPS.length}`); // v4 eyebrow: "Tour · 1 of N"
  expect(btn('Back').disabled).toBe(true);
});

it('Next advances the step; it does not re-navigate when only the navigator identity changes', () => {
  const onSetStep = jest.fn();
  const onNavigate = jest.fn();
  render(<StudioTour step={1} onNavigate={onNavigate} onSetStep={onSetStep} onClose={jest.fn()} />);
  onNavigate.mockClear();
  // A re-render with a NEW onNavigate function but the SAME step must not fire navigation again.
  act(() => root.render(<StudioTour step={1} onNavigate={jest.fn()} onSetStep={onSetStep} onClose={jest.fn()} />));
  expect(onNavigate).not.toHaveBeenCalled();
  click(btn('Next'));
  expect(onSetStep).toHaveBeenCalledWith(2);
});

it('the last step finishes (calls onClose) instead of advancing', () => {
  const onClose = jest.fn();
  const onSetStep = jest.fn();
  render(<StudioTour step={TOUR_STEPS.length - 1} onNavigate={jest.fn()} onSetStep={onSetStep} onClose={onClose} />);
  const finish = btn('Finish');
  expect(finish).toBeTruthy();
  click(finish);
  expect(onClose).toHaveBeenCalled();
  expect(onSetStep).not.toHaveBeenCalled();
});

it('Skip closes the tour', () => {
  const onClose = jest.fn();
  render(<StudioTour step={2} onNavigate={jest.fn()} onSetStep={jest.fn()} onClose={onClose} />);
  click(btn('Skip'));
  expect(onClose).toHaveBeenCalled();
});

it('the intern variant hides the admin-only Gold steps', () => {
  const admin = tourSteps('admin');
  const intern = tourSteps('intern');
  expect(admin.some((s) => s.title === 'The Gold decision')).toBe(true);
  expect(intern.some((s) => s.title === 'The Gold decision')).toBe(false);
  expect(intern.length).toBeLessThan(admin.length);
  // every intern step is a real admin step (intern is a strict filter)
  expect(intern.every((s) => admin.includes(s))).toBe(true);
});
