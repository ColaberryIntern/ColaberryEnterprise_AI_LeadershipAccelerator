import {
  verificationSection,
  type SnapshotStoryVerdict,
} from '../agentDomainSnapshot';

/**
 * AF12.1 — the verdict the platform already holds, put where the builder can read it.
 *
 * MEASURED, not imagined. On 3 Nov 2026 Sarbjit Kaur's `marketing.STORY-000` carried, in
 * `student_tasks.verification_json`, written that morning against her newest commit:
 *
 *   state: in_progress
 *   reasons: ["None of the 6 acceptance criteria are marked as passing yet."]
 *   criteria_passed: 0 of 6, rejected_claims: []
 *   outstanding: all six criteria, in full
 *
 * Her story page said "not started". 264 stories across the ten agent domains are in that
 * position, 347 platform-wide, and the number of unverified stories with SOME criteria claimed is
 * ZERO: nobody is half-using the file, they have not found it.
 *
 * The fixture below is that real row, trimmed.
 */

const SARBJIT: SnapshotStoryVerdict = {
  story_id: 'marketing.STORY-000',
  title: 'STORY-000 - Build your Command Center',
  status: 'not_started',
  verification_state: 'in_progress',
  criteria_passed: 0,
  criteria_total: 6,
  reasons: ['None of the 6 acceptance criteria are marked as passing yet.'],
  outstanding: [
    'Given the Command Center, when it is opened, then all six panels render and each one names the endpoint it read.',
    'Given a panel whose endpoint returned nothing, when it renders, then it says so in words.',
    'Given the autonomy ladder panel, when it renders, then all ten rungs are present.',
    'Given the autonomy ladder panel, when a capability authority is shown, then the page shows the effective authority.',
    'Given the governance panel, when a tool request is shown, then nothing implies that filing it granted anything.',
    'Trust -- no panel shows a number, a grant, a rung or a result this domain has not actually produced.',
  ],
  commit_sha: '50b248053fcb10f4ec28f1d6c696395ccd22876e',
  verified: false,
};

const VERIFIED: SnapshotStoryVerdict = {
  story_id: 'marketing.LEGACY-MIGRATION-PLAN',
  title: 'Legacy migration plan',
  status: 'complete',
  verification_state: 'verified',
  criteria_passed: 3,
  criteria_total: 3,
  reasons: [],
  outstanding: [],
  commit_sha: 'e08f24b579654bfa355bd5f5ea7f0a65b15bf024',
  verified: true,
};

/** Never looked at. Distinct from "looked at and nothing claimed". */
const UNCHECKED: SnapshotStoryVerdict = {
  story_id: 'marketing.STORY-004',
  title: 'Daily signal triage',
  status: 'not_started',
  verification_state: null,
  criteria_passed: null,
  criteria_total: null,
  reasons: [],
  outstanding: [],
  commit_sha: null,
  verified: false,
};

describe('the outstanding criteria reach the page', () => {
  it('carries the reason sentence verbatim rather than re-wording it', () => {
    const s = verificationSection([SARBJIT]) as { stories: Array<{ reasons: string[] }> };
    expect(s.stories[0].reasons)
      .toEqual(['None of the 6 acceptance criteria are marked as passing yet.']);
  });

  it('carries all six outstanding criteria, which is the actionable part', () => {
    const s = verificationSection([SARBJIT]) as { stories: Array<{ outstanding: string[] }> };
    expect(s.stories[0].outstanding).toHaveLength(6);
    expect(s.stories[0].outstanding[0]).toContain('all six panels render');
  });

  it('says 0 of 6 rather than leaving the page to infer it', () => {
    const s = verificationSection([SARBJIT]) as {
      stories: Array<{ criteria_passed: number | null; criteria_total: number | null }>;
    };
    expect(s.stories[0].criteria_passed).toBe(0);
    expect(s.stories[0].criteria_total).toBe(6);
  });

  it('names WHERE to claim a criterion, because that is why 264 stories are silent', () => {
    const s = verificationSection([SARBJIT]) as { disclosure: string };
    expect(s.disclosure).toContain('.colaberry/progress.json');
  });

  it('says 0 of N is not a rejection, so nobody reads it as one', () => {
    const s = verificationSection([SARBJIT]) as { disclosure: string };
    expect(s.disclosure.toLowerCase()).toContain('not a rejection');
  });
});

