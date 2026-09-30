import { toClientRelease } from '../clientReleaseProjection';
import { CLIENT_FIELD_ALLOWLIST, toClientShape } from '../clientVisibility';

/**
 * The release a client sees.
 *
 * Two of these matter more than the rest: that every field the allowlist promises is
 * actually produced, and that a waived check never reads as a passed one.
 */

const row = (over: any = {}) => ({
  id: 'release-1',
  version: '2.1.0',
  status: 'approved',
  approved_at: new Date('2026-08-19T10:00:00Z'),
  check_results: [
    { check: 'tests', outcome: 'pass', detail: null },
    { check: 'browser', outcome: 'pass', detail: null },
  ],
  waived_categories: [],
  ...over,
});

describe('the allowlist and the mapper agree', () => {
  it('produces EVERY field the client allowlist names', () => {
    // The guard that was missing. `release` sits in the contract test's "no backing model"
    // exemption, so nothing checked it — and four of its six fields were not columns.
    // Projecting the row directly gave { id, status } and dropped the rest in silence.
    //
    // Pinned against the MAPPER rather than the model, deliberately: the allowlist is the
    // client's vocabulary and the model is ours, and the mapper is the seam between them.
    const projected = toClientShape('release', toClientRelease(row()) as never);
    const promised = [...CLIENT_FIELD_ALLOWLIST.release].sort();
    expect(Object.keys(projected).sort()).toEqual(promised);
  });

  it('produces every field the evidence_summary allowlist names, for a waiver', () => {
    // `reason` is only present on a waiver, so a passing line legitimately omits it. This
    // asserts the waiver case, which is the one that must carry it.
    const out = toClientRelease(
      row({ waived_categories: [{ check: 'accessibility', reason: 'Documented WCAG exception.' }] }),
    );
    const waived = out.evidence_summary.find((e) => e.outcome === 'waived')!;
    for (const field of CLIENT_FIELD_ALLOWLIST.evidence_summary) {
      expect(Object.prototype.hasOwnProperty.call(waived, field)).toBe(true);
    }
  });
});

describe('waived is not passed', () => {
  it('carries the waiver reason through to the client', () => {
    // The reason is the only thing that makes a waiver reviewable by the person signing.
    const out = toClientRelease(
      row({ waived_categories: [{ check: 'accessibility', reason: 'Documented WCAG exception.' }] }),
    );
    const waived = out.evidence_summary.find((e) => e.dimension === 'accessibility');
    expect(waived?.outcome).toBe('waived');
    expect(waived?.reason).toContain('WCAG');
  });

  it('a WAIVED check never appears as passed, even if it was also measured', () => {
    // What governed the release is the waiver. Showing the pass would report a result for
    // something nobody required, which is the more flattering answer and the wrong one.
    const out = toClientRelease(
      row({
        check_results: [
          { check: 'tests', outcome: 'pass', detail: null },
          { check: 'accessibility', outcome: 'pass', detail: null },
        ],
        waived_categories: [{ check: 'accessibility', reason: 'Not applicable to this scope.' }],
      }),
    );
    const lines = out.evidence_summary.filter((e) => e.dimension === 'accessibility');
    expect(lines).toHaveLength(1);
    expect(lines[0].outcome).toBe('waived');
  });

  it('omits reason rather than inventing one when a waiver has none', () => {
    // Waivers were bare strings before they carried reasons. "No reason recorded" is more
    // use to a reader than a sentence implying there was one.
    const out = toClientRelease(row({ waived_categories: ['accessibility'] }));
    const waived = out.evidence_summary.find((e) => e.dimension === 'accessibility')!;
    expect(waived.outcome).toBe('waived');
    expect(waived.reason).toBeUndefined();
  });
});

describe('the client vocabulary', () => {
  it('renames version to name and approved_at to released_at', () => {
    // `version`, `approved_at` and `check_results` are our words. The allowlist keeps the
    // client's, and this mapper is the only place the two meet.
    const out = toClientRelease(row());
    expect(out.name).toBe('2.1.0');
    expect(out.released_at).toBe('2026-08-19T10:00:00.000Z');
  });

  it('survives a release that was never approved', () => {
    const out = toClientRelease(row({ approved_at: null, status: 'candidate' }));
    expect(out.released_at).toBeNull();
    expect(out.evidence_summary[0].checked_at).toBeNull();
  });

  it('does not fall over on missing or malformed check data', () => {
    // JSONB columns written before a shape settled, and rows created by hand.
    const out = toClientRelease(row({ check_results: null, waived_categories: null }));
    expect(out.evidence_summary).toEqual([]);
  });

  it('never leaks an internal release field to the client', () => {
    // profile_key, candidate_sha, goals_scores and the approver are ours. The projection
    // rebuilds from the allowlist, so this holds by construction — asserted because
    // "by construction" is exactly the claim worth checking.
    const projected = toClientShape(
      'release',
      { ...toClientRelease(row()), profile_key: 'government_public_sector', candidate_sha: 'abc' } as never,
    );
    expect(projected).not.toHaveProperty('profile_key');
    expect(projected).not.toHaveProperty('candidate_sha');
  });
});
