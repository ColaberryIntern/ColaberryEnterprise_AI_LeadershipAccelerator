# Morning Five: the three defaults, chosen and reversible

Ticket `10501226498` · Decided 2026-11-21 · Session `CC-20261120-k4d9`
Test week: 2026-11-11 to 2026-11-21.

The ticket's done-when: *"Ali has used it for the test week and finalized delivery time, ranking
weights and spread; the daily send is scheduled."* Two of the three were settled during the test
week and are already in code. The third is chosen here. The scheduling step is the one thing this
run does not do, and the reason is stated at the bottom rather than left as an omission.

---

## 1. Ranking weights: FINALIZED, already in code

`backend/src/scripts/lib/aliTaskAgent/pressingFive.js`.

**Time pressure is a gate, not a weight.** A task with no due date, or more than 60 days overdue,
scores **zero and is disqualified**. That is deliberate: a thing nobody dated is not pressing,
and a thing two months overdue is a disposition question rather than today's move. Everything
else is added to the timing score:

| Timing | Points |
|---|---|
| 1 to 7 days overdue | 50 |
| due today | 45 |
| 8 to 21 days overdue | 40 |
| due within 3 days | 35 |
| 22 to 60 days overdue | 25 |
| due within 7 days | 20 |
| due within 14 days | 8 |
| no due date, over 60 days late, or further out | 0 (disqualified) |

| Modifier | Points | Why |
|---|---|---|
| a decision only Ali can make | +20 | the ticket frames it as one |
| the ticket says a person has to do it | +15 | `human_required`, or stated outright |
| in an approval-gate list | +15 | other work is waiting on it |
| a commitment to someone outside the company | +10 | the cost of being late is not internal |
| machine-generated scaffolding | **-25** | the one negative, and it is large on purpose |

The `-25` is the weight worth defending. Generated scaffolding is numerous and well dated, so
without a penalty it crowds out everything a person actually wrote. Note the shape: it is a
penalty, not an exclusion, so a generated task that is genuinely late and gate-blocking can still
surface.

**Why these are final rather than provisional:** the curve peaks at *1 to 7 days overdue* rather
than at the most overdue item, which is the behavior Ali asked for and the opposite of a naive
sort. Something a week late is still rescuable; something three weeks late has already missed.

## 2. Spread: FINALIZED, already in code

At most **2 from one list** and **3 from one project**, out of five (`pickFive`, `perList: 2`,
`perProject: 3`).

Set by Ali on 2026-11-12 after the first real run put three MAPLOCA tasks in the five. The rule
in his words: a client deadline may lead, but it may not crowd out everything else. The cap is
deliberately not 1: a project that genuinely has the two most pressing items should show both.

## 3. Delivery time: **07:00 Central**, every day

This is the default being chosen here, and it is chosen for position in the morning rather than
for the hour itself.

Read from `reportingRegistry.js` rather than from memory. An earlier draft of this table put the
gov report at 07:30 and a family briefing at 06:00; the registry says otherwise for the first and
says nothing at all about the second, so both are corrected here:

| Time (CT) | What the registry schedules |
|---|---|
| 05:30 | Interview prep report, and the prep nudges right behind it |
| **07:00** | **Morning Five (this), proposed** |
| 08:00 | Ali Personal decisions-owed, labelled in the registry "first in the day, highest decisional priority" |
| 08:00 and 09:00 | the two-slot report at registry line 145 |
| 09:00 | Gov Contracts |
| 10:00 onward | the rest of the day's reports, one per hour |

Other morning mail exists outside this registry (the family briefing among it) and this document
does not claim its times, because they are not in the file and were not verified.

Three reasons for 07:00:

1. **It lands before the 08:00 decisional report.** Morning Five names the one move worth making
   today. Arriving after the decisions-owed email inverts the order: that report raises decisions,
   and this one says which to make first.
2. **It does not pile onto 05:30.** Five tasks each walked through, plus the Backlog Navigator and
   a PDF, is the longest read of the morning. Arriving alongside the interview prep report means
   one of the two gets skimmed, and the hour between them is the whole point.
3. **Every day, not weekdays.** The same reasoning Ali gave on 10 Nov 2026 for putting a morning
   report on autopilot: "Setup the process to be on auto pilot running every morning." A backlog
   does not pause, and a Monday email covering three days is the one nobody reads.

`sendCT` is DST-correct and fires through the `--ct-now` path, not the hourly stagger, so the
hour means the same thing in November and in July.

## Everything here is reversible, and this is how

Each default is one value in one place. None requires a migration or a redeploy of anything but
the backend.

| To change | Edit | Effect |
|---|---|---|
| delivery time | `sendCT` on the registry entry | next day's send |
| spread | `perList` / `perProject` passed to `pickFive` | next render |
| any weight | the `WEIGHTS` object or the `timing` table | next render |
| stop sending entirely | `--skip-morning-five` on the runner's lines | immediate, no deploy |

The skip flag matters more than it looks: these reports have **no cron line of their own**. They
fire from an inline registry dispatched by `runReportingAuditAndSend`, so turning one off means
adding its skip flag to **all** of the runner's lines, not commenting out a crontab entry that
does not exist.

## What this run does NOT do, said plainly

**The daily send is not scheduled yet.** No entry has been added to
`backend/src/scripts/lib/reportingRegistry.js`, so nothing fires.

That is deliberate. Registering it starts a recurring outbound email on a schedule, and this
change is landing as a pull request that will not be merged or deployed by the session that wrote
it. Wiring a daily send inside a branch nobody has reviewed means the first thing a deploy does
is start sending.

The registration is one object, and these are its values:

```js
{
  name: 'Morning Five + Backlog Navigator',
  scriptPath: 'backend/src/scripts/sendMorningFive.js',
  args: [],
  projectId: null,
  needsOpenai: false,
  recipients: { to: 'ali@colaberry.com', cc: [] },
  cbRunnerState: null,
  skipFlag: '--skip-morning-five',
  cadence: 'daily',
  sendCT: '07:00',
  description: 'The five most pressing tasks, each walked through, with the one move worth '
    + 'making today, the interactive Backlog Navigator board and a PDF of the report.',
}
```

**So the ticket is not closed by this document.** It is closed when that entry is added and the
first scheduled send lands. This records the three decisions so that step is a one-line change
somebody approves, rather than three judgment calls made at the moment of wiring.

## What would reopen the defaults

- **07:00 collides with something new.** The morning already has four emails; a fifth changes the
  ordering argument, which is the only argument for this hour.
- **The five stop being five different things.** If the spread caps are repeatedly hit, the
  backlog has concentrated and the caps are hiding that rather than correcting for it. That is a
  signal to look at the backlog, not to raise the cap.
- **The dormant line moves.** The 60-day disqualification and the `--days 60` window are the same
  number in two places. If one moves the other must, or tasks will appear in the data and never
  in the five.
- **Generated scaffolding stops being numerous.** The `-25` exists because of volume. If that
  volume goes away the penalty is just a bias.
