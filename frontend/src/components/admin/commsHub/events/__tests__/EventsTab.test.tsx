import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axe from 'axe-core';
import EventsTab from '../../EventsTab';
import * as api from '../../../../../services/commsHubApi';
import type { HubEvent } from '../../../../../services/commsHubApi';

jest.mock('../../../../../services/commsHubApi', () => ({
  ...jest.requireActual('../../../../../services/commsHubApi'),
  listHubEvents: jest.fn(), getHubEvent: jest.fn(), listHubCohorts: jest.fn(), createHubEvent: jest.fn(), updateHubEvent: jest.fn(),
  duplicateHubEvent: jest.fn(), cancelHubEvent: jest.fn(), describeHubEvent: jest.fn(),
  // CH4.4 the editor now holds the thumbnail studio; its own test covers it.
  listThumbnails: jest.fn(), listEventPhotos: jest.fn(), getLivePanel: jest.fn(), getPromotionPlan: jest.fn(),
}));

/** CH3.1 + CH3.2 rendered: the list in training-site shape, the editor, save/duplicate/cancel, Write with AI, a11y. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };

/** Event n starts at 00:00Z on Dec n (6:00 PM CST the evening before); valid for n up to 28. */
const at = (n: number): string => `2026-12-${String(n).padStart(2, '0')}T00:00:00.000Z`;
const ev = (n: number, o: Partial<HubEvent> = {}): HubEvent => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title: `Event ${n}`, event_type: 'session', audience: { kind: 'all_members' }, status: 'scheduled',
  starts_at: at(n), ends_at: null, central: { date: at(n).slice(0, 10), start_time: '18:00', end_time: null, label: 'x' },
  repeat_rule: null, next_occurrence_at: at(n), upcoming_preview: [], join_url: null, registration_url: null, hosts: [],
  description: `About event ${n}.`, placement: { calendar: true, events_page: true, campus_rail: true }, thumbnail_id: null, broadcast_occurrence_id: null,
  created_at: '2026-11-20T00:00:00.000Z', updated_at: '2026-11-20T00:00:00.000Z', ...o,
});

