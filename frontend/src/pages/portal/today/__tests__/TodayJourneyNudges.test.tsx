/**
 * TodayJourneyNudges - the journey-nudge card's one consumer (Phase 5 T521 fix
 * cycle 1). The read and the dismiss are injected, so the component is driven
 * end to end without mocking the shared portal client: two nudges render under
 * the deploy marker; a dismiss drops the row at once and posts its id; a
 * failing read renders nothing and throws nothing; a failing dismiss keeps the
 * row gone; the defaults - the real read and the real post over the shared
 * portal client - are covered by spying on that client's own methods.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import TodayJourneyNudges, { loadJourneyNudges, dismissJourneyNudge, JOURNEY_NUDGES_PATH } from '../TodayJourneyNudges';
import portalApi from '../../../../utils/portalApi';
import type { JourneyNudge } from '../../../../components/portal/JourneyNudgeCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const two: JourneyNudge[] = [
  { id: 'n-1', title: 'Answer three discovery questions', href: '/portal/discovery', purpose: 'discovery_questions' },
  { id: 'n-2', title: 'Book a 15-minute review', href: 'https://www.refactored.ai/book', purpose: 'scheduling_offer' },
];

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe('TodayJourneyNudges', () => {
  it('renders what the read returns, under the deploy marker, and nothing before it settles', async () => {
    let resolve: (rows: JourneyNudge[]) => void = () => undefined;
    const load = jest.fn(() => new Promise<JourneyNudge[]>((r) => { resolve = r; }));
    act(() => root.render(<TodayJourneyNudges load={load} dismiss={jest.fn(() => Promise.resolve())} />));
    expect(container.innerHTML).toBe('');
    await act(async () => { resolve(two); });
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="gj-journey-nudge-card"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="gj-journey-nudge"]')).toHaveLength(2);
  });

  it('dismiss drops the row at once and posts that id, once', async () => {
    const dismiss = jest.fn(() => Promise.resolve());
    act(() => root.render(<TodayJourneyNudges load={() => Promise.resolve(two)} dismiss={dismiss} />));
    await flush();
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    act(() => { buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelectorAll('[data-testid="gj-journey-nudge"]')).toHaveLength(1);
    expect(container.textContent).toContain('Book a 15-minute review');
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith('n-1');
  });

  it('a failing read renders nothing and throws nothing', async () => {
    act(() => root.render(<TodayJourneyNudges load={() => Promise.reject(new Error('503'))} dismiss={jest.fn(() => Promise.resolve())} />));
    await flush();
    expect(container.innerHTML).toBe('');
  });

  it('a failing dismiss keeps the row gone and throws nothing', async () => {
    act(() => root.render(<TodayJourneyNudges load={() => Promise.resolve(two)} dismiss={() => Promise.reject(new Error('500'))} />));
    await flush();
    act(() => { container.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(container.querySelectorAll('[data-testid="gj-journey-nudge"]')).toHaveLength(1);
    expect(container.textContent).toContain('Answer three discovery questions');
  });
});

describe('the defaults, over the shared portal client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('loadJourneyNudges returns the array the route answers, and nothing for any other body', async () => {
    const get = jest.spyOn(portalApi, 'get')
      .mockResolvedValueOnce({ data: two } as never)
      .mockResolvedValueOnce({ data: { error: 'not an array' } } as never);
    expect(await loadJourneyNudges()).toEqual(two);
    expect(await loadJourneyNudges()).toEqual([]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith(JOURNEY_NUDGES_PATH);
  });

  it('dismissJourneyNudge posts to the dismiss path of that id, once', async () => {
    const post = jest.spyOn(portalApi, 'post').mockResolvedValue({ data: { dismissed: true } } as never);
    await dismissJourneyNudge('n-2');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/portal/journey-nudges/n-2/dismiss');
  });

  it('with no props - as TodayShell mounts it - the component reads through the shared client', async () => {
    jest.spyOn(portalApi, 'get').mockResolvedValue({ data: two } as never);
    act(() => root.render(<TodayJourneyNudges />));
    await flush();
    expect(container.querySelectorAll('[data-testid="gj-journey-nudge"]')).toHaveLength(2);
  });
});
