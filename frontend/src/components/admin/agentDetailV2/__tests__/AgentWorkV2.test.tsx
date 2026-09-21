import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentWorkV2 from '../AgentWorkV2';
import { AgentDetail, AgentDetailTicket } from '../../../../services/agentDetailApi';

// Agent Detail redesign, Track A1 (2026-09-21) — replaces
// AgentWorkTab.test.tsx (deleted alongside the flat-list component it
// tested). Ports every real assertion from that file to the new
// list+detail split, plus 2 new, explicitly required negative checks: no
// mockup-only 5-step ladder, no mockup-only 3-way "waiting on a person"
// split — neither has any real backing anywhere in this codebase (see
// AgentWorkV2CaseDetail.tsx's own header comment).

const BASE_AGENT: AgentDetail['agent'] = {
  id: 'agent-1', agent_name: 'Reese', agent_type: 'ai_staff_mentor', category: null,
  description: null, system_prompt: null, tools_granted: [], persona_version: null,
  enabled: true, created_at: null, autonomy_level: null,
  department: null, module: null, source_file: null,
  max_runs_per_hour: 60, max_writes_per_execution: 100, max_proposals_per_run: 50,
  autonomy_level_set_at: null, autonomy_level_source: null,
  abac_mode_override: null, abac_mode_override_set_at: null, abac_mode_override_set_by: null,
  abac_effective_mode: 'shadow', abac_global_default: 'shadow',
};

function ticket(overrides: Partial<AgentDetailTicket>): AgentDetailTicket {
  return {
    id: 't1', ticket_number: 1, title: 'A ticket', description: null,
    status: 'todo', priority: 'medium', type: 'student_support',
    created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
    due_date: null, status_bucket: 'open',
    ...overrides,
  };
}

function buildDetail(tickets: AgentDetailTicket[]): AgentDetail {
  return {
    agent: BASE_AGENT,
    identity: null,
    live_status: 'unknown',
    open_ticket_count: tickets.length,
    completed_ticket_count_30d: 0,
    tickets,
    ticket_breakdown: [],
    related_tasks: [],
    owned_behaviors: [],
    persona_version_history: [],
    cost_summary: null,
    authorization_summary: { window_days: 30, total: 0, allow: 0, approval: 0, block: 0, enforced_count: 0 },
    capabilities: { reads: [], produces: [], undocumented_tools: [], produced_ticket_types: [], by_tool: [] },
    autonomy_explanation: { level: 'observe', reason: 'No tools_granted recorded for this agent — the safe, honest default, not a guess.', matched_tool: null },
    reports_to: null,
    trust_contract: {
      trigger_type: 'on_demand', schedule: null, status: 'idle', last_run_at: null, run_count: 0,
      error_count: 0, avg_duration_ms: null, last_error: null, last_error_at: null, last_activity_at: null,
    },
    goals: [],
    goals_overall: 0,
    employee_facts: null,
  };
}

let container: HTMLDivElement;
let root: Root;

