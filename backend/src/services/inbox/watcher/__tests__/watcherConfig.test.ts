/**
 * How far back a cycle looks, and why a fresh window needs to be told.
 *
 * `fetchRecentInbound` filters on `received_at >= <window start>`. For the
 * original run that was exactly right: the window opened as the campaign went
 * out, so "since the window opened" and "since we emailed them" were the same
 * instant.
 *
 * Reopening breaks that equivalence. A window opened now starts its clock now,
 * so a watcher with no lookback can only ever see mail that arrives AFTER the
 * moment it was restarted — and every reply already sitting in the mailbox,
 * including the ones nobody has answered, is invisible to it. Six students
 * verified in the last two days and several are mid-build; a watcher that
 * cannot see any of that is running, but it is not watching.
 *
 * The default stays 0 so the original behaviour is unchanged unless a caller
 * asks. Re-reading old mail is safe because the per-thread escalation record
 * and the reply ceilings are replayed from the log: a thread already dealt with
 * stays dealt with across a restart.
 */
import { resolveLookbackHours, resolveInboundSince, MAX_LOOKBACK_HOURS } from '../watcherConfig';

const WINDOW_START = new Date('2026-08-19T02:00:00.000Z');
const NOW = new Date('2026-08-19T02:30:00.000Z');
const H = 3_600_000;

describe('resolveLookbackHours', () => {
  it('defaults to no lookback, leaving the original behaviour untouched', () => {
    expect(resolveLookbackHours({})).toBe(0);
  });

  it('treats an empty string as unset rather than as zero-by-accident', () => {
    expect(resolveLookbackHours({ WATCHER_LOOKBACK_HOURS: '' })).toBe(0);
  });

  it('reads the number it was given', () => {
    expect(resolveLookbackHours({ WATCHER_LOOKBACK_HOURS: '48' })).toBe(48);
  });

  it('rejects a non-numeric value rather than silently looking back zero hours', () => {
    expect(() => resolveLookbackHours({ WATCHER_LOOKBACK_HOURS: 'yes' })).toThrow(
      /WATCHER_LOOKBACK_HOURS/,
    );
  });

  it('rejects a negative value, which would move the floor into the future', () => {
    expect(() => resolveLookbackHours({ WATCHER_LOOKBACK_HOURS: '-4' })).toThrow(/-4/);
  });

  it('caps the lookback, so a mistyped value cannot drag in the whole mailbox', () => {
    expect(() => resolveLookbackHours({ WATCHER_LOOKBACK_HOURS: String(MAX_LOOKBACK_HOURS + 1) }))
      .toThrow(String(MAX_LOOKBACK_HOURS));
  });

  it('accepts the cap itself', () => {
    expect(resolveLookbackHours({ WATCHER_LOOKBACK_HOURS: String(MAX_LOOKBACK_HOURS) }))
      .toBe(MAX_LOOKBACK_HOURS);
  });
});

describe('resolveInboundSince', () => {
  it('is the window start when no lookback is configured', () => {
    expect(resolveInboundSince(WINDOW_START, NOW, 0).toISOString()).toBe(WINDOW_START.toISOString());
  });

  it('reaches back from NOW, not from the window start', () => {
    // 24h before 02:30, not 24h before 02:00. The cycle's clock is what the
    // operator is reasoning about when they say "the last day of mail".
    expect(resolveInboundSince(WINDOW_START, NOW, 24).toISOString())
      .toBe(new Date(NOW.getTime() - 24 * H).toISOString());
  });

  it('never moves the floor later than the window start', () => {
    // A one-minute lookback on a window opened 30 minutes ago must not hide the
    // 29 minutes of mail the window itself already covers.
    expect(resolveInboundSince(WINDOW_START, NOW, 0.1).toISOString())
      .toBe(WINDOW_START.toISOString());
  });

  it('keeps the whole window in view on a long-running watch', () => {
    const later = new Date(WINDOW_START.getTime() + 20 * H);
    expect(resolveInboundSince(WINDOW_START, later, 2).toISOString())
      .toBe(WINDOW_START.toISOString());
  });
});
