/**
 * C117: the drawer celebrates a video that crossed the watch bar, without moving the learner, and offers the next lesson.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VideoWinCelebration, { winCopy } from '../VideoWinCelebration';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('winCopy', () => {
  it('says first win only when it is one', () => {
    expect(winCopy(5, true, true).headline).toBe("That's your first win! +5 pts");
    expect(winCopy(5, false, true).headline).toBe('Nice work! +5 pts earned');
  });
  it('tells the learner to keep watching, and mentions a next lesson only when there is one', () => {
    expect(winCopy(5, true, true).sub).toBe('Keep watching to the end. Your next lesson is ready when you are.');
    expect(winCopy(5, true, false).sub).toBe('Keep watching to the end.');
  });
  it('never uses the word "free" (TWC)', () => {
    for (const f of [true, false]) for (const n of [true, false]) expect(JSON.stringify(winCopy(5, f, n))).not.toMatch(/free/i);
  });
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent);

describe('VideoWinCelebration', () => {
  it('announces the win as a status and offers Close and Next', () => {
    const onOpen = jest.fn(), onClose = jest.fn();
    act(() => { root.render(<VideoWinCelebration pts={5} firstWin next={{ title: 'Quick check', onOpen }} onClose={onClose} />); });
    expect(container.querySelector('[role="status"]')!.textContent).toContain("That's your first win! +5 pts");
    expect(buttons()).toEqual(['Close', 'Next: Quick check →']);
    act(() => { (container.querySelectorAll('button')[1] as HTMLButtonElement).click(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
  it('shows no Next button when there is no next lesson', () => {
    act(() => { root.render(<VideoWinCelebration pts={5} firstWin={false} next={null} onClose={() => {}} />); });
    expect(buttons()).toEqual(['Close']);
  });
});
