import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ApprovalRequestsPage from '../ApprovalRequestsPage';
import { ApprovalRequestItem } from '../../../services/approvalRequestApi';

// Real-enforcement scoping, Phase 1 (2026-09-20) — the first real UI for
// the approval-requests backend. prepared_action must render verbatim
// (never hidden/summarized), and the Approve warning must be real, present
// text, not assumed.

jest.mock('../../../services/approvalRequestApi', () => ({
  listApprovalRequests: jest.fn(),
  approveApprovalRequestItem: jest.fn(),
  rejectApprovalRequestItem: jest.fn(),
  bulkApproveApprovalRequestItems: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listApprovalRequests, approveApprovalRequestItem, rejectApprovalRequestItem, bulkApproveApprovalRequestItems } =
  require('../../../services/approvalRequestApi') as {
    listApprovalRequests: jest.Mock; approveApprovalRequestItem: jest.Mock;
    rejectApprovalRequestItem: jest.Mock; bulkApproveApprovalRequestItems: jest.Mock;
  };

const PENDING_ITEM: ApprovalRequestItem = {
  id: 'a1', agent_name: 'Reese', action: 'reese_autonomous_outreach', risk_tier: 'R3',
  verdict: 'would_require_approval', reason_code: 'requires_approval:high_risk_tier',
  prepared_action: { studentEnrollmentId: 'enrollment-1', content: 'Hi Jordan, checking in!' },
  status: 'pending', expires_at: '2026-09-21T00:00:00Z', created_at: '2026-09-20T00:00:00Z',
};

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ApprovalRequestsPage />);
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('ApprovalRequestsPage', () => {
  it('honest empty state when nothing is pending', async () => {
    listApprovalRequests.mockResolvedValue([]);
    await renderPage();
    expect(container.textContent).toContain('Nothing is waiting for review right now.');
  });

  it('happy path: shows real fields, including the real prepared_action content verbatim, never hidden', async () => {
    listApprovalRequests.mockResolvedValue([PENDING_ITEM]);
    await renderPage();

    expect(container.textContent).toContain('Reese');
    expect(container.textContent).toContain('reese_autonomous_outreach');
    expect(container.textContent).toContain('R3');
    expect(container.textContent).toContain('Hi Jordan, checking in!');
    expect(container.textContent).toContain('enrollment-1');
  });

  it('the Approve warning is real, present text — this is load-bearing, not decorative', async () => {
    listApprovalRequests.mockResolvedValue([PENDING_ITEM]);
    await renderPage();

    expect(container.textContent).toContain('Approve has a real, immediate effect');
    expect(container.textContent).toContain('This cannot be undone once sent.');
  });

  it('Approve calls the real endpoint and refreshes the list', async () => {
    listApprovalRequests.mockResolvedValueOnce([PENDING_ITEM]).mockResolvedValueOnce([]);
    approveApprovalRequestItem.mockResolvedValue({ success: true, row: { ...PENDING_ITEM, status: 'approved' } });
    await renderPage();

    const approveButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Approve')!;
    await act(async () => {
      approveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(approveApprovalRequestItem).toHaveBeenCalledWith('a1');
    expect(listApprovalRequests).toHaveBeenCalledTimes(2);
  });

  it('Reject calls the real endpoint', async () => {
    listApprovalRequests.mockResolvedValue([PENDING_ITEM]);
    rejectApprovalRequestItem.mockResolvedValue({ success: true, row: { ...PENDING_ITEM, status: 'rejected' } });
    await renderPage();

    const rejectButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Reject')!;
    await act(async () => {
      rejectButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(rejectApprovalRequestItem).toHaveBeenCalledWith('a1');
  });

  it('a real fetch failure shows an honest error, not a blank page', async () => {
    listApprovalRequests.mockRejectedValue({ response: { data: { error: 'Service unavailable' } } });
    await renderPage();
    expect(container.textContent).toContain('Service unavailable');
  });

  it('bulk-approve: selecting items shows the bulk action, and it calls the real bulk endpoint with the selected ids', async () => {
    const item2 = { ...PENDING_ITEM, id: 'a2', agent_name: 'Dara' };
    listApprovalRequests.mockResolvedValueOnce([PENDING_ITEM, item2]).mockResolvedValueOnce([]);
    bulkApproveApprovalRequestItems.mockResolvedValue({ approved: ['a1', 'a2'], skipped: [] });
    await renderPage();

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    await act(async () => {
      checkboxes.forEach((cb) => (cb as HTMLInputElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    });

    const bulkButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Approve 2 selected'))!;
    await act(async () => {
      bulkButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(bulkApproveApprovalRequestItems).toHaveBeenCalledWith(expect.arrayContaining(['a1', 'a2']));
  });

  it("no prepared_action: shows the honest 'nothing recorded, won't send' state, never a blank gap", async () => {
    listApprovalRequests.mockResolvedValue([{ ...PENDING_ITEM, prepared_action: null }]);
    await renderPage();
    expect(container.textContent).toContain('Nothing recorded — approving this will not send anything.');
  });
});
