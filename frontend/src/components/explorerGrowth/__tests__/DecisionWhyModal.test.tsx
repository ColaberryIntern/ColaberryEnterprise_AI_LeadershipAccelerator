import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhyBody } from '../DecisionWhyModal';
import type { ExplorerWhy } from '../../../services/explorerGrowthApi';

/**
 * The Why modal — the component this epic exists for.
 *
 * ── THE ASSERTION THAT MATTERS IS THE COUNT ─────────────────────────────────
 *
 * Not "some losers render". The RENDERED loser count must equal the payload's,
 * because the failure mode is silent: a `.slice(0, 3)` or a "show more"
 * affordance added later would truncate the list and leave a screen that still
 * looks finished, while discarding exactly what the Phase A payload was built
 * to carry. A test that only checks "at least one loser appears" passes happily
 * through that.
 *
 * ── WHY renderToStaticMarkup AND NOT @testing-library ───────────────────────
 *
 * `@testing-library/react` is imported by 14 files in this repo and declared in
 * `package.json` by none — those suites cannot run. `renderToStaticMarkup` is
 * used by 198, and is what the spec's own file map named for these components.
 * Adding a test dependency to suit one file would be a drive-by install, which
 * CLAUDE.md forbids and which would not have made the gate any stronger.
 *
 * It also forced a better shape: `WhyBody` is pure given a payload, so the
 * guarantee is tested on the thing that renders it rather than through an async
 * shell that would only ever reach the loading state.
 *
 * NOTE ON THE GATE: CI does not run frontend jest. This is a local guard.
 */

