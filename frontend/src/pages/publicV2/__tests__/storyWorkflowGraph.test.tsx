import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { StoryWorkflowGraph } from '../StoryWorkflowGraph';
import type {
  PublicCaseStudyWorkflow,
  PublicCaseStudyWorkflowEdge,
  PublicCaseStudyWorkflowNode,
} from '../../../services/caseStudyPublicTypes';

/**
 * The graph as a reader drives it: Before/After swaps the node set, a node
 * selected by keyboard is read out in the panel, Previous/Next wrap, and a
 * reader who asked for reduced motion gets no particles and a control that
 * says so.
 */

const node = (key: string, over: Partial<PublicCaseStudyWorkflowNode> = {}): PublicCaseStudyWorkflowNode => ({
  key, label: `Node ${key}`, sublabel: null, detail: null, kicker: null, role: 'system', status: 'processing', lane: 'primary', evidence: null, tally: null, ...over,
});
const edge = (from: string, to: string): PublicCaseStudyWorkflowEdge => ({ from, to, label: null, status: 'processing', condition: null, motion: true });
const LANES = { primary: 'Live path', recovery: 'Recovery path', manual: 'Manual repair' } as const;

const workflow: PublicCaseStudyWorkflow = {
  key: 'flow', type: 'before_after', title: 'Same call, a different path', caption: null, description: 'What changed.',
  panels: [
    { key: 'before', label: 'Before', summary: 'The old way.', laneLabels: LANES,
      nodes: [node('launch'), node('lost', { status: 'attention', lane: 'manual', detail: 'The event never arrived.' })], edges: [edge('launch', 'lost')], initialNodeKey: 'launch' },
    { key: 'after', label: 'After', summary: null, laneLabels: LANES,
      nodes: [
        node('launch', { kicker: 'Step 1' }),
        node('gap', { lane: 'recovery', status: 'resolved', detail: 'Detected by query.', evidence: 'audit_log rows', tally: {
          label: 'Missing events resolved', valueDisplay: '97%', unit: null, verificationClass: 'verified', verificationMethod: 'internal',
          baseline: null, sample: null, methodology: null, limitations: [], shape: null, payload: null, plain: null, collection: null,
        } as unknown as PublicCaseStudyWorkflowNode['tally'] }),
        node('replay', { lane: 'recovery' }),
      ],
      edges: [edge('launch', 'gap'), edge('gap', 'replay')], initialNodeKey: 'launch' },
  ],
  motionNote: 'Illustration, not live telemetry.',
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(el: React.ReactElement): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root!.render(el); });
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  if (container?.parentNode) document.body.removeChild(container);
  root = null; container = null;
});

const q = (selector: string): HTMLElement => {
  const el = container?.querySelector(selector) as HTMLElement | null;
  if (!el) throw new Error(`No element matches ${selector}`);
  return el;
};
const all = (selector: string): HTMLElement[] => Array.from(container?.querySelectorAll(selector) ?? []) as HTMLElement[];
const click = (selector: string): void => { act(() => { q(selector).click(); }); };
const button = (label: string): HTMLElement => {
  const el = all('button').find((b) => b.textContent === label);
  if (!el) throw new Error(`No button labelled ${label}`);
  return el;
};
const heading = (): string => q('[data-testid="story-workflow-panel"] h4').textContent ?? '';

const stubMatchMedia = (matches: boolean): jest.Mock => {
  const fn = jest.fn().mockReturnValue({ matches, addEventListener: jest.fn(), removeEventListener: jest.fn() });
  (window as unknown as { matchMedia: unknown }).matchMedia = fn;
  return fn;
};

beforeEach(() => { stubMatchMedia(false); });

