import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import LivePanel, { LIVE_POLL_MS } from '../LivePanel';
import * as api from '../../../../../../services/commsHubApi';
import type { HubEvent, LivePanelView } from '../../../../../../services/commsHubApi';

jest.mock('../../../../../../services/commsHubApi', () => ({
  ...jest.requireActual('../../../../../../services/commsHubApi'),
  getLivePanel: jest.fn(), prepareLiveStream: jest.fn(), sendLiveCommand: jest.fn(), getLiveIngest: jest.fn(),
}));

/** CH5.2 the Live panel, rendered in each state the broadcast can be in. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const m = <T,>(f: T): jest.Mock => f as unknown as jest.Mock;
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
const KEY = 'SECRET-STREAM-KEY-1234567890abcdef';
const EVENT = { id: 'e1', title: 'Demo Tuesday', status: 'scheduled', repeat_rule: null } as unknown as HubEvent;
const occ = (state: string, health = 'unknown', version = 2): LivePanelView['occurrence'] => ({ id: 'o1', editorial_state: state, provider_health: health, version, scheduled_start_at: '2026-12-02T00:00:00.000Z', content_started_at: null, ended_at: null });
const view = (o: Partial<LivePanelView> = {}): LivePanelView => ({ input_configured: true, occurrence: null, commands: [], input_held_by: null, ...o });

async function render(ev: HubEvent = EVENT, onStatusChange?: () => void): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<LivePanel event={ev} locked={false} onStatusChange={onStatusChange} />); });
  await settle();
}
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); jest.useRealTimers(); });
const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement;
const click = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const text = (): string => container.textContent ?? '';

describe('CH5.2 the panel follows the broadcast', () => {
  it('not prepared: says what it does; Prepare stream calls the server and shows Getting ready', async () => {
    m(api.getLivePanel).mockResolvedValue(view());
    await render();
    expect(text()).toContain('Not prepared');
    m(api.prepareLiveStream).mockResolvedValue(view({ occurrence: occ('backstage') }));
    await click(btn('Prepare stream'));
    expect(api.prepareLiveStream).toHaveBeenCalledWith('e1');
    expect(text()).toContain('Getting ready');
    expect(text()).toContain('Waiting for the stream from Zoom.');
  });

  it('backstage, not ready: Go live is disabled and says why; the stream details only load when asked, the key masked', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('backstage') }));
    await render();
    expect(btn('Go live').disabled).toBe(true);
    expect(btn('Go live').getAttribute('aria-describedby')).toBe('ch-live-why');
    expect(container.querySelector('#ch-live-why')!.textContent).toBe('Go live unlocks when the stream from Zoom is ready.');
    expect(api.getLiveIngest).not.toHaveBeenCalled();
    m(api.getLiveIngest).mockResolvedValue({ rtmps_url: 'rtmps://live.cloudflare.com:443/live/', stream_key: KEY });
    await click(btn('Show stream details'));
    const key = container.querySelector('#ch-live-key') as HTMLInputElement;
    expect(key.type).toBe('password');
    expect(key.value).toBe(KEY);
    await click(btn('Show'));
    expect(key.type).toBe('text');
    expect(btn('Hide').getAttribute('aria-pressed')).toBe('true');
  });

  it('polls every 5 s while getting ready; when the stream is ready, Go live works and tells the editor', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('backstage') }));
    const onStatus = jest.fn();
    await render(EVENT, onStatus);
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('backstage', 'ready', 3) }));
    await act(async () => { jest.advanceTimersByTime(LIVE_POLL_MS); });
    await settle();
    expect(api.getLivePanel).toHaveBeenCalledTimes(2);
    expect(text()).toContain('Stream ready: Cloudflare is receiving it.');
    m(api.sendLiveCommand).mockResolvedValue(view({ occurrence: occ('live', 'ready', 5) }));
    await click(btn('Go live'));
    expect(api.sendLiveCommand).toHaveBeenCalledWith('e1', 'go_live', 3);
    expect(text()).toContain('Live now');
    expect(onStatus).toHaveBeenCalledTimes(1);
  });

  it('live: End asks first, then ends', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('live', 'ready', 5) }));
    await render();
    await click(btn('End stream'));
    expect(container.querySelector('[role="alertdialog"]')!.textContent).toContain('End the stream for everyone watching?');
    await click(btn('Keep streaming'));
    expect(api.sendLiveCommand).not.toHaveBeenCalled();
    await click(btn('End stream'));
    m(api.sendLiveCommand).mockResolvedValue(view({ occurrence: occ('ended', 'ready', 6) }));
    await click(btn('Yes, end it'));
    expect(api.sendLiveCommand).toHaveBeenCalledWith('e1', 'end', 5);
    expect(text()).toContain('This stream has ended.');
  });

  it('a series that has ended one date offers the next date', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('ended') }));
    await render({ ...EVENT, repeat_rule: { freq: 'weekly', until: '2027-01-31' } } as unknown as HubEvent);
    expect(btn('Prepare the next date')).toBeDefined();
  });

  it('another event holds the stream: it is named, and Prepare is disabled', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ input_held_by: { occurrence_id: 'x', title: 'Weekly Live', state: 'live' } }));
    await render();
    expect(text()).toContain('"Weekly Live" is live right now. Only one event can use the stream at a time.');
    expect(btn('Prepare stream').disabled).toBe(true);
  });

  it('no input on this server: says so, offers nothing', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ input_configured: false }));
    await render();
    expect(text()).toContain('No live stream input is set up on this server');
    expect(btn('Prepare stream')).toBeUndefined();
  });

  it('a refusal shows the server\'s sentence and re-reads the panel', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('backstage', 'ready', 3) }));
    await render();
    m(api.sendLiveCommand).mockRejectedValue({ response: { data: { error: '"Weekly Live" is live on the stream right now. Only one event can use it at a time; end that one first.' } } });
    await click(btn('Go live'));
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('"Weekly Live" is live on the stream right now.');
    expect(api.getLivePanel).toHaveBeenCalledTimes(2);
  });

  it('no axe violations, with the stream details open', async () => {
    m(api.getLivePanel).mockResolvedValue(view({ occurrence: occ('backstage', 'ready') }));
    m(api.getLiveIngest).mockResolvedValue({ rtmps_url: 'rtmps://live.cloudflare.com:443/live/', stream_key: KEY });
    await render();
    await click(btn('Show stream details'));
    jest.useRealTimers();
    const r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
