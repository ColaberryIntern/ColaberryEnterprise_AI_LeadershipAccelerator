/**
 * Maya on the campus.
 *  - The public site's widget (MayaChatWidget) is unchanged: with no props it is the floating launcher with proactive polling, and
 *    its embedded mode still works for any later public use. The campus no longer mounts it.
 *  - C121 (Ali, 2026-11-06: "put Maya in the same IM system as everyone else"): her desk is the same card as Reese's and Dara's.
 *    On duty with a DM host: "Message Maya" and her three questions, which open the shared chat dock; no embedded website chat,
 *    no visitor-id check, no request to the public /api/chat endpoints, and no "Executive briefing" anywhere.
 *  - Off duty (site chat off, or M36: paused on the M37 switch): "Back soon" like every desk, no button and no link.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockApiCalls: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
jest.mock('../../../utils/api', () => ({
  __esModule: true,
  default: {
    get: (url: string) => { mockApiCalls.push({ method: 'get', url }); return Promise.resolve({ data: {} }); },
    post: (url: string, body: Record<string, unknown>) => {
      mockApiCalls.push({ method: 'post', url, body });
      return Promise.resolve({ data: url.endsWith('/start') ? { conversation_id: 'conv-1', greeting: 'Hi, I am Maya.' } : {} });
    },
  },
}));
let mockOpenCalls: string[] = [];
let mockSendCalls: Array<[string, string]> = [];
jest.mock('../../../services/dmApi', () => ({
  openDm: (id: string) => { mockOpenCalls.push(id); return Promise.resolve('room-maya'); },
  sendDmMessage: (roomId: string, content: string) => { mockSendCalls.push([roomId, content]); return Promise.resolve({}); },
  myEnrollmentId: () => 'me',
}));

// eslint-disable-next-line import/first
import MayaChatWidget from '../../MayaChatWidget';
// eslint-disable-next-line import/first
import StaffDesk from '../StaffDesk';
// eslint-disable-next-line import/first
import { registerDmHost } from '../dmHost';
// eslint-disable-next-line import/first
import type { StaffDesk as Desk } from '../campusPeopleApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no scrollIntoView; the widget scrolls to Maya's newest message.
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;

let container: HTMLDivElement;
let root: Root | undefined;
let unhost: (() => void) | null = null;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter initialEntries={['/portal/today']}>{ui}</MemoryRouter>); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
beforeEach(() => { mockApiCalls.length = 0; mockOpenCalls = []; mockSendCalls = []; window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); unhost?.(); unhost = null; jest.useRealTimers(); window.localStorage.clear(); });
const launcher = () => container.querySelector('button[aria-label^="Chat with Maya"]');

describe('MayaChatWidget (the public website widget, unchanged)', () => {
  it('no props: the public site widget as before (floating launcher, proactive polling)', async () => {
    jest.useFakeTimers();
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    await render(<MayaChatWidget />);
    expect(launcher()).toBeNull(); // the site launcher appears after its 3 s delay, as before
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(launcher()).not.toBeNull();
    await act(async () => { jest.advanceTimersByTime(5100); });
    expect(mockApiCalls.some((c) => c.url.startsWith('/api/chat/proactive-check'))).toBe(true);
  });

  it('embedded and closed: no launcher and no proactive request', async () => {
    jest.useFakeTimers();
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    await render(<MayaChatWidget mode="embedded" />);
    expect(launcher()).toBeNull();
    await act(async () => { jest.advanceTimersByTime(20_000); });
    expect(mockApiCalls.filter((c) => c.url.startsWith('/api/chat/proactive-check'))).toHaveLength(0);
  });

  it('embedded and opened: starts one conversation and tells its host when it closes', async () => {
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    let closed = 0;
    await render(<MayaChatWidget mode="embedded" open onClose={() => { closed += 1; }} />);
    expect(mockApiCalls.find((c) => c.url === '/api/chat/start')?.body).toMatchObject({ visitor_id: 'fp-1', trigger_type: 'campus_gate' });
    await act(async () => { (container.querySelector('button[aria-label="Close chat"]') as HTMLButtonElement).click(); });
    expect(closed).toBe(1);
    expect(mockApiCalls.filter((c) => c.url === '/api/chat/start')).toHaveLength(1);
  });
});

describe('the Maya desk (C121: the shared chat)', () => {
  const maya: Desk = {
    id: 'maya', name: 'Maya', title: 'Welcome desk', building: 'admissions', ai: true, on_duty: true, enrollment_id: 'maya-1', opens: null,
    prompts: ['Compare the plans for me', 'Book a call with admissions', 'Have someone call me'],
  };

  it('on duty with a DM host: Message Maya and her three questions; no website chat, no briefing, no public chat calls', async () => {
    unhost = registerDmHost();
    window.localStorage.setItem('cb_visitor_fp', 'fp-1'); // even with a site visitor id, the widget is not used
    await render(<StaffDesk desk={maya} />);
    expect(container.querySelector('[data-testid="cm-desk-message-maya"]')?.textContent).toContain('Message Maya');
    expect(Array.from(container.querySelectorAll('.cm-pc-q button')).map((b) => b.textContent)).toEqual([
      '“Compare the plans for me”', '“Book a call with admissions”', '“Have someone call me”',
    ]);
    expect(container.querySelectorAll('[data-testid^="cm-ask-maya"], [data-testid="cm-maya-chat"], [data-testid="cm-maya-dnt"]')).toHaveLength(0);
    expect(container.textContent?.toLowerCase()).not.toContain('briefing');
    expect(mockApiCalls.filter((c) => c.url.startsWith('/api/chat'))).toHaveLength(0);
  });

  it('Message Maya opens the shared dock through te-open-dm with her enrollment id', async () => {
    unhost = registerDmHost();
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('te-open-dm', on);
    await render(<StaffDesk desk={maya} />);
    await act(async () => { (container.querySelector('[data-testid="cm-desk-message-maya"]') as HTMLButtonElement).click(); });
    window.removeEventListener('te-open-dm', on);
    expect(seen).toEqual([{ enrollmentId: 'maya-1', name: 'Maya' }]);
  });

  it('a question opens the conversation with Maya and sends it once', async () => {
    unhost = registerDmHost();
    await render(<StaffDesk desk={maya} />);
    const chip = container.querySelectorAll('.cm-pc-q button')[2] as HTMLButtonElement;
    await act(async () => { chip.click(); chip.click(); });
    for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
    expect(mockOpenCalls).toEqual(['maya-1']);
    expect(mockSendCalls).toEqual([['room-maya', 'Have someone call me']]);
  });

  it('no DM host on the page: "Open Today to message Maya", like the other desks', async () => {
    await render(<StaffDesk desk={maya} />);
    expect(container.textContent).toContain('to message Maya');
    expect(container.querySelector('[data-testid="cm-desk-message-maya"]')).toBeNull();
  });

  it.each([['site_chat_off'], ['maya_paused']])('off duty (%s): "Back soon", no button and no link (M36)', async (opens) => {
    await render(<StaffDesk desk={{ ...maya, on_duty: false, enrollment_id: null, prompts: [], opens }} />);
    expect(container.querySelector('[data-testid="cm-desk-status-maya"]')?.textContent).toBe('Back soon');
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });
});
