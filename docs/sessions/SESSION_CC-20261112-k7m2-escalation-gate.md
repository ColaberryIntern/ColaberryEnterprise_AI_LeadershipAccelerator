# Session CC-20261112-k7m2 — the escalation gate

Continuation of the intern nudge cadence work. This entry covers one change: a third gate on the
nudge send path, built after a message Ali read on 2026-11-13 and called "pretty harsh".

---

## What went wrong

A message sent 2026-11-12 19:57 UTC, in Ali's name, to `harpreetbadwal6161@gmail.com`:

> Over the last three weeks I have written to you five times and heard back once... Tell me which
> one of these is closest to true: ... 4. You have decided you are done with the internship and
> have not wanted to say so. What I cannot do is keep writing into silence and call that a
> program.

Every sentence was true about the mail. It was still the wrong message.

**Verified against production**, `accelerator-db` / `accelerator_prod`:

| Fact | Value |
|---|---|
| `enrollments.full_name` | Harpreet Kaur |
| `enrollments.status` | active |
| `enrollments.active_project_id` | **null** |
| `projects` rows on that enrollment | one, created 2026-11-11, **name empty** |

She was asked to account for screenshots of an app nobody had given her, and offered an exit from
a program she had never been let into. Ali, 2026-11-13: *"the message to Harpreet was pretty harsh
- she's not even assigned a project."* He told her to disregard it; the reply to her is his.

## Why nothing caught it

Two gates already sat on this path, and both were looking elsewhere:

| Gate | Question it answers |
|---|---|
| `briefProblems` | Can the SENDER transmit this? Dashes, angle brackets, double sign-off |
| `validateMiddle` | Is every FACT real? Invented numbers, dates, quotes, links |

Neither asked whether the message's **severity** was supported by the evidence. A factually
accurate, mechanically sendable ultimatum passes both.

## What was built

`backend/src/services/internship/nudgeBrief/escalationGate.ts` — pure, deterministic, a list of
refusals in the same family as the two above.

- `escalationLevel(body)` classifies text as `none` / `pressure` / `ultimatum` against a pattern
  table where each entry carries why it is there.
- `escalationWarrant(intern, now)` computes what the evidence supports, from the sidecar the brief
  was already composed from. **No project assigned caps it at `none`**; owing them a reply caps it
  at `none`; `pressure` needs 2 unanswered messages and 7 days of silence; `ultimatum` needs 3 and
  14. A missing warrant means `none` — it fails closed.
- `checkEscalation(body, warrant)` pairs the two.

Wired at four points, because the composer alone would leave three ways a harder sentence arrives
afterwards:

1. `chooseFocus` will not pick the escalating `never_started` shape without an `ultimatum`
   warrant. The same facts now produce a new `not_started_yet` shape, which says nothing has been
   built just as plainly and asks what is in the way instead of whether they are still here.
2. `composeBrief` attaches the warrant to the brief and warns on the row when no project is
   assigned. The console already renders `warnings`, so no frontend change was needed.
3. `sendBrief` refuses a body that exceeds the warrant — a `skipped`, not a throw, so one refusal
   never costs the rest of the roster. Logged as `intern_brief_escalation_blocked`,
   `error_class: ContractViolation`, at `warn`.
4. `validateMiddle` rejects a model middle that reaches for severity the facts did not give it.

`no_project` wording was also reframed to own the gap: "there is still no project on your name"
became "we have not put a project on your name".

`.claude/skills/intern-nudges/SKILL.md` gains rule 7 with the four conditions and the SQL, because
**`send.sh` bypasses every code gate above** and that is the path this message actually took.

## Verification

- `tsc --noEmit` (TypeScript 5.9.3): **0 errors in changed files.** A control error was planted
  first and caught, so the check is known to be live rather than silently passing. Four unrelated
  errors remain from optional deps missing in the borrowed `node_modules` (`maxmind`,
  `@anthropic-ai/sdk`); they are present on `origin/main` and are environmental.
- `jest --testPathPattern "nudgeBrief|internship" --ci`: **70 suites, 1048 tests, all passing.**
  23 of those are new.
- One pre-existing test changed: it asserted the sentence "none of them ends your internship" on a
  body that no longer offers the exit by default. It was split into two — the unwarranted case
  asserts the replan wording and the absence of the exit, the warranted case asserts the original.

## Not done

- **Not merged, not deployed.** Claude cannot approve or merge.
- The prod `send.sh` path is still ungated by code. Rule 7 is the only control on it.
- Still open from earlier in this session: whether `send.sh` mail registers as "answered" in the
  engagement model. Ali chose option B on 2026-11-13 — the cadence stays paused until it does.