describe('StoryWorkflowGraph', () => {
  it('opens on the After panel and the toggle switches the node set', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    expect(button('After').getAttribute('aria-pressed')).toBe('true');
    expect(all('[data-node-key]')).toHaveLength(3);
    act(() => { button('Before').click(); });
    expect(button('Before').getAttribute('aria-pressed')).toBe('true');
    expect(all('[data-node-key]')).toHaveLength(2);
    expect(container!.textContent).toContain('The old way.');
    // The static list follows the panel too.
    expect(all('[data-testid="story-workflow-steps"] li')).toHaveLength(2);
  });

  it('selects a node from the keyboard and the panel reads it out, tally and proof included', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    expect(heading()).toBe('Node launch');
    const gap = q('[data-node-key="gap"]');
    expect(gap.getAttribute('role')).toBe('button');
    expect(gap.getAttribute('tabindex')).toBe('0');
    expect(gap.getAttribute('aria-pressed')).toBe('false');
    act(() => {
      gap.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(gap.getAttribute('aria-pressed')).toBe('true');
    expect(heading()).toBe('Node gap');
    const panel = q('[data-testid="story-workflow-panel"]');
    expect(panel.textContent).toContain('Detected by query.');
    expect(panel.textContent).toContain('audit_log rows');
    expect(q('[data-testid="story-workflow-tally"]').textContent).toContain('97%');
    expect(panel.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('walks Previous and Next through every step and wraps at both ends', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    expect(heading()).toBe('Node launch');
    click('[data-visual-action="previous"]');
    expect(heading()).toBe('Node replay');
    click('[data-visual-action="next"]');
    expect(heading()).toBe('Node launch');
    click('[data-visual-action="next"]');
    expect(heading()).toBe('Node gap');
    expect(q('.cbv2-story-visual__panel-position').textContent).toBe('2 / 3');
  });

  it('remembers the selection per panel across a toggle', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    click('[data-visual-action="next"]');
    act(() => { button('Before').click(); });
    act(() => { button('After').click(); });
    expect(heading()).toBe('Node gap');
  });

  it('draws every edge as a path with the arrow marker and the motion flag', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    const paths = all('path.cbv2-story-visual__edge-path');
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute('marker-end')).toMatch(/^url\(#cbv2-arrow-/);
    expect(paths[0].getAttribute('data-motion')).toBe('true');
  });

  it('under reduced motion draws no particle and the control says so, disabled', () => {
    const mm = stubMatchMedia(true);
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    expect(mm).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(all('.cbv2-story-visual__particle')).toHaveLength(0);
    const control = q('[data-testid="story-workflow-motion"]') as HTMLButtonElement;
    expect(control.textContent).toBe('Reduced motion');
    expect(control.disabled).toBe(true);
  });

  it('offers a pause control when motion is auto and none when the record turned motion off', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    const control = q('[data-testid="story-workflow-motion"]');
    expect(control.textContent).toBe('Pause motion');
    click('[data-testid="story-workflow-motion"]');
    expect(control.textContent).toBe('Play motion');
    expect(control.getAttribute('aria-pressed')).toBe('true');
    act(() => root!.unmount());
    root = null;
    mount(<StoryWorkflowGraph workflow={workflow} motion="off" />);
    expect(container!.querySelector('[data-testid="story-workflow-motion"]')).toBeNull();
    expect(container!.textContent).toContain('Illustration, not live telemetry.');
  });

  it('renders a single-state workflow with no toggle', () => {
    mount(<StoryWorkflowGraph workflow={{ ...workflow, type: 'single_state', panels: [{ ...workflow.panels[1], key: 'single', label: 'As built' }] }} motion="auto" />);
    expect(container!.querySelector('[aria-label="Workflow state"]')).toBeNull();
    expect(q('[data-testid="story-workflow-svg"]').getAttribute('aria-label')).toBe('As built: 3 steps, 2 connections');
  });

  it('assigns every class inside the cbv2- namespace and uses no inline style', () => {
    mount(<StoryWorkflowGraph workflow={workflow} motion="auto" />);
    for (const el of all('[class]')) {
      for (const name of Array.from(el.classList)) {
        expect({ name, ok: name.startsWith('cbv2-') }).toEqual({ name, ok: true });
      }
    }
    expect(all('[style]')).toHaveLength(0);
  });
});
