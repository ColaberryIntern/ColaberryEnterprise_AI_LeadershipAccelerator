import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentOverviewV2NeedsAli from '../AgentOverviewV2NeedsAli';
import { ManagerInboxItem } from '../../../../services/managerInboxApi';

// Dashboard redesign, Slice 2b (2026-09-19) — the "Needs Ali" card. Ali's
// own confirmed decision: ProposedAgentAction only, real fields, no
// fabricated urgency.

function inboxItem(overrides: Partial<ManagerInboxItem> = {}): ManagerInboxItem {
  return {
    id: 'p1', actionType: 'propose_content_rewrite', reason: 'Rewrite onboarding template',
    confidence: 0.74, priorityScore: null, riskScore: null, impactScore: null,
    status: 'pending', createdAt: '2026-08-30T00:00:00Z', expiresAt: null,
    targetTable: null, targetId: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

async function renderCard(items: ManagerInboxItem[], loading = false, onNavigate: (tab: any) => void = () => {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AgentOverviewV2NeedsAli inboxItems={items} inboxLoading={loading} onNavigate={onNavigate} />);
  });
}

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('AgentOverviewV2NeedsAli', () => {
  it('honest empty state when there are no pending items', async () => {
    await renderCard([]);
    expect(container.textContent).toContain('Nothing needs your attention right now.');
  });

  it('happy path: shows real pending items with real reason/actionType/confidence', async () => {
    await renderCard([inboxItem({ id: 'p1', actionType: 'propose_content_rewrite', reason: 'Rewrite onboarding template', confidence: 0.74 })]);
    expect(container.textContent).toContain('1 item needs your review');
    expect(container.textContent).toContain('propose_content_rewrite');
    expect(container.textContent).toContain('Rewrite onboarding template');
    expect(container.textContent).toContain('0.74');
  });

  it('caps the visible list at 3 real items even when more are pending', async () => {
    await renderCard([
      inboxItem({ id: 'p1' }), inboxItem({ id: 'p2' }), inboxItem({ id: 'p3' }), inboxItem({ id: 'p4' }),
    ]);
    expect(container.textContent).toContain('4 items need your review');
    const rows = container.querySelectorAll('li');
    expect(rows.length).toBe(3);
  });

  it('shows a loading state, not a premature empty state, while inboxLoading is true', async () => {
    await renderCard([], true);
    expect(container.textContent).not.toContain('Nothing needs your attention right now.');
    expect(container.textContent).toContain('Loading');
  });

  it('"View all" navigates to the Decisions tab', async () => {
    const onNavigate = jest.fn();
    await renderCard([inboxItem()], false, onNavigate);
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('View all'));
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledWith('decisions');
  });
});
