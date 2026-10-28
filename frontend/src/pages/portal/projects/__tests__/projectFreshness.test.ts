import {
  copyState, markConfirmed, markStale, markStored, onCopyState, resetCopyState, describeCopyAge,
} from '../projectFreshness';
import { markProjectsConfirmed, projectsConfirmedAt } from '../projectsStore';

/**
 * "AM I LOOKING AT THE SERVER'S ANSWER, OR A COPY SAVED ON THIS DEVICE?"
 *
 * The workspace pull fails soft on purpose: a student offline mid-build should
 * lose the refresh, not the workspace. The defect AF2.9 reports is that the
 * fallback was SILENT, so stale work and current work looked identical and the
 * obvious next move (hard refresh) did nothing, because the store outlives a
 * refresh.
 *
 * The two tests that matter most here are the ones about what must NOT be
 * reported: a flag-gated-off API is not a stale copy, and reaching the server
 * does not heal a device that had no room to store the reply. Both would turn a
 * visible wrong answer back into an invisible one, which is the exact failure
 * mode this module was added to remove.
 */

beforeEach(() => {
  localStorage.clear();
  resetCopyState();
});

describe('a pull that could not reach the server', () => {
  it('reports a stale copy, with the status', () => {
    markStale('pull_failed', 503);

    expect(copyState().stale).toBe(true);
    expect(copyState().reason).toBe('pull_failed');
    expect(copyState().status).toBe(503);
  });

  it('starts out NOT stale, so a healthy page says nothing', () => {
    expect(copyState().stale).toBe(false);
    expect(copyState().reason).toBeNull();
  });

  it('clears once a later pull succeeds', () => {
    markStale('pull_failed', 503);
    markConfirmed(1_700_000_000_000);

    expect(copyState().stale).toBe(false);
    expect(copyState().confirmedAt).toBe(1_700_000_000_000);
  });
});

describe('a pull that succeeded but could not be stored', () => {
  it('reports a stale copy under its own reason', () => {
    markStored(false);

    expect(copyState().reason).toBe('cache_write_failed');
  });

  it('is NOT healed by reaching the server', () => {
    // The screen is still showing the older copy. Stamping it "confirmed just
    // now" because the network call worked would replace a visible wrong answer
    // with an invisible one.
    markStored(false);
    markConfirmed(1_700_000_000_000);

    expect(copyState().stale).toBe(true);
    expect(copyState().reason).toBe('cache_write_failed');
    expect(copyState().confirmedAt).toBeNull();
  });

  it('IS cleared by a write that lands, because that is real evidence of room', () => {
    markStored(false);
    markStored(true);

    expect(copyState().stale).toBe(false);
  });
});

describe('the stamp', () => {
  it('is null when this device has never confirmed a copy', () => {
    // Not zero. "Never confirmed" and "confirmed at the epoch" are different
    // facts, and only the first is true of a fresh device.
    expect(copyState().confirmedAt).toBeNull();
    expect(projectsConfirmedAt()).toBeNull();
  });

  it('survives being read back, so a reload can still say how old the copy is', () => {
    markProjectsConfirmed(1_700_000_000_000);

    expect(projectsConfirmedAt()).toBe(1_700_000_000_000);
  });

  it('ignores a stored value that is not a usable time', () => {
    localStorage.setItem('te_projects_v1__confirmed_at', 'not-a-number');
    expect(projectsConfirmedAt()).toBeNull();

    localStorage.setItem('te_projects_v1__confirmed_at', '0');
    expect(projectsConfirmedAt()).toBeNull();
  });
});

describe('subscribers', () => {
  it('hear the current state immediately on subscribing', () => {
    // The workspace pull starts on mount and can resolve BEFORE a child
    // banner's effect runs. A listener that only heard future events would miss
    // precisely the failure it is mounted to report.
    markStale('pull_failed', 500);

    const seen: Array<string | null> = [];
    const off = onCopyState((s) => seen.push(s.reason));
    off();

    expect(seen).toEqual(['pull_failed']);
  });

  it('hear later changes, and stop hearing them after unsubscribing', () => {
    const seen: Array<string | null> = [];
    const off = onCopyState((s) => seen.push(s.reason));
    markStale('pull_failed', 500);
    off();
    markConfirmed();

    expect(seen).toEqual([null, 'pull_failed']);
  });

  it('cannot break the sync that reported, even by throwing', () => {
    const off = onCopyState(() => { throw new Error('listener is broken'); });
    expect(() => markStale('pull_failed')).not.toThrow();
    off();
  });
});

describe('how old the copy is, in words', () => {
  const NOW = Date.UTC(2026, 9, 27, 12, 0, 0);
  const ago = (ms: number) => describeCopyAge(NOW - ms, NOW);

  it('says nothing at all when there is no stamp', () => {
    // The caller writes "never updated on this device" itself; a duration would
    // be an invention.
    expect(describeCopyAge(null, NOW)).toBeNull();
  });

  it('reads as a duration a student can act on', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(90 * 1000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5 minutes ago');
    expect(ago(59 * 60_000)).toBe('59 minutes ago');
    expect(ago(90 * 60_000)).toBe('an hour ago');
    expect(ago(5 * 3_600_000)).toBe('5 hours ago');
    expect(ago(30 * 3_600_000)).toBe('yesterday');
    expect(ago(3 * 86_400_000)).toBe('3 days ago');
  });

  it('does not print a negative age when a clock has moved', () => {
    expect(describeCopyAge(NOW + 60 * 60_000, NOW)).toBe('just now');
  });
});
