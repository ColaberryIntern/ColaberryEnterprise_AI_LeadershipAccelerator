/**
 * C7 Explorer tour end: the confirmation appears ONLY when the server says a handoff exists; every other answer, an error or a
 * timeout opens the sign-up sheet with the line that is true for it; one request however fast the clicks; the client API
 * rejects a malformed answer.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

type Answer = { handoff: boolean; reason: string };
let mockAnswer: () => Promise<Answer> = () => Promise.resolve({ handoff: true, reason: 'created' });
let calls = 0;
jest.mock('../campusApi', () => ({
  ...jest.requireActual('../campusApi'),
  postTourComplete: () => { calls += 1; return mockAnswer(); },
}));

// eslint-disable-next-line import/first
import CampusTourEnd, { END_COPY } from '../CampusTourEnd';
// eslint-disable-next-line import/first
import type { ExplorerPathModel } from '../campusPath';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MODEL: ExplorerPathModel = { steps: [{ kind: 'try', label: 'Watch the preview in the Classroom', route: '/portal/classroom' }], opens: ['Classroom'], cta: { label: 'Enroll', to: '/enroll' }, askMaya: false };
let container: HTMLDivElement;
let root: Root;
async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<MemoryRouter><CampusTourEnd pathModel={MODEL} onNavigate={() => undefined} /></MemoryRouter>); });
}
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
beforeEach(() => { calls = 0; mockAnswer = () => Promise.resolve({ handoff: true, reason: 'created' }); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const optIn = async () => { await act(async () => { (q('cm-tour-optin') as HTMLButtonElement).click(); }); await flush(); };

describe('confirmed only by the server', () => {
  it('created: Maya\'s line, no sign-up sheet', async () => {
    await mount();
    await optIn();
    expect(q('cm-tour-confirmed')?.textContent).toBe(END_COPY.created);
    expect(q('cm-tour-sheet')).toBeNull();
    expect(calls).toBe(1);
  });
  it('already_open: someone is already following up, no sheet', async () => {
    mockAnswer = () => Promise.resolve({ handoff: true, reason: 'already_open' });
    await mount();
    await optIn();
    expect(q('cm-tour-confirmed')?.textContent).toBe(END_COPY.already_open);
    expect(q('cm-tour-sheet')).toBeNull();
  });
});

describe('everything else opens the sign-up sheet with a true line', () => {
  it('closed: its own line, never "couldn\'t reach"', async () => {
    mockAnswer = () => Promise.resolve({ handoff: false, reason: 'closed' });
    await mount();
    await optIn();
    expect(q('cm-tour-line')?.textContent).toBe(END_COPY.closed);
    expect(q('cm-explorer-path')).not.toBeNull();
    expect(q('cm-tour-confirmed')).toBeNull();
  });
  it.each([
    ['disabled', () => Promise.resolve({ handoff: false, reason: 'disabled' })],
    ['unavailable', () => Promise.resolve({ handoff: false, reason: 'unavailable' })],
    ['a network error', () => Promise.reject(new Error('Network Error'))],
    ['a timeout', () => Promise.reject(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' }))],
    ['handoff:true with an unknown reason', () => Promise.resolve({ handoff: true, reason: 'surprise' })],
  ])('%s: the couldn\'t-reach line and the sheet, never success copy', async (_n, answer) => {
    mockAnswer = answer as () => Promise<Answer>;
    await mount();
    await optIn();
    expect(q('cm-tour-line')?.textContent).toBe(END_COPY.unreachable);
    expect(q('cm-explorer-path')).not.toBeNull();
    expect(q('cm-tour-confirmed')).toBeNull();
  });
  it('"See what enrolling opens" opens the sheet with no request and no line', async () => {
    await mount();
    await act(async () => { q('cm-tour-signup')!.click(); });
    expect(q('cm-explorer-path')).not.toBeNull();
    expect(q('cm-tour-line')).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('one request', () => {
  it('a double click sends one request and shows a busy state', async () => {
    let release: (a: Answer) => void = () => undefined;
    mockAnswer = () => new Promise<Answer>((r) => { release = r; });
    await mount();
    await act(async () => { const b = q('cm-tour-optin') as HTMLButtonElement; b.click(); b.click(); });
    expect(calls).toBe(1);
    expect((q('cm-tour-optin') as HTMLButtonElement).disabled).toBe(true);
    expect(q('cm-tour-optin')?.textContent).toBe('Asking admissions...');
    await act(async () => { release({ handoff: true, reason: 'created' }); });
    await flush();
    expect(q('cm-tour-confirmed')?.textContent).toBe(END_COPY.created);
  });
});
