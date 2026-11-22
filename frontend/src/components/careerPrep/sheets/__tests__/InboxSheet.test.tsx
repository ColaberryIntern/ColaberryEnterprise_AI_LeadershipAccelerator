import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { InboxView } from '../../inboxApi';
import { InboxSheet } from '../InboxSheet';

/** CP6.1 (kit F2): the #inbox sheet shows only what the server says, and says plainly when there is nothing. */
const mockInbox = jest.fn();
const mockSave = jest.fn();
const mockReceived = jest.fn();
jest.mock('../../inboxApi', () => ({
  CENTRAL_INBOX: 'c_interviews@colaberry.com',
  fetchInboxApi: (...a: unknown[]) => mockInbox(...a),
  saveInboxApi: (...a: unknown[]) => mockSave(...a),
  fetchReceivedApi: (...a: unknown[]) => mockReceived(...a),
}));

const EMPTY: InboxView = { address: null, health: 'setup', healthLabel: 'Not set up yet', verifiedAt: null, forwardingConfirmedAt: null, lastReceivedAt: null,
  lastTestAt: null, lastTestMs: null, receivedThisMonth: 0, steps: { create: false, added: false, forwarding: false, tested: false } };
// The real server's view right after a save: forwarding not verified yet, so still "Not set up yet" (inboxHealth.ts).
const SAVED: InboxView = { ...EMPTY, address: 'ann.lee.careers@gmail.com', steps: { create: true, added: true, forwarding: false, tested: false } };

let host: HTMLDivElement | null = null;
let root: Root | null = null;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function mount(): Promise<HTMLDivElement> {
  const h = document.createElement('div'); document.body.appendChild(h);
  const r = createRoot(h); host = h; root = r;
  act(() => { r.render(<InboxSheet />); });
  await flush();
  return h;
}
const q = (h: HTMLElement, id: string) => h.querySelector(`[data-testid="${id}"]`);
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
beforeEach(() => { mockInbox.mockReset(); mockSave.mockReset(); mockReceived.mockReset().mockResolvedValue([]); });

describe('the #inbox sheet (CP6.1)', () => {
  it('before setup: the four steps (none done), the forwarding path to the central inbox, nothing received, what we never do', async () => {
    mockInbox.mockResolvedValue(EMPTY);
    const h = await mount();
    expect(q(h, 'cp-inbox-addr')?.textContent).toBe('No address yet');
    expect(q(h, 'cp-inbox-health')?.textContent).toBe('Not set up yet');
    expect(h.querySelectorAll('[data-testid^="cp-inbox-step-"]')).toHaveLength(4);
    expect(h.querySelectorAll('[data-done="yes"]')).toHaveLength(0);
    expect(q(h, 'cp-inbox-step-forwarding')?.textContent).toContain('c_interviews@colaberry.com');
    expect(q(h, 'cp-inbox-empty')?.textContent).toBe('Nothing has arrived yet.');
    expect(q(h, 'cp-inbox-never')?.textContent).toContain('We never log in to your Gmail');
    expect(h.textContent).toContain('0 this month');
  });

  it('saving an address sends it once, then shows the server\'s inbox with steps 1 and 2 done', async () => {
    mockInbox.mockResolvedValue(EMPTY);
    mockSave.mockResolvedValue(SAVED);
    const h = await mount();
    const input = q(h, 'cp-inbox-address') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, ' ann.lee.careers@gmail.com ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { (q(h, 'cp-inbox-save') as HTMLButtonElement).click(); });
    await flush();
    expect(mockSave).toHaveBeenCalledWith('ann.lee.careers@gmail.com');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(q(h, 'cp-inbox-addr')?.textContent).toBe('ann.lee.careers@gmail.com');
    expect(q(h, 'cp-inbox-step-added')?.getAttribute('data-done')).toBe('yes');
    expect(q(h, 'cp-inbox-step-tested')?.getAttribute('data-done')).toBe('no');
  });

  it('the server\'s refusal (another learner\'s inbox) is shown as it said it', async () => {
    mockInbox.mockResolvedValue(EMPTY);
    mockSave.mockRejectedValue({ response: { data: { error: 'Another learner already uses that Gmail inbox. Make one just for your own job search.' } } });
    const h = await mount();
    const input = q(h, 'cp-inbox-address') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'abc@gmail.com'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => { (q(h, 'cp-inbox-save') as HTMLButtonElement).click(); });
    await flush();
    expect(q(h, 'cp-inbox-problem')?.textContent).toContain('Another learner already uses that Gmail inbox');
  });

  it('a broken forwarding says so, and received mail is listed with how it was read', async () => {
    // A state the server can really produce: verified and forwarding confirmed earlier, the latest test sent and not arrived.
    mockInbox.mockResolvedValue({ ...SAVED, health: 'broken', healthLabel: 'Forwarding broken', verifiedAt: '2026-11-10T15:00:00Z', forwardingConfirmedAt: '2026-11-09T15:00:00Z',
      lastTestAt: '2026-11-21T14:00:00Z', lastTestMs: null, lastReceivedAt: '2026-11-21T15:00:00Z', receivedThisMonth: 2,
      steps: { create: true, added: true, forwarding: true, tested: true } });
    mockReceived.mockResolvedValue([{ messageId: '<m1>', receivedAt: '2026-11-21T15:00:00Z', fromName: 'A recruiter', subject: 'Interview request', category: 'interview', confidence: 0.97, outcome: null }]);
    const h = await mount();
    expect(q(h, 'cp-inbox-health')?.className).toContain('bad');
    expect(h.textContent).toContain('Your forwarding stopped working');
    expect(h.textContent).toContain('2 this month');
    const table = q(h, 'cp-inbox-received') as HTMLElement;
    expect(table.textContent).toContain('A recruiter · Interview request');
    expect(table.textContent).toContain('interview 97%');
    expect(table.textContent).toContain('Nothing yet');
  });

  it('a failed load of what was received is an alert, never the "nothing arrived" empty state', async () => {
    mockInbox.mockResolvedValue(SAVED);
    mockReceived.mockRejectedValue(new Error('offline'));
    const h = await mount();
    expect(q(h, 'cp-inbox-received-failed')?.textContent).toBe('Could not load what your inbox received.');
    expect(q(h, 'cp-inbox-received-failed')?.getAttribute('role')).toBe('alert');
    expect(q(h, 'cp-inbox-empty')).toBeNull();
    expect(q(h, 'cp-inbox-status')).not.toBeNull();
  });

  it('a failed load says so plainly instead of showing anything made up', async () => {
    mockInbox.mockRejectedValue(new Error('offline'));
    const h = await mount();
    expect(q(h, 'cp-inbox-failed')?.textContent).toContain('Could not load your job-search inbox');
    expect(q(h, 'cp-inbox-status')).toBeNull();
  });
});
