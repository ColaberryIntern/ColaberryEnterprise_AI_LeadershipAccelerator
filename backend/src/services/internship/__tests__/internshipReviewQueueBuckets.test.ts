/**
 * Queue buckets.
 *
 * The rule these defend, from Ali on 2026-09-22 reading the live queue: "I want
 * them to have a status that is not open once they are approved. Open makes me
 * think they are still going through the enrollment process."
 *
 * So `in_review` ends at the decision, and the post-decision states have their
 * own buckets. The partition test is the one that matters: hand-maintained state
 * lists rot by leaving a state in NO bucket, and an application in no bucket is
 * invisible to the only people who could act on it.
 */
import { INTERNSHIP_STATES } from '../internshipStateMachine';
import { BUCKET_STATES, CLOSED_STATES, PARTITION_BUCKETS } from '../internshipReviewQueue';

const partitioned = PARTITION_BUCKETS.flatMap((b) => BUCKET_STATES[b]);

describe('the buckets partition every non-closed state', () => {
  it('gives every live state exactly one home', () => {
    const live = INTERNSHIP_STATES.filter((s) => !CLOSED_STATES.includes(s));
    for (const state of live) {
      const homes = PARTITION_BUCKETS.filter((b) => BUCKET_STATES[b].includes(state));
      expect({ state, homes }).toEqual({ state, homes: [expect.any(String)] });
    }
    expect([...partitioned].sort()).toEqual([...live].sort());
  });

  it('never files a closed application in a bucket', () => {
    for (const state of CLOSED_STATES) {
      expect(partitioned).not.toContain(state);
    }
  });
});

describe('"in review" means the decision has not been made', () => {
  it('excludes every state at or after approval', () => {
    const afterDecision = ['approved', 'offer_letter_ready', 'signed_documents_uploaded',
      'documents_verified', 'payment_pending', 'activation_pending', 'active', 'paused'];
    for (const state of afterDecision) {
      expect(BUCKET_STATES.in_review).not.toContain(state);
    }
  });

  it('keeps an ACTIVE intern out of it — the exact thing that read as "still enrolling"', () => {
    expect(BUCKET_STATES.in_review).not.toContain('active');
    expect(BUCKET_STATES.active_interns).toContain('active');
  });

  it('still holds everyone a reviewer has to decide about', () => {
    for (const state of ['started', 'under_review', 'information_requested', 'waitlisted',
      'interview_scheduled', 'interview_complete', 'administrative_intake_complete']) {
      expect(BUCKET_STATES.in_review).toContain(state);
    }
  });

  it('is a superset of the narrower review views, so no one is only in a sub-bucket', () => {
    for (const bucket of ['awaiting_review', 'information_requested', 'waitlisted', 'interview_incomplete'] as const) {
      for (const state of BUCKET_STATES[bucket]) {
        expect(BUCKET_STATES.in_review).toContain(state);
      }
    }
  });
});

describe('the post-decision buckets', () => {
  it('separates paperwork outstanding from paperwork done', () => {
    expect(BUCKET_STATES.approved_awaiting_documents).toEqual(
      ['approved', 'offer_letter_ready', 'signed_documents_uploaded'],
    );
    expect(BUCKET_STATES.onboarding).toEqual(
      ['documents_verified', 'payment_pending', 'activation_pending'],
    );
  });

  it('counts a paused intern as an intern, not as an applicant', () => {
    expect(BUCKET_STATES.active_interns).toContain('paused');
    expect(BUCKET_STATES.in_review).not.toContain('paused');
  });
});
