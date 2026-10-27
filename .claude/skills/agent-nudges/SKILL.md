---
name: agent-nudges
description: Run, inspect, or change the agent-builder nudge system - the weekday message to the seven interns building agent domains, composed from their measured build state rather than from a template. Covers previewing what would go out, sending one or all by hand, the rules that decide whether to send at all, the overlap with the older intern nudge, and installing the M-F schedule. Invoke on "nudge the builders", "what would the nudges say today", "why did nobody get nudged", "send the agent nudges", "the nudge sent the wrong thing", or before changing anything under backend/src/services/internship/agentNudge*.
user-invocable: true
---

# agent-nudges

The weekday message to the **seven interns building agent domains**. It is composed from what they
have actually done, not chosen from a template, and it declines to send when sending would be the
wrong move.

> Ali, 23 Oct 2026: *"I would like to create a nudge system, but one that is actually looking at
> what they are doing and helping them with the next step to move forward... I want to send out a
> message M-F but they need to be different each time. We can send them out if they aren't sending
> me issues and I don't detect movement or commits."*
>
> And the scope, same day: *"You can send it out but only to the 7 working on the Agent projects."*

---

## The four modules, and why they are four

| File | Owns | Knows about |
|---|---|---|
| `backend/src/services/internship/agentNudgeComposer.ts` | what to say, and whether to say anything | nothing. Pure. No DB, no mail, no express |
| `backend/src/services/internship/agentNudgeState.ts` | measuring each builder | one SQL query |
| `backend/src/services/internship/agentNudgeSend.ts` | the seam: compose, claim, send | the ledger, the transport, the kill switch |
| `backend/src/routes/admin/agentNudgeRoutes.ts` | the three admin routes | `requireSection('internship')` |

The split is load-bearing. **Every interesting decision lives in the pure module**, which is why
the rules can be tested without a database and why a wording change cannot break a send.

Frontend: `frontend/src/pages/admin/internship/ConsoleViewD.tsx`, reached at
`/admin/internship?view=console&cv=D`, with its client at `frontend/src/services/agentNudgeApi.ts`.

---

## Doing the thing

### See what would go out today, sending nothing

```bash
# From a shell on the VPS host.
./scripts/agentNudges.sh
```

Or open the console: **Intern Console → Agent nudges**. The table shows every builder, the
composed subject, the full body on expand, and whether the weekday run would send it.

### Send

Two deliberate clicks in the console, per row or for the whole run. From the shell:

```bash
./scripts/agentNudges.sh --apply
```

**Dry run is the default everywhere** - the script, both POST routes, and the service. Sending
requires `--apply` or `send: true`. There is no code path that mails somebody by accident.

### Install the M-F schedule

Not done by a deploy, because a crontab entry is a production environment change and therefore
Ali's call:

```
0 13 * * 1-5 /opt/colaberry-accelerator/scripts/agentNudges.sh --apply >> /var/log/agent-nudges.log 2>&1
```

13:00 UTC is 8am CDT / 7am CST. **Mon-Fri belongs in the cron expression (`1-5`), not in the
script** - a weekday test inside the script would also block a manager deliberately running it on
a Saturday.

---

## The rules that decide whether to send

`decideNudge` returns one of these, and the order matters:

| Reason | Sends? | Why |
|---|---|---|
| `no_recipient` | no | nothing to send to |
| `awaiting_our_reply` | no | they wrote and we have not answered. Nudging reads as not having been read |
| `moved_recently` | no | a commit since yesterday is the thing the nudge exists to produce |
| `never_started` | **yes** | its own reason, because there is no momentum to restart, only one to begin |
| `quiet_and_silent` | **yes** | the ordinary case |

**"We owe them a reply" is checked BEFORE "they moved."** Someone who reported a blocker and then
committed a workaround is still owed an answer, and nudging them would be the second time we failed
to read it.

### The measurement that took three attempts

"Are we still owed them a reply" was wrong twice against production, in opposite directions:

