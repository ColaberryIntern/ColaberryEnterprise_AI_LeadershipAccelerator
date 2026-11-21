import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import axe from 'axe-core';
import ComposeTab from '../../ComposeTab';
import { TellPeople } from '../../TodayTab';
import * as api from '../../../../../services/commsHubApi';
import type { HubEvent, MessageView } from '../../../../../services/commsHubApi';

jest.mock('../../../../../services/commsHubApi', () => ({
  ...jest.requireActual('../../../../../services/commsHubApi'),
  listHubEvents: jest.fn(), getDestinationOptions: jest.fn(), createMessage: jest.fn(), getMessage: jest.fn(), regenerateMessage: jest.fn(),
  editMessageDraft: jest.fn(), setMessageDestinations: jest.fn(), setMessageSendTime: jest.fn(), messageAction: jest.fn(), rejectHubMessage: jest.fn(),
  getRegistrantReach: jest.fn(),
}));

/** CH6.5 Compose rendered: the three steps, previews, versions, recipients, Central time, approve / reject / undo, voiding shown, a11y. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const m = <T,>(f: T): jest.Mock => f as unknown as jest.Mock;
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
let where = '';
function Where(): null { where = `${useLocation().pathname}${useLocation().search}`; return null; }

const EVENT = { id: 'e1', title: 'Demo Tuesday', central: { label: 'Tue, Dec 1 · 6:00 PM CST' } } as unknown as HubEvent;
const OPTIONS = [
  { channel: 'community_post', target_type: 'cohort_feed', target_id: 'c1', label: 'November 2026 feed' },
  { channel: 'in_app', target_type: 'in_app_audience', target_id: 'all_members', label: 'Everyone in the program' },
];
const msg = (o: Partial<MessageView> = {}): MessageView => ({
  id: 'm1', status: 'draft', kind: 'reminder', tone: 'friendly', notes: null, subject: null, include: { thumbnail: true, join_link: true, registration_link: true },
  send_at: null, created_by: 'jackie-1', plan_kind: null, occurrence_starts_at: null,
  event: { id: 'e1', title: 'Demo Tuesday', when: 'Tuesday, December 1 · 6:00 PM CST', thumbnail_id: 't7' },
  drafts: {
    community_post: { id: 'd2', channel: 'community_post', version: 2, title: null, body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.', author: 'ai', instruction: 'shorter', created_at: 'x' },
    in_app: { id: 'd3', channel: 'in_app', version: 1, title: 'Demo Tuesday, Dec 1', body: '6:00 PM CST', author: 'ai', instruction: null, created_at: 'x' },
  },
  versions: [
    { id: 'd2', channel: 'community_post', version: 2, title: null, body: 'Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.', author: 'ai', instruction: 'shorter', created_at: 'x' },
    { id: 'd1', channel: 'community_post', version: 1, title: null, body: 'A longer first draft.', author: 'ai', instruction: null, created_at: 'x' },
    { id: 'd3', channel: 'in_app', version: 1, title: 'Demo Tuesday, Dec 1', body: '6:00 PM CST', author: 'ai', instruction: null, created_at: 'x' },
  ],
  destinations: [OPTIONS[0] as never], approval: null, problems: [], recommended: [], ...o,
} as MessageView);

async function render(url = '/admin/comms-hub/compose'): Promise<void> {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><Where /><Routes>
      <Route path="/admin/comms-hub/compose" element={<ComposeTab />} />
      <Route path="/admin/comms-hub" element={<TellPeople />} />
    </Routes></MemoryRouter>);
  });
  await settle();
}
beforeEach(() => { m(api.listHubEvents).mockResolvedValue([EVENT]); m(api.getDestinationOptions).mockResolvedValue(OPTIONS); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });
const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement;
const click = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const type = async (id: string, value: string): Promise<void> => {
  const el = container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const status = (): string => container.querySelector('[role="status"]')!.textContent ?? '';

describe('CH6.5 step 1 to step 3', () => {
  it('start from an event: sends kind, tone, notes and include; the message opens with its previews and the URL holds it', async () => {
    await render();
    await type('ch-c-notes', 'Ask everyone to bring one question.');
    await click(container.querySelector('#ch-tone-professional')!);
    await click(container.querySelector('#ch-inc-join_link')!);
    m(api.createMessage).mockResolvedValue(msg());
    await click(btn('Write it'));
    expect(api.createMessage).toHaveBeenCalledWith({ event_id: 'e1', subject: null, kind: 'reminder', tone: 'professional', notes: 'Ask everyone to bring one question.', include: { thumbnail: true, join_link: false, registration_link: true } });
    expect(where).toBe('/admin/comms-hub/compose?message=m1');
    expect(container.querySelector('[aria-label="How it looks in the community feed"]')!.textContent).toContain('Demo Tuesday is Tuesday, December 1 at 6:00 PM CST.');
    expect((container.querySelector('.ch-prev-banner') as HTMLImageElement).getAttribute('src')).toBe('/api/comms-hub/thumbnails/e1/3x1.png?v=t7');
    expect(container.querySelector('[aria-label="How it looks in the notification bell"]')!.textContent).toContain('Demo Tuesday, Dec 1');
    expect(container.textContent).toContain('Draft 2 · written by AI');
  });

  it('the Today box carries its words into Compose as the subject', async () => {
    await render('/admin/comms-hub');
    await type('ch-tell', 'The Demo Tuesday time moved to 7 PM');
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await settle();
    expect(where).toBe('/admin/comms-hub/compose?text=The%20Demo%20Tuesday%20time%20moved%20to%207%20PM');
    act(() => { root.unmount(); }); container.remove();
    await render('/admin/comms-hub/compose?text=The%20Demo%20Tuesday%20time%20moved%20to%207%20PM');
    expect((container.querySelector('#ch-from-subject') as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector('#ch-c-subject') as HTMLInputElement).value).toBe('The Demo Tuesday time moved to 7 PM');
  });

  it('the validator problems are shown before approval, and a refused approve lists them', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval', problems: ['The in-app notification must say the time: 6:00 PM CST.'] }));
    await render('/admin/comms-hub/compose?message=m1');
    expect(container.querySelector('[role="note"]')!.textContent).toContain('must say the time');
    m(api.messageAction).mockRejectedValue({ response: { data: { error: 'Fix the drafts before approving.', problems: ['The in-app notification must say the time: 6:00 PM CST.'] } } });
    await click(btn('Approve and schedule'));
    const alert = container.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain('Fix the drafts before approving.');
    expect(alert.querySelectorAll('li')).toHaveLength(1);
  });
});

describe('CH6.5 editing and versions', () => {
  it('an edit is saved as a new draft; Shorter asks the AI; earlier drafts are listed', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await type('ch-e-community_post', 'Come build with us on Tuesday, December 1 at 6:00 PM CST.');
    m(api.editMessageDraft).mockResolvedValue(msg());
    await click(Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'Save my changes')[0]);
    expect(api.editMessageDraft).toHaveBeenCalledWith('m1', 'community_post', { title: null, body: 'Come build with us on Tuesday, December 1 at 6:00 PM CST.' });
    expect(status()).toContain('Saved as a new draft.');
    m(api.regenerateMessage).mockResolvedValue(msg());
    await click(btn('Shorter'));
    expect(api.regenerateMessage).toHaveBeenCalledWith('m1', 'shorter');
    expect(container.querySelector('.ch-compose-versions summary')!.textContent).toBe('See earlier drafts (3)');
  });

  it('ACCEPTANCE: editing after approval visibly voids it', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'scheduled', approval: { id: 'a1', approved_by: 'taiwo-1', approved_at: 'x' } }));
    await render('/admin/comms-hub/compose?message=m1');
    expect(container.textContent).toContain('Approved and scheduled');
    expect(btn('Undo approval')).toBeDefined();
    await type('ch-e-community_post', 'Come build with us on Tuesday, December 1 at 6:00 PM CST!');
    m(api.editMessageDraft).mockResolvedValue(msg({ status: 'needs_approval', approval: null }));
    await click(Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'Save my changes')[0]);
    expect(status()).toBe('This changed what was approved, so it needs approval again.');
    expect(container.querySelector('.ch-status')!.textContent).toBe('Needs approval');
    expect(btn('Approve and schedule')).toBeDefined();
    expect(btn('Undo approval')).toBeUndefined();
  });
});

describe('CH6.5 step 3', () => {
  it('recipients: ticking one shows Save recipients and sends the full list', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await click(container.querySelector('[id="ch-to-in_app|in_app_audience|all_members"]')!);
    m(api.setMessageDestinations).mockResolvedValue(msg({ destinations: OPTIONS as never }));
    await click(btn('Save recipients'));
    expect(m(api.setMessageDestinations).mock.calls[0][1].map((d: { target_id: string }) => d.target_id)).toEqual(['c1', 'all_members']);
    expect(container.textContent).toContain('1 in-app notification to Everyone in the program');
  });

  it('a set time is entered in Central and saved as the exact instant', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await click(container.querySelector('#ch-when-at')!);
    await type('ch-when-date', '2026-11-30');
    await type('ch-when-time', '18:00');
    m(api.setMessageSendTime).mockResolvedValue(msg({ send_at: '2026-12-01T00:00:00.000Z' }));
    await click(btn('Save the time'));
    expect(api.setMessageSendTime).toHaveBeenCalledWith('m1', '2026-12-01T00:00:00.000Z');
    expect(container.textContent).toContain('Mon, Nov 30, 6:00 PM CST');
  });

  it('submit, approve, reject with a note, undo, cancel', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    m(api.messageAction).mockResolvedValueOnce(msg({ status: 'needs_approval' }));
    await click(btn('Submit for approval'));
    expect(api.messageAction).toHaveBeenLastCalledWith('m1', 'submit');
    await type('ch-reject-note', 'Say the time once.');
    m(api.rejectHubMessage).mockResolvedValue(msg({ status: 'draft' }));
    await click(btn('Reject'));
    expect(api.rejectHubMessage).toHaveBeenCalledWith('m1', 'Say the time once.');
    m(api.messageAction).mockResolvedValueOnce(msg({ status: 'needs_approval' })).mockResolvedValueOnce(msg({ status: 'scheduled' })).mockResolvedValueOnce(msg({ status: 'needs_approval' })).mockResolvedValueOnce(msg({ status: 'cancelled' }));
    await click(btn('Submit for approval'));
    await click(btn('Approve and schedule'));
    expect(api.messageAction).toHaveBeenLastCalledWith('m1', 'approve');
    await click(btn('Undo approval'));
    expect(status()).toContain('Approval undone.');
    await click(btn('Cancel this message'));
    expect(api.messageAction).not.toHaveBeenLastCalledWith('m1', 'cancel');
    expect(container.textContent).toContain('Cancel this message? It will not be sent');
    await click(btn('Yes, cancel it'));
    expect(api.messageAction).toHaveBeenLastCalledWith('m1', 'cancel');
    expect(btn('Approve and schedule')).toBeUndefined();
  });

  it('a recipient already sent to cannot be unticked', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'partially_failed', destinations: [{ ...OPTIONS[0], id: 'd1', has_delivery: true } as never] }));
    await render('/admin/comms-hub/compose?message=m1');
    const box = container.querySelector('[id="ch-to-community_post|cohort_feed|c1"]') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(container.querySelector('[for="ch-to-community_post|cohort_feed|c1"]')!.textContent).toContain('(already sent)');
  });
});

describe('CH6.5 accessibility', () => {
  it('no axe violations on step 1, and with all three steps', async () => {
    await render();
    let r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    act(() => { root.unmount(); }); container.remove();
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval', problems: ['x'] }));
    await render('/admin/comms-hub/compose?message=m1');
    r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it('every control is labelled; focus order follows the steps', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval' }));
    await render('/admin/comms-hub/compose?message=m1');
    for (const id of ['ch-c-notes', 'ch-c-kind', 'ch-e-community_post', 'ch-e-title', 'ch-e-in_app', 'ch-reject-note', 'ch-when-now']) {
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    // The Tab sequence: every focusable control in DOM order, minus disabled ones (also those inside a disabled fieldset), tabindex=-1 (the
    // inactive channel tab) and anything inside a hidden tab panel. No positive tabindex reorders it.
    expect(container.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])')).toHaveLength(0);
    const seq = Array.from(container.querySelectorAll<HTMLElement>('input, select, textarea, button, summary, a[href]'))
      .filter((el) => !el.matches(':disabled') && el.tabIndex >= 0 && !el.closest('[hidden]'));
    // Tab through it: each one takes focus in turn.
    for (const el of seq) {
      act(() => { el.focus(); });
      expect(document.activeElement).toBe(el);
    }
    const at = (sel: string): number => seq.indexOf(container.querySelector(sel) as HTMLElement);
    expect(at('#ch-e-in_app')).toBe(-1); // in the hidden panel, so not reachable until its tab is chosen
    expect(at('#ch-tab-in_app')).toBe(-1); // roving tabindex: reached with the arrow keys
    expect(at('#ch-c-kind')).toBe(-1); // step 1 is locked once the message exists
    const steps = [seq.indexOf(btn('Start a new message')), at('#ch-tab-community_post'), at('#ch-e-community_post'), at('#ch-when-now'), seq.indexOf(btn('Approve and schedule')), at('#ch-reject-note')];
    expect(steps.every((p) => p >= 0)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    // Choosing the other tab brings its editor into the sequence, right after the tab list.
    await click(container.querySelector('#ch-tab-in_app')!);
    const seq2 = Array.from(container.querySelectorAll<HTMLElement>('input, select, textarea, button, summary'))
      .filter((el) => !el.matches(':disabled') && el.tabIndex >= 0 && !el.closest('[hidden]'));
    expect(seq2.indexOf(container.querySelector('#ch-e-in_app') as HTMLElement)).toBeGreaterThan(seq2.indexOf(container.querySelector('#ch-tab-in_app') as HTMLElement));
    expect(seq2.indexOf(container.querySelector('#ch-e-community_post') as HTMLElement)).toBe(-1);
  });
});

describe('CH6.5 opening an existing message', () => {
  it('step 1 shows what it was written from, not the defaults', async () => {
    m(api.getMessage).mockResolvedValue(msg({ kind: 'announcement', tone: 'urgent', notes: 'Ask everyone to bring one question.', include: { thumbnail: false, join_link: true, registration_link: true } }));
    await render('/admin/comms-hub/compose?message=m1');
    expect((container.querySelector('#ch-c-kind') as HTMLSelectElement).value).toBe('announcement');
    expect((container.querySelector('#ch-tone-urgent') as HTMLInputElement).checked).toBe(true);
    expect((container.querySelector('#ch-c-notes') as HTMLTextAreaElement).value).toBe('Ask everyone to bring one question.');
    expect((container.querySelector('#ch-inc-thumbnail') as HTMLInputElement).checked).toBe(false);
  });

  it('the channel tabs switch the preview; arrow keys move between them', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    const inApp = container.querySelector('#ch-tab-in_app') as HTMLButtonElement;
    expect((container.querySelector('#ch-panel-in_app') as HTMLElement).hidden).toBe(true);
    await click(inApp);
    expect(inApp.getAttribute('aria-selected')).toBe('true');
    expect((container.querySelector('#ch-panel-in_app') as HTMLElement).hidden).toBe(false);
    await act(async () => { inApp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    await settle();
    expect(document.activeElement).toBe(container.querySelector('#ch-tab-community_post'));
  });
});

describe('CH6.5 approve and save act on what is on screen', () => {
  it('Approve and schedule saves an unsaved time first, then approves', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval' }));
    await render('/admin/comms-hub/compose?message=m1');
    await click(container.querySelector('#ch-when-at')!);
    await type('ch-when-date', '2026-11-30');
    await type('ch-when-time', '18:00');
    m(api.setMessageSendTime).mockResolvedValue(msg({ status: 'needs_approval', send_at: '2026-12-01T00:00:00.000Z' }));
    m(api.messageAction).mockResolvedValue(msg({ status: 'scheduled', send_at: '2026-12-01T00:00:00.000Z' }));
    await click(btn('Approve and schedule'));
    expect(api.setMessageSendTime).toHaveBeenCalledWith('m1', '2026-12-01T00:00:00.000Z');
    expect(m(api.setMessageSendTime).mock.invocationCallOrder[0]).toBeLessThan(m(api.messageAction).mock.invocationCallOrder[0]);
    expect(api.messageAction).toHaveBeenCalledWith('m1', 'approve');
    expect(container.textContent).toContain('Mon, Nov 30, 6:00 PM CST');
  });

  it('a half-typed time stops the approval and says why', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval' }));
    await render('/admin/comms-hub/compose?message=m1');
    await click(container.querySelector('#ch-when-at')!);
    await click(btn('Approve and schedule'));
    expect(api.messageAction).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Pick a date and a time');
  });

  it('Approve and schedule saves unsaved recipients first', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval' }));
    await render('/admin/comms-hub/compose?message=m1');
    await click(container.querySelector('[id="ch-to-in_app|in_app_audience|all_members"]')!);
    m(api.setMessageDestinations).mockResolvedValue(msg({ status: 'needs_approval', destinations: OPTIONS as never }));
    m(api.messageAction).mockResolvedValue(msg({ status: 'scheduled', destinations: OPTIONS as never }));
    await click(btn('Approve and schedule'));
    expect(m(api.setMessageDestinations).mock.calls[0][1].map((d: { target_id: string }) => d.target_id)).toEqual(['c1', 'all_members']);
    expect(m(api.setMessageDestinations).mock.invocationCallOrder[0]).toBeLessThan(m(api.messageAction).mock.invocationCallOrder[0]);
    expect(container.textContent).toContain('1 in-app notification to Everyone in the program');
  });

  it('Approve and schedule saves unsaved editor text first; a refused save stops it', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await type('ch-e-community_post', 'Come build with us on Tuesday, December 1 at 6:00 PM CST.');
    m(api.editMessageDraft).mockResolvedValue(msg());
    m(api.messageAction).mockResolvedValue(msg({ status: 'scheduled' }));
    await click(btn('Approve and schedule')); // shown for a draft: it is submitted and approved in one step
    expect(api.editMessageDraft).toHaveBeenCalledWith('m1', 'community_post', { title: null, body: 'Come build with us on Tuesday, December 1 at 6:00 PM CST.' });
    expect(m(api.editMessageDraft).mock.invocationCallOrder[0]).toBeLessThan(m(api.messageAction).mock.invocationCallOrder[0]);
    expect(api.messageAction).toHaveBeenCalledWith('m1', 'approve');
    act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks();
    m(api.listHubEvents).mockResolvedValue([EVENT]); m(api.getDestinationOptions).mockResolvedValue(OPTIONS);
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await type('ch-e-community_post', 'Come build with us at 6.');
    m(api.editMessageDraft).mockRejectedValue({ response: { data: { error: 'Fix the drafts first.' } } });
    await click(btn('Approve and schedule'));
    expect(api.messageAction).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('Fix the drafts first.');
  });

  it('Save as draft saves the unsaved text and time, and does not submit', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await type('ch-e-community_post', 'Come build with us on Tuesday, December 1 at 6:00 PM CST.');
    await click(container.querySelector('#ch-when-at')!);
    await type('ch-when-date', '2026-11-30');
    await type('ch-when-time', '18:00');
    m(api.editMessageDraft).mockResolvedValue(msg());
    m(api.setMessageSendTime).mockResolvedValue(msg({ send_at: '2026-12-01T00:00:00.000Z' }));
    await click(btn('Save as draft'));
    expect(api.editMessageDraft).toHaveBeenCalledTimes(1);
    expect(api.setMessageSendTime).toHaveBeenCalledWith('m1', '2026-12-01T00:00:00.000Z');
    expect(api.messageAction).not.toHaveBeenCalled();
    expect(status()).toContain('Saved. It stays a draft');
  });

  it('Submit for approval saves unsaved text first; a double click writes one version', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await type('ch-e-community_post', 'Come build with us on Tuesday, December 1 at 6:00 PM CST.');
    let release: (v: MessageView) => void = () => undefined;
    m(api.editMessageDraft).mockReturnValue(new Promise<MessageView>((r) => { release = r; }));
    m(api.messageAction).mockResolvedValue(msg({ status: 'needs_approval' }));
    const submit = btn('Submit for approval');
    await act(async () => { submit.dispatchEvent(new MouseEvent('click', { bubbles: true })); submit.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { release(msg()); });
    await settle();
    expect(api.editMessageDraft).toHaveBeenCalledTimes(1);
    expect(m(api.editMessageDraft).mock.invocationCallOrder[0]).toBeLessThan(m(api.messageAction).mock.invocationCallOrder[0]);
    expect(api.messageAction).toHaveBeenCalledTimes(1);
    expect(api.messageAction).toHaveBeenCalledWith('m1', 'submit');
  });

  it('a refused action reloads the message as it now is', async () => {
    m(api.getMessage).mockResolvedValueOnce(msg({ status: 'needs_approval' })).mockResolvedValueOnce(msg({ status: 'cancelled' }));
    await render('/admin/comms-hub/compose?message=m1');
    m(api.messageAction).mockRejectedValue({ response: { data: { error: 'Someone cancelled this message.' } } });
    await click(btn('Approve and schedule'));
    expect(api.getMessage).toHaveBeenCalledTimes(2);
    expect(container.querySelector('.ch-status')!.textContent).toBe('Cancelled');
    expect(btn('Approve and schedule')).toBeUndefined();
  });

  it('Keep it closes the cancel question without cancelling', async () => {
    m(api.getMessage).mockResolvedValue(msg());
    await render('/admin/comms-hub/compose?message=m1');
    await click(btn('Cancel this message'));
    await click(btn('Keep it'));
    expect(api.messageAction).not.toHaveBeenCalled();
    expect(btn('Cancel this message')).toBeDefined();
  });

  it('the feed preview links URLs like the portal and shows the event', async () => {
    m(api.getMessage).mockResolvedValue(msg({ drafts: { ...msg().drafts, community_post: { ...msg().drafts.community_post!, body: 'Join at https://example.com/join on Tuesday.' } } }));
    await render('/admin/comms-hub/compose?message=m1');
    const feed = container.querySelector('[aria-label="How it looks in the community feed"]')!;
    expect(feed.querySelector('a.cm-link')!.getAttribute('href')).toBe('https://example.com/join');
    expect(feed.querySelector('.ch-prev-event')!.textContent).toContain('Tuesday, December 1 · 6:00 PM CST');
  });
});

describe('CH9.6 a message about an Eventbrite event managed in the hub can go to its registrants', () => {
  const REG = { channel: 'in_app', target_type: 'event_registrants', target_id: 'e1', label: 'Registrants of Demo Tuesday (in-app)' };
  it('the options follow the message event, the registrants are offered with how many it reaches, and choosing them saves them', async () => {
    m(api.getMessage).mockResolvedValue(msg({ status: 'needs_approval' }));
    m(api.getDestinationOptions).mockResolvedValue([...OPTIONS, REG]);
    m(api.getRegistrantReach).mockResolvedValue({ registrants: 40, reachable: 12, eventbrite: 'ok' });
    await render('/admin/comms-hub/compose?message=m1');
    expect(api.getDestinationOptions).toHaveBeenLastCalledWith('e1');
    expect(api.getRegistrantReach).toHaveBeenCalledWith('e1');
    expect(container.querySelector('[data-testid="ch-registrant-reach"]')!.textContent).toBe('12 of 40 registrants have a platform account and will get it in the app. The others are not reached in-app.');
    const box = container.querySelector('input[id="ch-to-in_app|event_registrants|e1"]') as HTMLInputElement;
    expect(box.labels![0].textContent).toBe('In-app notification: Registrants of Demo Tuesday (in-app)');
    await click(box);
    m(api.setMessageDestinations).mockResolvedValue(msg({ status: 'needs_approval', destinations: [OPTIONS[0] as never, REG as never] }));
    await click(btn('Save recipients'));
    expect(m(api.setMessageDestinations).mock.calls[0][1].map((d: { target_type: string }) => d.target_type)).toEqual(['cohort_feed', 'event_registrants']);
  });
});
