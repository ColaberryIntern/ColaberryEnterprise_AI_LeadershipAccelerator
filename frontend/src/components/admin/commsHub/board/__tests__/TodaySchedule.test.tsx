import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axe from 'axe-core';
import CommsHubLayout from '../../CommsHubLayout';
import TodayTab from '../../TodayTab';
import ScheduleTab from '../../ScheduleTab';
import * as api from '../../../../../services/commsHubApi';
import type { BoardRow } from '../../../../../services/commsHubApi';
import { groupByDay, retryLabel } from '../boardDisplay';

/**
 * CH7.4 Today and Schedule & history, rendered with createRoot + act (no Testing Library in this
 * repo), queried by role, label and aria-label, with axe-core run directly and focus order read
 * from document.activeElement.
 */
jest.mock('../../../../../services/commsHubApi');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOUR = 3600_000;
const iso = (ms: number): string => new Date(Date.now() + ms).toISOString();
const row = (o: Partial<BoardRow>): BoardRow => ({
  id: 'm1', status: 'scheduled', kind: 'reminder', title: 'Demo Tuesday: reminder', event: { id: 'e1', title: 'Demo Tuesday', thumbnail_id: 't1' },
  send_at: iso(2 * HOUR), updated_at: iso(-HOUR), destinations: [{ channel: 'community_post', label: 'November cohort' }, { channel: 'in_app', label: 'All members' }],
  preview: 'Tomorrow at 6:00 PM Central: Demo Tuesday.', include: { thumbnail: true, join_link: true, registration_link: false }, approved_by: 'Jackie',
  deliveries: { total: 0, sent: 0, failed: 0, pending: 0, cancelled: 0 }, failure: null, ...o,
});
const SUMMARY = { awaiting_approval: 1, scheduled_next_7_days: 2, upcoming_events: 2, events_missing_thumbnail: 1, needs_attention: 1, sending_paused: false };
const SETTINGS = { sending_paused: false, quiet_hours: { start: '21:00', end: '08:00' }, alert_recipients: ['ops@colaberry.com'], test_cohort: null, updated_at: null };
const EVENTS = [
  { id: 'e1', title: 'Demo Tuesday', thumbnail_id: 't1', next_occurrence_at: iso(30 * HOUR), starts_at: iso(30 * HOUR), repeat_rule: { freq: 'weekly', until: '2027-01-01' } },
  { id: 'e2', title: 'Open House', thumbnail_id: null, next_occurrence_at: iso(90 * HOUR), starts_at: iso(90 * HOUR), repeat_rule: null },
];
let board: Record<string, BoardRow[]>;

let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); };
async function renderAt(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/comms-hub" element={<CommsHubLayout />}>
            <Route index element={<TodayTab />} />
            <Route path="schedule" element={<ScheduleTab />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}
const click = async (el: Element | null | undefined): Promise<void> => {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};
const byText = <T extends HTMLElement>(sel: string, words: string): T => {
  const el = Array.from(container.querySelectorAll<T>(sel)).find((b) => (b.textContent ?? '').trim().startsWith(words));
  if (!el) throw new Error(`no ${sel} "${words}"`);
  return el;
};
const field = (label: string): HTMLInputElement => {
  const l = Array.from(container.querySelectorAll('label')).find((x) => (x.textContent ?? '').startsWith(label));
  return container.querySelector(`#${l!.getAttribute('for')}`) as HTMLInputElement;
};
const type = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): Promise<void> => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  await settle();
};
const alerts = (): string => Array.from(container.querySelectorAll('[role="alert"]')).map((a) => a.textContent).join(' ');