async function renderAt(url: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/admin/comms-hub/events" element={<EventsTab />} /></Routes></MemoryRouter>); });
  await settle();
}
beforeEach(() => {
  (api.listThumbnails as jest.Mock).mockResolvedValue({ options: [], chosen_id: null, ai: { enabled: true, used_today: 0, daily_limit: 12, batch: 3 } });
  (api.listEventPhotos as jest.Mock).mockResolvedValue([]);
  (api.getPromotionPlan as jest.Mock).mockResolvedValue({ event_id: 'x', rows: [] });
  (api.getLivePanel as jest.Mock).mockResolvedValue({ input_configured: true, occurrence: null, commands: [], input_held_by: null });
});
beforeEach(() => { (api.listHubCohorts as jest.Mock).mockResolvedValue([{ id: '77777777-7777-4777-8777-777777777777', name: 'November 2026', status: 'open', start_date: '2026-11-03' }]); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim().startsWith(label)) as HTMLButtonElement;
const click = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const type = async (id: string, value: string): Promise<void> => {
  const el = container.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const axeViolations = async (): Promise<string[]> => (await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map((v) => `${v.id}: ${v.help}`);

describe('CH3.1 the list', () => {
  it('upcoming: the next event featured, the rest under "More upcoming events" with date chips', async () => {
    (api.listHubEvents as jest.Mock).mockResolvedValue([ev(1), ev(2), ev(3)]);
    await renderAt('/admin/comms-hub/events');
    expect(container.querySelector('.ch-featured')?.textContent).toContain('Event 1');
    expect(container.textContent).toContain('More upcoming events');
    expect(container.querySelectorAll('[data-testid="ch-events-grid"] .ch-event-card')).toHaveLength(2);
    // Dec 2 00:00Z is Dec 1, 6:00 PM Central: the chip is the Central date, zero-padded like the training site.
    expect(container.querySelector('.ch-date-chip')?.textContent).toBe('01DEC');
    expect(container.textContent).toContain('Needs a thumbnail');
  });

  it('twenty events: one featured and nineteen in the grid, each with its own Open', async () => {
    (api.listHubEvents as jest.Mock).mockResolvedValue(Array.from({ length: 20 }, (_, i) => ev(i + 1)));
    await renderAt('/admin/comms-hub/events');
    expect(container.querySelectorAll('.ch-featured')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="ch-events-grid"] .ch-event-card')).toHaveLength(19);
    expect(Array.from(container.querySelectorAll('.ch-event-card button')).map((b) => b.textContent)).toContain('Open Event 20');
  });

  it('the featured card says Online when the event has a join link', async () => {
    (api.listHubEvents as jest.Mock).mockResolvedValue([ev(1, { join_url: 'https://zoom.us/j/1' })]);
    await renderAt('/admin/comms-hub/events');
    expect(container.querySelector('.ch-featured-meta')?.textContent).toContain('Online');
  });

  it('focus order on the list: the scope buttons, then the featured card, then each grid card in date order', async () => {
    (api.listHubEvents as jest.Mock).mockResolvedValue([ev(1), ev(2), ev(3)]);
    await renderAt('/admin/comms-hub/events');
    const order: string[] = [];
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'))) { el.focus(); order.push((document.activeElement?.textContent ?? '').trim()); }
    expect(order).toEqual(['Upcoming', 'Past', 'Cancelled', 'Open event', 'Open Event 2', 'Open Event 3']);
  });

  it('one event: featured only; none: the empty state offers New event; scope buttons say which is on', async () => {
    (api.listHubEvents as jest.Mock).mockResolvedValue([ev(1)]);
    await renderAt('/admin/comms-hub/events');
    expect(container.textContent).not.toContain('More upcoming events');
    expect(btn('Upcoming').getAttribute('aria-pressed')).toBe('true');
    (api.listHubEvents as jest.Mock).mockResolvedValue([]);
    await click(btn('Past'));
    expect(api.listHubEvents).toHaveBeenLastCalledWith('past');
    expect(container.textContent).toContain('No past events');
  });

  it('a failed load says so with a retry; it never shows the empty state', async () => {
    (api.listHubEvents as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await renderAt('/admin/comms-hub/events');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not load');
    expect(container.textContent).not.toContain('No upcoming events');
  });

  it('accessibility: no axe violations with events listed; every control carries the 44px class', async () => {
    (api.listHubEvents as jest.Mock).mockResolvedValue([ev(1), ev(2)]);
    await renderAt('/admin/comms-hub/events');
    expect(await axeViolations()).toEqual([]);
    for (const b of Array.from(container.querySelectorAll('button'))) expect(b.className).toMatch(/comms-hub-action/);
  });
});

describe('CH3.2 the editor', () => {
  it('new event: required fields are named, nothing is sent until they are fixed, then it saves as scheduled', async () => {
    (api.createHubEvent as jest.Mock).mockImplementation(async () => ev(1, { title: 'Demo Tuesday' }));
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1, { title: 'Demo Tuesday' }));
    await renderAt('/admin/comms-hub/events?new=1');
    await click(btn('Save event'));
    expect(api.createHubEvent).not.toHaveBeenCalled();
    expect(container.querySelector('#ch-title')?.getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('#ch-err-title')?.textContent).toMatch(/title/);
    await type('ch-title', 'Demo Tuesday'); await type('ch-date', '2026-12-01'); await type('ch-start', '18:00');
    await click(btn('Save event'));
    expect(api.createHubEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Demo Tuesday', date: '2026-12-01', start_time: '18:00', status: 'scheduled' }));
  });

  it('a server refusal is shown in its own words and the form keeps what was typed', async () => {
    (api.createHubEvent as jest.Mock).mockRejectedValue({ response: { data: { error: 'The end time must be after the start time.' } } });
    await renderAt('/admin/comms-hub/events?new=1');
    await type('ch-title', 'X'); await type('ch-date', '2026-12-01'); await type('ch-start', '18:00');
    await click(btn('Save event'));
    expect(container.querySelector('.alert-danger')?.textContent).toBe('The end time must be after the start time.');
    expect((container.querySelector('#ch-title') as HTMLInputElement).value).toBe('X');
  });

  it('Write with AI fills the description and can be undone', async () => {
    (api.describeHubEvent as jest.Mock).mockResolvedValue('Three builders show what they shipped.');
    await renderAt('/admin/comms-hub/events?new=1');
    await type('ch-title', 'Demo Tuesday'); await type('ch-desc', 'my notes');
    await click(btn('Write with AI'));
    expect(api.describeHubEvent).toHaveBeenCalledWith(expect.objectContaining({ title: 'Demo Tuesday', notes: 'my notes' }));
    expect((container.querySelector('#ch-desc') as HTMLTextAreaElement).value).toBe('Three builders show what they shipped.');
    await click(btn('Undo AI text'));
    expect((container.querySelector('#ch-desc') as HTMLTextAreaElement).value).toBe('my notes');
  });

  it('cancel asks first, says what it does, then cancels; a cancelled event is read-only', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1));
    (api.cancelHubEvent as jest.Mock).mockResolvedValue({ event: ev(1, { status: 'cancelled' }), cancellation: null });
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    await click(btn('Cancel this event'));
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('comes off the community calendar');
    // Dec 1 00:00Z is Mon, Nov 30 at 6:00 PM Central: the dialog names the Central date.
    expect(dialog?.textContent).toContain('"Event 1" on Mon, Nov 30 · 6:00 PM CST');
    expect(document.activeElement?.textContent).toBe('Keep it'); // focus lands on the safe choice
    expect(api.cancelHubEvent).not.toHaveBeenCalled();
    await click(btn('Yes, cancel the event'));
    expect(api.cancelHubEvent).toHaveBeenCalledWith(ev(1).id);
    expect(btn('Save event')).toBeUndefined();
    expect((container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('CH7.3 after cancelling: it says what stopped, and offers the drafted cancellation message in Compose', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1));
    (api.cancelHubEvent as jest.Mock).mockResolvedValue({
      event: ev(1, { status: 'cancelled' }),
      cancellation: { messages_cancelled: 2, deliveries_cancelled: 1, sending_voided: 1, broadcast: 'cancelled', draft_message_id: '11111111-1111-4111-8111-111111111111' },
    });
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    await click(btn('Cancel this event'));
    await click(btn('Yes, cancel the event'));
    const status = container.querySelector('[role="status"]')!.textContent ?? '';
    expect(status).toContain('3 messages about it will not be sent.');
    expect(status).toContain('The live stream prepared for it was cancelled too.');
    expect(status).toContain('A message telling people it is cancelled is ready for you to review.');
    const link = Array.from(container.querySelectorAll('a')).find((x) => x.textContent === 'Review the cancellation message') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/comms-hub/compose?message=11111111-1111-4111-8111-111111111111');
  });

  it('CH7.3 when the AI could not draft it, or the stream could not be cancelled, it says what to do instead', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1));
    (api.cancelHubEvent as jest.Mock).mockResolvedValue({
      event: ev(1, { status: 'cancelled' }),
      cancellation: { messages_cancelled: 0, deliveries_cancelled: 0, sending_voided: 0, broadcast: 'failed', draft_message_id: null },
    });
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    await click(btn('Cancel this event'));
    await click(btn('Yes, cancel the event'));
    const status = container.querySelector('[role="status"]')!.textContent ?? '';
    expect(status).toContain('could not be cancelled; cancel it on the Live panel.');
    expect(status).not.toContain('will not be sent');
    const link = Array.from(container.querySelectorAll('a')).find((x) => x.textContent === 'Write a cancellation message') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/comms-hub/compose?text=Event%201%20is%20cancelled');
  });

  it('duplicate makes a draft copy; a live event offers no cancel', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1, { status: 'live' }));
    (api.duplicateHubEvent as jest.Mock).mockResolvedValue(ev(2, { status: 'draft' }));
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    expect(btn('Cancel this event')).toBeUndefined();
    await click(btn('Duplicate'));
    expect(api.duplicateHubEvent).toHaveBeenCalledWith(ev(1).id);
  });

  it('a repeating event names the whole series in the cancel question', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1, { repeat_rule: { freq: 'weekly', until: '2026-12-29' } }));
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    await click(btn('Cancel this event'));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('every upcoming date in the series');
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('repeats until 2026-12-29');
  });

  it('focus order in the editor follows the form top to bottom, then the actions', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1));
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    const ids: string[] = [];
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'))) {
      el.focus(); ids.push(document.activeElement?.id || (document.activeElement?.textContent ?? '').trim());
    }
    const pos = (x: string): number => ids.indexOf(x);
    expect(pos('All events')).toBe(0);
    for (const [a, b] of [['ch-title', 'ch-type'], ['ch-type', 'ch-aud-all'], ['ch-aud-some', 'ch-date'], ['ch-date', 'ch-start'], ['ch-start', 'ch-end'],
      ['ch-end', 'ch-repeat'], ['ch-repeat', 'ch-join'], ['ch-join', 'ch-reg'], ['ch-reg', 'ch-desc'], ['ch-desc', 'ch-place-calendar'], ['ch-place-campus_rail', 'Save event']]) {
      expect(pos(a)).toBeGreaterThan(-1);
      expect(pos(a)).toBeLessThan(pos(b));
    }
  });

  it('accessibility: the editor has no axe violations and every input is labelled', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1, { hosts: [{ name: 'Aleem' }], repeat_rule: { freq: 'weekly', until: '2026-12-29' }, audience: { kind: 'cohorts', cohort_ids: [] } }));
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    expect(await axeViolations()).toEqual([]);
    for (const el of Array.from(container.querySelectorAll('input, select, textarea'))) {
      expect(container.querySelector(`label[for="${el.id}"]`)).not.toBeNull();
    }
  });
});
