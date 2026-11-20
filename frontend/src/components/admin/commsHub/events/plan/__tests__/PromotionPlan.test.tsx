import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import PromotionPlan from '../PromotionPlan';
import * as api from '../../../../../../services/commsHubApi';
import type { HubEvent, PlanView } from '../../../../../../services/commsHubApi';

jest.mock('../../../../../../services/commsHubApi', () => ({ ...jest.requireActual('../../../../../../services/commsHubApi'), getPromotionPlan: jest.fn(), savePromotionPlan: jest.fn() }));

/** CH6.4 the promotion plan card: rows, ticking, Draft these messages, statuses, a11y. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const m = <T,>(f: T): jest.Mock => f as unknown as jest.Mock;
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const EVENT = { id: 'e1', status: 'scheduled' } as unknown as HubEvent;
const row = (kind: string, label: string, timing: string, o: Record<string, unknown> = {}) => ({ kind, label, timing, channels: 'Community feed, in-app notification', ticked: false, next: null, ...o });
const PLAN: PlanView = { event_id: 'e1', rows: [
  row('announcement', 'Announcement', '4 days before, 12:00 PM'), row('reminder', 'Reminder', '1 day before, at the start time'),
  row('starting_soon', 'Starting in 1 hour', 'Day of, 1 hour before'), row('recording_thanks', 'Recording and thanks', 'Day after, 10:00 AM'),
] as never };

async function render(ev: HubEvent = EVENT): Promise<void> {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  await act(async () => { root.render(<PromotionPlan event={ev} />); });
  await settle();
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });
const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement;
const click = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };

it('shows the four rows with their timing; ticking two and drafting sends exactly those, then shows their status and send time', async () => {
  m(api.getPromotionPlan).mockResolvedValue(PLAN);
  await render();
  expect(Array.from(container.querySelectorAll('.ch-plan-row label')).map((l) => l.textContent)).toEqual(['Announcement', 'Reminder', 'Starting in 1 hour', 'Recording and thanks']);
  expect(container.textContent).toContain('4 days before, 12:00 PM');
  await click(container.querySelector('#ch-plan-announcement')!);
  await click(container.querySelector('#ch-plan-reminder')!);
  m(api.savePromotionPlan).mockResolvedValue({
    event_id: 'e1', result: { created: 2, existing: 0, skipped: [] },
    rows: [
      row('announcement', 'Announcement', '4 days before, 12:00 PM', { ticked: true, next: { message_id: 'm1', status: 'needs_approval', send_at: '2026-11-27T18:00:00.000Z', occurrence: '2026-12-02T00:00:00.000Z' } }),
      row('reminder', 'Reminder', '1 day before', { ticked: true, next: { message_id: 'm2', status: 'scheduled', send_at: '2026-12-01T00:00:00.000Z', occurrence: '2026-12-02T00:00:00.000Z' } }),
      PLAN.rows[2], PLAN.rows[3],
    ],
  });
  await click(btn('Draft these messages'));
  expect(api.savePromotionPlan).toHaveBeenCalledWith('e1', ['announcement', 'reminder']);
  expect(container.querySelector('[role="status"]')!.textContent).toContain('2 messages were drafted and wait for approval in Compose.');
  expect(container.textContent).toContain('Fri, Nov 27, 12:00 PM CST');
  expect(container.textContent).toContain('Needs approval');
  expect(container.textContent).toContain('Scheduled');
});

it('says when a row was skipped, and when nothing new was due', async () => {
  m(api.getPromotionPlan).mockResolvedValue(PLAN);
  await render();
  await click(container.querySelector('#ch-plan-announcement')!);
  m(api.savePromotionPlan).mockResolvedValue({ ...PLAN, result: { created: 0, existing: 0, skipped: [{ kind: 'announcement', occurrence: 'x', reason: 'its send time has already passed' }] } });
  await click(btn('Draft these messages'));
  const s = container.querySelector('[role="status"]')!.textContent!;
  expect(s).toContain('Nothing new was due yet');
  expect(s).toContain('Announcement was skipped: its send time has already passed.');
});

it('a cancelled event: says why and disables everything', async () => {
  m(api.getPromotionPlan).mockResolvedValue(PLAN);
  await render({ ...EVENT, status: 'cancelled' } as unknown as HubEvent);
  expect(container.textContent).toContain('A cancelled event has no promotion plan.');
  expect(btn('Draft these messages').disabled).toBe(true);
});

it('every checkbox is labelled and described by its timing; no axe violations', async () => {
  m(api.getPromotionPlan).mockResolvedValue(PLAN);
  await render();
  for (const k of ['announcement', 'reminder', 'starting_soon', 'recording_thanks']) {
    const box = container.querySelector(`#ch-plan-${k}`)!;
    expect(container.querySelector(`label[for="ch-plan-${k}"]`)).not.toBeNull();
    expect(container.querySelector(`#${box.getAttribute('aria-describedby')}`)).not.toBeNull();
  }
  const r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
