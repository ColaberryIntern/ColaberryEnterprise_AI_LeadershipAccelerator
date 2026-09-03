import * as fs from 'fs';
import * as path from 'path';

const decisionFindOne = jest.fn();
const profileFindOne = jest.fn();

jest.mock('../../../models', () => ({
  ExplorerJourneyDecision: { findOne: (...a: unknown[]) => decisionFindOne(...a) },
  ExplorerJourneyProfile: { findOne: (...a: unknown[]) => profileFindOne(...a) },
}));

import { getExplorerWhy, getExplorerWhyByDecision } from '../explorerWhyService';

/**
 * The Why drilldown.
 *
 * THE FIXTURE IS A REAL PRODUCTION ROW — every field below, `candidate_actions`
 * and its `required_assets` included, copied verbatim from
 * `explorer_journey_decisions` on 2026-09-02 (decision
 * `771952ba-9801-481c-a263-56e2cde51c14`). That is deliberate. EPIC 1 shipped a
 * bug that passed eleven green tests because its mock asserted an assumption
 * about the driver rather than the driver's actual behaviour, and the same trap
 * is available here: an invented `suppressed_actions` entry would let this file
 * pass while the real column shape differed.
 *
 * Two facts measured on production the same day, which several assertions below
 * depend on:
 *   - 142 of 153 decisions carry at least one suppressed candidate (max 2)
 *   - 12 of 153 carry an `asset gaps:` segment, and it is the same 12 whose
 *     `selected_content_assets` is empty
 */

const REAL_REASON =
  'state=CONNECTED_TO_COMMUNITY | no affinity evidence yet | campaign=explorer_next_lesson' +
  ' | consent: can_spam_opt_out | asset gaps: no_asset_for_purpose:lesson_recommendation:learning';

const ENROLLMENT = '2039513d-307a-4749-ab99-c666a33794d3';

function realDecision(overrides: Record<string, unknown> = {}) {
  return {
    id: '771952ba-9801-481c-a263-56e2cde51c14',
    enrollment_id: ENROLLMENT,
    lead_id: 24481,
    decision_date: '2026-09-02',
    mode: 'shadow',
    primary_state: 'CONNECTED_TO_COMMUNITY',
    overlays: [],
    e_score: 9,
    i_score: 0,
    f_score: 0,
    triggering_signals: [],
    candidate_actions: [
      {
        channel: 'email',
        rationale: ['state=CONNECTED_TO_COMMUNITY', 'no affinity evidence yet'],
        action_type: 'RECOMMEND_LESSON',
        campaign_key: 'explorer_next_lesson',
        priority_tier: 7,
        required_assets: [
          {
            state: 'CONNECTED_TO_COMMUNITY',
            asset_type: 'lesson_recommendation',
            affinity_tags: [],
          },
        ],
        intra_tier_score: 40,
      },
      {
        channel: 'email',
        rationale: ['CONNECTED_TO_COMMUNITY'],
        action_type: 'SEND_EMAIL',
        campaign_key: 'explorer_community_digest',
        priority_tier: 8,
        required_assets: [{ state: 'CONNECTED_TO_COMMUNITY', asset_type: 'community_digest' }],
        intra_tier_score: 50,
      },
      {
        channel: 'email',
        rationale: ['general nurture — no higher-priority candidate applies'],
        action_type: 'SEND_EMAIL',
        campaign_key: 'explorer_weekly_digest',
        priority_tier: 9,
        required_assets: [
          { state: 'CONNECTED_TO_COMMUNITY', asset_type: 'weekly_digest', affinity_tags: [] },
        ],
        intra_tier_score: 30,
      },
    ],
    // Verbatim from production. Both losers, both with the reason they lost.
    suppressed_actions: [
      {
        action_type: 'SEND_EMAIL',
        campaign_key: 'explorer_community_digest',
        reason: 'lower priority than tier 7 (RECOMMEND_LESSON)',
      },
      {
        action_type: 'SEND_EMAIL',
        campaign_key: 'explorer_weekly_digest',
        reason: 'lower priority than tier 7 (RECOMMEND_LESSON)',
      },
    ],
    selected_action: 'RECOMMEND_LESSON',
    selected_campaign_id: null,
    selected_sequence_step: null,
    selected_content_assets: [],
    channel: 'email',
    reason: REAL_REASON,
    deferred_actions: [],
    ai_involved: false,
    ai_rationale: null,
    ruleset_version: 'epic4-v1',
    holdout_group: null,
    experiment_key: null,
    executed: false,
    scheduled_email_id: null,
    outcome: null,
    outcome_at: null,
    ...overrides,
  };
}

