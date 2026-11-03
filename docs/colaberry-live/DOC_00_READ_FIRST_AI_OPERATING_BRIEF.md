# DOC 00 — READ FIRST: Colaberry Live AI Operating Brief

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1 |
| **Basecamp ticket** | L11.8 |
| **Owner** | Ali Muwwakkil |
| **Written** | 2026-11-03 |
| **Status** | Current as of 2026-11-03. State claims below carry their own dates. |

**If you are a Claude Code session opening the Colaberry Live project for the first time, read this
document before anything else.** Every AI-executable todo on the board links here. It exists so that
a session with no chat history can start work safely, pick the right next ticket, and not rebuild
something that already exists.

---

## Mission

Colaberry Live is the operational home for the Colaberry Live broadcast platform: a live class that
Ali creates the way he creates an Accelerator Session, customizes through a Session Timeline, airs
through the app from Zoom via Cloudflare Stream Live, interacts with through prompts, polls and a
phone companion, ends, processes into a replay, and hands into a long-form plus Shorts production
workflow.

The bootstrap states the completion test directly: Ali must be able to create a live session,
customize the show through the Timeline, generate the viewer and companion experience
automatically, rehearse it, go backstage, go live through the app, stream Zoom through Cloudflare
Stream Live, distribute to YouTube, interact with the audience, end the show, process a replay, and
hand the recording into production.

**This is not a greenfield rewrite.** The existing repository is the source of the work. Basecamp is
the project-management and AI-handoff layer around it.

---

## Launch deadline

**The hard deadline was October 31, 2026 (bootstrap §7, R9). It passed without a public production
airing.**

That is stated plainly here because every status document in this program is read by someone
deciding what to do next, and a passed deadline changes that decision. As of 2026-11-03:

- R9 (rehearsal and go-live) is not met.
- No public production airing has happened. One private airing happened on 2026-10-20.
- **10 of the 48 definition-of-done conditions are satisfied** (`docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md`,
  counted 2026-11-03).

The deadline is not re-set in this document. Setting a new launch date is Ali's call, not a
document's.

---

## Repository

```
ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator
```

**Do not create a new Colaberry Live repository.** The bootstrap is explicit: the Story-Build
"repo + deploy" rule is satisfied by this existing Enterprise repo and its existing production
deployment.

Broadcast code lives under `backend/src/services/broadcast/`, `backend/src/services/classKit/` and
`frontend/src/components/portal/`. Work happens on a `workstream/*` branch and merges to `main` via
pull request. Only `main` deploys to production.

---

## Basecamp members

Basecamp project **49210714** — *Colaberry Live*.

| Person | Basecamp ID | Role |
|---|---|---|
| Ali Muwwakkil — ali@colaberry.com | `17454835` | Executive sponsor, final approval, technical owner |
| Piyush Prajapati — piyush@colaberry.com | Resolve live via `/people.json` — **do not guess** | Videography, studio production, AI avatar, recording quality |
| Sohail Syed — sohail@colaberry.com | `47335940` | Marketing, distribution, campaign, audience growth |
| Mohammed Abdul Aleem — aleem@colaberry.com | `47335967` | Creative, UI/UX, broadcast graphics, visual review |

Access is deliberately narrow. Do not grant broad company access and do not invite unrelated
employees.

---

## Current architecture

```
Zoom → RTMP → Cloudflare Stream Live → HLS → signed/expiring playback → Colaberry persistent player
```

- **Zoom** is the interactive production source.
- **Cloudflare Stream Live** is the public and in-app delivery layer.
- **YouTube is a distribution output, not the source of truth.**

Colaberry remains authoritative for session, broadcast occurrence, access, prompts, participation,
build progress, community, replay metadata and Architect conversion.

The broadcast subsystem is **provider-independent by design**, and selecting Cloudflare did not
change that. Cloudflare is implemented behind the provider adapter. The full contract — lifecycle
states, access modes, the playback grant, what must be preserved — is DOC 02.

---

## Source-of-truth hierarchy

When two sources disagree, the higher row wins. This ordering is the single most useful thing in
this document, because most wasted work in this program has come from trusting a status claim over
the code.

