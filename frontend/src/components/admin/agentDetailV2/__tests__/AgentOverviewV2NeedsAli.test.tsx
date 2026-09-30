import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentOverviewV2NeedsAli from '../AgentOverviewV2NeedsAli';
import { ManagerInboxItem } from '../../../../services/managerInboxApi';

// Dashboard redesign, Slice 2b (2026-09-19) — the "Needs Ali" card. Ali's
// own confirmed decision: ProposedAgentAction only, real fields, no
// fabricated urgency.
//
// Agent Detail polish round 5 (2026-09-30) — Ali, live: "Needs Ali section
// should make sure it has the functionality that you see in the
// screenshot." Real "Approval required" pill, real "Why this action?" box,
// real "Review & decide" (approveInboxItem) and "See evidence"
// (getInboxItemInspector) — the same 2 real APIs already proven on the
// Decisions tab, reused inline here rather than duplicated.

jest.mock('../../../../services/managerInboxApi', () => {
  const actual = jest.requireActual('../../../../services/managerInboxApi');
  return { ...actual, approveInboxItem: jest.fn(), getInboxItemInspector: jest.fn() };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { approveInboxItem, getInboxItemInspector } = require('../../../../services/managerInboxApi') as {
  approveInboxItem: jest.Mock; getInboxItemInspector: jest.Mock;
};

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

async function renderCard(
  items: ManagerInboxItem[],
  loading = false,
  onNavigate: (tab: any) => void = () => {},
  onInboxChanged: () => void = () => {},
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AgentOverviewV2NeedsAli
        agentId="agent-1"
        inboxItems={items}
        inboxLoading={loading}
        onInboxChanged={onInboxChanged}
        onNavigate={onNavigate}
      />,
    );
  });
}

beforeEach(() => { jest.clearAllMocks(); });

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

  it('shows an "Approval required" pill and a "Why this action?" box with the real reason', async () => {
    await renderCard([inboxItem({ reason: 'Onboarding copy is stale' })]);
    expect(container.textContent).toContain('Approval required');
    expect(container.textContent).toContain('Why this action?');
    // The real reason appears at least twice: the summary line and the box.
    const occurrences = container.textContent?.split('Onboarding copy is stale').length! - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('"Review & decide" calls the real approveInboxItem and refreshes the inbox', async () => {
    approveInboxItem.mockResolvedValue({ success: true, item: inboxItem({ status: 'approved' }) });
    const onInboxChanged = jest.fn();
    await renderCard([inboxItem({ id: 'p1' })], false, () => {}, onInboxChanged);

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Review & decide');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(approveInboxItem).toHaveBeenCalledWith('agent-1', 'p1');
    expect(onInboxChanged).toHaveBeenCalled();
  });

  it('a failed approve shows a real error message, not a silent failure', async () => {
    approveInboxItem.mockRejectedValue({ response: { data: { error: 'Proposal already decided' } } });
    await renderCard([inboxItem({ id: 'p1' })]);

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Review & decide');
    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.textContent).toContain('Proposal already decided');
  });

  it('"See evidence" fetches and renders the real 3 inspector fields, then hides without re-fetching', async () => {
    getInboxItemInspector.mockResolvedValue({
      blastRadius: '1 recipient', reversibility: 'Reversible', expectedResult: 'Subject changes.',
    });
    await renderCard([inboxItem({ id: 'p1' })]);

    const seeBtn = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'See evidence' || b.textContent === 'Hide evidence');
    await act(async () => { seeBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(getInboxItemInspector).toHaveBeenCalledWith('agent-1', 'p1');
    expect(container.textContent).toContain('1 recipient');
    expect(container.textContent).toContain('Reversible');
    expect(container.textContent).toContain('Subject changes.');

    await act(async () => { seeBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toContain('1 recipient');

    await act(async () => { seeBtn()!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(getInboxItemInspector).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('1 recipient');
  });

  it('an evidence fetch failure shows an honest error, not a blank panel', async () => {
    getInboxItemInspector.mockRejectedValue(new Error('network error'));
    await renderCard([inboxItem({ id: 'p1' })]);

    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'See evidence');
    await act(async () => { button!.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(container.textContent).toContain('Could not load this evidence.');
  });
});
