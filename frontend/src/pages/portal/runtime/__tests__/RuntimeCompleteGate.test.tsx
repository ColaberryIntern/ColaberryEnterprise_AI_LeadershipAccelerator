/**
 * RuntimeCompleteGate — Mark complete is DIMMED until the task's requirement is
 * met, for every gate the server enforces (2026-10-29, Ali: a video task showed a
 * live Complete button; clicking it hit the server's watch gate and replaced the
 * page). Never hidden, never clickable early, and a server rejection shows inline.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { RuntimeCompleteGate, RuntimeBlogCompleteGate, type CompleteGateProps } from '../RuntimeCompleteGate';
import { isWatchBlocked, watchGateLabel } from '../../../../components/timeline/useWatchVerdict';

const off = { on: false, complete: false, done: 0, total: 0 };
const base = (over: Partial<CompleteGateProps> = {}): CompleteGateProps => ({
  completed: false, busy: false, fill: false, evidenceRequired: false,
  reader: off, deepDive: off, watchApplies: false, watch: null, dwellApplies: false, dwell: null,
  message: null, onComplete: jest.fn(), ...over,
});
let host: HTMLDivElement; let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const render = (el: React.ReactElement) => { act(() => root.render(el)); };
const btn = () => host.querySelector('button') as HTMLButtonElement;
const text = () => host.textContent || '';

describe('watch gate', () => {
  it('a freshly opened video (verdict still loading) starts dimmed', () => {
    render(<RuntimeCompleteGate {...base({ watchApplies: true, watch: null })} />);
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain('Checking your progress');
  });

  it('below the bar stays dimmed and shows how far along', () => {
    render(<RuntimeCompleteGate {...base({ watchApplies: true, watch: { watched_pct: 20, required_pct: 75, met: false } })} />);
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain('Keep watching · 20/75%');
  });

  it('once met, the button lights up and completes', () => {
    const onComplete = jest.fn();
    render(<RuntimeCompleteGate {...base({ watchApplies: true, watch: { watched_pct: 80, required_pct: 75, met: true }, onComplete })} />);
    expect(btn().disabled).toBe(false);
    act(() => { btn().click(); });
    expect(onComplete).toHaveBeenCalled();
  });

  it('a video type with no watch rule is open to click', () => {
    render(<RuntimeCompleteGate {...base({ watchApplies: true, watch: { watched_pct: 0, required_pct: null, met: true } })} />);
    expect(btn().disabled).toBe(false);
  });
});

describe('every other gate dims the button rather than hiding it', () => {
  it('dwell: dimmed with the seconds remaining', () => {
    render(<RuntimeCompleteGate {...base({ dwellApplies: true, dwell: { dwell_s: 40, required_s: 120, met: false } })} />);
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain('Keep reading · 40/120s');
  });

  it('reader: dimmed with sections remaining', () => {
    render(<RuntimeCompleteGate {...base({ reader: { on: true, complete: false, done: 2, total: 5 } })} />);
    expect(btn().disabled).toBe(true);
    expect(text()).toContain('2 of 5 sections read');
  });

  it('deep dive: dimmed until the guide is finished', () => {
    render(<RuntimeCompleteGate {...base({ deepDive: { on: true, complete: false, done: 1, total: 4 } })} />);
    expect(btn().disabled).toBe(true);
  });

  it('lab copy step: dimmed with the reason', () => {
    render(<RuntimeCompleteGate {...base({ lockedReason: 'Copy the prompt first' })} />);
    expect(btn().disabled).toBe(true);
    expect(text()).toContain('Copy the prompt first');
  });

  it('no requirements: plain Mark complete, enabled', () => {
    render(<RuntimeCompleteGate {...base()} />);
    expect(btn().disabled).toBe(false);
    expect(btn().textContent).toContain('Mark complete');
  });
});

describe('server rejection and completed states', () => {
  it('a rejection message shows inline next to the button', () => {
    render(<RuntimeCompleteGate {...base({ message: 'Watch at least 75% to collect your points' })} />);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Watch at least 75%');
  });

  it('a completed card shows the done pill, no button', () => {
    render(<RuntimeCompleteGate {...base({ completed: true })} />);
    expect(btn()).toBeNull();
  });
});

describe('blog gate', () => {
  it('dimmed while reading, enabled once the 2 minutes are met', () => {
    render(<RuntimeBlogCompleteGate completed={false} busy={false} gate={{ met: false, read_s: 30, required_s: 120 }} learningPoints={10} message={null} onCollect={jest.fn()} />);
    expect(btn().disabled).toBe(true);
    expect(btn().textContent).toContain('Keep reading · 30/120s');
    render(<RuntimeBlogCompleteGate completed={false} busy={false} gate={{ met: true, read_s: 120, required_s: 120 }} learningPoints={10} message={null} onCollect={jest.fn()} />);
    expect(btn().disabled).toBe(false);
    expect(btn().textContent).toContain('Collect +10 pts');
  });
});

describe('watch helpers', () => {
  it('unknown and unmet both block; met and ungated do not', () => {
    expect(isWatchBlocked(null)).toBe(true);
    expect(isWatchBlocked({ watched_pct: 10, required_pct: 75, met: false })).toBe(true);
    expect(isWatchBlocked({ watched_pct: 80, required_pct: 75, met: true })).toBe(false);
    expect(isWatchBlocked({ watched_pct: 0, required_pct: null, met: true })).toBe(false);
    expect(watchGateLabel({ watched_pct: 80, required_pct: 75, met: true })).toBeNull();
  });
});
