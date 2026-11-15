/**
 * T15 - the review queue, and the one property that carries all the risk.
 *
 * THERE IS NO WAY TO APPROVE A MESSAGE WITHOUT OPENING IT.
 *
 * Not a checkbox column, not an "approve all", not an approve button on a list row. The
 * assertions below count controls rather than look for a named element, because the way this
 * property gets lost is somebody adding a convenience, not somebody removing a guard.
 *
 * The reason is measured, not theoretical: `approvalRequestTimeoutJob.ts` approved every expired
 * pending row on a fifteen-minute cron and `reeseOutreachHolds.ts` records the cost - 851
 * replayed DMs to 52 students, one of them 37 times. A bulk button is the same decision made by a
 * person in one click.
 *
 * TEST STYLE: this repo has no `@testing-library/react`; frontend suites drive React through
 * `createRoot` and `act`. Matching the sibling suites rather than adding a dependency.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockList = jest.fn();
const mockGet = jest.fn();
const mockApprove = jest.fn();
const mockReject = jest.fn();
jest.mock('../../../services/mayaConsoleApi', () => ({
  listOutboundQueue: (...a: unknown[]) => mockList(...a),
  getOutboundMessage: (...a: unknown[]) => mockGet(...a),
  approveOutboundMessage: (...a: unknown[]) => mockApprove(...a),
  rejectOutboundMessage: (...a: unknown[]) => mockReject(...a),
  // Mirrors the real one, so the "the server's own sentence" assertion is not vacuous.
  mayaErrorMessage: (e: unknown, fallback: string) => (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  ),
}));

// eslint-disable-next-line import/first
import AdminOutboundApprovalsPage from '../AdminOutboundApprovalsPage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><AdminOutboundApprovalsPage /></MemoryRouter>);
  });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

async function click(el: Element | null): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

const SUMMARY = {
  id: 'msg-1',
  recipient_ref: 'lead:abc',
  recipient_masked: 's***@example.com',
  recipient_display: 'A Student',
  channel: 'email',
  subject: 'Your program guide',
  body_preview: 'Hello from Maya, an AI assistant.',
  composed_by: 'send_document',
  capability: 'sendDocument',
  correlation_id: 'corr-1',
  status: 'pending_approval',
  created_at: '2026-11-15T12:00:00Z',
  expires_at: '2026-11-22T12:00:00Z',
};
const DETAIL = {
  ...SUMMARY,
  body: '<p>Hello from Maya, an AI assistant.</p>',
  body_hash: 'abcdef0123456789abcdef',
  decided_by: null, decided_at: null, decision_note: null, delivered_at: null, failure_reason: null,
};

const buttons = () => [...container.querySelectorAll('button')];
const labels = () => buttons().map((b) => (b.textContent || '').trim().toLowerCase());

beforeEach(() => {
  mockList.mockReset().mockResolvedValue({ pending: [SUMMARY, { ...SUMMARY, id: 'msg-2' }], count: 2 });
  mockGet.mockReset().mockResolvedValue(DETAIL);
  mockApprove.mockReset().mockResolvedValue({ ok: true, id: 'msg-1', status: 'sent' });
  mockReject.mockReset().mockResolvedValue({ ok: true, id: 'msg-1', status: 'rejected' });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container?.remove();
});

describe('T15 the list cannot decide anything', () => {
  it('CONTROL - the queue really did render two rows, so the counts below mean something', async () => {
    await render();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('offers exactly one control per row, and it is Open', async () => {
    await render();
    // Two rows, two buttons in the table body, both Open. A third per row would be an approve.
    const rowButtons = [...container.querySelectorAll('tbody button')];
    expect(rowButtons).toHaveLength(2);
    for (const b of rowButtons) expect((b.textContent || '').trim()).toBe('Open');
  });

  it('renders no approve or reject control before a message is opened', async () => {
    await render();
    expect(labels().some((l) => l.includes('approve'))).toBe(false);
    expect(labels().some((l) => l.includes('reject'))).toBe(false);
  });

  it('renders no bulk control of any shape', async () => {
    await render();
    for (const l of labels()) {
      expect(l).not.toMatch(/all|bulk|selected|batch/);
    }
    // A checkbox column is the other way a bulk decision arrives.
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });
});

describe('T15 a decision is made on one opened message', () => {
  it('shows the exact bytes as source rather than rendering them', async () => {
    await render();
    await click(container.querySelector('tbody button'));
    expect(mockGet).toHaveBeenCalledWith('msg-1');
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    // The HTML is TEXT. If it had been injected, the <p> would be an element and this would be
    // "Hello from Maya, an AI assistant." with no tags.
    expect(pre!.textContent).toContain('<p>Hello from Maya, an AI assistant.</p>');
    expect(pre!.querySelector('p')).toBeNull();
  });

  it('now offers exactly one approve, for that one id', async () => {
    await render();
    await click(container.querySelector('tbody button'));
    const approve = buttons().filter((b) => (b.textContent || '').toLowerCase().includes('approve'));
    expect(approve).toHaveLength(1);
    await click(approve[0]);
    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove).toHaveBeenCalledWith('msg-1', undefined);
  });

  it('never names an approver, because the server reads it off the session', async () => {
    await render();
    await click(container.querySelector('tbody button'));
    await click(buttons().find((b) => (b.textContent || '').toLowerCase().includes('approve'))!);
    const [, second] = mockApprove.mock.calls[0];
    expect(second).toBeUndefined();
    expect(JSON.stringify(mockApprove.mock.calls)).not.toMatch(/ali@|system:|unknown/);
  });

  it('will not reject without a note', async () => {
    await render();
    await click(container.querySelector('tbody button'));
    const reject = buttons().find((b) => (b.textContent || '').trim() === 'Reject') as HTMLButtonElement;
    expect(reject.disabled).toBe(true);
    await click(reject);
    expect(mockReject).not.toHaveBeenCalled();
  });

  it('shows the server\'s own refusal sentence rather than a generic failure', async () => {
    mockApprove.mockRejectedValue({
      response: { data: { error: 'This message changed after it was composed. It was not sent. Compose it again.' } },
    });
    await render();
    await click(container.querySelector('tbody button'));
    await click(buttons().find((b) => (b.textContent || '').toLowerCase().includes('approve'))!);
    expect(container.textContent).toContain('It was not sent. Compose it again.');
  });

  it('closes the message and refreshes the queue after a decision', async () => {
    await render();
    expect(mockList).toHaveBeenCalledTimes(1);
    await click(container.querySelector('tbody button'));
    await click(buttons().find((b) => (b.textContent || '').toLowerCase().includes('approve'))!);
    expect(mockList).toHaveBeenCalledTimes(2);
    // And the panel is gone, so a second click cannot re-decide what was just decided.
    expect(container.querySelector('pre')).toBeNull();
    expect(labels().some((l) => l.includes('approve'))).toBe(false);
  });

  it('never shows an unmasked address, because the API does not carry one', async () => {
    await render();
    await click(container.querySelector('tbody button'));
    expect(container.textContent).toContain('s***@example.com');
    expect(container.textContent).not.toContain('student@example.com');
  });
});

describe('T15 the empty queue says so', () => {
  it('renders an empty state and no decision controls', async () => {
    mockList.mockResolvedValue({ pending: [], count: 0 });
    await render();
    expect(container.textContent).toContain('Nothing is waiting');
    expect(labels().some((l) => l.includes('approve'))).toBe(false);
  });
});
