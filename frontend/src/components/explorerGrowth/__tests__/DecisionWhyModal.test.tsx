import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhyBody, draftBodyToText } from '../DecisionWhyModal';
import type { ExplorerWhy, ExplorerWhyMessage } from '../../../services/explorerGrowthApi';

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
 * NOTE ON THE GATE, corrected 2026-10-28: CI DOES run frontend jest. The
 * `frontend-tests` job in `ci.yml` runs `react-scripts test` and excludes only the
 * `/testEnv/` helper directory, so this file executes there and goes red. It is
 * not in the REQUIRED check set, so a failure is visible without blocking a merge
 * — but it is a real signal, not local noise.
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
  // Null is the honest default: most decisions have no rendered draft, and the
  // panel's job in that case is to say WHICH kind of nothing it is.
  message: null,
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

describe('the message a decision would have sent', () => {
  // A FULL base plus a Partial override, two spreads — the same shape the
  // `why` helper above uses. Inline properties followed by `...Partial<T>`
  // make TypeScript mark the result's properties optional, which then fails to
  // satisfy the required fields; two spreads keep them required.
  const BASE_MESSAGE: ExplorerWhyMessage = {
    scheduled_email_id: 'se-1',
    subject: 'This week in AI, for practitioners',
    body: '<p>Two lessons worth your time.</p><p>Both are short.</p>',
    status: 'explorer_draft',
    passed_quality_gate: true,
    issues: [],
    auto_fixed: [],
    fact_set_present: true,
    step_index: 0,
    model: 'gpt-x',
    created_at: null,
    // Phase 3. The default is a GROUNDED draft that cites one entry, because that is the
    // state the panel is built for; the tests about an absent corpus or an ungoverned
    // brand override these explicitly rather than relying on a bare default.
    cited: [
      {
        domain: 'sales',
        question: 'Do I need a coding background?',
        reference: 'sales/index.html#cat-program-basics',
        referenceLabel: 'Program basics',
      },
    ],
    knowledge_available: true,
    brand_voice: { name: 'Colaberry Enterprise AI Division', rules_version: 0, published: false },
  };
  const message = (over: Partial<ExplorerWhyMessage> = {}): ExplorerWhyMessage => ({
    ...BASE_MESSAGE,
    ...over,
  });

  it('shows the subject and the body a learner would read', () => {
    const markup = html(why({ message: message() }));
    expect(markup).toContain('This week in AI, for practitioners');
    expect(markup).toContain('Two lessons worth your time.');
  });

  it('says NOT SENDABLE on every draft', () => {
    // The safety of the whole stage rests on this, so a reader should never
    // have to infer it from a status string.
    expect(html(why({ message: message() }))).toContain('Not sendable');
  });

  it('marks refused copy as refused and lists why', () => {
    // Showing the body WITHOUT the verdict would be worse than showing
    // nothing: a reviewer would read it as approved.
    const markup = html(
      why({
        message: message({
          passed_quality_gate: false,
          status: 'explorer_draft_rejected',
          issues: ['Ungrounded date: November 12'],
        }),
      }),
    );
    expect(markup).toContain('Refused by the quality gate');
    expect(markup).toContain('Ungrounded date: November 12');
    expect(markup).toContain('would not have been allowed to send');
  });

  it('warns when the fact guard was not even in force', () => {
    // Distinct from "in force and found nothing quotable", which is the
    // STRICTEST state. Conflating them makes a disabled guard look passing.
    const markup = html(why({ message: message({ fact_set_present: false }) }));
    expect(markup).toContain('fact guard was not in force');
  });

  it('does not warn when the guard was in force', () => {
    expect(html(why({ message: message() }))).not.toContain('fact guard was not in force');
  });

  it('states which KIND of absence it is, rather than rendering blank', () => {
    // An email decision with no draft means "go run the render". A WAIT with
    // no draft means "there was never going to be one". Opposite actions.
    //
    // The distinction is drawn from channel + campaign, NOT from the action
    // name: RECOMMEND_LESSON and RECOVER_FRICTION are both emails despite
    // being named after their subject matter, and BASE here is a
    // RECOMMEND_LESSON. An action-name check would have called the largest
    // group of learners in the system "sends no email".
    const pending = html(
      why({
        message: null,
        outcome: { ...BASE.outcome, channel: 'email', selected_campaign_id: 'c1' },
      }),
    );
    expect(pending).toContain('Run the draft render');

    const wait = html(
      why({
        message: null,
        outcome: {
          ...BASE.outcome,
          selected_action: 'WAIT',
          channel: 'none',
          selected_campaign_id: null,
        },
      }),
    );
    expect(wait).toContain('sends no email');
    expect(wait).not.toContain('Run the draft render');
  });

  it('does not promise a render for an email decision with no campaign', () => {
    // The Governor leaves selected_campaign_id null AND names the gap when a
    // campaign_key resolves to nothing. There is no sequence, so there is no
    // brief, so running the render would not produce one — saying "go run it"
    // would send a reader off to do something that cannot work.
    const markup = html(
      why({
        message: null,
        outcome: { ...BASE.outcome, channel: 'email', selected_campaign_id: null },
      }),
    );
    expect(markup).not.toContain('Run the draft render');
  });

  it('puts the message above the asset list', () => {
    // A reader wants to know what the learner would read; which lesson could
    // be cited is supporting detail. The old order answered the second
    // question only, which is what made the tab confusing.
    const markup = html(why({ message: message() }));
    expect(markup.indexOf('Message')).toBeLessThan(
      markup.indexOf('Content available to cite'),
    );
  });
});

