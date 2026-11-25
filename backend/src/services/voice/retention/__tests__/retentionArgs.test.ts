import { CONFIRM, exitCodeFor, parseRetentionArgs } from '../../../../scripts/voice/retention';

describe('VS4.2 voice:retention arguments', () => {
  it('is a dry run unless both --apply and the confirmation are given', () => {
    expect(parseRetentionArgs([])).toEqual({ ok: true, apply: false, limit: 200 });
    expect(parseRetentionArgs(['--confirm', CONFIRM])).toEqual({ ok: true, apply: false, limit: 200 });
    expect(parseRetentionArgs(['--apply', '--confirm', CONFIRM, '--limit', '5'])).toEqual({ ok: true, apply: true, limit: 5 });
  });

  it.each([['--apply'], ['--apply', '--confirm', 'yes'], ['--apply', '--confirm'], ['--aply'], ['--limit'], ['--limit', '0'], ['--limit', '1001'], ['--limit', '1.5']].map((a) => [a]))('refuses %j', (argv) => {
    expect(parseRetentionArgs(argv).ok).toBe(false);
  });

  it('a failed call makes the run exit 1', () => {
    const base = { applied: true, due: [], deleted: [], blockedByRecording: 0, notEndedPastDeadline: 0, withoutDeadline: 0 };
    expect(exitCodeFor({ ...base, failed: [] })).toBe(0);
    expect(exitCodeFor({ ...base, failed: [{ callId: 'x', errorClass: 'DatabaseError' }] })).toBe(1);
  });
});
