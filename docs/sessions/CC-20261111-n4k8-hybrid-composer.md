# CC-20261111-n4k8 — the model writes the middle, the facts decide whether it ships

Fifth log file for this session, same reason as the others: open branches are editing the earlier
files, and two branches appending to one file is the conflict class that has cost PR approvals here.

- [x] Hybrid message body: model-written middle behind a gate on the facts
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: new `nudgeBrief/modelBody.ts` holds the facts builder, the refusal gate, the
    model call and the reassembly. `composeBrief` stays PURE and now also returns `bodyParts`
    (head / middle / tail) plus `deterministicBody` and `bodyFromModel`. `briefFromPipeline` calls
    `upgradeBody`, which returns the brief unchanged on any refusal. `pipeline.ts` exposes the
    cached `chatClient` it already built for the report.
  - Verification: new `__tests__/modelBody.test.ts`, 17 cases covering every refusal reason and
    three accepts. Internship subsystem 66 suites / 991 tests pass. `tsc --noEmit` 0 errors.
    `checkTestTypecheck` baseline matched exactly in both directions.
  - Notes: decision was Ali's, 2026-11-11, asked as a multiple choice and answered A twice — once
    for the hybrid, once for "deterministic text only when unreviewed".

## Why the model only writes the middle

The first line is their name and the last line is one reply with a date. Both are structural
promises that the sender and several tests depend on, and the closing ask is the entire reason for
sending. Letting a model near either trades a real guarantee for a stylistic gain. The sameness
lives in `theOneThing` / `nextAction` / `wayThrough`, so that is what it rewrites.

`composeBrief` is documented pure and stays pure: this module never runs inside it. The pattern is
exactly `summary.ts` upgrading `fallbackSummary`, which already exists in this subsystem and
already rejects roughly a third of what the model returns.

## Two bodies on every brief, on purpose

`body` is what the console shows and a person approves. `deterministicBody` is never rewritten.
Ali's rule is that an unattended send uses the deterministic wording, so the 48 hour worker will
send `deterministicBody` and will not need a second composer to do it.

## The gate, and the mistake each check exists for

| check | the failure it exists for |
|---|---|
| gendered pronoun | the 9 Nov dry run gendered an intern |
| number not in facts | `summary.ts` learned this: "46 of 136" when the number was 47 |
| date word not in facts | a day name nobody promised is a commitment somebody now believes |
| quoted words are not theirs | a paraphrase presented as their words is worse than silence |
| link not in facts | an invented URL |
| sender would refuse it | `briefProblems`, so a draft that could never be sent is never shown as one |
| wrote the greeting | it wrote a line that is not its to write |

The assembled whole is checked a second time against `briefProblems`, because the three pieces
passing separately does not prove the join passes.

## A design error my own test caught

The first version of the date gate included `today`, `tomorrow` and `tonight`. That rejected
almost every reasonable draft, including this file's own example of a good one — and it was wrong
on the merits: those words are relative to the moment of sending rather than claims about a
calendar, and the deterministic close already uses them ("Reply today with the day you will have
the first one recorded"). Only day and month names are commitments. Caught because the accept
cases were written before the implementation was trusted.

## Not done

- Not deployed. Built, typechecked and tested only.
- **No live sample yet.** The gate's acceptance rate against real interns is unmeasured; the only
  evidence is the unit cases. That number matters and should be taken on the first real run.
- The 48 hour cadence worker is Phase 2 and is not in this change.
