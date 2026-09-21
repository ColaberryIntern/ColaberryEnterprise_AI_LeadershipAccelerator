import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentOverviewV2WorkExplained from '../AgentOverviewV2WorkExplained';
import { AgentExplainability } from '../../../../services/agentExplainabilityApi';

// "Work, explained" — the Overview tab's narrative preview of the same real
// Decision Journal data AgentWorkDecisionsTab.tsx already fetches. No new
// backend data: this component reuses getAgentExplainability() verbatim.

jest.mock('../../../../services/agentExplainabilityApi', () => ({ getAgentExplainability: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getAgentExplainability } = require('../../../../services/agentExplainabilityApi') as { getAgentExplainability: jest.Mock };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderCard(onNavigate = jest.fn()) {
  await act(async () => {
    root.render(<AgentOverviewV2WorkExplained agentId="agent-1" onNavigate={onNavigate} />);
    await new Promise((r) => setTimeout(r, 0));
  });
  return onNavigate;
}

const EMPTY: AgentExplainability = { agentId: 'agent-1', agentName: 'Reese', events: [], proposedActions: [] };

describe('AgentOverviewV2WorkExplained', () => {
  it('shows the honest empty state when nothing has been recorded', async () => {
    getAgentExplainability.mockResolvedValue(EMPTY);
    await renderCard();
    expect(container.textContent).toContain('No decisions or events recorded for this agent yet.');
  });

  it('shows an error state on failure, not a silent blank card', async () => {
    getAgentExplainability.mockRejectedValue({ response: { data: { error: 'DB unavailable' } } });
    await renderCard();
    expect(container.textContent).toContain('DB unavailable');
  });

  it('merges real events and proposed actions into one timeline, most recent first', async () => {
    getAgentExplainability.mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Reese',
      events: [
        { eventType: 'llm.call', outcome: 'success', model: 'gpt-4o', costUsd: 0.02, durationMs: 400, createdAt: '2026-09-20T10:00:00Z', authorization: null },
      ],
      proposedActions: [
        { actionType: 'send_followup', reason: 'Student inactive 9 days', status: 'approved', confidence: 0.8, createdAt: '2026-09-20T12:00:00Z', reviewedAt: null },
      ],
    } as AgentExplainability);

    await renderCard();

    const items = Array.from(container.querySelectorAll('li')).map((li) => li.textContent || '');
    expect(items.length).toBe(2);
    // The later proposedAction (12:00) renders before the earlier event (10:00).
    expect(items[0]).toContain('send_followup');
    expect(items[1]).toContain('llm.call');
  });

  it('shows a real authorization verdict line for an authorization-shaped event, exactly as the Decision Journal does', async () => {
    getAgentExplainability.mockResolvedValue({
      agentId: 'agent-1',
      agentName: 'Reese',
      events: [
        { eventType: 'agent.authorization', outcome: 'success', model: null, costUsd: null, durationMs: null, createdAt: '2026-09-20T10:00:00Z', authorization: { verdict: 'block', reason: 'kill_switch_active', mode: 'shadow', enforced: false } },
      ],
      proposedActions: [],
    } as AgentExplainability);

    await renderCard();

    expect(container.textContent).toContain('block');
    expect(container.textContent).toContain('kill_switch_active');
  });

  it('caps the preview at 6 entries even when more are real', async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      eventType: 'llm.call', outcome: 'success', model: null, costUsd: null, durationMs: null,
      createdAt: `2026-09-2${i}T00:00:00Z`, authorization: null,
    }));
    getAgentExplainability.mockResolvedValue({ agentId: 'agent-1', agentName: 'Reese', events, proposedActions: [] } as AgentExplainability);

    await renderCard();

    expect(container.querySelectorAll('li').length).toBe(6);
  });

  it('"View full decision journal" calls onNavigate with the real decisions tab key', async () => {
    getAgentExplainability.mockResolvedValue(EMPTY);
    const onNavigate = await renderCard();

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'View full decision journal')!;
    await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(onNavigate).toHaveBeenCalledWith('decisions');
  });
});
