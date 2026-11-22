import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';
import ComposeTab from '../../ComposeTab';
import * as api from '../../../../../services/commsHubApi';
import type { DraftView, HubEvent, MessageView } from '../../../../../services/commsHubApi';
import { charCount } from '../WhatsAppPreview';

jest.mock('../../../../../services/commsHubApi', () => ({
  ...jest.requireActual('../../../../../services/commsHubApi'),
  listHubEvents: jest.fn(), getDestinationOptions: jest.fn(), createMessage: jest.fn(), getMessage: jest.fn(), regenerateMessage: jest.fn(),
  editMessageDraft: jest.fn(), setMessageDestinations: jest.fn(), setMessageSendTime: jest.fn(), messageAction: jest.fn(), rejectHubMessage: jest.fn(),
  getRegistrantReach: jest.fn(),
}));

/** CH10.3 Compose with WhatsApp: the WhatsApp tab and bubble, the character count, editing it, and WhatsApp groups as recipients. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const m = <T,>(f: T): jest.Mock => f as unknown as jest.Mock;
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

const EVENT = { id: 'e1', title: 'Demo Tuesday', central: { label: 'Tue, Dec 1 · 6:00 PM CST' } } as unknown as HubEvent;
const FEED = { channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1', label: 'November 2026 feed' };
const GROUP = { channel: 'whatsapp', target_type: 'whatsapp_group', target_id: '11111111-1111-4111-8111-111111111111', label: 'Comms Hub test group' };
const draft = (channel: DraftView['channel'], body: string, o: Partial<DraftView> = {}): DraftView => ({ id: `d-${channel}`, channel, version: 1, title: channel === 'in_app' ? 'Demo Tuesday, Dec 1' : null, body, author: 'ai', instruction: null, created_at: 'x', ...o });
const WA = 'Demo Tuesday is on Tuesday, December 1 at 6:00 PM CST. Bring one question.';
const msg = (o: Partial<MessageView> = {}): MessageView => ({
  id: 'm1', status: 'draft', kind: 'reminder', tone: 'friendly', notes: null, subject: null, include: { thumbnail: true, join_link: true, registration_link: true },
  send_at: null, created_by: 'jackie-1', plan_kind: null, occurrence_starts_at: null,
  event: { id: 'e1', title: 'Demo Tuesday', when: 'Tuesday, December 1 · 6:00 PM CST', thumbnail_id: 't7' },
  drafts: { community_post: draft('community_post', 'Post.'), in_app: draft('in_app', '6:00 PM CST'), whatsapp: draft('whatsapp', WA) },
  versions: [draft('whatsapp', WA)], destinations: [FEED as never, GROUP as never], approval: null, problems: [], recommended: [], ...o,
} as MessageView);

async function render(): Promise<void> {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/admin/comms-hub/compose?message=m1']}><Routes><Route path="/admin/comms-hub/compose" element={<ComposeTab />} /></Routes></MemoryRouter>);
  });
  await settle();
}
const tab = (name: string): HTMLButtonElement => Array.from(container.querySelectorAll('[role="tab"]')).find((b) => b.textContent === name) as HTMLButtonElement;
beforeEach(() => { m(api.listHubEvents).mockResolvedValue([EVENT]); m(api.getDestinationOptions).mockResolvedValue([FEED, GROUP]); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

it('a message with WhatsApp text shows a WhatsApp tab: the plain bubble, its count, and who it goes to', async () => {
  m(api.getMessage).mockResolvedValue(msg());
  await render();
  expect(Array.from(container.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(['Community post', 'In-app notification', 'WhatsApp']);
  await act(async () => { tab('WhatsApp').click(); });
  const panel = container.querySelector('#ch-panel-whatsapp') as HTMLElement;
  expect(panel.hidden).toBe(false);
  expect(panel.querySelector('figure[aria-label="How it looks in a WhatsApp group"]')!.textContent).toContain(WA);
  expect(panel.querySelector('[data-testid="ch-wa-count"]')!.textContent).toBe(`${charCount(WA.length)}.`);
  expect(panel.textContent).toContain('Goes to: Comms Hub test group.');
  expect((panel.querySelector('#ch-e-whatsapp') as HTMLTextAreaElement).maxLength).toBe(1000);
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

it('arrow keys move across all three tabs and wrap around', async () => {
  m(api.getMessage).mockResolvedValue(msg());
  await render();
  const press = async (el: Element, key: string): Promise<void> => { await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); }); };
  await press(tab('Community post'), 'ArrowLeft');
  expect(document.activeElement?.textContent).toBe('WhatsApp');
  await press(tab('WhatsApp'), 'ArrowRight');
  expect(document.activeElement?.textContent).toBe('Community post');
});

it('saving an edit of the WhatsApp text sends it as the whatsapp channel with no title', async () => {
  m(api.getMessage).mockResolvedValue(msg());
  m(api.editMessageDraft).mockResolvedValue(msg());
  await render();
  await act(async () => { tab('WhatsApp').click(); });
  const el = container.querySelector('#ch-e-whatsapp') as HTMLTextAreaElement;
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(el, 'Short and plain, Tuesday, December 1 at 6:00 PM CST.'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(container.querySelector('#ch-e-whatsapp-count')!.textContent).toContain(charCount(52));
  const save = Array.from(container.querySelector('#ch-panel-whatsapp')!.querySelectorAll('button')).find((b) => b.textContent === 'Save my changes')!;
  await act(async () => { save.click(); });
  await settle();
  expect(api.editMessageDraft).toHaveBeenCalledWith('m1', 'whatsapp', { title: null, body: 'Short and plain, Tuesday, December 1 at 6:00 PM CST.' });
});

it('a WhatsApp group chosen without WhatsApp text yet says how to get it; too long is flagged', async () => {
  m(api.getMessage).mockResolvedValue(msg({ drafts: { community_post: draft('community_post', 'Post.'), in_app: draft('in_app', 'x') } }));
  await render();
  await act(async () => { tab('WhatsApp').click(); });
  expect(container.querySelector('#ch-panel-whatsapp')!.textContent).toContain('No WhatsApp message yet. Use Shorter, Warmer or More detail to draft one.');
  expect(container.querySelector('#ch-e-whatsapp')).toBeNull();
  act(() => { root.unmount(); }); container.remove();
  m(api.getMessage).mockResolvedValue(msg({ drafts: { community_post: draft('community_post', 'Post.'), in_app: draft('in_app', 'x'), whatsapp: draft('whatsapp', 'y'.repeat(1001)) } }));
  await render();
  await act(async () => { tab('WhatsApp').click(); });
  expect(container.querySelector('[data-testid="ch-wa-count"]')!.textContent).toBe('1,001 of 1,000 characters. Too long for WhatsApp.');
});

it('"You are approving" names the WhatsApp group; with only a WhatsApp group it never says "No recipients yet"', async () => {
  const summary = (): string[] => Array.from(container.querySelectorAll('.ch-compose-summary li')).map((l) => l.textContent ?? '');
  m(api.getMessage).mockResolvedValue(msg());
  await render();
  expect(summary()).toEqual(['1 community post with banner to 1 feed', '1 WhatsApp message with banner to Comms Hub test group', 'As soon as it is approved']);
  act(() => { root.unmount(); }); container.remove();
  m(api.getMessage).mockResolvedValue(msg({ destinations: [GROUP as never], include: { thumbnail: false, join_link: true, registration_link: true } }));
  await render();
  expect(summary()).toEqual(['1 WhatsApp message to Comms Hub test group', 'As soon as it is approved']);
});

it('no WhatsApp text and no WhatsApp group: no WhatsApp tab; recipients read "WhatsApp group:"', async () => {
  m(api.getMessage).mockResolvedValue(msg({ drafts: { community_post: draft('community_post', 'Post.'), in_app: draft('in_app', 'x') }, destinations: [FEED as never] }));
  await render();
  expect(tab('WhatsApp')).toBeUndefined();
  expect(Array.from(container.querySelectorAll('.form-check-label')).map((l) => l.textContent)).toContain('WhatsApp group: Comms Hub test group');
});
