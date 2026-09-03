import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentWorkDecisionsTab from '../AgentWorkDecisionsTab';
import { ManagerInboxItem } from '../../../services/managerInboxApi';
import { AgentExplainability } from '../../../services/agentExplainabilityApi';

// AI Agent Dashboard redesign, Checkpoint B (2026-09-02) — Work & Decisions
// tab: real pending approvals (honest real-executor-vs-decorative label)
// plus a Decision Journal from the real explainability service. Component is
// tested directly (not through the full AgentDetailPage), matching
// AgentTrustPanel.smoke.test.tsx's precedent — it owns its own explainability
// fetch, inbox items come in as props from the parent page.

jest.mock('../../../services/managerInboxApi', () => ({
  approveInboxItem: jest.fn(),
  rejectInboxItem: jest.fn(),
}));
jest.mock('../../../services/agentExplainabilityApi', () => ({ getAgentExplainability: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { approveInboxItem, rejectInboxItem } = require('../../../services/managerInboxApi') as {
  approveInboxItem: jest.Mock; rejectInboxItem: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAgentExplainability } = require('../../../services/agentExplainabilityApi') as { getAgentExplainability: jest.Mock };

const REAL_EXECUTOR_ITEM: ManagerInboxItem = {
  id: 'p1', actionType: 'update_scheduled_email', reason: 'Shift send window to 8am recipient-local',
  confidence: 0.88, priorityScore: 0.7, riskScore: 0.2, impactScore: 0.5,
  status: 'pending', createdAt: '2026-09-01T00:00:00Z', expiresAt: null,
  targetTable: 'scheduled_emails', targetId: 'email-1',
};

const DECORATIVE_ITEM: ManagerInboxItem = {
  id: 'p2', actionType: 'propose_content_rewrite', reason: 'Onboarding copy is stale',
  confidence: 0.74, priorityScore: null, riskScore: null, impactScore: null,
  status: 'pending', createdAt: '2026-09-01T00:00:00Z', expiresAt: null,
  targetTable: 'onboarding_templates', targetId: 't1',
};

const EXPLAINABILITY: AgentExplainability = {
  agentId: 'agent-1', agentName: 'CoryStrategicAgent',
  events: [
    { eventType: 'agent.authorization', outcome: 'success', model: null, costUsd: null, durationMs: null, createdAt: '2026-09-01T00:00:00Z', authorization: { verdict: 'block', reason: 'legacy ERP write', mode: 'shadow', enforced: false } },
    { eventType: 'llm.call', outcome: 'success', model: 'gpt-4o-mini', costUsd: 0.003, durationMs: 800, createdAt: '2026-09-01T00:00:00Z', authorization: null },
  ],
  proposedActions: [
    { actionType: 'propose_content_rewrite', reason: 'Onboarding copy is stale', status: 'pending', confidence: 0.74, createdAt: '2026-09-01T00:00:00Z', reviewedAt: null },
  ],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  getAgentExplainability.mockResolvedValue(EXPLAINABILITY);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderTab(props: Partial<React.ComponentProps<typeof AgentWorkDecisionsTab>> = {}) {
  await act(async () => {
    root.render(
      <AgentWorkDecisionsTab
        agentId="agent-1"
        inboxItems={[]}
        inboxLoading={false}
        inboxError={null}
        onInboxChanged={jest.fn()}
        {...props}
      />,
    );
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('AgentWorkDecisionsTab — Pending Approvals honesty', () => {
  it('labels a real executor (scheduled_emails) distinctly from a decorative one', async () => {
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM, DECORATIVE_ITEM] });
    expect(container.textContent).toContain('Real executor wired');
    expect(container.textContent).toContain('No real executor yet');
    expect(container.textContent).toContain('the scheduled_emails record is updated immediately and automatically');
    expect(container.textContent).toContain('only the decision status changes');
  });

  it('shows the empty state honestly when nothing is pending', async () => {
    await renderTab({ inboxItems: [] });
    expect(container.textContent).toContain('No approvals waiting for review right now.');
  });

  it('shows the loading state while the parent page is still fetching the inbox', async () => {
    await renderTab({ inboxLoading: true });
    expect(container.textContent).toContain('Loading pending approvals');
  });

  it('shows real risk/impact/priority scores, and an em-dash for missing ones, never a fabricated blast radius', async () => {
    await renderTab({ inboxItems: [DECORATIVE_ITEM] });
    expect(container.textContent).toContain('— / — / —');
    expect(container.textContent).toContain('Not tracked on this proposal today');
  });
});

describe('AgentWorkDecisionsTab — approve/reject wiring', () => {
  it('approve calls the real API with agentId + proposalId, then refreshes inbox and journal', async () => {
    const onInboxChanged = jest.fn();
    approveInboxItem.mockResolvedValue({ success: true, applied: true, item: { ...REAL_EXECUTOR_ITEM, status: 'approved' } });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM], onInboxChanged });

    const approveButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Approve')!;
    await act(async () => {
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(approveInboxItem).toHaveBeenCalledWith('agent-1', 'p1');
    expect(onInboxChanged).toHaveBeenCalled();
    expect(getAgentExplainability).toHaveBeenCalledTimes(2); // once on mount, once after approve
  });

  it('reject calls the real API and surfaces a real error honestly on failure', async () => {
    rejectInboxItem.mockRejectedValue({ response: { data: { error: 'Proposal already decided' } } });
    await renderTab({ inboxItems: [DECORATIVE_ITEM] });

    const rejectButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Reject')!;
    await act(async () => {
      rejectButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(rejectInboxItem).toHaveBeenCalledWith('agent-1', 'p2');
    expect(container.textContent).toContain('Proposal already decided');
  });
});

describe('AgentWorkDecisionsTab — Decision Journal', () => {
  it('renders the real shadow-mode wording for an agent.authorization event, never a bare "Blocked" badge', async () => {
    await renderTab();
    expect(container.textContent).toContain('Policy result: block. Enforcement: observation only (shadow). Actual result: continued regardless of the verdict.');
  });

  it('renders a real non-authorization event with its real model/cost/duration', async () => {
    await renderTab();
    expect(container.textContent).toContain('llm.call');
    expect(container.textContent).toContain('gpt-4o-mini');
    expect(container.textContent).toContain('$0.0030');
    expect(container.textContent).toContain('800ms');
  });

  it('renders a real proposed action entry with its real reason and confidence', async () => {
    await renderTab();
    expect(container.textContent).toContain('propose_content_rewrite');
    expect(container.textContent).toContain('Onboarding copy is stale');
    expect(container.textContent).toContain('confidence 0.74');
  });

  it('shows the honest empty state when there are zero events and zero proposed actions', async () => {
    getAgentExplainability.mockResolvedValue({ agentId: 'agent-1', agentName: 'X', events: [], proposedActions: [] });
    await renderTab();
    expect(container.textContent).toContain('No events or proposals recorded for this agent yet.');
  });

  it('shows a real, honest error message when the journal fails to load, never a silent failure', async () => {
    getAgentExplainability.mockRejectedValue({ response: { data: { error: 'Explainability service unavailable' } } });
    await renderTab();
    expect(container.textContent).toContain('Explainability service unavailable');
  });
});