function realProfile(overrides: Record<string, unknown> = {}) {
  return {
    enrollment_id: ENROLLMENT,
    lead_id: 24481,
    email_normalized: 'learner@example.com',
    primary_state: 'CONNECTED_TO_COMMUNITY',
    overlays: [],
    e_score: 9,
    i_score: 0,
    f_score: 0,
    contactability: { email: { eligible: true }, sms: { eligible: false, reason: 'no_number' } },
    affinities: [{ tag: 'analytics', confidence: 0.42 }],
    days_since_last_activity: 3,
    state_entered_at: new Date('2026-08-20T00:00:00Z'),
    scores_computed_at: new Date('2026-09-02T00:58:00Z'),
    ...overrides,
  };
}

const NOW = new Date('2026-09-02T12:00:00Z').getTime();

beforeEach(() => {
  decisionFindOne.mockReset();
  profileFindOne.mockReset();
});

describe('every loser comes back, with the reason it lost', () => {
  it('names the winner AND both suppressed candidates', async () => {
    // The assertion this whole task exists for. A payload with the winner and an
    // empty `suppressed` would satisfy a "returns data" test while answering
    // "what happened" instead of "why".
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);

    expect(why.found).toBe(true);
    if (!why.found) return;
    expect(why.outcome.selected_action).toBe('RECOMMEND_LESSON');
    expect(why.suppressed).toHaveLength(2);
    expect(why.suppressed.map((s) => s.campaign_key)).toEqual([
      'explorer_community_digest',
      'explorer_weekly_digest',
    ]);
    for (const loser of why.suppressed) {
      expect(loser.reason).toBe('lower priority than tier 7 (RECOMMEND_LESSON)');
    }
  });

  it('does not truncate the suppressed list', async () => {
    // A "top 3" convenience here would recreate exactly the omission the payload
    // exists to prevent, and would do it invisibly.
    const many = Array.from({ length: 9 }, (_, i) => ({
      action_type: 'SEND_EMAIL',
      campaign_key: `c${i}`,
      reason: `reason ${i}`,
    }));
    decisionFindOne.mockResolvedValue(realDecision({ suppressed_actions: many }));
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.suppressed).toHaveLength(9);
  });

  it('returns candidates as well, so the ranking is visible', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());
    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.candidates).toHaveLength(3);
    expect(why.found && why.candidates[0].priority_tier).toBe(7);
    // Passed through untouched, `required_assets` included — the drilldown shows
    // what each candidate needed, which is half of why the loser lost.
    expect(why.found && why.candidates.map((c) => c.priority_tier)).toEqual([7, 8, 9]);
  });
});

