# CC-20261111-n4k8 — the Agent Factory audit, and the command that repeats it

- [x] Add `runAgentFactoryAudit` and its tested judgement module
  - Date: 2026-11-12
  - Session: CC-20261111-n4k8
  - What changed: a read-only script that compares the Agent Factory board with production
    and computes a verdict, plus `lib/agentFactoryAudit.ts` holding the pure judgement.
  - Verification: `tsc --noEmit` 0 errors; 12 unit tests; both SQL queries run against
    production, including a positive control proving the missing-table branch is reachable;
    full backend CI suite green.
  - Notes: authorized by Ali on 2026-11-12 as the answer to "how can we make sure we assess
    this and recalibrate".

## What the audit found

| | |
|---|---|
| open tickets on the board | 34 |
| assigned to Ali | **34** |
| overdue | 16, six of them by 25 to 28 days |
| staffed builds | 7 — 1,057 tasks, 96 complete (**9%**) |
| domains with no builder | 3 — executive 212, learner_success 116, website 92 |
| managers who cannot reach their builder's agent | **4 of 7** |

And underneath all of it:

| Governance step | Times ever completed |
|---|---|
| build authorization | **0** |
| capability confirmation | **0** |
| change request filed | **0** |
| tool request / decision / grant | **0 / 0 / 0** |

**The path from "built" to "working employee" has never been completed once, by anyone.**
276 agents exist, 181 are enabled, 37 have a manager and 31 have any tool. The autonomy
ladder has two rungs live, `observe` and `communicate`.

Nobody hid any of this. It simply was not a number anyone looked at: the board recorded
INTENT, and nothing compared it with what production could show. That is the whole reason
this script exists.

## Why the verdict is computed rather than written

A report that prints counts and leaves the reader to judge them is the thing that already
failed. Zero rows in `agent_domain_build_authorizations` is not a statistic, it is "every
Release 2 is locked and has been since 18 October", and that sentence is what someone acts
on. `assess()` is pure and tested, so the judgement is reproducible instead of depending on
who reads the table.

The ordering is tested too, and it is the part that makes the report useful: **a cold gate
outranks the completion percentage.** Progress toward a gate nobody can pass is not
progress, and an audit that leads with "9% complete" invites exactly the reading that let
this drift for a month.

## Two traps the module is shaped around

**A zero can mean "nothing happened" or "we counted the wrong thing", and they look
identical.** `agent_runs` taught this during the audit: it holds two rows, from August, for
one unrelated agent. Reading it as the run log would have reported that every scheduled
agent had never run — the opposite of the truth. So every gate line names the table it
counted, and a missing table is reported as missing rather than as a zero, because "this
step has never happened" and "this step was never built" call for different actions.

**An unstaffed domain is not 0% progress.** Counting its tasks into the denominator reports
a staffing problem as a productivity problem. The percentage covers staffed builds only and
the unstaffed domains are named. Production returns `intended_builder` as a BLANK STRING
rather than NULL for those three, which is why the check trims rather than testing for null.

## What was cut, and what was not

`AF8.1` ("send the interns the material from the 14 Oct call") was trashed, with the reason
posted as a comment first so it survives on the record. Due 15 October, overtaken by the
rollout it was meant to precede.

That was the only clean cut in 34. The list is not cluttered with junk — the load-bearing
items are simply buried among P1s and have been sitting unowned for a month. `AF12.13` was
left open deliberately: its premise was `in_progress = 0`, today that reads 150, but
builders can set `in_progress` themselves from the portal, so the number may be manual
ticking rather than the automatic rollup the ticket asks for. Closing it on that number
would be closing it on the wrong measurement.

## The manager access item, which was not what it looked like

The audit recommended creating four `admin_users` rows for Kes, Aleem, Roselyn and Taiwo as
"the cheapest unlock". That recommendation was wrong on the mechanism, and the rows were
NOT created.

The Agent Detail surface requires the `program` section. Only `owner`, `admin` and
`curriculum` hold it. The four managers' natural roles — `platform`, `product_experience`,
`support`, `admissions` — have no `program`, so rows alone would unblock nobody. The three
managers who CAN reach it (Dhee, Sohail, Swati) all hold `admin`, which is
`ADMIN_EXCEPT_INBOX`: near-full management access including revenue, students, leads and
settings.

So the real choice is between widening near-full access from 7 people to 11, or adding a
minimal role. `mgmtRoles.ts` already answers that twice in its own comments — `lead_intake`,
`internship_review` and `product_experience` all exist precisely because handing someone a
wider existing role is "another intern's entire domain, dressed up as scoping". Left as a
decision for Ali rather than taken, because it is an access-control grant on four real
people and the first recommendation on it was already wrong once.