beforeEach(() => {
  board = {
    approval: [row({ id: 'a1', status: 'needs_approval', title: 'Open House: announcement', send_at: null, include: { thumbnail: false, join_link: false, registration_link: true } })],
    schedule: [
      row({ id: 'a1', status: 'needs_approval', title: 'Open House: announcement', send_at: null }),
      row({ id: 's1', title: 'Demo Tuesday: reminder', send_at: iso(2 * HOUR) }),
      row({ id: 's2', status: 'draft', title: 'Demo Tuesday: recording and thanks', send_at: iso(72 * HOUR) }),
    ],
    history: [
      row({ id: 'h1', status: 'partially_failed', title: 'Office Hours: starting soon', send_at: iso(-48 * HOUR), deliveries: { total: 3, sent: 2, failed: 1, pending: 0, cancelled: 0 }, failure: { reason: 'Some recipients did not receive it after every try.', missed: ['Alumni cohort'], attempts: 4 } }),
      row({ id: 'h2', status: 'failed', title: 'Office Hours: reminder', send_at: iso(-96 * HOUR), failure: { reason: 'Nothing was delivered after every try.', missed: ['All members'], attempts: 4 } }),
      row({ id: 'h3', status: 'sent', title: 'Demo Tuesday: recording and thanks', send_at: iso(-120 * HOUR), notes: ['Already in the WhatsApp group, so it was not sent again.'] }),
    ],
  };
  (api.getCommsHubSummary as jest.Mock).mockResolvedValue(SUMMARY);
  (api.getWhatsAppStatus as jest.Mock).mockResolvedValue({ configured: false, enabled: false, state: 'not_configured', number_last4: null, reason: 'WhatsApp is switched off for the hub.' });
  (api.getBoard as jest.Mock).mockImplementation(async (scope: string) => board[scope]);
  (api.listHubEvents as jest.Mock).mockResolvedValue(EVENTS);
  (api.getHubSettings as jest.Mock).mockResolvedValue(SETTINGS);
  (api.saveHubSettings as jest.Mock).mockImplementation(async (p: Record<string, unknown>) => ({ ...SETTINGS, ...p, test_cohort: p.test_cohort_id ? { id: p.test_cohort_id, name: 'Test cohort' } : null }));
  (api.listHubCohorts as jest.Mock).mockResolvedValue([{ id: 'c-test', name: 'Test cohort', status: 'open', start_date: null }]);
  (api.getActivity as jest.Mock).mockResolvedValue([{ id: 'x1', at: iso(-HOUR), who: 'Jackie', did: 'approved', about: 'Demo Tuesday: reminder', entity_type: 'message', entity_id: 's1' }]);
  (api.setSendingPaused as jest.Mock).mockImplementation(async (paused: boolean) => ({ ...SETTINGS, sending_paused: paused }));
  (api.apiErrorMessage as jest.Mock).mockImplementation((_e: unknown, f: string) => f);
  (api.rejectHubMessage as jest.Mock).mockResolvedValue({});
  (api.messageAction as jest.Mock).mockResolvedValue({});
  (api.retryHubMessage as jest.Mock).mockResolvedValue({});
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

describe('Today', () => {
  it('the approval queue shows the exact text, where, when and what it includes, and opens it in Compose', async () => {
    await renderAt('/admin/comms-hub');
    const card = container.querySelector('.ch-aq-card')!;
    expect(card.textContent).toContain('Open House: announcement');
    expect(card.textContent).toContain('Where:Community feed (November cohort), in-app notification (All members)');
    expect(card.textContent).toContain('When:As soon as it is approved');
    expect(card.textContent).toContain('Includes:registration link');
    expect(byText<HTMLAnchorElement>('a', 'Review & approve').getAttribute('href')).toBe('/admin/comms-hub/compose?message=a1');
    expect(api.getBoard).toHaveBeenCalledWith('approval', { limit: 20 });
  });

  it('Reject asks for an optional note, sends it back, then reloads the queue and the tiles', async () => {
    await renderAt('/admin/comms-hub');
    await click(byText('button', 'Reject'));
    await type(field('What should change?') as unknown as HTMLTextAreaElement, 'Say noon Central, not 12');
    const before = (api.getCommsHubSummary as jest.Mock).mock.calls.length;
    await click(byText('button', 'Reject and send back'));
    expect(api.rejectHubMessage).toHaveBeenCalledWith('a1', 'Say noon Central, not 12');
    expect((api.getCommsHubSummary as jest.Mock).mock.calls.length).toBe(before + 1);
  });

  it('Going out next, upcoming events with their thumbnails, and channels with WhatsApp as coming next', async () => {
    await renderAt('/admin/comms-hub');
    expect(api.getBoard).toHaveBeenCalledWith('schedule', { status: ['approved', 'scheduled', 'sending'], limit: 4 });
    expect(container.querySelector('.ch-next')?.textContent).toContain('Demo Tuesday: reminder');
    const img = container.querySelector<HTMLImageElement>('img.ch-up-thumb')!;
    expect([img.getAttribute('src'), img.alt]).toEqual(['/api/comms-hub/thumbnails/e1/16x9.png?v=t1', 'Demo Tuesday thumbnail']);
    expect(byText<HTMLAnchorElement>('a', 'Create thumbnail').getAttribute('href')).toBe('/admin/comms-hub/events?edit=e2');
    const whatsapp = Array.from(container.querySelectorAll('.ch-channel-row')).find((r) => r.textContent?.includes('WhatsApp'))!;
    expect(whatsapp.textContent).toContain('Coming next');
    expect(container.textContent).toContain('Next: ');
  });

  it('a thumbnail the public route will not serve shows "Preview unavailable", never a broken image', async () => {
    await renderAt('/admin/comms-hub');
    await act(async () => { container.querySelector('img.ch-up-thumb')!.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img.ch-up-thumb')).toBeNull();
    expect(container.querySelector('.ch-up')?.textContent).toContain('Preview unavailable');
  });

  it('an approval queue that did not load shows its own retry and never says nothing is waiting', async () => {
    (api.getBoard as jest.Mock).mockImplementation(async (scope: string) => { if (scope === 'approval') throw new Error('down'); return board[scope]; });
    await renderAt('/admin/comms-hub');
    expect(alerts()).toContain('The approval queue could not be shown.');
    expect(container.textContent).not.toContain('Nothing is waiting for your approval');
    expect(container.textContent).toContain('Demo Tuesday: reminder');
  });
});

describe('Schedule & history', () => {
  it('next 7 days is grouped by Central day, send-on-approval first, with Review, Open and Cancel by status', async () => {
    await renderAt('/admin/comms-hub/schedule');
    const headings = Array.from(container.querySelectorAll('.ch-day-h')).map((h) => h.textContent);
    expect(headings[0]).toBe('On approval');
    expect(headings.length).toBeGreaterThanOrEqual(2);
    expect(byText<HTMLAnchorElement>('a', 'Review').getAttribute('href')).toBe('/admin/comms-hub/compose?message=a1');
    expect(byText<HTMLAnchorElement>('a', 'Open').getAttribute('href')).toBe('/admin/comms-hub/compose?message=s2');
    await click(byText('button', 'Cancel'));
    expect(api.messageAction).not.toHaveBeenCalled();
    expect(container.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Cancel Demo Tuesday: reminder?');
    await click(byText('button', 'Yes, cancel it'));
    expect(api.messageAction).toHaveBeenCalledWith('s1', 'cancel');
  });

  it('history shows failure detail in words and retries only what missed; a refused retry says so', async () => {
    await renderAt('/admin/comms-hub/schedule');
    const table = container.querySelector('table.ch-history')!;
    expect(table.textContent).toContain('Some recipients did not receive it after every try. Did not receive it: Alumni cohort. Tried 4 times.');
    expect(byText('button', 'Send again')).toBeDefined();
    expect(byText<HTMLAnchorElement>('a', 'Details').getAttribute('href')).toBe('/admin/comms-hub/compose?message=h3');
    (api.retryHubMessage as jest.Mock).mockRejectedValueOnce(new Error('409'));
    await click(byText('button', 'Retry 1 recipient'));
    expect(api.retryHubMessage).toHaveBeenCalledWith('h1');
    expect(alerts()).toContain('The retry did not start. Try again.');
  });

  it('an event list that did not load leaves Any event and says so', async () => {
    (api.listHubEvents as jest.Mock).mockRejectedValue(new Error('down'));
    await renderAt('/admin/comms-hub/schedule');
    expect(container.textContent).toContain('The event list did not load, so the event filter only offers Any event.');
  });

  it('the filters narrow both lists; WhatsApp is a channel filter too (CH10.3)', async () => {
    await renderAt('/admin/comms-hub/schedule');
    await type(field('Status') as unknown as HTMLSelectElement, 'failed');
    await type(field('Channel') as unknown as HTMLSelectElement, 'in_app');
    await type(field('Event') as unknown as HTMLSelectElement, 'e2');
    const want = { status: ['failed'], channel: 'in_app', event_id: 'e2' };
    expect(api.getBoard).toHaveBeenCalledWith('schedule', want);
    expect(api.getBoard).toHaveBeenCalledWith('history', want);
    expect(Array.from((field('Channel') as unknown as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(['Any channel', 'Community feed', 'In-app notification', 'WhatsApp']);
  });

  it('safety controls save quiet hours, alert recipients and the test cohort; a refused save shows why', async () => {
    await renderAt('/admin/comms-hub/schedule');
    expect(container.textContent).toContain('Hold messages during quiet hours, 9:00 PM to 8:00 AM Central');
    await type(field('Until'), '07:30');
    await type(field('Email these people') as unknown as HTMLTextAreaElement, 'ops@colaberry.com\njackie@colaberry.com');
    await type(field('Test cohort') as unknown as HTMLSelectElement, 'c-test');
    await click(byText('button', 'Save safety controls'));
    expect(api.saveHubSettings).toHaveBeenCalledWith({ quiet_hours: { start: '21:00', end: '07:30' }, alert_recipients: ['ops@colaberry.com', 'jackie@colaberry.com'], test_cohort_id: 'c-test' });
    expect(container.textContent).toContain('Saved.');
    (api.saveHubSettings as jest.Mock).mockRejectedValueOnce(new Error('400'));
    (api.apiErrorMessage as jest.Mock).mockReturnValueOnce('Each alert recipient must be an email address.');
    await click(byText('button', 'Save safety controls'));
    expect(alerts()).toContain('Each alert recipient must be an email address.');
  });

  it('Pause in the safety controls pauses every channel: the header and the banner agree, and the log reloads', async () => {
    await renderAt('/admin/comms-hub/schedule');
    const logLoads = (api.getActivity as jest.Mock).mock.calls.length;
    const inPanel = container.querySelector('.ch-pause-box button')!;
    await click(inPanel);
    expect(api.setSendingPaused).toHaveBeenCalledWith(true);
    expect(container.querySelector('[data-testid="ch-paused"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll('button[aria-pressed="true"]')).map((b) => b.textContent?.trim())).toEqual(['Resume sending', 'Resume sending']);
    expect((api.getActivity as jest.Mock).mock.calls.length).toBe(logLoads + 1);
  });

  it('the WhatsApp card says it is not connected (CH10.1); the activity log reads as sentences', async () => {
    await renderAt('/admin/comms-hub/schedule');
    // CH10.4: a history row shows its plain-words note (here: an earlier try had already sent it).
    expect(container.textContent).toContain('Already in the WhatsApp group, so it was not sent again.');
    expect(container.querySelector('[data-testid="ch-whatsapp-card"]')?.textContent).toContain('Not connected');
    expect(container.textContent).not.toContain('WhatsApp: coming next.');
    expect(container.querySelector('.ch-activity')?.textContent).toContain('Jackie approvedDemo Tuesday: reminder');
  });
});

describe('accessibility', () => {
  it.each(['/admin/comms-hub', '/admin/comms-hub/schedule'])('%s with real rows: axe finds no WCAG A/AA violations', async (path) => {
    await renderAt(path);
    const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });

  it.each(['/admin/comms-hub', '/admin/comms-hub/schedule'])('%s: every status badge says its status in words, with an icon', async (path) => {
    await renderAt(path);
    const badges = Array.from(container.querySelectorAll('.ch-status'));
    expect(badges.length).toBeGreaterThan(3);
    for (const b of badges) {
      expect((b.textContent ?? '').trim().length).toBeGreaterThan(2);
      expect(b.querySelector('i[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('Schedule focus order: the three filters, then the first row actions in reading order; every control meets the 44px class', async () => {
    await renderAt('/admin/comms-hub/schedule');
    const main = Array.from(container.querySelectorAll<HTMLElement>('select, button:not([disabled]), a[href], input, textarea'))
      .filter((el) => !el.closest('nav') && !el.closest('.page-header, header'));
    const order: string[] = [];
    for (const el of main.slice(0, 8)) { el.focus(); order.push(document.activeElement === el ? (el.id || (el.textContent ?? '').trim()) : 'LOST'); }
    expect(order.slice(0, 3)).toEqual(['ch-f-status', 'ch-f-channel', 'ch-f-event']);
    expect(order.slice(3, 6)).toEqual(['Review: Open House: announcement', 'Cancel: Demo Tuesday: reminder', 'Open: Demo Tuesday: recording and thanks']);
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('.ch-sched-row a, .ch-sched-row button, .ch-history a, .ch-history button'))) expect(el.className).toMatch(/comms-hub-action/);
  });
});

describe('display rules', () => {
  it('a row due before today (held by a pause) is listed under today, not lost in the past', () => {
    const now = new Date('2026-11-20T16:00:00Z');
    const g = groupByDay([row({ id: 'late', send_at: '2026-11-19T15:00:00Z' }), row({ id: 'n', send_at: null })], now);
    expect(g.map((x) => [x.heading, x.rows.map((r) => r.id)])).toEqual([['On approval', ['n']], ['Today, Fri, Nov 20', ['late']]]);
  });
  it('the retry button names what it will do', () => {
    expect(retryLabel({ status: 'partially_failed', deliveries: { total: 5, sent: 3, failed: 2, pending: 0, cancelled: 0 } })).toBe('Retry 2 recipients');
    expect(retryLabel({ status: 'failed', deliveries: { total: 1, sent: 0, failed: 1, pending: 0, cancelled: 0 } })).toBe('Send again');
    expect(retryLabel({ status: 'sent', deliveries: { total: 1, sent: 1, failed: 0, pending: 0, cancelled: 0 } })).toBeNull();
  });
});
