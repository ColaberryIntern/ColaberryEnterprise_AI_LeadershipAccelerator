# Session CC-20261115-c3r8 (part 4) — Cora troubleshoots, instead of referring

**Date:** 2026-11-16 (Central)
**Part 3:** [`CC-20261115-c3r8-rules.md`](CC-20261115-c3r8-rules.md) — the rules block, PR
[#4080](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4080) (merged, deployed)
**Ask (Ali):** "Cora should be able to help them troubleshoot issues"

---

## The rule I got wrong

Rule 7, shipped in #4080 the night before, made **all** software troubleshooting a
handoff. It was written after a reply gave confident step-by-step Power BI advice and
marked the email resolved, so no person ever saw it.

Ali reversed it, and he is right. The defect was never that she helped. It was that the
help was unsourced and the email was closed out. The rule treated the symptom by
forbidding the most common thing anyone writes in about.

**The audit makes the mistake obvious.** Over 90 days, human senders named:

| Named in their mail | Count |
|---|---|
| portal or login | 928 |
| SQL Server family (SSMS/SSRS/SSIS) | 867 |
| Claude Code or Anthropic | 723 |
| recordings | 234 |
| GitHub | 173 |
| Python | 95 |
| Power BI | 94 |
| Excel | 56 |
| Tableau | 26 |
| Docker | 16 |

Against that, the knowledge base had **27 active answers, of which four touched
troubleshooting at all**: broken links, payment failure, portal login, and a list of
required tools. She had almost nothing to help anyone with, so she referred them. The
rule was papering over a content gap.

## Scope decision (Ali, 2026-11-16)

Asked whether she should troubleshoot the legacy bootcamp stack too, given it is about
half the volume: **both stacks, with bootcamp tools always keeping a person.** She gives
first-line help on Power BI, SQL Server, Tableau and Excel and never closes one out,
which keeps the 17 June Accelerator-only scope intact without dead-ending the sender —
which is exactly what the blanket refusal did.

## What changed

**Rule 7** is now only about scope: answer from the knowledge base, do not fill gaps from
general knowledge, do not describe what is "standard" or "typical".

**Rule 8 is new, and frames troubleshooting as a duty:** *"Troubleshooting is your job,
so do it. Someone who writes in stuck should get real help from you, not a referral to
somebody else."* With the three limits that actually caused the original defect:

1. Do not invent specifics you cannot check — no menu paths, button names, version
   numbers, subscription tiers, settings screens or file locations unless the knowledge
   base gives them.
2. Do not state anything about their account, enrollment, payment or records.
3. Ask for the error itself: the exact message, a screenshot, which tool, what they tried.
   That is what turns a four-round thread into one, so collecting it is help, not a delay.

Plus: never tell anyone to write to support@colaberry.com, which is the address they just
wrote to. The old rule 8 (a decline closes the message) is now rule 9.

**`needs_human`** gained the troubleshooting case: a reply that gave the steps and leaves
the sender able to get unstuck is resolved; one that asked for an error message, or needs
access Cora does not have, or concerns another program's tool, always keeps a person.

## Content: five answers, and two live answers that were teaching the wrong habit

Applied to production, 27 active entries to **32**. Every step is sourced — install URLs
and the tool list from the existing `Required tools` entry, the recordings path from
`Session recordings access`, "GitHub account with repository creation access" from
`seedClassReadinessCampaign.ts`, and "Docker Desktop must be running" is a property of
the tool rather than a claim about our product.

| New entry | What it does |
|---|---|
| Claude Code setup problems | Reinstall point, subscription-account check, stale-session sign-out, then asks for the error |
| Docker Desktop problems | The install URL, and the one that catches most of them: Docker must be *running*, not just installed |
| GitHub access problems | Confirms the account can create a repo, separates "their account" from "a repo we provisioned" |
| Recording will not play | The portal path, the 24-hour posting window, try another browser, then report with session date and browser |
| Other program tool support | First-line help, says plainly it belongs to another program, collects everything in one go, always keeps a person |

**Two live answers fixed at the source**, which matters more than it looks:

1. `Required tools` ended with *"available in the portal once you are enrolled."* **That
   is where the rule-6 violation in the deployed replay was coming from** — the model was
   quoting the knowledge base faithfully. A rule cannot out-argue its own source material.
2. The `AI Mentor` answer routed the sender to **support@colaberry.com**: the echo reply,
   shipped as knowledge.

Six SQL guards all return 0 rows afterwards: no "once you are enrolled", no support@
redirect, no "free", no refund terms, no founding rate, no placement claim, no plan tier,
no unresolved merge tag.

## Measured

24 emails — the same 20 real unanswered ones, plus 4 probes written to hit the new entries
— replayed with the revised rules swapped into the live production prompt. The swap script
fails loudly if the deployed rules block is not found verbatim, if the replacement is a
no-op, or if the file still contains the old refusal, because each of those would report
"the new rules changed nothing" when the truth is they were never in the prompt.

| | Deployed (#4080) | Revised rules |
|---|---|---|
| Compliance violations, 20 real emails | 2 | **1** |
| Hand-offs, 20 real emails | 18 | **15** |
| Generation errors | 0 | 0 |
| Prompt size | 17,799 | 19,223 |

The violation count fell because the `Required tools` fix removed the phrase at its
source. The one survivor is a "feel free to ask" that the parse-time check forces to a
human anyway.

**Hand-offs falling is the point, not a regression.** All three that stopped needing a
person are cases where she now does the work:

- **Michael**, who missed setup steps in orientation, gets the Docker download, "open it
  until it reports that it is running", and the GitHub account step. Before he got a
  referral to a person.
- **Genay**, on a replacement laptop, gets the reinstall list.
- A "when does the next class start" question the knowledge base fully answers.

All four probes got real help: Claude Code returned the three checks and asked for the
error; **Docker correctly diagnosed "cannot connect to the Docker daemon" as Docker not
running**; the recording probe got the browser check and the reporting path; and the SSRS
probe got first-line help, a plain statement that it belongs to another program, an
information request, and a person kept on it.

## Verification

| Gate | Result |
|---|---|
| `coraPromptRules.test.ts` | **39 pass** (7 new, pinning the duty and the three limits) |
| Banned-word ratchet | passes, baseline unchanged at 2 |
| Rules + inbox + banned-word suites | **252 pass, 14 suites** |
| `tsc --noEmit`, CI flags, 8192MB heap | clean |
| Live replay, 24 emails | 0 errors |
| Production SQL guards | 6 of 6 return 0 rows |

A test now asserts the rules do **not** forbid troubleshooting
(`expect(CORA_PROMPT_RULES).not.toMatch(/do not troubleshoot software/i)`), so a later
edit cannot quietly turn the duty back into a refusal.

## Needs Ali

1. **Claude Code plan tier contradiction, and it is a money question.** The knowledge base
   says the Claude Code subscription is **"~$20/month"**; `seedClassReadinessCampaign.ts`
   tells enrolling students they need a **"Claude Code paid account (Max or Team plan)"**.
   Those are different tiers at very different prices. Cora is quoting the $20 figure to
   students today. If the program actually needs Max, we are understating what the course
   costs someone. No troubleshooting answer added here states a tier, deliberately, until
   this is settled.
2. **Who owns setup support?** The new entries inherit the owner of `Portal login issues`,
   which concentrates more mail on one person. Six of twenty replies already routed there.
3. Still open from part 3: the four facts holding four answers inactive (next Open House
   date, cohort end date, Expo date, signed refund policy), and whether
   `payments@colaberry.com` and `admissions@colaberry.com` are monitored.

`CORA_DRY_RUN` is still `true`. Nothing was sent.

---

## Deploy, 2026-11-16 05:52 Central

PR [#4096](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4096)
merged as `8f1ebb4df` at 11:40:29Z. **Verified live: 32 of 32 checks pass against the
deployed build, prompt 19,223 chars, `CORA_DRY_RUN` still `true`.**

### Honest record of how it actually shipped

My own deploy command **refused**, and correctly. By the time it ran, two more merges
(#4097, #4098) had moved main to `e10600d7b` and then further to `8490e46b7`, and
`deploy-prod.sh`'s registry check found no published image for that newer tip:

```
[deploy] registry mode: verifying published images match 8490e46b7473...
exit 1
```

The change was already live anyway. **Another session's deploy, 22 seconds earlier at
11:52:43Z, carried it** — their image was built from a commit containing this merge.
Confirmed by reading the running container rather than inferring from the deploy log:

```
docker exec accelerator-backend grep -c 'Troubleshooting is your job' \
  /app/dist/services/coraPromptRules.js   # 1
docker exec accelerator-backend grep -c 'do not troubleshoot software' \
  /app/dist/services/coraPromptRules.js   # 0
```

Two operational notes worth keeping:

1. **The wrapper's own `git pull` broke the first attempt** with `fatal: Cannot rebase
   onto multiple branches`. This host has `pull.rebase=true` globally and a concurrent
   fetch had left more than one branch in `FETCH_HEAD`. The pull was redundant:
   `deploy-prod.sh` pulls `origin/main` itself, under its own lock and guards. Removed.
2. **On a busy main, "did my deploy run" and "is my code live" are different questions.**
   The honest answer came from the container, not from the exit code.

### Verified against the deployed build: 32 of 32

Beyond the #4080 checks, the verifier now asserts the reversal itself: troubleshooting is
stated as her job, **the old blanket refusal is gone**, the three limits are present,
another program's tools keep a person, the support@ echo is forbidden, `needs_human`
covers troubleshooting, and all five new knowledge base answers are in the prompt.

**A check of mine was wrong again, and this is the third time.** Two assertions scanned
the *whole prompt* for "once you are enrolled" and for `support@colaberry.com`, and failed
— because **rule 6 quotes that phrase in order to ban it and rule 8 names that address in
order to forbid it.** The rules were flagged for containing the things they prohibit. The
production SQL guards over the answers had already returned 0 rows, which is what exposed
it as an instrument fault rather than a content defect. Both assertions now scan only the
knowledge base section of the prompt.

A separate scoring bug: `coraReplay.js` does not carry the `synthetic` flag through, so a
first pass counted the 4 probes among the 20 real emails and computed the probe statistics
over an empty array, where `.every()` returns true. Re-scored by probe id.

### The same 20 real emails plus 4 probes, through the deployed code

| | #4080 deployed | Now |
|---|---|---|
| Compliance violations, 20 real | 2 | **1** |
| Hand-offs, 20 real | 18 | **16** |
| Probe violations | n/a | **0 of 4** |
| Probes keeping a person | n/a | **4 of 4** |
| Generation errors | 0 | **0** |

The enforcement fired in production and logged itself:

```
[InboxCOS][Cora] {"event":"cora_rule_violation","outcome":"partial",
 "error_class":"ContractViolation","rules":["advertises_free"],"forced_needs_human":true}
```

Every violating reply is routed to a person; nothing leaked.

The four replies that resolve without a person are all legitimate: **Michael** gets the
Docker download, "run it until it reports that it is running", the GitHub step and the
portal link — he asked for exactly that and had been getting a referral; **Genay** gets
the reinstall list for her replacement laptop; and the vendor and the sponsorship spam are
closed declines that cost nobody any time.

All four probes got real help. The Docker probe diagnosed it outright: *"It sounds like
Docker Desktop might not be running, which can cause the 'cannot connect to the Docker
daemon' error."*

### One judgement call for Ali to confirm or tighten

The SSRS probe got **three generic SSRS steps** — check the subscription is active, verify
the SMTP settings, look at the report history — which are general knowledge rather than
knowledge base content. She did keep a person on it, and first-line help on bootcamp tools
is what was asked for on 2026-11-16, so this looks like the intended behaviour. But it is
the boundary of "help as far as the knowledge base takes you", and it is worth a look.
Tightening it means saying so; the rule can name it in a line.

`CORA_DRY_RUN` is still `true`. Nothing was sent, no database row was written, and every
file carrying student data was removed from the host and the container afterwards.