/** Shaped from real production decision 771952ba-…, 2026-09-02. */
const BASE: ExplorerWhy = {
  found: true,
  enrollment_id: '2039513d-307a-4749-ab99-c666a33794d3',
  decision_id: '771952ba-9801-481c-a263-56e2cde51c14',
  decision_date: '2026-09-02',
  mode: 'shadow',
  ruleset_version: 'epic4-v1',
  holdout_group: null,
  experiment_key: null,
  outcome: {
    selected_action: 'RECOMMEND_LESSON',
    selected_campaign_id: null,
    selected_sequence_step: null,
    channel: 'email',
    reason: 'state=CONNECTED_TO_COMMUNITY | campaign=explorer_next_lesson',
    executed: false,
    scheduled_email_id: null,
    outcome: null,
    outcome_at: null,
    ai_involved: false,
    ai_rationale: null,
  },
  scores_at_decision: {
    e_score: 9,
    i_score: 0,
    f_score: 0,
    primary_state: 'CONNECTED_TO_COMMUNITY',
    overlays: [],
  },
  candidates: [],
  suppressed: [
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
  triggering_signals: [],
  deferred_actions: [],
  content: { assets: [], named_gaps: [], gap: null },
  contactability: null,
  affinities: [],
  scores_now: null,
  days_in_state: 13,
  days_since_last_activity: 7,
  drift: { scores_changed: false, state_changed: false, profile_computed_at: null },
};

const why = (over: Partial<ExplorerWhy> = {}): ExplorerWhy => ({ ...BASE, ...over });
const html = (w: ExplorerWhy) => renderToStaticMarkup(<WhyBody w={w} />);
/** How many loser rows the markup actually contains. */
const loserRows = (markup: string) =>
  (markup.match(/data-testid="suppressed-row"/g) ?? []).length;

describe('every loser is rendered, with its reason', () => {
  it('renders exactly as many losers as the payload carries', () => {
    const markup = html(why());
    expect(loserRows(markup)).toBe(BASE.suppressed.length);
    expect(loserRows(markup)).toBe(2);
  });

  it('renders NINE when the payload carries nine — no cap, no top-N', () => {
    // The regression guard. A `.slice(0, 3)` added later fails here and nowhere
    // else, because the screen would still look complete.
    const many = Array.from({ length: 9 }, (_, i) => ({
      action_type: 'SEND_EMAIL' as const,
      campaign_key: `campaign_${i}`,
      reason: `reason ${i}`,
    }));
    const markup = html(why({ suppressed: many }));
    expect(loserRows(markup)).toBe(9);
    for (let i = 0; i < 9; i += 1) expect(markup).toContain(`campaign_${i}`);
  });

  it('the count in the heading agrees with the rows beneath it', () => {
    // If these disagree, one of them is lying about the other — and the count is
    // the part a reader trusts at a glance.
    const markup = html(why());
    expect(markup).toMatch(/data-testid="suppressed-count"[^>]*>2</);
    expect(loserRows(markup)).toBe(2);
  });

  it('shows each loser with the reason it lost, not merely its name', () => {
    const markup = html(why());
    expect(markup).toContain('explorer_community_digest');
    expect(markup).toContain('explorer_weekly_digest');
    expect((markup.match(/lower priority than tier 7/g) ?? []).length).toBe(2);
  });

  it('states plainly when nothing lost, rather than rendering an empty table', () => {
    // "Nothing else qualified" is an answer. A blank space is not.
    const markup = html(why({ suppressed: [] }));
    expect(markup).not.toContain('data-testid="suppressed-table"');
    expect(markup).toContain('Nothing else qualified');
  });
});

describe('the winner is shown as what was decided', () => {
  it('names the action, its channel and its reason', () => {
    const markup = html(why());
    expect(markup).toContain('RECOMMEND_LESSON');
    expect(markup).toContain('email');
    expect(markup).toContain('campaign=explorer_next_lesson');
  });

  it('marks an un-executed decision calmly and an executed one loudly', () => {
    // While every flag is off, "executed" is the surprising state, not the
    // normal one — so it is the one that should stand out.
    expect(html(why())).toContain('not executed');
    const executed = html(why({ outcome: { ...BASE.outcome, executed: true } }));
    expect(executed).toContain('>executed<');
  });
});

describe('drift between then and now is surfaced, not smoothed over', () => {
  it('shows both bases and says the learner moved', () => {
    const markup = html(
      why({
        scores_now: {
          e_score: 71,
          i_score: 5,
          f_score: 0,
          primary_state: 'ENROLLMENT_READY',
          overlays: [],
        },
        drift: { scores_changed: true, state_changed: true, profile_computed_at: '2026-09-03' },
      }),
    );
    expect(markup).toContain('has moved since the decision');
    // The decision's own basis AND the current value, both present.
    expect(markup).toContain('>9<');
    expect(markup).toContain('>71<');
  });

  it('says nothing about drift when nothing drifted', () => {
    expect(html(why())).not.toContain('has moved since the decision');
  });

  it('handles a learner with a decision but no profile row', () => {
    // Real state: the decision references an enrollment, the profile is written
    // by a separate recompute. Must not render as "scores of zero".
    const markup = html(why({ scores_now: null }));
    expect(markup).toContain('No profile row');
  });
});

describe('the content gap is named, not summarised', () => {
  it("shows the Governor's own gap token verbatim", () => {
    const markup = html(
      why({
        content: {
          assets: [],
          named_gaps: ['no_asset_for_purpose:lesson_recommendation:learning'],
          gap: 'The Governor reported gap: no_asset_for_purpose:lesson_recommendation:learning.',
        },
      }),
    );
    expect(markup).toContain('no_asset_for_purpose:lesson_recommendation:learning');
  });

  it('does not claim a gap when none was reported', () => {
    expect(html(why())).toContain('No content was needed for this action');
  });
});

describe('provenance is on the payload', () => {
  it('shows the mode, ruleset and decision id', () => {
    const markup = html(why());
    expect(markup).toContain('shadow');
    expect(markup).toContain('epic4-v1');
    expect(markup).toContain('771952ba-9801-481c-a263-56e2cde51c14');
  });
});