| Rank | Source | Authoritative on |
|---|---|---|
| 1 | **The code**, and the tests that pin it | What the system actually does. Beats every document about state, including this one. |
| 2 | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` | Scope, release order, ownership, the test ladder, the 48-point definition of done. What the program *must* become. |
| 3 | `docs/requirements/CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md` | Repository implementation tasks: seven phases, 56 parent tasks `P1-01 … P7-08`. The `P3-09`-style keys in the source are these task IDs — a real traceability axis, not stale naming. |
| 4 | `docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md` (DOC 09) | The counted definition of done. Generated — never hand-edited. |
| 5 | `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` | The maintained analysis of where the program actually is. Sections carry their own dates; trust a dated section over an undated one. |
| 6 | **Basecamp board 49210714** | The work queue and the owner of record. |
| 7 | `CLAUDE.md` | How to work in this repo. Governs everything above procedurally. |

**Two standing cautions about rank 6.** The board *lags the code*: on 2026-11-03, ten of its
thirty-nine open tickets already held finished work. And the board *understates scope*: five
required deliverables have no ticket anywhere on it (see **Current known blockers**). A board can
never show either fact about itself.

---

## How Claude Code should start a session

1. **Read `CLAUDE.md` fully** — the project's operating contract. It governs autonomy, testing,
   idempotency, the progress-log gate and the deployment gates.
2. **Mint a session ID**: `CC-<YYYYMMDD>-<4 random alphanumerics>`. Check `docs/sessions/` first so
   you do not reuse one. Several Claude instances run against this repo at once.
3. **Read this document (DOC 00) and DOC 09, the traceability matrix.** DOC 09 tells you what is
   actually satisfied; this document tells you how to behave.
4. **Read `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` §8** — "What is actually built". Every row is BUILT,
   PARTIAL or NOT BUILT with a file citation.
5. **Inspect the code before proposing any change.** The bootstrap says this twice and it is the
   rule most often skipped: *"Before implementing any ticket, inspect what is already built."*
   Several capabilities in this subsystem were complete server-side with no reader, which looks
   identical to "not built" from a ticket title.
6. **Do not reimplement an existing capability**, and do not break the provider abstraction.
7. Log work to `docs/sessions/CC-<id>.md`. **`PROGRESS.md` is sealed** — do not append to it.

---

## How to choose the next ticket

The bootstrap (§16) gives the selector, in strict order. Apply it top down and stop at the first
that discriminates:

1. **Launch blocker**
2. **Dependency unlock**
3. **External prerequisite**
4. **Provider spine**
5. **Testability**
6. **User-facing orchestration**
7. **Production polish**

Then apply the three filters that this program has learned the hard way, because a ticket can score
highly on all seven and still be unworkable today:

- **Is it owned by a person other than you?** Ten open tickets belong to a named human (studio
  install, avatar recording, operator manual). No amount of repository work substitutes.
- **Does it require an airing that has not happened?** Twelve open tickets are airing-gated. They
  cannot be closed by code.
- **Does it require a decision that is Ali's?** See `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` §10.

What remains is the workable queue. **Do not stop and ask Ali what to do next if the next task is
deterministically clear** — the bootstrap says so explicitly, and so does `CLAUDE.md`'s autonomy
model.

---

## How to update and close tickets

At the end of every work unit:

1. Update the Basecamp ticket.
2. Attach or link the evidence.
3. Update the status.
4. **Close only if done.**
5. Sync the project documents if the architecture changed.
6. Select the next highest-priority unblocked ticket.

**Four conditions must all hold before a ticket closes** (bootstrap §5): the artifact exists, the
acceptance criteria pass, evidence is attached or linked, and the Basecamp status matches reality.

**Never collapse the shipping ladder into "done".** Built, tested, merged, deployed and
production-verified are five different states, and this program has tickets sitting in each.

**In this repo, Claude Code does not close Basecamp tickets.** Work a ticket to a review state,
post the evidence, and stop. Closing is Ali's call. Bulk Basecamp writes as Ali are refused by the
tooling, by design.

---

## How to write evidence

**Every task must produce at least one durable artifact, named before the task starts.** A ticket
with no artifact is incomplete even if someone performed work.

Evidence has to be checkable by someone who was not there:

- **Name the artifact, with a path or a URL.** "Tests pass" is not evidence; a test name is.
- **A commit SHA or PR URL** for code. Full URLs, never a bare `#1234`.
- **For a screen**: the exact route, the role required, the screenshot, and the code path.
- **For external configuration**: the evidence with secrets removed. *No ticket may pretend an
  external admin setting was verified from repository code.*
