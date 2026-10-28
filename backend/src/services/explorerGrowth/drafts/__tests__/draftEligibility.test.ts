import {
  draftSkipReason,
  selectStepIndex,
  tallyReasons,
} from '../draftEligibility';
import { DRAFTABLE_ACTIONS, type DraftableDecision } from '../draftContracts';

/**
 * The pure rules of the draft stage. No database, no model calls.
 *
 * These are the assertions that would have caught the two defects this stage
 * was most likely to ship: a step index that advances on replay, and a skipped
 * decision reported as a bare count instead of a named reason.
 */

function decision(over: Partial<DraftableDecision> = {}): DraftableDecision {
  return {
    id: 'd1',
    enrollment_id: 'e1',
    lead_id: 42,
    decision_date: '2026-10-27',
    selected_action: 'SEND_EMAIL',
    selected_campaign_id: 'c1',
    channel: 'email',
    scheduled_email_id: null,
    selected_content_assets: [],
    reason: 'nurture',
    ...over,
  };
}

describe('draftSkipReason', () => {
  it('passes a complete SEND_EMAIL decision', () => {
    expect(draftSkipReason(decision())).toBeNull();
  });

  it.each(['SEND_EMAIL', 'RECOMMEND_LESSON', 'RECOVER_FRICTION'] as const)(
    'passes %s — all three are emails with a sequence behind them',
    (action) => {
      // THE REGRESSION THIS GUARDS. RECOMMEND_LESSON and RECOVER_FRICTION are
      // named after what the email is ABOUT, not after a channel, and both are
      // emitted with channel 'email' and a campaign_key. A list of just
      // ['SEND_EMAIL'] skipped the entirety of tier 7 — the largest group of
      // learners there is — and reported a tidy `action_not_draftable` for
      // them, which reads as working.
      expect(draftSkipReason(decision({ selected_action: action }))).toBeNull();
    },
  );

  it('covers exactly the actions the generators emit as email', () => {
    // Derived from governor/candidates/: anything with a campaign_key AND
    // channel 'email'. Pinned so adding a fourth is a deliberate edit here.
    expect([...DRAFTABLE_ACTIONS].sort()).toEqual([
      'RECOMMEND_LESSON',
      'RECOVER_FRICTION',
      'SEND_EMAIL',
    ]);
  });

  it('skips a decision that already has a draft — the idempotency guard', () => {
    // THE load-bearing rule. Without it the nightly cron would generate a
    // second message for every learner it already drafted for, every night.
    expect(draftSkipReason(decision({ scheduled_email_id: 'se-1' }))).toBe('already_drafted');
  });

  it('reports already_drafted even when the row is otherwise ineligible', () => {
    // Order matters: a drafted WAIT is not a defect, and reporting it as
    // `action_not_draftable` would send a reader looking for a Governor bug.
    expect(
      draftSkipReason(decision({ scheduled_email_id: 'se-1', selected_action: 'WAIT' })),
    ).toBe('already_drafted');
  });

  it.each(['WAIT', 'CREATE_HUMAN_TASK', 'SUPPRESS_CONTACT', 'SHOW_IN_APP_NUDGE'] as const)(
    'skips %s — it sends no email',
    (action) => {
      expect(draftSkipReason(decision({ selected_action: action }))).toBe('action_not_draftable');
    },
  );

  it('skips SEND_ALI_OUTREACH, which is email but is a named human writing', () => {
    // Deliberately NOT draftable. Generating it under the generic Colaberry
    // persona would put words in Ali's mouth.
    expect(DRAFTABLE_ACTIONS).not.toContain('SEND_ALI_OUTREACH');
    expect(draftSkipReason(decision({ selected_action: 'SEND_ALI_OUTREACH' }))).toBe(
      'action_not_draftable',
    );
  });

  it('skips a null action rather than throwing on it', () => {
    expect(draftSkipReason(decision({ selected_action: null }))).toBe('action_not_draftable');
  });

  it('reports a SEND_EMAIL whose channel disagrees, instead of trusting one field', () => {
    expect(draftSkipReason(decision({ channel: 'sms' }))).toBe('channel_not_email');
    expect(draftSkipReason(decision({ channel: null }))).toBe('channel_not_email');
  });

  it('skips a learner with no lead row — scheduled_emails.lead_id is NOT NULL', () => {
    // An Explorer without a lead_id is a real, expected state. The insert
    // would fail on the FK, so this is named rather than crashed on.
    expect(draftSkipReason(decision({ lead_id: null }))).toBe('no_lead_id');
  });

  it('skips when the Governor resolved no campaign', () => {
    expect(draftSkipReason(decision({ selected_campaign_id: null }))).toBe('no_campaign');
  });
});

describe('selectStepIndex', () => {
  it('starts a learner with no prior drafts at step 0', () => {
    expect(selectStepIndex(0, 3)).toBe(0);
  });

  it('walks the sequence as prior drafts accumulate', () => {
    expect(selectStepIndex(1, 3)).toBe(1);
    expect(selectStepIndex(2, 3)).toBe(2);
  });

  it('CLAMPS at the last step rather than wrapping to the first', () => {
    // Wrapping would restart a sequence whose first step introduces itself to
    // someone who has already had eight messages from it.
    expect(selectStepIndex(3, 3)).toBe(2);
    expect(selectStepIndex(99, 3)).toBe(2);
  });

  it('returns null for a campaign with no steps instead of defaulting to 0', () => {
    // Step 0 of nothing would mean rendering from a brief that does not exist.
    expect(selectStepIndex(0, 0)).toBeNull();
    expect(selectStepIndex(5, 0)).toBeNull();
    expect(selectStepIndex(0, -1)).toBeNull();
  });

  it('is total on garbage input rather than returning NaN', () => {
    // A NaN step index would index the steps array as undefined and the
    // failure would surface three calls later as "cannot read ai_instructions".
    expect(selectStepIndex(Number.NaN, 3)).toBe(0);
    expect(selectStepIndex(-4, 3)).toBe(0);
    expect(selectStepIndex(1.8, 3)).toBe(1);
    expect(selectStepIndex(0, Number.NaN)).toBeNull();
  });

  it('is a single-step sequence every time, for every prior count', () => {
    for (const prior of [0, 1, 7, 400]) {
      expect(selectStepIndex(prior, 1)).toBe(0);
    }
  });
});

describe('tallyReasons', () => {
  it('counts by name so a report says WHICH wall was hit', () => {
    expect(
      tallyReasons(['no_lead_id', 'no_lead_id', 'no_campaign', null, 'already_drafted']),
    ).toEqual({ no_lead_id: 2, no_campaign: 1, already_drafted: 1 });
  });

  it('ignores the nulls that mean success', () => {
    expect(tallyReasons([null, null])).toEqual({});
    expect(tallyReasons([])).toEqual({});
  });
});
