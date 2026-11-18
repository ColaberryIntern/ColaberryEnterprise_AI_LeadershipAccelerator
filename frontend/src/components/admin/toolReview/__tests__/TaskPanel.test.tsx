/**
 * The task panel. Every test is about a state that must not be collapsed into another one.
 *
 * Three facts look the same on a screen that is careless: this request belongs to no task, the
 * task lookup failed, and this task needs one tool. They lead to different actions — decide it
 * alone, go and find out what else is waiting, and decide it alone with confidence — so each one
 * is asserted by its own test id.
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

import TaskPanel from '../TaskPanel';
import type { GroupedTask, TaskTool } from '../../../../services/agentDomainApi';

function tool(over: Partial<TaskTool> = {}): TaskTool {
  return {
    request_id: 'r1',
    tool_name: 'read_explorers',
    title: 'read_explorers: read unpaid Explorer accounts',
    state: 'waiting_on_a_decision',
    requested_at: '2026-11-16T10:00:00Z',
    ready_to_decide: true,
    not_ready_because: [],
    ...over,
  };
}

function task(over: Partial<GroupedTask> = {}): GroupedTask {
  return {
    task_key: 'weekly_unpaid_explorer_report',
    domain_key: 'admissions',
    task_label: 'Send the admissions team the weekly unpaid Explorer report',
    other_labels: [],
    tools: [tool()],
    waiting_on_a_decision: 1,
    approved_to_build: 0,
    every_tool_decided: false,
    ...over,
  };
}

describe('the three states that must not be collapsed', () => {
  it('a FAILED lookup says so, and never renders as "no task"', () => {
    draw(<TaskPanel task={null} requestId="r1" problem="Could not read the tasks." />);
    expect(need('task-panel-problem')).toBeTruthy();
    expect(byId('task-panel-none')).toBeNull();
    // And it says what the reader is missing, rather than only that something broke.
    expect(need('task-panel-problem').textContent)
      .toContain('you are not seeing whatever else the same task may need');
  });

  it('a request that belongs to no task states that, with the reason', () => {
    draw(<TaskPanel task={null} requestId="r1" />);
    expect(need('task-panel-none')).toBeTruthy();
  });

  it('a task of ONE tool says so rather than rendering nothing', () => {
    draw(<TaskPanel task={task()} requestId="r1" />);
    expect(need('task-panel-solo').textContent)
      .toContain('This task needs one tool');
  });
});

describe('a task of several tools', () => {
  const three = task({
    tools: [
      tool({ request_id: 'r1', tool_name: 'read_explorers' }),
      tool({ request_id: 'r2', tool_name: 'read_crm_history', state: 'approved_to_build' }),
      tool({
        request_id: 'r3',
        tool_name: 'build_report',
        ready_to_decide: false,
        not_ready_because: ['simulated_action'],
      }),
    ],
    waiting_on_a_decision: 2,
    approved_to_build: 1,
  });

  it('lists every tool, including the one being looked at, marked as this one', () => {
    draw(<TaskPanel task={three} requestId="r1" />);
    expect(need('task-tool-r1')).toBeTruthy();
    expect(need('task-tool-r2')).toBeTruthy();
    expect(need('task-tool-r3')).toBeTruthy();
    expect(need('task-tool-r1').textContent).toContain('this one');
    expect(need('task-tool-r2').textContent).not.toContain('this one');
  });

  it('says how many of them are waiting, because that is what makes it a task decision', () => {
    draw(<TaskPanel task={three} requestId="r1" />);
    expect(need('task-panel').textContent).toContain('This task needs 3 tools');
    expect(need('task-panel').textContent).toContain('2 of them are waiting on you');
  });

  it('says WHY a sibling is not readable, in the readiness check’s own words', () => {
    draw(<TaskPanel task={three} requestId="r1" />);
    expect(need('task-tool-r3').textContent).toContain('simulated action');
  });

  it('never uses the word "granted", because a grant is a different record', () => {
    draw(<TaskPanel task={three} requestId="r1" />);
    expect(container.textContent).not.toContain('granted');
    expect(need('task-tool-r2').textContent).toContain('approved to build');
  });

  it('states rung 4 honestly: not watched until every tool exists', () => {
    draw(<TaskPanel task={three} requestId="r1" />);
    expect(need('task-panel').textContent)
      .toContain('cannot do this task watched until every tool it needs exists');
  });

  it('and says the opposite once every tool is decided', () => {
    draw(<TaskPanel
      task={task({
        tools: [
          tool({ request_id: 'r1', state: 'approved_to_build' }),
          tool({ request_id: 'r2', state: 'declined' }),
        ],
        waiting_on_a_decision: 0,
        approved_to_build: 1,
        every_tool_decided: true,
      })}
      requestId="r1"
    />);
    expect(need('task-panel').textContent)
      .toContain('Every tool this task needs has been decided');
  });

  it('keeps the other wordings of the task rather than dropping them', () => {
    draw(<TaskPanel
      task={task({ other_labels: ['Weekly report'], tools: [tool(), tool({ request_id: 'r2' })], waiting_on_a_decision: 2 })}
      requestId="r1"
    />);
    expect(need('task-panel').textContent).toContain('Weekly report');
  });
});
