# Journey Governor — shadow review

**This is the sign-off gate.** The Governor has decided one action for every one of your
153 free learners. Nothing has been sent. Read this, and if you agree the decisions are
right, EPIC 6 can later be allowed to act on them.

Run against `accelerator_prod`, 2026-08-24. Ruleset `epic4-v1`.

---

## What it decided

| Learner state | Count | Action chosen |
|---|---|---|
| `ACTIVATING` | 133 | **Send activation email** |
| `ACTIVE_LEARNER` | 6 | Recommend a lesson |
| `CONVERTED` | 9 | **Nothing** (hard stop) |
| `ENGAGED_LEARNER` | 2 | Recommend a lesson |
| `CONNECTED_TO_COMMUNITY` | 2 | Recommend a lesson |
| `ACTIVATING` | 1 | Nothing (unreachable) |

**153 learners, 153 rows, one per learner, one date.** 143 decided, 10 waited, 0 failed.
Total run time 3.1 seconds.

In plain terms: **almost everyone gets a nudge to actually start**, because that is what
your population needs. 133 of them signed up and never completed a lesson. Ten people who
are already learning get a lesson recommendation instead. Nine get nothing at all.

---

## The four things worth checking yourself

### 1. Nobody is being sold to

**Zero commercial actions.** Not one learner was chosen for an enrolment push.

That is correct, not a gap. Buying-intent scores max out at **2** across all 153, against
a threshold of 60. Almost nobody has clicked a pricing page or started an enrolment form —
partly because the page-tracking column that links a view to a person was only fixed a
fortnight ago, so that data has had days to accumulate rather than months.

**If you saw a commercial push here, it would be a defect.** The threshold was deliberately
not lowered to make the tier look busy.

### 2. Your staff are excluded

All **9 CONVERTED** learners receive nothing. Seven of them are `@colaberry.com` staff
accounts — Karthik, William, ntaylor, Vivek, Taiwo, Balamurali, John — who have full
curriculum access and must never receive acquisition messaging. The other two genuinely
paid.

This is a **hard stop**: they are not merely deprioritised, they generate no candidate at
all, so they can never be enqueued by anything downstream.

### 3. Nothing was sent

`executed = false` on all 153 rows. Zero rows executed.

One outbound email does appear in `communication_logs` during this window — a signup
welcome to a person who **enrolled today at 14:08**, is a `standard` enrolment rather than
an Explorer, and **has no Explorer profile at all**, so the Governor never saw them. That
is your existing signup flow, not this system.

### 4. Almost nobody has given consent

**143 of 143 decided learners carry a "no consent evidence" note.**

They are permitted under a default rule — US/CA business contacts may be emailed on a
CAN-SPAM opt-out basis — not because anyone opted in. That distinction is recorded on every
row rather than quietly treated as consent.

**This is the finding most worth your attention before EPIC 6.** It is legal, and it is
also not the same as a list of people who asked to hear from you.

---

## Reproduce every number

```sql
-- the distribution
SELECT primary_state, selected_action, count(*)
  FROM explorer_journey_decisions GROUP BY 1,2 ORDER BY 3 DESC;

-- nothing executed, one row per learner per day
SELECT count(*) FILTER (WHERE executed) AS executed,
       count(*) AS total, count(DISTINCT enrollment_id) AS learners,
       count(DISTINCT decision_date) AS dates
  FROM explorer_journey_decisions;

-- how many were allowed without consent evidence
SELECT count(*) FROM explorer_journey_decisions WHERE reason LIKE '%consent:%';

-- a sample with its rejected alternatives
SELECT primary_state, selected_action,
       jsonb_array_length(candidate_actions)  AS considered,
       jsonb_array_length(suppressed_actions) AS rejected,
       reason
  FROM explorer_journey_decisions ORDER BY random() LIMIT 10;
```

Every decision records what it considered and what it rejected. A typical activating
learner shows **2 candidates considered, 1 rejected**: activation rescue won, general
nurture lost, and the row says so — so "why did this person get X and not Y" is answerable
without re-running anything.

---

## What this run found

Two real defects, both invisible to 144 passing tests:

1. **The Governor could not write a row.** Two columns it wrote did not exist; two NOT NULL
   columns were missing. Caught by checking the real table rather than the model.
2. **It hard-stopped all 153 learners.** "No SMS or voice consent" was being read as "do
   not contact", when it only ever meant "no phone channel". Email and in-app died with it.

A third behaviour was correct and looked like a failure: the first corrected run still
refused everyone, with `refused: profile stale`. The scores were 26 hours old and the
nightly recompute is switched off, so the freshness gate did exactly its job — refuse
rather than decide on stale data.

---

## What is still not true

- **No message has ever been sent by this system**, and it cannot send: execution is a
  separate epic behind its own flag.
- **The nightly crons are off.** Scores and decisions only refresh when someone runs the
  scripts by hand.
- **Content does not exist yet.** Every decision names an asset type (`activation_first_step`,
  `lesson_recommendation`) that EPIC 5 has to supply. The Governor knows what to send; there
  is nothing to send.

---

## Your decision

**If you agree these decisions are right**, EPIC 5 (content) and EPIC 6 (sending) can
proceed on this foundation.

**If you disagree with any of it** — the 133 activation emails, the staff exclusion, the
absence of commercial pushes, or the consent position — say which, and it becomes the next
task list rather than something to work around.

Recorded here rather than assumed:

- [ ] Ali reviewed the distribution and agrees
- [ ] Ali accepts that 143 learners are permitted on a default rule rather than opt-in
- [ ] Date: ____________
