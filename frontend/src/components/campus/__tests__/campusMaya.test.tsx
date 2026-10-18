/**
 * C6 Maya at the gate (Ali's decision: the website chat, no new endpoint).
 *  - The public site's widget is unchanged with no props (floating launcher, proactive polling).
 *  - Embedded: no launcher, no proactive request; opens on request with trigger campus_gate; tells the campus when it closes.
 *  - The desk: on duty + this browser has the site's visitor id -> the embedded chat; no visitor id -> the enrollment page
 *    (never the widget's "try refreshing" dead end); the campus never writes the visitor id; site chat off -> opens soon.
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
jest.mock('../../../services/dmApi', () => ({ openDm: () => Promise.resolve('room'), sendDmMessage: () => Promise.resolve({}) }));

// eslint-disable-next-line import/first
import MayaChatWidget from '../../MayaChatWidget';
// eslint-disable-next-line import/first
import StaffDesk, { hasSiteVisitorId } from '../StaffDesk';
// eslint-disable-next-line import/first
import type { StaffDesk as Desk } from '../campusPeopleApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no scrollIntoView; the widget scrolls to Maya's newest message.
(Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;

let container: HTMLDivElement;
let root: Root | undefined;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter initialEntries={['/portal/today']}>{ui}</MemoryRouter>); });
  for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); });
}
beforeEach(() => { mockApiCalls.length = 0; window.localStorage.clear(); window.sessionStorage.clear(); });
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); jest.useRealTimers(); window.localStorage.clear(); });
const launcher = () => container.querySelector('button[aria-label^="Chat with Maya"]');

describe('MayaChatWidget', () => {
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

  it('embedded, opened by the campus: starts a conversation tagged campus_gate; closing tells the campus', async () => {
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    let closed = 0;
    await render(<MayaChatWidget mode="embedded" open onClose={() => { closed += 1; }} />);
    const start = mockApiCalls.find((c) => c.url === '/api/chat/start');
    expect(start?.body).toMatchObject({ visitor_id: 'fp-1', trigger_type: 'campus_gate' });
    expect(container.textContent).toContain('Hi, I am Maya.');
    await act(async () => { (container.querySelector('button[aria-label="Close chat"]') as HTMLButtonElement).click(); });
    expect(closed).toBe(1);
    expect(mockApiCalls.filter((c) => c.url === '/api/chat/start')).toHaveLength(1); // closing never re-opens
  });
});

describe('the Maya desk', () => {
  const maya: Desk = { id: 'maya', name: 'Maya', title: 'Welcome desk', building: 'gate', ai: true, on_duty: true, enrollment_id: null, opens: null, prompts: [] };

  it('on duty, this browser has the site visitor id: Ask Maya opens the embedded chat at the gate', async () => {
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    await render(<StaffDesk desk={maya} />);
    expect(container.querySelector('[data-testid="cm-ask-maya-site"]')).toBeNull();
    await act(async () => { (container.querySelector('[data-testid="cm-ask-maya"]') as HTMLButtonElement).click(); });
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
    expect(mockApiCalls.find((c) => c.url === '/api/chat/start')?.body).toMatchObject({ trigger_type: 'campus_gate' });
  });

  it('on duty, NO visitor id (not seeded): a link to the enrollment page in a new tab, the chat is never mounted', async () => {
    await render(<StaffDesk desk={maya} />);
    expect(container.querySelector('[data-testid="cm-ask-maya"]')).toBeNull();
    const link = container.querySelector('[data-testid="cm-ask-maya-site"]')!;
    expect(link.getAttribute('href')).toBe('/enroll');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(mockApiCalls.filter((c) => c.url.startsWith('/api/chat'))).toHaveLength(0);
    expect(container.textContent).not.toContain('refreshing');
  });

  it('the campus never writes the site visitor id', async () => {
    await render(<StaffDesk desk={maya} />);
    expect(hasSiteVisitorId()).toBe(false);
    expect(window.localStorage.getItem('cb_visitor_fp')).toBeNull();
  });

  it('a Do Not Track browser: the desk says the chat stays hidden (the widget hides itself for DNT), no dead link', async () => {
    window.localStorage.setItem('cb_visitor_fp', 'fp-1');
    const dnt = Object.getOwnPropertyDescriptor(Navigator.prototype, 'doNotTrack');
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, get: () => '1' });
    await render(<StaffDesk desk={maya} />);
    expect(container.querySelector('[data-testid="cm-maya-dnt"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="cm-ask-maya"]')).toHaveLength(0);
    if (dnt) Object.defineProperty(navigator, 'doNotTrack', dnt); else delete (navigator as unknown as { doNotTrack?: string }).doNotTrack;
  });

  it('site chat off: "opens soon", no button and no link', async () => {
    await render(<StaffDesk desk={{ ...maya, on_duty: false, opens: 'site_chat_off' }} />);
    expect(container.querySelector('[data-testid="cm-desk-status-maya"]')?.textContent).toBe("Maya's desk opens soon");
    expect(container.querySelectorAll('button, a')).toHaveLength(0);
  });
});