- **For a claim about state**: say how it was established. A passing suite does not prove a stage
  whose criterion is that a failure mode be *exercised*.
- **Distinguish a measurement from a derivation.** Measure a delivered video's duration with
  `ffprobe`; do not compute it.

Acceptable artifacts include a commit or PR, an architecture diagram, a system document, an ADR, a
test report, an annotated screenshot, a recording sample, an equipment research matrix, an approved
purchase list, a receipt, an installation photo, a configuration export, an operator SOP, a
runbook, a production metrics snapshot, a replay URL, a transcript, a media brief or an executive
brief.

---

## External prerequisites

These cannot be satisfied from the repository. They need a human in a vendor console. Full detail
in DOC 02 and DOC 08.

**Cloudflare** — confirm Stream is enabled; create and retrieve API credentials; store them only in
approved secret storage or the production environment; validate API permissions; create a test Live
Input; confirm signed playback; confirm VOD recording behavior; confirm billing visibility.

**Zoom** — verify the account supports **Live Streaming to a Custom Service**; enable it at the
correct account, group or user scope; verify custom RTMP can be configured for Ali's class host;
verify the existing Server-to-Server OAuth and recording configuration remains intact; verify no
change regresses Zoom cloud recording; validate student and guest audio and Ali's share behavior;
document the fallback if custom RTMP is unavailable.

**YouTube** — verify channel ownership and access; verify live-stream eligibility; verify the stream
destination; document stream key and API handling; verify a test or unlisted live event; verify
post-live replay ownership.

---

## Production safety rules

- **Deploy only through `scripts/deploy-prod.sh`.** On the host, invoke it as
  `bash scripts/deploy-prod.sh`. `DRY_RUN=1` is **not** honored.
- **Never run two deploys concurrently.** Two `compose up` invocations race and have produced
  Cloudflare 521s and a shared-Postgres OOM cascade.
- **Verify `HEAD` on the box equals `origin/main` before trusting a deploy.** A dirty production
  tree rebuilds stale code and reports success.
- **A 502 in the 60–90 seconds after a backend deploy is timing, not failure.** Wait before
  diagnosing.
- **Access must remain fail-closed.** Every change near entitlement has to be tested for the
  unauthenticated and un-entitled caller, not only the happy path.
- **No secrets in source, in logs, in error messages or in commit history.** Cloudflare and Zoom
  credentials live in the production environment only.
- **Integration tests must never touch production.**
- **Merging a pull request is Ali's click.** Do not merge your own work.
- **Flag ordering matters.** `broadcastHealthLoop.ts` reads `BROADCAST_ENABLED` **once at boot** and
  schedules nothing when it is off. Turning the flag on during a class means the health loop never
  runs, nothing writes `provider_health`, and `go_live` refuses with `ProviderNotReady`. Enable the
  flag and restart *before* an airing, never during one.

---

## Current known blockers

Dated 2026-11-03. Re-derive from DOC 09 rather than trusting this list after a week.

**The cheapest blocker in the whole program, and it gates R9 completely:**

> **Item 6 — Zoom custom RTMP is verified and usable.** The Zoom *account setting* is done (L1.1).
> The operator half — which client, signed in as whom, on what license — has never been confirmed by
> the host seeing the menu item in a throwaway meeting. That is what made the 2026-10-29 airing fail
> to stream: the host was signed in from something other than the Zoom desktop client and had no way
> to start the stream. **Ten minutes of Ali's time. No repository work substitutes for it.**

**Structural blockers:**

| Blocker | Consequence |
|---|---|
| No public production airing has happened | R9 is unmet, and twelve open tickets cannot be closed by code |
| **There is no timeline runtime** | DOC 03 requires a timeline that drives thirteen things. The show moves only when the presenter presses a key. See DOC 03. |
| The studio is not installed (L6.2, L6.3 — Piyush) | Blocks Test 4, the operator manual (DOC 13) and five launch tickets |
| Avatar and voice work not started (L9.1–L9.4) | R6 unmet. L9.1 needs a vendor-workflow check on the execution date. |
| Entitlement has never been exercised against a real paywalled airing (L10.7) | The fail-closed guarantee is asserted by tests, not by production |

**Five required deliverables have no Basecamp ticket at all**, measured against all 61 todos, done
and open:

