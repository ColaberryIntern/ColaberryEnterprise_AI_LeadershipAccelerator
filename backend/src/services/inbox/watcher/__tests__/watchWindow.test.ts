import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  openWindow,
  readWindow,
  checkWindow,
  evaluateWindow,
  windowPath,
  WATCH_WINDOW_HOURS,
  WatchWindowState,
} from '../watchWindow';

/**
 * The 30-hour expiry has to be a mechanism, not an intention. These tests pin
 * that it fires on a STORED timestamp — so a restart cannot restart the clock —
 * and that every way of failing to read that timestamp resolves to expired.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-window-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const START = new Date('2026-08-17T02:00:00.000Z');
const H = 3_600_000;

describe('the window expires at exactly 30 hours from the stored start', () => {
  it('defaults to 30 hours', () => {
    expect(WATCH_WINDOW_HOURS).toBe(30);
  });

  it('persists an expiry exactly 30 hours after the start instant', () => {
    const state = openWindow(dir, { now: START, runId: 'r1' });
    expect(state.started_at).toBe('2026-08-17T02:00:00.000Z');
    expect(state.expires_at).toBe('2026-08-18T08:00:00.000Z');
    expect(Date.parse(state.expires_at) - Date.parse(state.started_at)).toBe(30 * H);
  });

  it('is active one second before the deadline', () => {
    const state = openWindow(dir, { now: START, runId: 'r1' });
    const verdict = evaluateWindow(state, new Date(START.getTime() + 30 * H - 1000));
    expect(verdict.active).toBe(true);
    expect(verdict.active === true && verdict.remainingMs).toBe(1000);
  });

  it('is expired AT the deadline, not merely after it', () => {
    const state = openWindow(dir, { now: START, runId: 'r1' });
    const verdict = evaluateWindow(state, new Date(START.getTime() + 30 * H));
    expect(verdict.active).toBe(false);
    expect(verdict.active === false && verdict.reason).toBe('window_elapsed');
  });

  it('is expired one hour after the deadline', () => {
    const state = openWindow(dir, { now: START, runId: 'r1' });
    const verdict = evaluateWindow(state, new Date(START.getTime() + 31 * H));
    expect(verdict.active === false && verdict.reason).toBe('window_elapsed');
  });

  it('expires off the file on disk, so a restarted process does not get a fresh 30 hours', () => {
    openWindow(dir, { now: START, runId: 'r1' });

    // A second process starts 29 hours in. It must adopt the ORIGINAL start.
    const restarted = openWindow(dir, { now: new Date(START.getTime() + 29 * H), runId: 'r1' });
    expect(restarted.started_at).toBe(START.toISOString());
    expect(restarted.expires_at).toBe('2026-08-18T08:00:00.000Z');

    // ...and is therefore expired an hour later, not 30 hours later.
    const verdict = checkWindow(dir, new Date(START.getTime() + 30 * H + 1));
    expect(verdict.active).toBe(false);
    expect(verdict.active === false && verdict.reason).toBe('window_elapsed');
  });

  it('honours the stored expiry even if the constant is later changed to a longer one', () => {
    openWindow(dir, { now: START, runId: 'r1' });
    // Re-opening with hours=100 must NOT extend a window that already exists.
    const reopened = openWindow(dir, { now: START, runId: 'r1', hours: 100 });
    expect(reopened.expires_at).toBe('2026-08-18T08:00:00.000Z');
    expect(reopened.duration_hours).toBe(30);
  });
});

describe('every unreadable clock resolves to expired, never to active', () => {
  it('treats a missing window file as expired', () => {
    const verdict = checkWindow(dir, START);
    expect(verdict.active).toBe(false);
    expect(verdict.active === false && verdict.reason).toBe('no_window_file');
  });

  it('treats unparseable JSON as expired', () => {
    fs.writeFileSync(windowPath(dir), '{ not json');
    expect(readWindow(dir)).toBeNull();
    const verdict = checkWindow(dir, START);
    expect(verdict.active === false && verdict.reason).toBe('malformed_window_file');
  });

  it('treats a window file missing required fields as expired', () => {
    fs.writeFileSync(windowPath(dir), JSON.stringify({ run_id: 'r1' }));
    const verdict = checkWindow(dir, START);
    expect(verdict.active === false && verdict.reason).toBe('malformed_window_file');
  });

  it('treats an unparseable expires_at as expired', () => {
    const state: WatchWindowState = {
      run_id: 'r1', started_at: START.toISOString(), expires_at: 'not-a-date', duration_hours: 30,
    };
    const verdict = evaluateWindow(state, START);
    expect(verdict.active === false && verdict.reason).toBe('malformed_window_file');
  });

  it('treats a start in the future (clock moved back) as expired', () => {
    const state: WatchWindowState = {
      run_id: 'r1',
      started_at: new Date(START.getTime() + H).toISOString(),
      expires_at: new Date(START.getTime() + 31 * H).toISOString(),
      duration_hours: 30,
    };
    const verdict = evaluateWindow(state, START);
    expect(verdict.active === false && verdict.reason).toBe('start_in_future');
  });

  it('refuses to overwrite a corrupt window file rather than silently restarting the clock', () => {
    fs.writeFileSync(windowPath(dir), '{ corrupt');
    expect(() => openWindow(dir, { now: START, runId: 'r1' })).toThrow(/Refusing to overwrite/);
  });
});
