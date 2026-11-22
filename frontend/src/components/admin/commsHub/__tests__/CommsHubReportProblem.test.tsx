import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CommsHubLayout, { COMMS_HUB_BUG_REPORT_ENDPOINT } from '../CommsHubLayout';
import * as commsHubApi from '../../../../services/commsHubApi';
import api from '../../../../utils/api';

jest.mock('../../../../services/commsHubApi');
jest.mock('../../../../utils/api', () => ({ __esModule: true, default: { post: jest.fn() } }));

/**
 * CH9.1 Report a problem on the Communications Hub: the button is on every tab, and a report goes to
 * the hub's own endpoint (comms_hub), never Marketing's (campaigns), which Jackie and Taiwo cannot reach.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const EMPTY = { awaiting_approval: 0, scheduled_next_7_days: 0, upcoming_events: 0, events_missing_thumbnail: 0, needs_attention: 0, sending_paused: false };
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

async function renderAt(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // The tab bodies are stubs: this file is about the shell's button, not the tabs.
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/comms-hub" element={<CommsHubLayout />}>
            <Route index element={<p>today</p>} />
            <Route path="events" element={<p>events</p>} />
            <Route path="compose" element={<p>compose</p>} />
            <Route path="schedule" element={<p>schedule</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);

beforeEach(() => { (commsHubApi.getCommsHubSummary as jest.Mock).mockResolvedValue(EMPTY); (api.post as jest.Mock).mockResolvedValue({ data: { sent: true } }); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

describe('CH9.1 Report a problem on the Communications Hub', () => {
  it.each(['/admin/comms-hub', '/admin/comms-hub/events', '/admin/comms-hub/compose', '/admin/comms-hub/schedule'])(
    'the button is on %s', async (path) => {
      await renderAt(path);
      const open = q<HTMLButtonElement>('[data-testid="report-problem-open"]');
      expect(open?.textContent).toContain('Report a problem');
    },
  );

  it('a report posts to the hub endpoint, labelled Communications Hub, with the route it was sent from', async () => {
    await renderAt('/admin/comms-hub/events');
    await act(async () => { q<HTMLButtonElement>('[data-testid="report-problem-open"]')!.click(); });
    const send = q<HTMLButtonElement>('[data-testid="bug-send"]')!;
    expect(send.disabled).toBe(true); // nothing typed yet
    await act(async () => {
      type(q<HTMLInputElement>('[data-testid="bug-summary"]')!, 'Thumbnail never finishes');
      type(q<HTMLTextAreaElement>('[data-testid="bug-happened"]')!, 'Pressed Generate and nothing appeared after five minutes.');
    });
    expect(send.disabled).toBe(false);
    await act(async () => { send.click(); });
    await settle();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = (api.post as jest.Mock).mock.calls[0];
    expect(url).toBe(COMMS_HUB_BUG_REPORT_ENDPOINT);
    expect(url).toBe('/api/admin/comms-hub/bug-report');
    expect(url).not.toContain('/marketing/');
    expect(body).toMatchObject({ summary: 'Thumbnail never finishes', brandLabel: 'Communications Hub', area: 'comms-hub' });
    expect(q('[data-testid="report-problem-sent"]')).not.toBeNull();
  });

  it('a refused report says why and keeps what was typed', async () => {
    (api.post as jest.Mock).mockRejectedValue({ response: { data: { error: 'No one is set up to receive problem reports yet. Tell Ali directly.' } } });
    await renderAt('/admin/comms-hub');
    await act(async () => { q<HTMLButtonElement>('[data-testid="report-problem-open"]')!.click(); });
    await act(async () => {
      type(q<HTMLInputElement>('[data-testid="bug-summary"]')!, 'Pause did nothing');
      type(q<HTMLTextAreaElement>('[data-testid="bug-happened"]')!, 'Pressed Pause all sending and it stayed the same.');
    });
    await act(async () => { q<HTMLButtonElement>('[data-testid="bug-send"]')!.click(); });
    await settle();
    expect(q('[data-testid="report-problem-error"]')?.textContent).toContain('Tell Ali directly');
    expect(q<HTMLInputElement>('[data-testid="bug-summary"]')!.value).toBe('Pause did nothing');
  });
});