describe('draftBodyToText', () => {
  it('never emits raw markup — the body is model-written and not trusted', () => {
    // dangerouslySetInnerHTML is forbidden here for a reason: the generator's
    // inputs include lead fields and lesson titles from outside it.
    const out = draftBodyToText('<p>Hi <script>alert(1)</script>there</p>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<p>');
    expect(out).toContain('there');
  });

  it('keeps paragraph breaks so the copy stays readable', () => {
    expect(draftBodyToText('<p>One</p><p>Two</p>')).toBe('One\nTwo');
    expect(draftBodyToText('One<br>Two')).toBe('One\nTwo');
  });

  it('decodes the entities an email body actually contains', () => {
    expect(draftBodyToText('<p>Tips &amp; tricks&nbsp;here</p>')).toBe('Tips & tricks here');
    expect(draftBodyToText('<p>&quot;quoted&quot; &#39;single&#39;</p>')).toBe(
      '"quoted" \'single\'',
    );
  });

  it('collapses the run of blank lines that block tags leave behind', () => {
    expect(draftBodyToText('<div><p>A</p></div><div><p>B</p></div>')).toBe('A\n\nB');
  });

  it('is total on an empty body', () => {
    expect(draftBodyToText('')).toBe('');
    expect(draftBodyToText('<p></p>')).toBe('');
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

/**
 * Whether a model took part, and what it said (Phase 2).
 *
 * `ai_involved`, `ai_rationale` and `selected_sequence_step` were selected by the
 * service, typed on the payload and sent on every Why open since the drilldown
 * shipped — and rendered nowhere. Three fields fetched and dropped on the floor.
 *
 * `ai_involved` is the one that matters and the one that reads as harmless. On a
 * page whose subject is governance, whether a model decided something about a real
 * learner is the first question an auditor asks, and until now the honest answer
 * was that the API knew and the screen did not say.
 */
const withOutcome = (over: Partial<ExplorerWhy['outcome']>): ExplorerWhy =>
  why({ outcome: { ...BASE.outcome, ...over } });

describe('how the decision was reached', () => {
  it('STATES that no model was involved, rather than showing nothing', () => {
    // A stated negative. An absent badge is indistinguishable from a panel that
    // forgot to check, and "no model" is a finding worth reading.
    const markup = html(withOutcome({ ai_involved: false }));
    expect(markup).toContain('data-testid="ai-not-involved"');
    expect(markup).toContain('no model involved');
  });

  it('says plainly when a model DID take part', () => {
    const markup = html(withOutcome({ ai_involved: true }));
    expect(markup).toContain('data-testid="ai-involved"');
    expect(markup).toContain('A model took part in this decision');
    expect(markup).not.toContain('data-testid="ai-not-involved"');
  });

  it('shows the rationale the model gave', () => {
    const markup = html(
      withOutcome({ ai_involved: true, ai_rationale: 'Chose lesson 4 over 7 on recency.' }),
    );
    expect(markup).toContain('data-testid="ai-rationale"');
    expect(markup).toContain('Chose lesson 4 over 7 on recency.');
  });

  it('says a model gave NO rationale, which is different from no model', () => {
    // The two absences lead to different questions: "why is this unexplained"
    // versus "there was nothing to explain".
    const markup = html(withOutcome({ ai_involved: true, ai_rationale: null }));
    expect(markup).toContain('The model gave no rationale');
  });

  it('does not ask for a rationale when no model was involved', () => {
    const markup = html(withOutcome({ ai_involved: false, ai_rationale: null }));
    expect(markup).not.toContain('The model gave no rationale');
  });

  it('renders the rationale as TEXT, never as markup', () => {
    const markup = html(withOutcome({ ai_involved: true, ai_rationale: '<b>bold</b>' }));
    expect(markup).not.toContain('<b>bold</b>');
    expect(markup).toContain('&lt;b&gt;');
  });

  it('shows the sequence step counting from one, not zero', () => {
    const markup = html(withOutcome({ selected_sequence_step: 0 }));
    expect(markup).toContain('data-testid="sequence-step"');
    expect(markup).toContain('Sequence step 1');
  });

  it('omits the step badge when the decision carried no step', () => {
    // `null` means no step was selected. Rendering "Sequence step 1" for it would
    // invent a fact — and `0` is a REAL step, so a truthiness check here would
    // have hidden the first step of every sequence.
    const markup = html(withOutcome({ selected_sequence_step: null }));
    expect(markup).not.toContain('data-testid="sequence-step"');
  });
});
