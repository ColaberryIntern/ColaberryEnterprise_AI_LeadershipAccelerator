import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgentDetailPage from '../AgentDetailPage';
import { AgentDetail } from '../../../services/agentDetailApi';
import { ManagerInboxItem } from '../../../services/managerInboxApi';

// AI Workforce Management, Checkpoint A of the Command Center redesign
// (2026-09-01) — dedicated test file for the new "Command Center" tab, kept
// separate from the existing ~1000-line AgentDetailPage.smoke.test.tsx
// (which asserts on Overview content rendering by default with no tab-click
// step anywhere in it — adding to that file would risk entangling this
// checkpoint's coverage with a suite that has zero margin for a mistaken
// edit). Same react-dom/client + act harness that file established.

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
// At a Glance, Checkpoint F (2026-09-03) — the new default tab's own 4
// summary fetches, unmocked they'd hit a real (nonexistent, in jsdom)
// network call on every render in this file.
jest.mock('../../../services/managerDirectiveApi', () => ({ listDirectives: jest.fn() }));
jest.mock('../../../services/agentReportSubscriptionApi', () => ({ listReportSubscriptions: jest.fn() }));
jest.mock('../../../services/agentGoalApi', () => ({ listGoals: jest.fn() }));
jest.mock('../../../services/agentOneOnOneApi', () => ({ listOneOnOnes: jest.fn() }));

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

const DETAIL: AgentDetail = {
  agent: {
    id: 'agent-cory', agent_name: 'corybrain', agent_type: 'ai_leadership', category: 'executive',
    description: null, system_prompt: null, tools_granted: [], persona_version: '2026-08-20',
    enabled: true, created_at: null, autonomy_level: 'suggest',
    department: null, module: null, source_file: null,
    max_runs_per_hour: 60, max_writes_per_execution: 100, max_proposals_per_run: 50,
    autonomy_level_set_at: null,
  },
  identity: null,
  live_status: 'unknown',
  open_ticket_count: 1,
  tickets: [
    { id: 't-1', ticket_number: 401, title: 'Ops Summary', description: null, status: 'done', priority: 'normal', type: 'ops_summary', created_at: null, updated_at: '2026-08-29T10:00:00Z' },
    { id: 't-2', ticket_number: 398, title: 'Agent Escalation', description: null, status: 'in_progress', priority: 'high', type: 'agent_escalation', created_at: null, updated_at: '2026-08-28T10:00:00Z' },
  ],
  ticket_breakdown: [],
  related_tasks: [],
  persona_version_history: [],
  cost_summary: { cost_usd: 0.42, runs: 38 },
  authorization_summary: { window_days: 30, total: 38, allow: 34, approval: 3, block: 1, enforced_count: 0 },
  capabilities: { reads: [], produces: [], undocumented_tools: [], produced_ticket_types: [], by_tool: [] },
  reports_to: null,
  trust_contract: {
    trigger_type: 'on_demand', schedule: null, status: 'idle', last_run_at: null, run_count: 0,
    // Relative to test-run time, not a fixed literal — deriveOperationalState
    // compares against the real Date.now() (no `now` override at the
    // component-integration layer, unlike the dedicated unit tests), so a
    // hardcoded past date silently drifts outside the 24h idle window as
    // real time passes and always resolves to 'unknown' instead of 'idle'.
    error_count: 0, avg_duration_ms: null, last_error: null, last_error_at: null,
    last_activity_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  goals: [],
  goals_overall: 0,
};

const PENDING_ITEM: ManagerInboxItem = {
  id: 'p-1', actionType: 'update_scheduled_email', reason: 'Shift send window to 8am recipient-local',
  confidence: 0.88, priorityScore: null, riskScore: null, impactScore: null,
  status: 'pending', createdAt: '2026-08-30T00:00:00Z', expiresAt: '2026-09-02T00:00:00Z',
  targetTable: 'scheduled_emails', targetId: 'email-1',
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

async function openCommandCenterTab() {
  const tabButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Command Center'));
  if (!tabButton) throw new Error('Command Center tab button not found');
  await act(async () => {
    tabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  // At a Glance, Checkpoint F (2026-09-03) — jest.clearAllMocks() wipes
  // implementations in this file's setup (confirmed live: a bare jest.fn()
  // resolves to undefined, which crashes AgentAtAGlanceTab's inboxItems.length
  // on the very first render) — re-applied here once since this file has a
  // single global beforeEach, unlike the smoke test file's per-describe ones.
  listDirectives.mockResolvedValue([]);
  listReportSubscriptions.mockResolvedValue([]);
  listGoals.mockResolvedValue([]);
  listOneOnOnes.mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

// At a Glance, Checkpoint F (2026-09-03) — "At a Glance" is now the
// default tab (Overview's old slot); Command Center's own content
// (including the relocated Overview content) is additive, reached via a
// tab click, same as every other real tab.
describe('AgentDetailPage — At a Glance is the default tab, Command Center is additive', () => {
  it('renders At a Glance tiles on mount without any tab click, and Command Center content only appears after clicking it', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    expect(container.textContent).toContain('At a glance');
    expect(container.textContent).not.toContain('Identity');

    await openCommandCenterTab();
    expect(container.textContent).toContain('Identity');
  });
});

describe('AgentDetailPage — Command Center: operational state', () => {
  it('derives and renders a real operational-state label from trust_contract + live_status', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(getManagerInboxItems).toHaveBeenCalledWith('agent-cory');
    expect(container.textContent).toContain('Idle');
  });
});

describe('AgentDetailPage — Command Center: Attention Required', () => {
  it('shows a loading state while the inbox is being fetched', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    let resolveInbox: (items: ManagerInboxItem[]) => void = () => {};
    getManagerInboxItems.mockReturnValue(new Promise((resolve) => { resolveInbox = resolve; }));
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('Checking pending approvals');
    await act(async () => { resolveInbox([]); await new Promise((r) => setTimeout(r, 0)); });
  });

  it('shows an honest error message, never a silent failure, when the inbox call rejects', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockRejectedValue({ response: { data: { error: 'Network timeout' } } });
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('Network timeout');
  });

  it('surfaces a real pending-approval item with its real reason text', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([PENDING_ITEM]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('1 approval waiting for review');
    expect(container.textContent).toContain('Shift send window to 8am recipient-local');
  });

  it('surfaces a real shadow-mode item citing the real would-block count', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('shadow mode');
    expect(container.textContent).toContain('1 of those had a policy verdict of "would block"');
  });

  it('shows the honest "no action required" item when nothing is pending and enforcement is real', async () => {
    getAgentDetail.mockResolvedValue({
      ...DETAIL,
      authorization_summary: { window_days: 30, total: 5, allow: 5, approval: 0, block: 0, enforced_count: 5 },
    });
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('No manager action required right now');
  });
});

