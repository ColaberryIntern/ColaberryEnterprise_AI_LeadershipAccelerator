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
  getInboxItemInspector: jest.fn(),
}));
jest.mock('../../../services/agentExplainabilityApi', () => ({ getAgentExplainability: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { approveInboxItem, rejectInboxItem, getInboxItemInspector } = require('../../../services/managerInboxApi') as {
  approveInboxItem: jest.Mock; rejectInboxItem: jest.Mock; getInboxItemInspector: jest.Mock;
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

  it('shows real risk/impact/priority scores, and an em-dash for missing ones', async () => {
    await renderTab({ inboxItems: [DECORATIVE_ITEM] });
    expect(container.textContent).toContain('— / — / —');
  });
});

describe('AgentWorkDecisionsTab — decision inspector (Slice 2c)', () => {
  it('does not fetch the inspector until "View details" is clicked', async () => {
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });
    expect(getInboxItemInspector).not.toHaveBeenCalled();
  });

  it('clicking "View details" fetches and renders the real 3 fields', async () => {
    getInboxItemInspector.mockResolvedValue({
      blastRadius: '1 recipient',
      reversibility: 'Reversible — this email has not sent yet',
      expectedResult: "Subject changes from 'Old' to 'New'.",
    });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(getInboxItemInspector).toHaveBeenCalledWith('agent-1', 'p1');
    expect(container.textContent).toContain('1 recipient');
    expect(container.textContent).toContain('Reversible — this email has not sent yet');
    expect(container.textContent).toContain("Subject changes from 'Old' to 'New'.");
  });

  it('a second click on "Hide details" collapses without re-fetching', async () => {
    getInboxItemInspector.mockResolvedValue({ blastRadius: '1 recipient', reversibility: 'x', expectedResult: 'y' });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const firstClick = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => { firstClick().dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(container.textContent).toContain('1 recipient');

    const hideButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Hide details')!;
    await act(async () => { hideButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toContain('1 recipient');

    const reopenButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => { reopenButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(getInboxItemInspector).toHaveBeenCalledTimes(1); // cached, not re-fetched
    expect(container.textContent).toContain('1 recipient');
  });

  it('shows an honest error, not a blank panel, when the fetch fails', async () => {
    getInboxItemInspector.mockRejectedValue(new Error('network error'));
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('Could not load these details.');
  });
});

// Agent Detail redesign, Track E (2026-09-28) — the new 4-quadrant inspector.
// Quadrants 1-2 have no real backing anywhere in this codebase and must
// honestly disclose that, never invent a trigger or a "known facts" story.
describe('AgentWorkDecisionsTab — 4-quadrant inspector honesty (Track E)', () => {
  it('quadrant 1 ("What started this?") honestly discloses no trigger is tracked, never a fabricated one', async () => {
    getInboxItemInspector.mockResolvedValue({ blastRadius: 'x', reversibility: 'y', expectedResult: 'z' });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(container.textContent).toContain('What started this?');
    expect(container.textContent).toContain('Not tracked — this codebase does not record what triggered this proposal.');
    expect(container.textContent).toContain('scheduled_emails (email-1)');
  });

  it('quadrant 2 ("What does Reese know?") shows the real confidence/risk/impact/priority scores, honestly labeled as scores not facts', async () => {
    getInboxItemInspector.mockResolvedValue({ blastRadius: 'x', reversibility: 'y', expectedResult: 'z' });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(container.textContent).toContain('What does Reese know?');
    expect(container.textContent).toContain('Not tracked as a facts list');
    expect(container.textContent).toContain('Confidence 0.88 · Risk 0.2 · Impact 0.5 · Priority 0.7');
  });

  it('quadrants 3-4 still show the real reason/blast-radius/reversibility/expected-result data, honestly labeled "if approved"', async () => {
    getInboxItemInspector.mockResolvedValue({
      blastRadius: '1 recipient',
      reversibility: 'Reversible — this email has not sent yet',
      expectedResult: "Subject changes from 'Old' to 'New'.",
    });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(container.textContent).toContain('Why this next step?');
    expect(container.textContent).toContain('Shift send window to 8am recipient-local');
    expect(container.textContent).toContain('1 recipient');
    expect(container.textContent).toContain('What actually happened?');
    expect(container.textContent).toContain('Expected outcome if approved');
    expect(container.textContent).toContain("Subject changes from 'Old' to 'New'.");
  });

  it('never renders the mockup-only fictional narrative — no fabricated trigger, no fabricated "known facts" list', async () => {
    getInboxItemInspector.mockResolvedValue({ blastRadius: 'x', reversibility: 'y', expectedResult: 'z' });
    await renderTab({ inboxItems: [REAL_EXECUTOR_ITEM] });

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View details')!;
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    // The mockup's own fictional per-case fields (trigger/known/unknown prose) never appear.
    expect(container.textContent).not.toContain('Student reported');
    expect(container.textContent).not.toContain('Unknown or excluded');
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

  // Agent Detail polish round 4 (2026-09-30) — Ali, live: "I don't
  // understand Decision Journal - can we get more details on this so we can
  // make sense... this page is pretty confusing." Purely additive labeling/
  // framing of already-real data — zero change to the fetch or data shape.
  it('labels an agent.authorization event as "Authorization check"', async () => {
    await renderTab();
    const pills = Array.from(container.querySelectorAll('.adv2-pill'));
    expect(pills.some((p) => p.textContent === 'Authorization check')).toBe(true);
  });

  it('labels a non-authorization event as "System event"', async () => {
    await renderTab();
    const pills = Array.from(container.querySelectorAll('.adv2-pill'));
    expect(pills.some((p) => p.textContent === 'System event')).toBe(true);
  });

  it('labels a proposed-action entry as "Proposal outcome"', async () => {
    await renderTab();
    const pills = Array.from(container.querySelectorAll('.adv2-pill'));
    expect(pills.some((p) => p.textContent === 'Proposal outcome')).toBe(true);
  });

  it('the header hint plainly states this journal is agent-wide, not ticket-specific', async () => {
    await renderTab();
    expect(container.textContent).toContain('not specific to any one ticket');
    expect(container.textContent).toContain('real recorded fact');
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
