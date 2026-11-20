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
}));

/** CH3.1 + CH3.2 rendered: the list in training-site shape, the editor, save/duplicate/cancel, Write with AI, a11y. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };

const ev = (n: number, o: Partial<HubEvent> = {}): HubEvent => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, title: `Event ${n}`, event_type: 'session', audience: { kind: 'all_members' }, status: 'scheduled',
  starts_at: `2026-12-0${n}T00:00:00.000Z`, ends_at: null, central: { date: `2026-11-3${n - 1}`, start_time: '18:00', end_time: null, label: 'x' },
  repeat_rule: null, next_occurrence_at: `2026-12-0${n}T00:00:00.000Z`, upcoming_preview: [], join_url: null, registration_url: null, hosts: [],
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
    expect(container.querySelector('.ch-date-chip')?.textContent).toBe('1DEC');
    expect(container.textContent).toContain('Needs a thumbnail');
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
    (api.cancelHubEvent as jest.Mock).mockResolvedValue(ev(1, { status: 'cancelled' }));
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    await click(btn('Cancel this event'));
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain('comes off the community calendar');
    expect(api.cancelHubEvent).not.toHaveBeenCalled();
    await click(btn('Yes, cancel the event'));
    expect(api.cancelHubEvent).toHaveBeenCalledWith(ev(1).id);
    expect(btn('Save event')).toBeUndefined();
    expect((container.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('duplicate makes a draft copy; a live event offers no cancel', async () => {
    (api.getHubEvent as jest.Mock).mockResolvedValue(ev(1, { status: 'live' }));
    (api.duplicateHubEvent as jest.Mock).mockResolvedValue(ev(2, { status: 'draft' }));
    await renderAt(`/admin/comms-hub/events?edit=${ev(1).id}`);
    expect(btn('Cancel this event')).toBeUndefined();
    await click(btn('Duplicate'));
    expect(api.duplicateHubEvent).toHaveBeenCalledWith(ev(1).id);
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
