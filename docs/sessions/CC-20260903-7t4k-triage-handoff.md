# CCAR-F question triage — what you have and what to do with it

**Run:** `20260907-cert-question-triage` · **Session:** CC-20260903-7t4k

---

## The one sentence that matters

**A question with no objection has not been checked.**

A language model read all of them and argued against each marked answer. It is a
different model from the one that wrote them, which makes it a second opinion
rather than a check. Where it raised no objection, that means one model failed to
break the question — not that the question is right, and not that anybody has
read it.

The flagged list is **where to start**, not the only place a problem could be.

---

## What to do, in order

1. **Open the triage email.** Subject begins `CCAR-F triage:`. It lists only the
   questions the reviewer objected to, each with its key, what the objection is,
   and which option it concerns.

2. **Work the list.** For each one, decide: is the marked answer still the single
   best choice? The most common objection is *"a wrong option may also be right"*,
   which is the failure a bank written quickly actually has — not obviously wrong
   items, which anyone catches.

3. **Reply to the email in prose** for anything you want changed. Quote the
   question key, e.g. `CCARF-D1-07: C is also defensible when the budget is fixed`.
   Replying changes nothing on its own; it tells me what to revise.

4. **Approve in the admin queue**, at `/admin/cert-prep`, under your own name.
   That is the only act that makes a question servable. There is no bulk-approve
   button, by design: approving forty questions in one click is not review.

5. **Nothing is served until you do step 4.** A student starting a sitting today
   gets *"There are no approved questions for this set yet."* That is the current,
   intended state.

---

## What this process cannot tell you

- **Whether an unflagged question is correct.** It only knows one model did not
  object.
- **Whether the bank as a whole covers the exam fairly.** Weighting and coverage
  are checked separately, by tests, against the published blueprint.
- **Anything about difficulty calibration.** The reviewer was told explicitly not
  to flag an item for being easy, because a question that is merely easy is not a
  defect.
- **Whether our questions resemble the real exam's style.** They are shorter and
  less scenario-driven than Anthropic's own samples. That is a known, separate
  gap.

---

## If the report looks wrong

| What you see | What it means |
|---|---|
| A question flagged for something that is not a defect | The reviewer over-reached. Ignore it; no action needed. |
| Far more flagged than expected | Worth telling me — it may mean the prompt is too aggressive rather than the bank being poor. |
| **Zero flagged** | Do not read that as clearance. The report says so itself. It more likely means the reviewer was too permissive. |
| An item marked `error` | The reviewer could not read it. That item has had **no** review at all and is deliberately listed with the flagged ones. |

---

## Undoing it

The triage wrote rows to `cert_question_triage` and nothing else. It did not
touch any question, any review status, or anything a student can see.

```sql
DELETE FROM cert_question_triage WHERE run_id = '<run id from the report footer>';
```

The run id is in the report's footer. Deleting those rows removes the opinion and
leaves the bank exactly as it was.

The email cannot be unsent, which is why sending is a separate explicit step and
never the default.

---

## Where things stand

- **150 questions**, all drafts, **0 servable**.
- The previous "approved" state was retired earlier in this session: every one of
  those approvals belonged to `certprep-e2e@colaberry.test`, an end-to-end test
  fixture, not a person.
- Cert Prep is deployed and working. It serves nothing because nothing has been
  approved by a human, which is the state you chose.
