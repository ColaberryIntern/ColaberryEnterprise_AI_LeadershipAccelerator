import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentOverviewV2Sidebar from '../AgentOverviewV2Sidebar';
import { AgentDetail } from '../../../../services/agentDetailApi';

// Agent Detail polish round 2 (2026-09-29) — Ali, live: a long
// charter.mission pushed the sections after "Role charter" (Reports to,
// Employee facts, Persona and prompt) below the fold. This is the first
// real test coverage of a populated (non-null) charter anywhere on this
// page — every existing AgentDetailPage.smoke.test.tsx test mocks
// getAgentRoleCharter to return charter: null.

jest.mock('../../../../services/agentRoleCharterApi', () => ({
  getAgentRoleCharter: jest.fn(),
  saveAgentRoleCharter: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAgentRoleCharter } = require('../../../../services/agentRoleCharterApi') as { getAgentRoleCharter: jest.Mock };

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

function buildDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    agent: BASE_AGENT,
    identity: null,
    live_status: 'unknown',
    open_ticket_count: 0,
    completed_ticket_count_30d: 0,
    tickets: [],
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
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function render(detail: AgentDetail) {
  await act(async () => {
    root.render(<AgentOverviewV2Sidebar detail={detail} agentId="agent-1" agentDisplayName="Reese" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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

describe('AgentOverviewV2Sidebar — Role charter truncation', () => {
  it('a short mission renders in full, no toggle, every section after it visible without truncation', async () => {
    getAgentRoleCharter.mockResolvedValue({
      agentId: 'agent-1',
      charter: { roleTitle: 'Student Success', mission: 'Help students move forward.', responsibilities: [], kpis: [], updatedByEmail: 'ali@colaberry.com', updatedAt: '2026-09-01T00:00:00Z' },
    });
    await render(buildDetail());
    expect(container.textContent).toContain('Help students move forward.');
    expect(container.querySelector('.adv2-truncate-toggle')).toBeNull();
    expect(container.textContent).toContain('Reports to');
  });

  it('a long mission truncates to ~140 chars with a working expand toggle', async () => {
    const longMission = 'Reese is the student\'s dedicated AI mentor. '.repeat(6); // > 140 chars
    getAgentRoleCharter.mockResolvedValue({
      agentId: 'agent-1',
      charter: { roleTitle: 'Student Success', mission: longMission, responsibilities: [], kpis: [], updatedByEmail: 'ali@colaberry.com', updatedAt: '2026-09-01T00:00:00Z' },
    });
    await render(buildDetail());

    expect(container.textContent).toContain('…');
    expect(container.textContent).not.toContain(longMission);
    const toggle = container.querySelector('.adv2-truncate-toggle') as HTMLElement;
    expect(toggle).toBeTruthy();
    expect(toggle.textContent).toBe('Show more');

    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain(longMission.trim());
  });
});