describe('NO WALL CLOCK, which this file cannot carry', () => {
  it('drops checked_at entirely', () => {
    // A stamp that moves on every sync turns each sync into a commit whose only difference is the
    // time, churning the builder's git history and breaking "unchanged implies no commit"
    // (FR-026). `agentDomainSnapshot.ts`'s header states this; the verdict's own `checked_at`
    // would have broken it.
    const json = JSON.stringify(verificationSection([SARBJIT, VERIFIED]));
    expect(json).not.toContain('checked_at');
  });

  it('keeps commit_sha, which moves only when the work moves', () => {
    const s = verificationSection([SARBJIT]) as { stories: Array<{ commit_sha: string | null }> };
    expect(s.stories[0].commit_sha).toBe('50b248053fcb10f4ec28f1d6c696395ccd22876e');
  });

  it('is byte-identical across two calls on the same input', () => {
    const a = JSON.stringify(verificationSection([SARBJIT, VERIFIED, UNCHECKED]));
    const b = JSON.stringify(verificationSection([VERIFIED, UNCHECKED, SARBJIT]));
    expect(a).toBe(b);
  });
});

describe('silence and zero are different answers', () => {
  it('an ABSENT list says the platform did not report, never "nothing outstanding"', () => {
    const s = verificationSection(undefined) as { known: boolean; note: string; stories: [] };
    expect(s.known).toBe(false);
    // The caps on NOT are in the message on purpose; match case-insensitively so a later
    // rewording of emphasis does not fail a test that is about meaning.
    expect(s.note.toLowerCase()).toContain('not that every story is clear');
    expect(s.stories).toEqual([]);
  });

  it('an EMPTY list is a real answer and says so', () => {
    const s = verificationSection([]) as { known: boolean };
    expect(s.known).toBe(true);
  });

  it('a story never checked keeps a null state, not a fabricated verdict', () => {
    const s = verificationSection([UNCHECKED]) as {
      stories: Array<{ verification_state: string | null; criteria_total: number | null }>;
      summary: { checked: number };
    };
    expect(s.stories[0].verification_state).toBeNull();
    expect(s.stories[0].criteria_total).toBeNull();
    // It must not be counted as checked-and-clear.
    expect(s.summary.checked).toBe(0);
  });
});

describe('the summary a panel can render without recomputing', () => {
  it('counts the stories waiting on a criterion nobody has claimed', () => {
    const s = verificationSection([SARBJIT, VERIFIED, UNCHECKED]) as {
      summary: { stories: number; checked: number; verified: number; awaiting_criteria: number; outstanding_criteria: number };
    };
    expect(s.summary.stories).toBe(3);
    expect(s.summary.checked).toBe(2);
    expect(s.summary.verified).toBe(1);
    // Sarbjit's only: verified ones are not awaiting, unchecked ones are not yet judged.
    expect(s.summary.awaiting_criteria).toBe(1);
    expect(s.summary.outstanding_criteria).toBe(6);
  });

  it('does not count a VERIFIED story as awaiting anything', () => {
    const s = verificationSection([VERIFIED]) as { summary: { awaiting_criteria: number; outstanding_criteria: number } };
    expect(s.summary.awaiting_criteria).toBe(0);
    expect(s.summary.outstanding_criteria).toBe(0);
  });
});

describe('the page can tell in_progress from not_started, which today it cannot', () => {
  it('reports BOTH the task status and the verifier state, because they disagree', () => {
    // This is the whole defect in one assertion: status says not_started, the verifier says
    // in_progress with six named criteria, and only one of those reached the builder.
    const s = verificationSection([SARBJIT]) as {
      stories: Array<{ status: string; verification_state: string | null }>;
    };
    expect(s.stories[0].status).toBe('not_started');
    expect(s.stories[0].verification_state).toBe('in_progress');
    expect(s.stories[0].status).not.toBe(s.stories[0].verification_state);
  });
});