describe('the gap is the one the Governor named', () => {
  it('extracts the named gap verbatim from the reason', async () => {
    // Not a generic "no content was resolved". The named form says which purpose
    // and stage combination is empty, which is the difference between a reader
    // going looking and a reader knowing.
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.content.named_gaps).toEqual([
      'no_asset_for_purpose:lesson_recommendation:learning',
    ]);
    expect(why.found && why.content.gap).toContain('no_asset_for_purpose');
  });

  it('reports no gap when content was resolved and none was named', async () => {
    decisionFindOne.mockResolvedValue(
      realDecision({
        reason: 'state=ACTIVE_LEARNER | campaign=explorer_next_lesson',
        selected_content_assets: [{ id: 'a1', title: 'Lesson 1' }],
      }),
    );
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.content.named_gaps).toEqual([]);
    expect(why.found && why.content.gap).toBeNull();
  });

  it('does NOT call an empty asset list a gap for a WAIT', async () => {
    // A WAIT carries no content by design. Flagging it would put a false gap on
    // 11 of today's 153 decisions.
    decisionFindOne.mockResolvedValue(
      realDecision({ selected_action: 'WAIT', reason: 'nothing due', selected_content_assets: [] }),
    );
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.content.gap).toBeNull();
  });

  it('keeps a MULTI-STAGE gap intact — the separator collision', async () => {
    // `resolveContentAssets` builds the token as
    //   `no_asset_for_purpose:<type>:<stages joined on '|'>`
    // while `runGovernor` joins reason segments on ' | '. Splitting on a bare
    // '|' cut a multi-stage gap in half and returned the first fragment —
    // silently NARROWING a gap, on the one surface built to report gaps
    // faithfully. No production row exercises this today (every stageTags entry
    // is single-element), but stageTags is typed as an array, so a second tag is
    // a config change rather than a code change.
    decisionFindOne.mockResolvedValue(
      realDecision({
        reason:
          'state=X | asset gaps: no_asset_for_purpose:lesson_recommendation:learning|deciding' +
          ' | campaign gap: none',
      }),
    );
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.content.named_gaps).toEqual([
      'no_asset_for_purpose:lesson_recommendation:learning|deciding',
    ]);
  });

  it('does not swallow a segment that FOLLOWS the gaps', async () => {
    // `campaignGap` is appended after the asset-gaps segment, so "read to end of
    // string" would have been the wrong fix for the collision above.
    decisionFindOne.mockResolvedValue(
      realDecision({ reason: 'asset gaps: gap_one:a:b | campaign gap: no_campaign_for_state' }),
    );
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.content.named_gaps).toEqual(['gap_one:a:b']);
  });

  it('splits multiple named gaps rather than gluing them together', async () => {
    decisionFindOne.mockResolvedValue(
      realDecision({ reason: 'x | asset gaps: gap_one:a:b, gap_two:c:d' }),
    );
    profileFindOne.mockResolvedValue(realProfile());
    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.content.named_gaps).toEqual(['gap_one:a:b', 'gap_two:c:d']);
  });
});

describe('the scores shown are the ones the decision was made on', () => {
  it('reads scores from the DECISION, not the profile', async () => {
    // The load-bearing distinction. Showing the profile's current scores as the
    // basis of a past decision answers "what would we decide now" while looking
    // like an answer about the past.
    decisionFindOne.mockResolvedValue(realDecision({ e_score: 9, primary_state: 'ACTIVE_LEARNER' }));
    profileFindOne.mockResolvedValue(
      realProfile({ e_score: 71, primary_state: 'ENROLLMENT_READY' }),
    );

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.scores_at_decision.e_score).toBe(9);
    expect(why.found && why.scores_at_decision.primary_state).toBe('ACTIVE_LEARNER');
    expect(why.found && why.scores_now?.e_score).toBe(71);
  });

  it('flags drift when the world moved under the decision', async () => {
    decisionFindOne.mockResolvedValue(realDecision({ e_score: 9, primary_state: 'ACTIVE_LEARNER' }));
    profileFindOne.mockResolvedValue(
      realProfile({ e_score: 71, primary_state: 'ENROLLMENT_READY' }),
    );
    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.drift.scores_changed).toBe(true);
    expect(why.found && why.drift.state_changed).toBe(true);
  });

  it('reports no drift when nothing moved', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());
    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.drift.scores_changed).toBe(false);
    expect(why.found && why.drift.state_changed).toBe(false);
  });

  it('computes days in state from the profile timestamp', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());
    const why = await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);
    expect(why.found && why.days_in_state).toBe(13); // 2026-08-20 -> 2026-09-02
  });
});

describe('an absence is stated, never an empty object', () => {
  it('distinguishes "no decision that day" and points at the nearest', async () => {
    decisionFindOne
      .mockResolvedValueOnce(null) // the dated lookup
      .mockResolvedValueOnce(realDecision({ decision_date: '2026-08-31' })); // the nearest
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, '2026-09-01', NOW);
    expect(why.found).toBe(false);
    if (why.found) return;
    expect(why.learner_exists).toBe(true);
    expect(why.nearest_decision_date).toBe('2026-08-31');
    expect(why.reason).toContain('2026-09-01');
    expect(why.reason).toContain('2026-08-31');
  });

  it('distinguishes an id that matches nothing at all', async () => {
    decisionFindOne.mockResolvedValue(null);
    profileFindOne.mockResolvedValue(null);

    const why = await getExplorerWhy('00000000-0000-4000-8000-000000000000', '2026-09-02', NOW);
    expect(why.found).toBe(false);
    if (why.found) return;
    expect(why.learner_exists).toBe(false);
    expect(why.reason).toContain('No Explorer journey profile or decision exists');
  });

  it('distinguishes a learner with a profile but no decision ever', async () => {
    decisionFindOne.mockResolvedValue(null);
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhy(ENROLLMENT, undefined, NOW);
    expect(why.found).toBe(false);
    if (why.found) return;
    expect(why.learner_exists).toBe(true);
    expect(why.reason).toContain('no decision has ever been recorded');
  });
});