async function renderTab(tickets: AgentDetailTicket[], onNavigate: (tab: any) => void = () => {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AgentWorkV2 detail={buildDetail(tickets)} onNavigate={onNavigate} />);
  });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('AgentWorkV2', () => {
  it('happy path: default view (Overdue) shows the right subset, the right live count on every bucket button, and auto-selects the first case for the detail panel', async () => {
    await renderTab([
      ticket({ id: 't-overdue', title: 'Overdue ticket', status_bucket: 'overdue' }),
      ticket({ id: 't-verify', title: 'Ready ticket', status_bucket: 'ready_to_verify' }),
      ticket({ id: 't-reply', title: 'Needs reply ticket', status_bucket: 'needs_reply' }),
      ticket({ id: 't-open', title: 'Open ticket', status_bucket: 'open' }),
    ]);

    expect(container.textContent).toContain('Overdue ticket');
    expect(container.textContent).not.toContain('Ready ticket');
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes('Overdue') && b.textContent?.includes('1'))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('Ready to verify') && b.textContent?.includes('1'))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('Needs a reply') && b.textContent?.includes('1'))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('Open') && b.textContent?.includes('1'))).toBe(true);
  });

  it('clicking a filter button switches the visible subset to that bucket only', async () => {
    await renderTab([
      ticket({ id: 't-overdue', title: 'Overdue ticket', status_bucket: 'overdue' }),
      ticket({ id: 't-reply', title: 'Needs reply ticket', status_bucket: 'needs_reply' }),
    ]);

    const buttons = Array.from(container.querySelectorAll('button'));
    const needsReplyBtn = buttons.find((b) => b.textContent?.includes('Needs a reply'));
    await act(async () => {
      needsReplyBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Needs reply ticket');
    expect(container.textContent).not.toContain('Overdue ticket');
  });

  it('honest empty state per bucket, not a blank list', async () => {
    await renderTab([]);
    expect(container.textContent).toContain('No tickets are overdue right now.');
  });

  it('selecting a case in the list shows its real detail — description, priority, type, timestamps, real status', async () => {
    await renderTab([
      ticket({ id: 't-a', title: 'First ticket', status_bucket: 'overdue', description: 'Real narrative text.', priority: 'high', type: 'student_support', status: 'in_review' }),
      ticket({ id: 't-b', title: 'Second ticket', status_bucket: 'overdue', description: 'Other narrative.', priority: 'low', type: 'task' }),
    ]);

    // First case auto-selected.
    expect(container.textContent).toContain('Real narrative text.');
    expect(container.textContent).toContain('high');
    expect(container.textContent).toContain('In Review');

    const secondRow = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Second ticket'));
    await act(async () => { secondRow!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(container.textContent).toContain('Other narrative.');
    expect(container.textContent).not.toContain('Real narrative text.');
  });

  it('excludes closed tickets (status_bucket: null) from every bucket count and list entirely', async () => {
    await renderTab([
      ticket({ id: 't-open', title: 'Open ticket', status_bucket: 'open' }),
      ticket({ id: 't-closed', title: 'Closed ticket', status: 'done', status_bucket: null }),
    ]);

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes('Open') && b.textContent?.includes('1'))).toBe(true);
    expect(container.textContent).not.toContain('Closed ticket');
  });

  it('shows "No due date" honestly rather than a blank or fabricated date', async () => {
    await renderTab([
      ticket({ id: 't-overdue', title: 'Overdue ticket', status_bucket: 'overdue', due_date: null }),
    ]);

    expect(container.textContent).toContain('No due date');
  });

  it('"Explain this decision" navigates to the Decisions tab (never a fake per-ticket explanation)', async () => {
    const onNavigate = jest.fn();
    await renderTab([ticket({ id: 't-1', status_bucket: 'overdue' })], onNavigate);

    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Explain this decision');
    await act(async () => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onNavigate).toHaveBeenCalledWith('decisions');
  });

  it('"Discuss with Reese" navigates to the Talk tab', async () => {
    const onNavigate = jest.fn();
    await renderTab([ticket({ id: 't-1', status_bucket: 'overdue' })], onNavigate);

    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Discuss with Reese');
    await act(async () => { btn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onNavigate).toHaveBeenCalledWith('talk');
  });

  // Required, run-specific hard-stop checks (this run's own plan.md R68 and
  // execution-contract.md) — neither the mockup's 5-step narrative ladder
  // nor its 3-way "waiting on Ali/staff/student" split has any real backing
  // anywhere in this codebase; building either, even in reduced form, would
  // misrepresent a real kanban `status` as an invented narrative stage.
  it('never renders the mockup-only 5-step ladder (Assess/Plan/Handoff/Verify/Complete) — no real backing exists', async () => {
    await renderTab([ticket({ id: 't-1', status_bucket: 'overdue' })]);

    for (const step of ['Assess', 'Handoff', 'Verify', 'Complete']) {
      expect(container.textContent).not.toContain(step);
    }
  });

  it('never renders the mockup-only 3-way "waiting on a person" split — only the 4 real buckets exist', async () => {
    await renderTab([ticket({ id: 't-1', status_bucket: 'overdue' })]);

    expect(container.textContent).not.toContain('Waiting on');
    expect(container.textContent).not.toContain('Assign an outcome');
  });
});
