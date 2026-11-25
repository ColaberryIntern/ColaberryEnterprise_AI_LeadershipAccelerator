import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The recap panel (WL1.4). The order is enforced: the real send stays disabled until the overview is
 * saved, the next-event link is https, and the test copy went to Ali (his pre-approval condition).
 * Sending asks for confirmation with the exact count first.
 */
jest.mock('../../../../services/weeklyLiveRecapApi', () => ({
  __esModule: true,
  getRecap: jest.fn(), saveRecap: jest.fn(), draftRecap: jest.fn(), sendRecap: jest.fn(),
  recapError: (e: { response?: { data?: { error?: string; violations?: unknown[] } } }) => ({ message: e?.response?.data?.error || 'Something went wrong. Try again.', violations: e?.response?.data?.violations || [] }),
}));

import { getRecap, sendRecap } from '../../../../services/weeklyLiveRecapApi';
import StudioRecapPanel, { canSend } from '../StudioRecapPanel';

const mockGet = getRecap as unknown as jest.Mock;
const mockSend = sendRecap as unknown as jest.Mock;
const SUMMARY = { headline: 'It Works While You Sleep', intro: '', ideas: [{ icon: '', title: 'One skill, one job', text: '' }], steps: [], quote: '', homework: '' };
const state = (over: Record<string, unknown> = {}) => ({
  session: { id: 's1', title: 'Weekly Live Ep 2', date: '2026-11-30' }, summary: SUMMARY, hasSavedSummary: true,
  nextEventUrl: 'https://www.eventbrite.com/e/1', testSentAt: '2026-12-01T14:00:00Z',
  counts: { queued: 0, sending: 0, sent: 0, failed: 0, skipped: 1 },
  dry: { toSend: 31, alreadySent: 0, skipped: { test_guest: 1 }, checkedIn: 32 }, ...over,
});

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;

describe('canSend', () => {
  const ok = { hasSavedSummary: true, nextEventUrl: 'https://www.eventbrite.com/e/1', testSentAt: 'x' };
  it('needs saved overview, https link, test copy, and no unsaved edits', () => {
    expect(canSend(ok, false)).toBe(true);
    expect(canSend(ok, true)).toBe(false);
    expect(canSend({ ...ok, hasSavedSummary: false }, false)).toBe(false);
    expect(canSend({ ...ok, nextEventUrl: 'http://x.com' }, false)).toBe(false);
    expect(canSend({ ...ok, nextEventUrl: '' }, false)).toBe(false);
    expect(canSend({ ...ok, testSentAt: null }, false)).toBe(false);
  });
});

it('shows the counts and keeps Send disabled until the test copy went out', async () => {
  mockGet.mockResolvedValue(state({ testSentAt: null }));
  act(() => { root.render(<StudioRecapPanel sessionId="s1" onClose={() => undefined} />); });
  await flush();
  expect(q('recap-counts')?.textContent).toContain('32 checked in');
  expect(q('recap-counts')?.textContent).toContain('31 will get the recap');
  expect(q('recap-counts')?.textContent).toContain('1 test check-ins');
  expect(q('recap-send')?.disabled).toBe(true);
  expect(q('recap-send-why')).not.toBeNull();
});

it('asks for confirmation with the count, then sends once and shows the result', async () => {
  mockGet.mockResolvedValue(state());
  mockSend.mockResolvedValue({ sent: 31, failed: 0, skippedNow: 1, alreadySent: 0 });
  act(() => { root.render(<StudioRecapPanel sessionId="s1" onClose={() => undefined} />); });
  await flush();
  expect(q('recap-send')?.disabled).toBe(false);
  expect(q('recap-send')?.textContent).toContain('Send to 31 people');
  act(() => { q('recap-send')!.click(); });
  expect(q('recap-confirm')?.textContent).toContain('31 people');
  expect(mockSend).not.toHaveBeenCalled();
  await act(async () => { q('recap-confirm-yes')!.click(); });
  await flush();
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend).toHaveBeenCalledWith('s1', 'send');
  expect(q('recap-result')?.textContent).toContain('Sent 31');
});

it('editing the overview disables Send until it is saved again', async () => {
  mockGet.mockResolvedValue(state());
  act(() => { root.render(<StudioRecapPanel sessionId="s1" onClose={() => undefined} />); });
  await flush();
  const headline = container.querySelector('#rcp-headline') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => { setter.call(headline, 'New headline'); headline.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(q('recap-send')?.disabled).toBe(true);
  expect(q('recap-test')?.disabled).toBe(true);
});

it('a load failure shows the error and a way out', async () => {
  mockGet.mockRejectedValue({ response: { data: { error: 'Class not found' } } });
  act(() => { root.render(<StudioRecapPanel sessionId="s1" onClose={() => undefined} />); });
  await flush();
  expect(container.textContent).toContain('Class not found');
  expect(container.textContent).toContain('Close');
});