describe('a requested date is honoured exactly', () => {
  it('queries the date given rather than sliding to a neighbour', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    await getExplorerWhy(ENROLLMENT, '2026-09-02', NOW);

    // Sliding to the nearest day would attribute one day's decision to another,
    // which is the worst possible failure for an audit surface.
    const where = decisionFindOne.mock.calls[0][0].where;
    expect(where).toEqual({ enrollment_id: ENROLLMENT, decision_date: '2026-09-02' });
  });

  it('falls back to the most recent decision only when no date is given', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    await getExplorerWhy(ENROLLMENT, undefined, NOW);

    const call = decisionFindOne.mock.calls[0][0];
    expect(call.where).toEqual({ enrollment_id: ENROLLMENT });
    expect(call.order).toEqual([['decision_date', 'DESC']]);
  });
});

describe('getExplorerWhyByDecision — addressed by the decision, not the learner', () => {
  it('assembles the payload for a decision id', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    const why = await getExplorerWhyByDecision('771952ba-9801-481c-a263-56e2cde51c14', NOW);
    expect(why).not.toBeNull();
    expect(why!.found).toBe(true);
    expect(why!.suppressed).toHaveLength(2);
    expect(why!.enrollment_id).toBe(ENROLLMENT);
  });

  it('looks the decision up by ITS id, not by a learner id', async () => {
    // `/decisions/:id` links from a specific row on the Decisions tab. Resolving
    // the learner and re-finding by date would return a different row than the
    // one clicked whenever a caller followed a stale link.
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    await getExplorerWhyByDecision('771952ba-9801-481c-a263-56e2cde51c14', NOW);
    expect(decisionFindOne.mock.calls[0][0].where).toEqual({
      id: '771952ba-9801-481c-a263-56e2cde51c14',
    });
  });

  it('fetches the profile of the decision’s own learner', async () => {
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(realProfile());

    await getExplorerWhyByDecision('771952ba-9801-481c-a263-56e2cde51c14', NOW);
    expect(profileFindOne.mock.calls[0][0].where).toEqual({ enrollment_id: ENROLLMENT });
  });

  it('returns NULL for an unknown decision id so the route can 404', async () => {
    // Not the absence shape used elsewhere: that carries an `enrollment_id`,
    // which is not knowable from an id that matches nothing.
    decisionFindOne.mockResolvedValue(null);
    expect(await getExplorerWhyByDecision('00000000-0000-4000-8000-000000000000', NOW)).toBeNull();
  });

  it('does not look up a profile when the decision does not exist', async () => {
    decisionFindOne.mockResolvedValue(null);
    await getExplorerWhyByDecision('00000000-0000-4000-8000-000000000000', NOW);
    expect(profileFindOne).not.toHaveBeenCalled();
  });

  it('still answers when the learner has a decision but no profile', async () => {
    // A decision references an enrollment; a profile row is written by a
    // separate recompute. Treating a missing profile as "no such decision" would
    // hide the decision that actually exists.
    decisionFindOne.mockResolvedValue(realDecision());
    profileFindOne.mockResolvedValue(null);

    const why = await getExplorerWhyByDecision('771952ba-9801-481c-a263-56e2cde51c14', NOW);
    expect(why!.found).toBe(true);
    expect(why!.scores_now).toBeNull();
    expect(why!.drift.scores_changed).toBe(false);
  });
});

describe('nothing is recomputed', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'explorerWhyService.ts'), 'utf8');

  it.each([
    'explorerScoringService',
    'explorerStateMachine',
    'explorerAffinityService',
    'explorerContactabilityService',
    'explorerProfileService',
    'runGovernor',
  ])('does not import %s', (mod) => {
    // A structural guard, not a stylistic one. Importing any of these makes it
    // possible to answer "what would we decide now" while the page claims to be
    // showing what was decided then — and the two disagree constantly, because a
    // nightly recompute moves the scores.
    expect(SRC).not.toContain(`from './${mod}'`);
  });

  it('reads from exactly two models and no raw SQL', () => {
    expect(SRC).toContain("from '../../models'");
    expect(SRC).not.toContain('sequelize.query');
    expect(SRC).not.toContain('QueryTypes');
  });
});
