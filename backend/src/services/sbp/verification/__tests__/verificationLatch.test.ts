/**
 * verificationLatch — the rule, tested without a database or a repo.
 *
 * THE RULE: evidence lives in our database; the repo is only where verification
 * happens. A story the platform verified stays verified no matter what the
 * student later does to their repo. The latch can only HOLD a story at
 * verified; it must never create one.
 */
import {
  applyVerificationLatch, isLatched, awardedEvidenceRef, latchNote,
  VerificationRecord,
} from '../verificationLatch';

const SHA = 'a'.repeat(40);
const AT = '2026-08-14T09:00:00Z';

const live = (over: Partial<VerificationRecord> = {}): VerificationRecord => ({
  state: 'not_started',
  criteria_total: 4,
  criteria_passed: 0,
  outstanding: ['one', 'two', 'three', 'four'],
  commit_sha: null,
  commit_at: null,
  reasons: ['No commit in the repo names STORY-001 and changes a file.'],
  rejected_claims: [],
  checked_at: AT,
  ...over,
});

const latch = (over: Record<string, unknown> = {}) => ({
  verified_at: new Date('2026-08-01T12:00:00Z'),
  verified_by: 'build_pipeline:repo_verification',
  verified_ref: SHA,
  ...over,
});

describe('isLatched', () => {
  it('is exactly "verified_at is set" — nothing else votes', () => {
    expect(isLatched(latch())).toBe(true);
    expect(isLatched({ verified_at: '2026-08-01T12:00:00Z' })).toBe(true);
    expect(isLatched({ verified_at: null })).toBe(false);
    expect(isLatched({ verified_at: undefined })).toBe(false);
    expect(isLatched(null)).toBe(false);
    expect(isLatched(undefined)).toBe(false);
  });
});

describe('applyVerificationLatch — when there is nothing to hold', () => {
  it('returns the live record untouched with no latch', () => {
    const record = live({ state: 'submitted', criteria_passed: 3 });
    expect(applyVerificationLatch(record, null)).toBe(record);
    expect(applyVerificationLatch(record, { verified_at: null })).toBe(record);
  });

  it('returns the live record untouched when the live read AGREES it is verified', () => {
    // The common case on a healthy repo. It must stay byte-identical, and
    // specifically must NOT be marked `latched` — that flag means "we could not
    // re-check this", and a healthy story would then explain itself wrongly.
    const record = live({ state: 'verified', criteria_passed: 4, outstanding: [], commit_sha: SHA, reasons: [] });
    const result = applyVerificationLatch(record, latch());
    expect(result).toBe(record);
    expect(result.latched).toBeUndefined();
  });

  it('NEVER invents a verification — an unlatched story stays exactly where the read put it', () => {
    for (const state of ['not_started', 'in_progress', 'submitted'] as const) {
      const result = applyVerificationLatch(live({ state }), { verified_at: null });
      expect(result.state).toBe(state);
      expect(result.latched).toBeFalsy();
    }
  });
});

describe('applyVerificationLatch — when the repo read disagrees', () => {
  it('holds the story at verified and says the read is what changed, not the work', () => {
    const result = applyVerificationLatch(live({ state: 'not_started' }), latch());

    expect(result.state).toBe('verified');
    expect(result.latched).toBe(true);
    // The live verdict is kept, as diagnosis — a degraded repo stays visible.
    expect(result.live_state).toBe('not_started');
  });

  it('shows no outstanding criteria: verification MEANS all of them passed', () => {
    const result = applyVerificationLatch(live({ state: 'submitted', criteria_passed: 3, outstanding: ['four'] }), latch());
    expect(result.criteria_passed).toBe(4);
    expect(result.criteria_total).toBe(4);
    expect(result.outstanding).toEqual([]);
  });

  it('carries the FROZEN evidence sha forward, not whatever the repo shows now', () => {
    const result = applyVerificationLatch(live({ commit_sha: 'b'.repeat(40) }), latch({ verified_ref: SHA }));
    expect(result.commit_sha).toBe(SHA);
  });

  it('falls back to the last good record when the latch predates verified_ref', () => {
    const prior: Partial<VerificationRecord> = { commit_sha: SHA, commit_at: '2026-08-01T11:00:00Z' };
    const result = applyVerificationLatch(live(), latch({ verified_ref: null }), prior);
    expect(result.commit_sha).toBe(SHA);
    expect(result.commit_at).toBe('2026-08-01T11:00:00Z');
  });

  it('falls back to the live read last, and to null rather than to a lie', () => {
    expect(applyVerificationLatch(live({ commit_sha: 'c'.repeat(40) }), latch({ verified_ref: null })).commit_sha)
      .toBe('c'.repeat(40));
    expect(applyVerificationLatch(live(), latch({ verified_ref: null })).commit_sha).toBeNull();
    expect(applyVerificationLatch(live(), latch({ verified_ref: '   ' })).commit_sha).toBeNull();
  });

  it('explains itself in a sentence that leads with the reassurance', () => {
    const result = applyVerificationLatch(live({ state: 'not_started' }), latch());
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toMatch(/stays verified/i);
    expect(result.reasons[0]).toMatch(/nothing you do to the repo can take it away/i);
    // Not the stale "no commit names this story" list, which would read as an
    // accusation about work that is already done.
    expect(result.reasons[0]).not.toMatch(/No commit in the repo/);
  });

  it('says something different depending on WHY the read disagrees', () => {
    expect(latchNote('not_started')).toMatch(/no longer find this story's progress/i);
    expect(latchNote('submitted')).toMatch(/no longer shows it complete/i);
  });

  it('leaves the check timestamp alone — the read did happen', () => {
    expect(applyVerificationLatch(live(), latch()).checked_at).toBe(AT);
  });

  it('is idempotent: latching an already-latched record changes nothing', () => {
    const once = applyVerificationLatch(live(), latch());
    const twice = applyVerificationLatch(once, latch());
    expect(twice).toEqual(once);
  });
});

describe('awardedEvidenceRef', () => {
  it('rebuilds the key the award was recorded under, from the FROZEN sha', () => {
    expect(awardedEvidenceRef('STORY-001', latch())).toBe(`STORY-001@${SHA}`);
  });

  it('is null when the story was never verified — there is no award to find', () => {
    expect(awardedEvidenceRef('STORY-001', { verified_at: null, verified_ref: SHA })).toBeNull();
  });

  it('is null when the frozen sha is missing, so the caller knows to look another way', () => {
    expect(awardedEvidenceRef('STORY-001', latch({ verified_ref: null }))).toBeNull();
    expect(awardedEvidenceRef('STORY-001', latch({ verified_ref: '  ' }))).toBeNull();
    expect(awardedEvidenceRef(null, latch())).toBeNull();
  });
});
