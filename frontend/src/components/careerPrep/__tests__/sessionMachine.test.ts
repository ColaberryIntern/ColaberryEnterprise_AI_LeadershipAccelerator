import { activeSeconds, clock, end, idle, next, pause, resume, secondsLeft, start } from '../logic/sessionMachine';

const segs = [{ title: 'Warm up', minutes: 2 }, { title: 'Learn', minutes: 4 }, { title: 'Cool down', minutes: 1 }];
const T0 = 1_700_000_000_000;

describe('sessionMachine (CP4.3)', () => {
  it('starts on the first segment with its full time', () => {
    const s = start(idle(), segs, T0);
    expect(s).toMatchObject({ status: 'running', index: 0 });
    expect(secondsLeft(s, T0)).toBe(120);
    expect(clock(secondsLeft(s, T0 + 30_000))).toBe('1:30');
  });

  it('reconciles from timestamps: a tab hidden for 100 s shows 100 s less, and never goes below zero', () => {
    const s = start(idle(), segs, T0);
    expect(secondsLeft(s, T0 + 100_000)).toBe(20);
    expect(secondsLeft(s, T0 + 999_000)).toBe(0);
  });

  it('pause keeps the time left; time paused counts neither against the segment nor as practice', () => {
    const s = start(idle(), segs, T0);
    const p = pause(s, T0 + 30_000);
    expect(secondsLeft(p, T0 + 500_000)).toBe(90);
    const r = resume(p, T0 + 500_000);
    expect(secondsLeft(r, T0 + 510_000)).toBe(80);
    expect(activeSeconds(r, T0 + 510_000)).toBe(40);
  });

  it('next marks the segment done and starts the next; the last one finishes', () => {
    let s = start(idle(), segs, T0);
    s = next(s, segs, T0 + 60_000);
    expect(s).toMatchObject({ status: 'running', index: 1, done: [0] });
    expect(secondsLeft(s, T0 + 60_000)).toBe(240);
    s = next(next(s, segs, T0 + 120_000), segs, T0 + 150_000);
    expect(s).toMatchObject({ status: 'finished', done: [0, 1, 2] });
    expect(activeSeconds(s, T0 + 999_000)).toBe(150);
  });

  it('ending early keeps the practice already done; finished and ended states never change again', () => {
    const e = end(start(idle(), segs, T0), T0 + 45_000);
    expect(e.status).toBe('ended');
    expect(activeSeconds(e, T0 + 999_000)).toBe(45);
    expect(next(e, segs, T0 + 50_000)).toBe(e);
    expect(resume(e, T0 + 50_000)).toBe(e);
  });

  it('ignores events that do not apply (pause while paused, start twice)', () => {
    const s = start(idle(), segs, T0);
    expect(start(s, segs, T0 + 5)).toBe(s);
    const p = pause(s, T0 + 10);
    expect(pause(p, T0 + 20)).toBe(p);
    expect(start(idle(), [], T0).status).toBe('idle');
  });
});
