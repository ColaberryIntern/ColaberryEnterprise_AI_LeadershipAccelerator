import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgentDetailPage from '../AgentDetailPage';
import { AgentDetail } from '../../../services/agentDetailApi';

// Checkpoint G (2026-09-10) — Command Center unfolded into "Live Status"
// and "Overview" (see AgentLiveStatusTab.tsx / AgentDetailPage.tsx's own
// header comment for the full history). This is the dedicated test file
// for the re-promoted "Overview" tab — the Identity/tools/reports-to/
// system-prompt content that used to be covered inside
// AgentDetailPage.commandCenter.test.tsx before the split. AgentOverviewTab
// itself takes `detail` only (no inbox dependency), so this file needs no
// inbox mocking — only the "At a Glance" default landing tab's own 4
// summary fetches, which still fire on mount regardless of which tab this
// file clicks into afterward.

jest.mock('../../../services/agentDetailApi', () => ({ getAgentDetail: jest.fn() }));
jest.mock('../../../services/managerInboxApi', () => ({ getManagerInboxItems: jest.fn() }));
jest.mock('../../../services/workforceOrgChartApi', () => ({
  resetAgents: jest.fn(),
  reactivateAgent: jest.fn(),
  AUTONOMY_LEVELS: ['observe', 'suggest', 'act_audited', 'communicate'],
  AUTONOMY_LEVEL_DESCRIPTIONS: {
    observe: 'Read only.', suggest: 'May propose actions.', act_audited: 'May write, audited.', communicate: 'May send outbound comms.',
  },
}));
jest.mock('../../../services/managerDirectiveApi', () => ({ listDirectives: jest.fn() }));
jest.mock('../../../services/agentReportSubscriptionApi', () => ({ listReportSubscriptions: jest.fn() }));
jest.mock('../../../services/agentGoalApi', () => ({ listGoals: jest.fn() }));
jest.mock('../../../services/agentOneOnOneApi', () => ({ listOneOnOnes: jest.fn() }));
jest.mock('../../../services/agentRoleCharterApi', () => ({ getAgentRoleCharter: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAgentDetail } = require('../../../services/agentDetailApi') as { getAgentDetail: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getManagerInboxItems } = require('../../../services/managerInboxApi') as { getManagerInboxItems: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listDirectives } = require('../../../services/managerDirectiveApi') as { listDirectives: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listReportSubscriptions } = require('../../../services/agentReportSubscriptionApi') as { listReportSubscriptions: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listGoals } = require('../../../services/agentGoalApi') as { listGoals: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listOneOnOnes } = require('../../../services/agentOneOnOneApi') as { listOneOnOnes: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAgentRoleCharter } = require('../../../services/agentRoleCharterApi') as { getAgentRoleCharter: jest.Mock };

const DETAIL: AgentDetail = {
  agent: {
    id: 'agent-cory', agent_name: 'corybrain', agent_type: 'ai_leadership', category: 'executive',
    description: null, system_prompt: 'You are CoryBrain.', tools_granted: [], persona_version: '2026-08-20',
    enabled: true, created_at: null, autonomy_level: 'suggest',
    department: null, module: null, source_file: null,
    max_runs_per_hour: 60, max_writes_per_execution: 100, max_proposals_per_run: 50,
    autonomy_level_set_at: null,
  },
  identity: null,
  live_status: 'unknown',
  open_ticket_count: 1,
  tickets: [],
  ticket_breakdown: [],
  related_tasks: [],
  persona_version_history: [],
  cost_summary: { cost_usd: 0.42, runs: 38 },
  authorization_summary: { window_days: 30, total: 38, allow: 34, approval: 3, block: 1, enforced_count: 0 },
  capabilities: { reads: [], produces: [], undocumented_tools: [], produced_ticket_types: [], by_tool: [] },
  reports_to: null,
  trust_contract: {
    trigger_type: 'on_demand', schedule: null, status: 'idle', last_run_at: null, run_count: 0,
    error_count: 0, avg_duration_ms: null, last_error: null, last_error_at: null,
    last_activity_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  goals: [],
  goals_overall: 0,
};

let container: HTMLDivElement;
let root: Root;

async function renderAgentPage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/agents/agent-cory']}>
        <Routes><Route path="/admin/agents/:id" element={<AgentDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function openOverviewTab() {
  const tabButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Overview');
  if (!tabButton) throw new Error('Overview tab button not found');
  await act(async () => {
    tabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  listDirectives.mockResolvedValue([]);
  listReportSubscriptions.mockResolvedValue([]);
  listGoals.mockResolvedValue([]);
  listOneOnOnes.mockResolvedValue([]);
  getAgentRoleCharter.mockResolvedValue({ agentId: 'agent-cory', charter: null });
  getAgentDetail.mockResolvedValue(DETAIL);
  getManagerInboxItems.mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('AgentDetailPage — Overview tab', () => {
  it('is not shown on mount (At a Glance is the default), and shows real Identity/system-prompt content once opened', async () => {
    await renderAgentPage();
    expect(container.textContent).not.toContain('Identity');

    await openOverviewTab();
    expect(container.textContent).toContain('Identity');
    expect(container.textContent).toContain('System prompt');
    expect(container.textContent).toContain('You are CoryBrain.');
  });

  it('never fetches the manager inbox — Overview has no dependency on pending-approval data', async () => {
    await renderAgentPage();
    getManagerInboxItems.mockClear();
    await openOverviewTab();
    expect(getManagerInboxItems).not.toHaveBeenCalled();
  });
});