1. **`email_send_ledger`** holds only mail sent through the service layer. Replies sent by hand
   never reach it: its newest row for any of the seven was from August while two had been answered
   that week.
2. **Asking Gmail** was worse. Mail sent through Mandrill never appears in Gmail's Sent folder at
   all, so the mailbox reported six of seven as unanswered, including someone last heard from 79
   days earlier.

The answer was already in Postgres. Every outbound BCCs Ali, that copy is ingested like any other
mail, and `to_addresses` records who it went to - so **our side of the conversation sits in
`inbox_emails` next to theirs**, and the comparison is one subquery with nothing to mock.

Also: being owed a reply is a **live** state. `OWED_WINDOW_DAYS = 7`, because without a window one
79-day-old message would mute somebody's nudges forever, and the fix for a months-old miss is a
reply, not silence.

### Why the crude version was worse

"Wrote within two days" held back the one person who most needed nudging: she wrote on the 20th,
was answered on the 21st, then went silent. An **answered** question is a finished conversation,
and the silence afterwards is exactly the silence a nudge is for.

---

## Traps

**A zero can be a claim about somebody's work.** If a builder's stories carry no acceptance
criteria then nothing they do *can* be verified, and "you have verified 0" would be the system
blaming someone for its own gap. That state has its own branch, its own words, and it never scolds.
The console says `none gradeable` rather than showing a bare zero.

**The manual button and the weekday run disagree on purpose.** `sendOneNudge` does **not** consult
`decideNudge`; `sendAllNudges` does. A manager clicking send on a builder who just committed wants
the congratulations, and a button that silently refuses with the preview on screen is a button that
lies. The response carries the verdict it overrode so the row cannot contradict itself.

**Running twice is safe, and that is why the schedule is installable at all.** Every send is
claimed in `email_send_ledger` under `agent-nudge-<domain>-<date>`, arbitrated by a unique index.
Three scheduler instances run on this box and cron can be re-run by hand, so "it fired more than
once" is a normal event, not an incident.

**The day comes from Postgres, not from the process clock.** The measuring query uses
`current_date` for overdue stories; a day taken from anywhere else would let "this story is
overdue" and "they have been quiet N days" be computed against different days.

**`program` must never reach these routes.** `agentDomainRoutes` withholds builder *names* from
`program` on purpose - intern names are applicant data. Every response here carries a first name
**and** an email address, so all three routes are `requireSection('internship')`, and a test
asserts that guard-for-guard. This is also why the nudge UI is not on the `program`-gated All
Domains page.

**The overlap with the older nudge is real.** `backend/src/scripts/dailyInternNudges.js` already
mails interns at YELLOW or worse at 22:00 UTC Mon-Fri, and the seven builders *are* interns. On a
bad week a builder can get both. They are nine hours apart and say different things - that one is
about showing up, this one is about the next story - but it is a decision, not an oversight. If
Ali wants one voice, that is the thing to change.

**Do not wire this to the Triage Board's disabled Nudge button.** That is a different feature - the
fixed-template check-in in `internshipNudge.ts` - and its cards are the whole intern cohort, not
the seven. A per-card button there would be enabled for one intern in five.

---

## Verifying a change

```bash
# All four nudge suites: 96 tests.
node node_modules/jest/bin/jest.js --config backend/jest.ci.config.ts --testPathPattern 'agentNudge'

# The console view.
cd frontend && CI=true npx react-scripts test --testPathPattern ConsoleViewD --watchAll=false
```

Note the worktree tooling: jest lives at the **worktree root** `node_modules/jest/bin/jest.js`, and
`--testPathPattern` must be anchored on `src/` or it matches the worktree directory name. The root
`typescript` here is 4.9.5 and only emits `node_modules` noise; use a real 5.x for a meaningful
`tsc --noEmit`.

**Mutation-test any rule you change.** Four claims in these suites were verified by actually
reverting the fix and watching the named test die: the kill switch beating a preview, the manual
override, the section guard, and the composed body rendering as text rather than HTML. A check that
passes with the behavior broken proves nothing.