| What | Why it has no ticket |
|---|---|
| Definition-of-done item 17 — the Claude pathway works | Specified in requirements §9 and DOC 04; L7.3 is the timeline and does not mention it |
| Item 18 — the Claude Code desktop pathway | DOC 04's two phone actions, "Open in Claude" and "Save Claude Code version for later", neither built nor ticketed |
| Item 19 — Builder Room at the agreed access tier | The thread exists; nothing reads `access_mode` |
| Item 40 — the Ali + Piyush recorded walkthrough | L11.6 is the Ram briefing, which is item 44 |
| **DOC 10 — the Current Build Migration Report** | Required by bootstrap §17 as a named deliverable. L11.8 covers DOC 00–08; no ticket covers DOC 10. Found 2026-11-03. |

---

## Index of every project document

Eighteen documents are required by bootstrap §3.1 and §17. Status as of 2026-11-03.

| DOC | Title | Ticket | Where it is |
|---|---|---|---|
| **00** | READ FIRST — AI Operating Brief | L11.8 | `docs/colaberry-live/DOC_00_READ_FIRST_AI_OPERATING_BRIEF.md` — this file |
| **01** | Requirements & Product Vision | L11.8 | `docs/colaberry-live/DOC_01_REQUIREMENTS_AND_PRODUCT_VISION.md` |
| **02** | Broadcast Architecture & Security Contract | L11.8 | `docs/colaberry-live/DOC_02_BROADCAST_ARCHITECTURE_AND_SECURITY_CONTRACT.md` |
| **03** | Session + Timeline + Broadcast Orchestration | L11.8 | `docs/colaberry-live/DOC_03_SESSION_TIMELINE_BROADCAST_ORCHESTRATION.md` |
| **04** | Viewer Experience + Phone Companion | L11.8 | `docs/colaberry-live/DOC_04_VIEWER_EXPERIENCE_AND_PHONE_COMPANION.md` |
| **05** | Studio, Equipment, OBS, Zoom & Piyush Requirements | L11.8 | `docs/colaberry-live/DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM.md` |
| **06** | AI Avatar + Voice AI Recording & Training | L11.8 | `docs/colaberry-live/DOC_06_AI_AVATAR_AND_VOICE.md` |
| **07** | YouTube, Media Production & Weekly Content Engine | L11.8 | `docs/colaberry-live/DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md` |
| **08** | Test Plan, Failure Drills & Launch Runbook | L11.8 | `docs/colaberry-live/DOC_08_TEST_PLAN_FAILURE_DRILLS_LAUNCH_RUNBOOK.md` |
| **09** | Traceability Matrix | L0.4 | `docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md` — **generated, do not hand-edit** |
| **10** | Current State Migration Ledger | **none** | **Not written.** Required by §17. No ticket covers it. |
| **11** | System Architecture Handbook | L11.1 | `docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md` — **read this second**, after DOC 00 |
| **12** | Architecture Diagrams | L11.2 | Not written — ten diagrams, Mermaid source plus rendered |
| **13** | Ali + Piyush Studio Operator Manual | L11.3 | Not written — needs the studio installed (L6.3) |
| **14** | Developer & AI Maintenance Runbook | L11.4 | Not written — needs DOC 11 |
| **15** | Testing Strategy & Evidence Matrix | L11.5 | `docs/COLABERRY_LIVE_TESTING_STRATEGY.md` — **generated** |
| **16** | Ram Executive Brief | L11.6 | Not written — needs DOC 12's diagrams |
| **17** | Case Study Source Pack | L11.7 | Not written |

**Twelve of eighteen written.** Rebuild the index with
`node scripts/artifacts/buildL118Artifacts.js`, which checks every row above against the disk in
both directions — a document that lands here without a ledger row fails the build.

**DOC 11 carries a capability proof register**: all 28 capability claims in the system with the
level of proof behind each. **4 have run in a real airing; 10 have never run at all.** Read it
before trusting any "it works" in this program — including the ones in this document.

Related, not part of the eighteen: `docs/COLABERRY_LIVE_PROGRAM_SPEC.md` (the maintained state
analysis), `directives/go-live-colaberry-live-broadcast.md`,
`directives/rehearse-colaberry-live-airing-procedure.md`,
`directives/run-open-house-live-experience.md`, `docs/broadcast/ROLLOUT_RUNBOOK.md`.
