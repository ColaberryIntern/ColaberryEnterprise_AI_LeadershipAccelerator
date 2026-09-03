import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentReportsTab from '../AgentReportsTab';
import { ReportSubscription, ReportRunHistory } from '../../../services/agentReportSubscriptionApi';

// AI Agent Dashboard redesign, Checkpoint C, Reports slice (2026-09-02) —
// pins the honest math this checkpoint's whole point was to get right:
// successRatePct === null renders as "Not enough data yet", never a
// fabricated 0% or 100%, and a failed run's real error is always shown.

jest.mock('../../../services/agentReportSubscriptionApi', () => ({
  listReportSubscriptions: jest.fn(),
  createReportSubscription: jest.fn(),
  updateReportSubscription: jest.fn(),
  getReportRuns: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listReportSubscriptions, createReportSubscription, updateReportSubscription, getReportRuns } = require('../../../services/agentReportSubscriptionApi') as {
  listReportSubscriptions: jest.Mock; createReportSubscription: jest.Mock; updateReportSubscription: jest.Mock; getReportRuns: jest.Mock;
};

const REAL_SUBSCRIPTION: ReportSubscription = {
  id: 'sub-1', agentId: 'agent-1', contentScope: ['cost', 'tickets'], cadence: 'daily',
  deliveryHourLocal: 8, timezone: 'America/Chicago', channel: 'email', enabled: true,
  createdByEmail: 'ali@colaberry.com', createdAt: '2026-08-30T00:00:00Z',
};

const EMPTY_HISTORY: ReportRunHistory = { windowDays: 30, runs: [], sent: 0, failed: 0, pending: 0, successRatePct: null };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  listReportSubscriptions.mockResolvedValue([]);
  getReportRuns.mockResolvedValue(EMPTY_HISTORY);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderTab() {
  await act(async () => {
    root.render(<AgentReportsTab agentId="agent-1" />);
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('AgentReportsTab — subscriptions', () => {
  it('shows the honest empty state when nobody has subscribed', async () => {
    await renderTab();
    expect(container.textContent).toContain('No one has subscribed to reports about this agent yet.');
  });

  it('renders a real subscription with its real cadence, hour, timezone, and sections', async () => {
    listReportSubscriptions.mockResolvedValue([REAL_SUBSCRIPTION]);
    await renderTab();
    expect(container.textContent).toContain('Daily · 08:00 America/Chicago');
    expect(container.textContent).toContain('cost, tickets');
    expect(container.textContent).toContain('Created by ali@colaberry.com');
  });

  it('toggling disable calls the real update API and refreshes the list', async () => {
    listReportSubscriptions.mockResolvedValue([REAL_SUBSCRIPTION]);
    updateReportSubscription.mockResolvedValue({ ...REAL_SUBSCRIPTION, enabled: false });
    await renderTab();

    const disableButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Disable')!;
    await act(async () => { disableButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(updateReportSubscription).toHaveBeenCalledWith('agent-1', 'sub-1', { enabled: false });
    expect(listReportSubscriptions).toHaveBeenCalledTimes(2);
  });

  it('create requires at least one section before calling the API', async () => {
    await renderTab();
    const subscribeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Subscribe')!;
    await act(async () => { subscribeButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(createReportSubscription).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Choose at least one section.');
  });

  it('create calls the real API with the chosen sections/cadence/hour', async () => {
    createReportSubscription.mockResolvedValue(REAL_SUBSCRIPTION);
    await renderTab();

    const costCheckbox = container.querySelector('#section-cost') as HTMLInputElement;
    await act(async () => { costCheckbox.click(); });

    const subscribeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Subscribe')!;
    await act(async () => { subscribeButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(createReportSubscription).toHaveBeenCalledWith('agent-1', { contentScope: ['cost'], cadence: 'daily', deliveryHourLocal: 8 });
  });
});

describe('AgentReportsTab — Delivery History honesty', () => {
  it('shows "Not enough data yet", never a fabricated rate, when there is no sent/failed evidence', async () => {
    await renderTab();
    expect(container.textContent).toContain('Not enough data yet');
    expect(container.textContent).not.toContain('0%');
    expect(container.textContent).not.toContain('100%');
  });

  it('shows the honest empty run-list state', async () => {
    await renderTab();
    expect(container.textContent).toContain('No delivery attempts in the last 30 days.');
  });

  it('computes and displays a real, non-null success rate when sent/failed data exists', async () => {
    getReportRuns.mockResolvedValue({
      windowDays: 30, sent: 2, failed: 1, pending: 0, successRatePct: 66.7,
      runs: [
        { id: 'r1', subscriptionId: 'sub-1', periodKey: '2026-09-01', generatedAt: '2026-09-01T13:00:00Z', deliveredAt: '2026-09-01T13:00:05Z', deliveryStatus: 'sent', errorMessage: null },
        { id: 'r2', subscriptionId: 'sub-1', periodKey: '2026-08-31', generatedAt: '2026-08-31T13:00:00Z', deliveredAt: null, deliveryStatus: 'failed', errorMessage: 'Mandrill timeout' },
      ],
    });
    await renderTab();
    expect(container.textContent).toContain('66.7%');
    expect(container.textContent).toContain('Mandrill timeout');
  });

  it('shows a real error when the delivery history fails to load', async () => {
    getReportRuns.mockRejectedValue({ response: { data: { error: 'Report run service unavailable' } } });
    await renderTab();
    expect(container.textContent).toContain('Report run service unavailable');
  });
});
