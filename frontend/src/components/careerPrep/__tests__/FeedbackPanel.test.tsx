import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { FeedbackPanel } from '../FeedbackPanel';
import type { FeedbackItem } from '../feedbackApi';
import { fitSize } from '../logic/shrinkImage';

/** Career Prep pilot feedback (Ali, 2026-11-25). */
const mockFetch = jest.fn();
const mockSend = jest.fn();
const mockSeen = jest.fn();
jest.mock('../feedbackApi', () => ({
  fetchFeedback: (...a: unknown[]) => mockFetch(...a), sendFeedback: (...a: unknown[]) => mockSend(...a),
  markFeedbackSeen: (...a: unknown[]) => mockSeen(...a), watchPortalFailures: () => undefined,
}));

const item = (o: Partial<FeedbackItem> = {}): FeedbackItem => ({ id: 'f1', kind: 'idea', message: 'Add a timer', status: 'new', unread: false, createdAt: '2026-11-25T14:00:00Z', ...o });
let host: HTMLDivElement;
let root: Root;
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const click = async (id: string) => { await act(async () => { q(id)!.click(); }); await flush(); };
const type = (text: string) => act(() => {
  const el = q('cp-pfb-message') as HTMLTextAreaElement;
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const mount = async () => { act(() => { root.render(<FeedbackPanel tab="session" sheet="offers" interviewId="i1" />); }); await flush(); };
const value = () => (q('cp-pfb-message') as HTMLTextAreaElement).value;

beforeEach(() => {
  mockFetch.mockReset().mockResolvedValue([]); mockSend.mockReset().mockResolvedValue(item()); mockSeen.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

it('sends the kind, the words and where the student was, then shows it as received', async () => {
  await mount(); await click('cp-pfb-open'); await click('cp-pfb-kind-idea');
  expect((q('cp-pfb-send') as HTMLButtonElement).disabled).toBe(true);
  type('Add a timer');
  await click('cp-pfb-send');
  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend.mock.calls[0][0]).toMatchObject({ kind: 'idea', message: 'Add a timer', context: { tab: 'session', sheet: 'offers', interviewId: 'i1' } });
  expect(host.querySelector('[role="status"]')!.textContent).toContain('Sent.');
  expect(q('cp-pfb-item')!.textContent).toContain('Received');
  expect(value()).toBe('');
});
it('a failed send keeps the words, and the retry uses the same key; the next item gets a new one', async () => {
  mockSend.mockRejectedValueOnce(new Error('offline'));
  await mount(); await click('cp-pfb-open'); type('It broke');
  await click('cp-pfb-send');
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(value()).toBe('It broke');
  await click('cp-pfb-send');
  type('Another one'); await click('cp-pfb-send');
  const keys = mockSend.mock.calls.map((c) => c[0].clientKey);
  expect(keys[1]).toBe(keys[0]);
  expect(keys[2]).not.toBe(keys[0]);
});
it('badges an unread answer, shows it, marks it seen, and Esc closes with the badge cleared and focus back', async () => {
  mockFetch.mockResolvedValue([item({ status: 'fixed', reply: 'Timer added.', unread: true })]);
  await mount();
  expect(q('cp-pfb-open')!.getAttribute('aria-label')).toBe('Give feedback, 1 new answer');
  await click('cp-pfb-open');
  expect(q('cp-pfb-item')!.textContent).toContain('Timer added.');
  expect(mockSeen).toHaveBeenCalledTimes(1);
  act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(q('cp-pfb')).toBeNull();
  expect(q('cp-pfb-open')!.getAttribute('aria-label')).toBe('Give feedback');
  expect(document.activeElement).toBe(q('cp-pfb-open'));
});
it('a list that will not load never blocks the form', async () => {
  mockFetch.mockRejectedValue(new Error('down'));
  await mount(); await click('cp-pfb-open');
  expect(q('cp-pfb-message')).not.toBeNull();
  expect(mockSeen).not.toHaveBeenCalled();
});
it('scales a wide or very tall picture down and never up', () => {
  expect(fitSize(3200, 1800, 1600)).toEqual({ w: 1600, h: 900 });
  expect(fitSize(800, 600, 1600)).toEqual({ w: 800, h: 600 });
  expect(fitSize(1000, 8000, 1600)).toEqual({ w: 500, h: 4000 });
});
