/**
 * The overview, rendered. The arithmetic is covered in `queueSignals.test.ts`; these are about
 * what reaches the screen.
 *
 * The one that matters most is the pair of tiles. Ali asked for an overview that helps him decide
 * what to do next, and the number that does that is not how many requests exist but how many he
 * can act on. A screen that printed one figure sent him to four decisions he could not make.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// The house convention, as every agentDetailV2 test does it. Without it React warns on every
// render and the real failures get lost in the noise.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * No `@testing-library/react` in this repo: the house pattern is `createRoot` plus `act`, as
 * `AgentOutboundTab.test.tsx` does it. Adding a test dependency to save three lines of harness
 * would be a change to the build for the convenience of one file.
 */
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function draw(el: React.ReactElement): void {
  act(() => { root.render(el); });
}

/** The element carrying this test id, or null. Null is an assertable answer here. */
function byId(id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

/** The same, but it throws when absent, so a missing element fails on its own line. */
function need(id: string): HTMLElement {
  const el = byId(id);
  if (!el) throw new Error(`no element with data-testid="${id}"`);
  return el;
}

import DecideOverview from '../DecideOverview';
import type { ChangeRequest, GroupedTask, ToolRequestDetail } from '../../../../services/agentDomainApi';

const NOW = new Date('2026-11-17T18:00:00Z');

function detail(over: Partial<ToolRequestDetail> = {}): ToolRequestDetail {
  return {
    agent_id: 'a1',
    domain_key: 'admissions',
    tool_name: 'read_explorers',
    purpose: 'p',
    reads: ['explorers'],
    produces: ['a list'],
    capability_id: 'c1',
    task_unblocked: 'Send the report',
    task_key: 'weekly_report',
    manual_today: 'by hand',
    acts_on_output: 'ali@colaberry.com',
    judged_threshold: '20 a week',
    judged_measured_from: 'enrollments',
    tried_in_product: 'not_built',
    missing_from_product: 'nothing does this',
    needed_by: '2026-12-01',
    run_frequency: 'weekly',
    touches: ['accelerator_prod'],
    environment: 'production',
    read_datasets: ['explorers'],
    inputs: [],
    writes: false,
    side_effects: null,
    reversible: null,
    reversibility_note: null,
    ...over,
  } as ToolRequestDetail;
}

function req(over: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: 'r1',
    kind: 'tool',
    domain_key: 'admissions',
    title: 'read_explorers',
    description: null,
    status: 'submitted',
    requested_by_identity: 'kalkidankin@gmail.com',
    requested_at: '2026-11-16T10:00:00Z',
    approved_by_identity: null,
    approved_at: null,
    declined_reason: null,
    tool_request: detail(),
    duplicate_check: null,
    decision_package: null,
    readiness: {
      has_package: true, ready_for_a_human: true, bounced_blocks: [], bounce_reasons: [],
    },
    ...over,
  };
}

const thin: Partial<ChangeRequest> = {
  readiness: {
    has_package: true, ready_for_a_human: false, bounced_blocks: ['problem'], bounce_reasons: [],
  },
};

describe('the tiles', () => {
  it('separates what can be decided from what is only waiting', () => {
    draw(<DecideOverview
      requests={[req({ id: 'a' }), req({ id: 'b', ...thin }), req({ id: 'c', ...thin })]}
      tasks={[]}
      now={NOW}
    />);
    expect(need('kpi-decidable').textContent).toBe('1');
    expect(need('kpi-blocked').textContent).toBe('2');
  });

  it('says "none" rather than a zero when nothing is waiting', () => {
    // A 0 in "oldest waiting" would read as "something arrived today".
    draw(<DecideOverview requests={[req({ status: 'approved' })]} tasks={[]} now={NOW} />);
    expect(need('kpi-oldest').textContent).toBe('none');
  });

  it('counts a production write that cannot be undone as needing care', () => {
    draw(<DecideOverview
      requests={[req({ tool_request: detail({ writes: true, reversible: false }) })]}
      tasks={[]}
      now={NOW}
    />);
    expect(need('kpi-hazardous').textContent).toBe('1');
  });
});

describe('the chart', () => {
  it('is bars with their own numbers, so no axis has to be traced', () => {
    draw(<DecideOverview
      requests={[req({ id: 'a' }), req({ id: 'b', tool_request: null }), req({ id: 'c', tool_request: null })]}
      tasks={[]}
      now={NOW}
    />);
    expect(need('bar-count-send_back').textContent).toBe('2');
    expect(need('bar-count-read').textContent).toBe('1');
  });

  it('is replaced by a plain sentence when nothing waits, not an empty chart', () => {
    draw(<DecideOverview requests={[req({ status: 'declined' })]} tasks={[]} now={NOW} />);
    expect(byId('next-step-chart')).toBeNull();
  });

  it('survives an empty queue', () => {
    draw(<DecideOverview requests={[]} tasks={[]} now={NOW} />);
    expect(need('kpi-decidable').textContent).toBe('0');
  });
});

describe('half-decided tasks', () => {
  const half: GroupedTask = {
    task_key: 'weekly_report',
    domain_key: 'admissions',
    task_label: 'Send the admissions team the weekly report',
    other_labels: [],
    tools: [],
    waiting_on_a_decision: 2,
    approved_to_build: 1,
    every_tool_decided: false,
  };

  it('are called out, because the task cannot be done and nothing else says so', () => {
    draw(<DecideOverview requests={[req()]} tasks={[half]} now={NOW} />);
    expect(need('half-decided-tasks').textContent)
      .toContain('One task is half decided');
  });

  it('are not mentioned when no task is half decided', () => {
    draw(<DecideOverview
      requests={[req()]}
      tasks={[{ ...half, approved_to_build: 0 }]}
      now={NOW}
    />);
    expect(byId('half-decided-tasks')).toBeNull();
  });

  it('are not mentioned while the task read has not answered', () => {
    // `null` is "not answered yet", which must not render as "none are half decided".
    draw(<DecideOverview requests={[req()]} tasks={null} now={NOW} />);
    expect(byId('half-decided-tasks')).toBeNull();
  });
});
