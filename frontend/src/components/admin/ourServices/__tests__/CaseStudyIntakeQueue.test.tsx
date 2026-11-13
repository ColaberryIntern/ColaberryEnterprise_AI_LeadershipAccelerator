import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CaseStudyIntakeQueue from '../CaseStudyIntakeQueue';
import { intakeItem } from '../__fixtures__/summaryFixtures';
import type { IntakeSummaryItem } from '../../../../services/ourServicesApi';

// No @testing-library in this repo: render via react-dom/client + act and drive the DOM directly.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

const click = async (el: Element): Promise<void> => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
};
const button = (text: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text)) as HTMLButtonElement;
const gate = (): string => container.querySelector('[data-testid="intake-gate"]')?.textContent ?? '';

describe('CaseStudyIntakeQueue: the must-link gate', () => {
  it('pre-checks only suggestions at 75% or more, and is ready with them', async () => {
    const onLink = jest.fn().mockResolvedValue(undefined);
    await render(<CaseStudyIntakeQueue intake={[intakeItem()]} growthServiceIds={new Set()} onLink={onLink} onPropose={jest.fn()} />);
    const boxes = Array.from(container.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]); // score 6 = 80%; score 1 = 20%
    expect(container.textContent).toContain('80%');
    expect(gate()).toContain('Ready: 1 service selected');
    await click(button('Link'));
    expect(onLink).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs-9' }), ['link-strong']); // the weak one stays a suggestion
  });

  it('is locked with no selection: the button is disabled until a service is picked', async () => {
    const onLink = jest.fn();
    const weakOnly: IntakeSummaryItem = intakeItem({ sourceKind: 'inside', suggestions: [{ linkId: 'l1', serviceId: 's1', serviceName: 'Service B', matchScore: 2, rationale: null }] });
    await render(<CaseStudyIntakeQueue intake={[weakOnly]} growthServiceIds={new Set()} onLink={onLink} onPropose={jest.fn()} />);
    expect(gate()).toContain('Pick at least one service');
    expect(button('Link & publish').disabled).toBe(true);
    await click(container.querySelector('input[type="checkbox"]')!);
    expect(gate()).toContain('Ready: 1 service selected');
    expect(button('Link & publish').disabled).toBe(false);
  });

  it('outside case studies say they stay internal', async () => {
    await render(<CaseStudyIntakeQueue intake={[intakeItem()]} growthServiceIds={new Set()} onLink={jest.fn()} onPropose={jest.fn()} />);
    expect(button('Link (internal only)')).toBeTruthy();
  });

  it('New service opens a form that proposes a Growth service from the case study', async () => {
    const onPropose = jest.fn().mockResolvedValue(undefined);
    await render(<CaseStudyIntakeQueue intake={[intakeItem({ suggestions: [] })]} growthServiceIds={new Set()} onLink={jest.fn()} onPropose={onPropose} />);
    expect(container.textContent).toContain('No suggestions yet');
    await click(button('New service'));
    const input = container.querySelector('#ns-name-cs-9') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, 'Service Z'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(onPropose).toHaveBeenCalledWith(expect.objectContaining({ id: 'cs-9' }), 'Service Z', '');
  });

  it('shows the server sentence when linking fails, and stays on the card', async () => {
    const onLink = jest.fn().mockRejectedValue({ response: { data: { error: 'That link was already decided.' } } });
    await render(<CaseStudyIntakeQueue intake={[intakeItem()]} growthServiceIds={new Set()} onLink={onLink} onPropose={jest.fn()} />);
    await click(button('Link'));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('That link was already decided.');
  });

  it('an empty queue says nothing is blocked', async () => {
    await render(<CaseStudyIntakeQueue intake={[]} growthServiceIds={new Set()} onLink={jest.fn()} onPropose={jest.fn()} />);
    expect(container.querySelector('[data-testid="intake-empty"]')?.textContent).toContain('Nothing is blocked');
  });
});
