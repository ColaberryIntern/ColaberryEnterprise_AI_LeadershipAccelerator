# Growth Journey reason codes — the troubleshooting index

**Companion to `directives/growth-journey-operations.md`.** That directive is the
procedure; this is the lookup table it sends you to. Split out because a reason index is
a reference consulted by symptom, not a set of steps read in order — and because the
runbook was over this repo's 500-line ceiling with it inline.

**How to use it:** almost everything this system declines to do, it declines *by name*.
Find the code in the symptom group below, then act on the row. A code you cannot find
here is worth reporting — the vocabulary is closed, and an unrecognised one usually means
a composed reason was truncated (several columns cap at 64 characters and cut rather than
reject).

---

## Troubleshooting by reason string


**"Nothing is happening at all."**

| Reason | Meaning | Move |
|---|---|---|
| `flag_master_off` | the master switch is off | set `GROWTH_JOURNEY_ENABLED=true` and restart |
| `flag_decisions_off` / `flag_execution_off` | that capability is off | the corresponding env var, then restart |
| `explorer_flag_off:<flag>` | the channel's Explorer flag is off | that Explorer env var |
| `journeyExecution_off` / `growthJourney_off` / `journeyDecisions_off` / `journeyHandoffs_off` | a cron skipped itself on its own flag check | as above |

**"It is on but nothing goes out."**

| Reason | Meaning | Move |
|---|---|---|
| `kill_switch` | the global switch is on | deactivate it, then re-enable campaigns and agents **by hand** |
| `kill_switch_unreadable` | the setting could not be read; treated as ON | fix the database read; this is fail-closed on purpose |
| `pause:<dims>` | a scoped pause covers this | find it in the controls list and clear it |
| `no_rollout` | no rollout for this scope, so it stays in shadow | create a rollout (§5.2) |
| `review_only_channel` | `ali_outreach` is review-only by construction | nothing to do; this is correct |
| `not_in_cohort` | the subject is not in the `limited` cohort | widen the cohort, or use `review` |
| `daily_limit_reached` | the day's limit is spent | raise the limit (max 25) or wait |
| `journey_hold:<reason>` | a send was held at send time | the nested reason is the real one |

**"A handoff is stuck in the queue."**

| Reason | Meaning |
|---|---|
| `flag_off` / `kill_switch_active` | the flags or the kill switch |
| `no_assignee_policy` | the queue policy row has no assignee |
| `capacity_full` | the queue is at `daily_capacity` (counts `assigned` + `accepted`; `queued` does not count) |
| `capacity_unknown:<reason>` | capacity not set, policy absent, policy paused, or lookup failed — and **unknown is not full**; nothing is suppressed |
| `creator_unregistered` | the creator agent row is missing |
| `ticket_create_failed:<class>` | ticket creation failed; the handoff stays queued |
| `released` | a human released it back |

**"A plan was refused."** The planner writes one ledger row per refusal. Common codes:
`decision_not_live`, `no_selected_action`, `channel_not_authorized`, `no_program`,
`stale_decision_age` (older than 36 h), `stale_decision_reply_newer` (the person replied
after the decision), `consent_unverified`, `human_in_conversation`,
`contact_evidence_unavailable`, `returned_to_ai_cooldown`, `in_app_requires_enrollment`,
`in_app_no_approved_content`, `open_execution_exists`, `mode_not_live:<ladder reason>`.

**"A campaign will not run."** `campaign_not_registered`, `campaign_missing`,
`campaign_not_brand_scoped`, `campaign_not_approved`, `campaign_no_sequence`,
`campaign_not_active`, `sequence_inactive`.

**"Content was withheld."** The content gate's codes name the dimension that failed:
`asset_other_brand`, `asset_unscoped_not_this_brand`, `asset_other_offer_family`,
`asset_other_program`, `asset_other_path`, `asset_not_approved:<status>`,
`content_rule_window`, `content_rule_restricted`, `content_rule_not_approved:<status>`,
`content_not_approved`, `offer_not_eligible:<reason>`. The required status is `approved`
— nothing else passes. **A deny always outranks an allow.**

**"A number is missing from a report."** These are absences, not zeros:
`no_denominator` (nothing to divide by), `below_min_samples` (a median needs 3),
`window_too_large` (the window is refused, not truncated — narrow it),
`settings_invalid` (a holdout policy row needs a human), `needs_executor_run_row`,
`needs_identity_key`. On the by-journey read there is no reason string at all: a
programme with `has_leads: false` has not started, and every figure is absent rather
than `0`.

---