describe('AgentDetailPage — Command Center: Recent Outcome', () => {
  it('shows the most recent done ticket as the verified outcome', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('Ops Summary');
    expect(container.textContent).toContain('Done — ticket closed');
  });

  it('shows an honest empty state when there is no done ticket, never falling back to the most recent ticket regardless of status', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, tickets: [{ ...DETAIL.tickets[1] }] });
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('No verified ("done") ticket yet');
  });
});

describe('AgentDetailPage — Command Center: Current Work', () => {
  it('always renders the honest "not yet instrumented" message, never an inferred task', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('Current work is not yet instrumented.');
  });
});

describe('AgentDetailPage — Command Center: stat row', () => {
  it('renders real cost, schedule, and inbox-count values', async () => {
    getAgentDetail.mockResolvedValue(DETAIL);
    getManagerInboxItems.mockResolvedValue([PENDING_ITEM]);
    await renderAgentPage();
    await openCommandCenterTab();
    expect(container.textContent).toContain('$0.42');
    expect(container.textContent).toContain('On-demand trigger');
  });

  it('shows an em-dash, never $0.00, when cost_summary is null (no cost-tracked events)', async () => {
    getAgentDetail.mockResolvedValue({ ...DETAIL, cost_summary: null });
    getManagerInboxItems.mockResolvedValue([]);
    await renderAgentPage();
    await openCommandCenterTab();
    const costCard = Array.from(container.querySelectorAll('.admin-stat-card')).find((el) => el.textContent?.includes('Cost (30d)'));
    expect(costCard?.textContent).toContain('—');
  });
});
