import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { DeskInboxes, DeskQueue, QueueItem } from './careerDeskApi';

/** Shared mount + fixtures for the interview desk tests (CP11.1b). Fixtures follow backend/src/routes/careerDeskSchemas.ts. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement | null = null;
let root: Root | null = null;
export const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

export async function mountAt(path: string, element: React.ReactElement, pattern = '/admin/placement/:deskTab'): Promise<HTMLDivElement> {
  const h = document.createElement('div'); document.body.appendChild(h);
  const r = createRoot(h); host = h; root = r;
  act(() => {
    r.render(<MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /><Route path="*" element={<p data-testid="elsewhere">elsewhere</p>} /></Routes></MemoryRouter>);
  });
  await flush();
  return h;
}
export function unmount(): void { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; }
export const q = (h: HTMLElement, id: string) => h.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
export const click = async (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); await flush(); };
/** Type into a controlled input or select the way React hears it. */
export async function typeInto(el: Element | null, value: string): Promise<void> {
  expect(el).not.toBeNull();
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el!.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  await flush();
}

export const lowItem: QueueItem = {
  source: 'item', id: '41', kind: 'low_confidence', title: 'Low confidence: is this an interview?', detail: null, learner: 'Ann Lee', enrollmentId: '11111111-1111-4111-8111-111111111111',
  interviewId: null, company: 'Cedar Credit Union', position: null, subject: 'Quick chat this week?', confidence: 0.78, since: '2026-11-21T15:00:00.000Z', needsContact: false, related: [],
  actions: [{ action: 'make_interview', label: 'Send booking link' }, { action: 'dismiss', label: 'Not an interview' }],
};
export const noContact: QueueItem = {
  ...lowItem, source: 'interview', id: '22222222-2222-4222-8222-222222222222', kind: 'no_contact', title: 'No employer email to reply to',
  detail: 'No employer email on file: add one to send the booking link.', interviewId: '22222222-2222-4222-8222-222222222222', company: 'Harbor Insurance', subject: null,
  confidence: 0.9, needsContact: true, actions: [{ action: 'send_link', label: 'Send booking link' }, { action: 'not_interview', label: 'Not an interview' }],
};
export const unmatched: QueueItem = {
  ...lowItem, id: '43', kind: 'unmatched_learner', title: 'No learner matched this email', learner: null, enrollmentId: null, company: 'Atlas Manufacturing',
  subject: 'Interview availability', confidence: 0.94, actions: [{ action: 'match', label: 'Match and send' }, { action: 'dismiss', label: 'Not an interview' }],
};
export const queueOf = (items: QueueItem[], held: DeskQueue['held'] = []): DeskQueue => ({ items, held, heldNote: 'A booking link is held when employer email was switched off when it was due.' });
export const inboxesOf = (over: Partial<DeskInboxes['learners'][number]> = {}): DeskInboxes => ({
  testsSwitch: 'off',
  learners: [{ enrollmentId: '11111111-1111-4111-8111-111111111111', learner: 'Ann Lee', address: 'ann.lee.careers@gmail.com', health: 'healthy', healthLabel: 'Healthy',
    lastForwardedAt: '2026-11-21T15:00:00.000Z', lastForwardedLabel: 'Sat, Nov 21, 9:00 AM', last30Days: 14, lastTestAt: null, lastTestMs: null, confirmationPending: false, canSendTest: true, ...over }],
});
