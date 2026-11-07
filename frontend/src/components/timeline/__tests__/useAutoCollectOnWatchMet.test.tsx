/**
 * C116: a lesson video collects its points by itself when the learner crosses the watch bar while watching. Production, 7 Nov:
 * an Explorer watched 100% of the Week 0 program video and got no credit because nobody pressed "Collect points".
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { crossedWatchBar, useAutoCollectOnWatchMet } from '../useAutoCollectOnWatchMet';
import type { WatchVerdict } from '../useWatchVerdict';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const below = (pct: number): WatchVerdict => ({ watched_pct: pct, required_pct: 75, met: false });
const met = (pct: number): WatchVerdict => ({ watched_pct: pct, required_pct: 75, met: true });
const UNGATED: WatchVerdict = { watched_pct: 0, required_pct: null, met: true };

describe('crossedWatchBar', () => {
  it('is true only for a below-the-bar verdict followed by a met one', () => {
    expect(crossedWatchBar(below(70), met(76))).toBe(true);
    expect(crossedWatchBar(null, met(100))).toBe(false);        // already met when the drawer opened
    expect(crossedWatchBar(met(80), met(90))).toBe(false);      // was already over the bar
    expect(crossedWatchBar(below(40), below(60))).toBe(false);  // still below
    expect(crossedWatchBar(UNGATED, UNGATED)).toBe(false);      // no gate, nothing to cross
    expect(crossedWatchBar(below(70), null)).toBe(false);       // drawer moved to another card
  });
});

const Harness: React.FC<{ watch: WatchVerdict | null; enabled: boolean; collect: () => void }> = ({ watch, enabled, collect }) => {
  useAutoCollectOnWatchMet(watch, enabled, collect);
  return null;
};

let container: HTMLDivElement;
let root: Root;
let collect: jest.Mock;
const show = (watch: WatchVerdict | null, enabled = true) =>
  act(() => { root.render(<Harness watch={watch} enabled={enabled} collect={collect} />); });

beforeEach(() => {
  collect = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('useAutoCollectOnWatchMet', () => {
  it('collects once when a heartbeat carries the learner over the bar', () => {
    show(null);          // drawer opened, verdict loading
    show(below(5));      // verdict on open
    show(below(70));     // heartbeats
    show(met(76));       // crosses 75%
    show(met(90));       // keeps watching
    show(met(100));
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('does not collect a video that was already met when the drawer opened (a rewatch)', () => {
    show(null);
    show(met(100));
    show(met(100));
    expect(collect).not.toHaveBeenCalled();
  });

  it('does nothing while disabled (preview, completed card, no points)', () => {
    show(below(70), false);
    show(met(80), false);
    expect(collect).not.toHaveBeenCalled();
  });

  it('can fire again for the next card opened in the same drawer', () => {
    show(below(70));
    show(met(80));
    show(null);          // a different card opens: useWatchVerdict resets to null
    show(below(10));
    show(met(75));
    expect(collect).toHaveBeenCalledTimes(2);
  });
});
