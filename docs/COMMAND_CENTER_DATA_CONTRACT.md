# Command Center Data Contract

**Status:** v1 of this document · plan.json `schema_version: 2` · progress.json `schema_version: 2` · profile.json `schema_version: 1`

This is the contract between the platform and the page a student builds in STORY-000. It defines what ships into a student's repo, who owns which fields, what is guaranteed when we change the shape, and — the part that matters most — what a Command Center honestly **cannot** know.

---

## Why there is no API

A student's Command Center is a static page served by **GitHub Pages out of their own repo**.

A static page cannot hold a secret. There is no server to keep a token on, no session, nothing between the page and the reader. Anything the page is given, its reader is given: view-source, devtools, the network tab. So the page cannot authenticate to us, which means it cannot call an authenticated API, which means **the data has to ship with the page**.

That is the whole reason these files exist. Not caching, not performance. The alternative designs were considered and each fails on the same point:

| Alternative | Why not |
|---|---|
| Page calls our API with a student token | The token is in the page. It is a public credential the moment Pages serves it. |
| Public read-only API keyed on project id | An unauthenticated endpoint that returns a student's plan by id is an enumeration target, and the plan can name their employer's internals. |
| Page proxies through a serverless function | Now the student owns a deployed backend and a secret, which is a different course. |
| Data injected at build time by a CI step | This is the same as committing files, with more moving parts and no idempotency guarantee. |

Committing files also buys three things an API would not: the data is **versioned in git** alongside the code that renders it, it **works offline**, and it is **inspectable by the student**, which is pedagogically the point.

The cost is honest and stated everywhere: the data is **as of the last sync**, not live. See [Freshness](#freshness).

---

## The three files

Every file lives under the platform write allowlist (`CLAUDE.md`, `docs/**`, `.colaberry/**`). Everything else in the repo is the student's.

| File | Owner | Write rule | Changes when |
|---|---|---|---|
| `.colaberry/plan.json` | Platform-seeded | Replaced wholesale | The plan is republished |
| `.colaberry/progress.json` | **Co-owned** | Merged field by field | A story's verification state moves |
| `.colaberry/profile.json` | **Student** | Seeded once, never overwritten | Only when the student edits it |
| `.colaberry/manifest.json` | Platform-seeded | Rides along with any change | Any of the above changes |

Three files because there are exactly three ownership rules, and one file cannot have three.

### "Platform-seeded" is not "platform-guaranteed"

The first and last rows used to read **Platform**, flatly. That was true of the intent and false of the outcome, and the gap mattered: STORY-000's acceptance criteria ask the student to attest that `plan.json` and `manifest.json` are in their repo, while this table told them those files were ours and none of their business. 8 of 9 students created `manifest.json` themselves anyway; one read this sentence the way it was written and did not.

The platform writes all three **only where it holds push access**. On a bring-your-own repo where `permissions.push` is false — a legitimate choice, not an error — `writeDocsToRepo` fails at the GitHub boundary and the files never arrive. There, they are the student's to obtain from the docs bundle (`GET /api/portal/workspace/docs/bundle`, surfaced as "Download the documents" in the workspace panel) and commit like any other file.

So: **platform-seeded where we can write, student-supplied where we cannot, and required in the repo either way.** `criterionPaths.ts` enforces the second half of that sentence and is careful never to charge a student for a file we could have written and did not — see its `blameForMissing`.

### Why `progress.json` is co-owned

The platform owns the story list and the exact text of each acceptance criterion. **Claude Code, running in the student's repo, owns the completion side**: which criteria now pass, which files it touched, which tests it added.

`mergeProgressFile` keeps that split on every write. Without it, republishing a plan would silently wipe every tick the student's agent had recorded, and a student would open their repo to find work they had genuinely done reported as not started.

| Field | Owner | On republish |
|---|---|---|
| `schema_version`, `project`, `totals` | Platform | Replaced |
| `stories[].id`, `.release`, `.acceptance_total` | Platform | Replaced |
| `stories[].criteria[].text` | Platform | Replaced |
| `stories[].criteria[].passed`, `.evidence` | **Agent** | **Carried across** |
| `stories[].files_touched`, `.tests_added`, `.notes`, `.updated_at` | **Agent** | **Carried across** |
| `stories[].verification` | Platform | Replaced |

`verification` is deliberately on the platform side. It is our conclusion about the student's evidence — if merge read it back out of the repo, the file could assert its own verification, and a student could type `"state": "verified"` and have it stick. Criteria are matched by **normalised text**, so an agent that reorders or rewraps them still lands on the right criterion, and a criterion the plan has since **reworded** is intentionally not carried over: the sentence they ticked is not the sentence now being asked for.

**With exactly one exception, and it is a hand-audited list rather than a rule.** When the PLATFORM rewrites one of its own criteria — as it did to STORY-000's C3 and C4 on 2026-08-19 — the students who ticked the old sentence did nothing wrong, and their files sit in repos we frequently cannot push to and can therefore never correct. `SUPERSEDED_CRITERIA` in `backend/src/services/sbp/verification/criterionIdentity.ts` maps each exact historical sentence to the criterion it became, and `resolveCriterionKey` consults it in **both** `decideStory` and `mergeProgressFile` — both, because closing only the matcher would still let the next sync write `false` over a student's real work. An entry can only ever resolve onto a criterion the plan already asks for, so it can never invent one; a criterion reworded *without* an entry still fails, which is what keeps the paragraph above true in general. The table is append-only and permanent.

### Why `profile.json` is seeded once

A portfolio carries editorial choices — which build to lead with, how to describe an employer, what the hard part actually was — and none of that is derivable from a plan. It also carries **consent**, and consent the platform can overwrite is not consent.

So the platform writes this file exactly once, when it does not exist, and treats it as read-only from then on. The seed embeds the repo URL, which means a repo rename changes the seed's bytes and would otherwise drag the file back into the change set; `repoWriter` drops it from the write set whenever the repo already has one.

---

## Freshness

**The stamp lives in `.colaberry/manifest.json` → `generated_at`, and nowhere else.**

This is a design constraint, not a convention. `repoWriter.changedFiles` decides whether to commit by hashing file contents. Any field that moves when the build does not — a "checked at", a run id, a rendered-at clock — turns **every sync into a commit that says nothing**, churning the student's git history forever. The manifest is the one file excluded from that comparison, precisely so it can carry the clock.

Consequences, stated plainly because the page must not paper over them:

- `generated_at` is **when the data last changed**, not when the student last synced. A sync that finds nothing new writes nothing and leaves the stamp alone.
- Therefore an old stamp means **either** "nothing has happened" **or** "you have not synced", and **the page cannot tell which**.
- STORY-000 requires the page to word it **"Data as of …"**, never "Last synced …", to show an absolute date alongside the relative age, and to escalate to a visible warning past about a week. Prompting a sync in the ambiguous case is the safe direction: a student who syncs unnecessarily loses nothing, a student reading a confidently stale dashboard loses trust in the whole thing.

---

## Versioning: what is guaranteed

Both data files carry `schema_version`.

**Guaranteed for the life of a major version:**

1. **Fields are only ever added.** A field that exists keeps its name, its location in the tree, and its meaning.
2. **A page written against v1 keeps working against v2.** v1 of `plan.json` was a bare serialisation of the plan, so `project_name`, `descriptor`, `requirements`, `releases` and `stories` sit at the **root**. v2 adds beside them and never moves them.
3. **Readers accept older files.** Our parser accepts any version from `MIN_READABLE_PROGRESS_VERSION` up to current, and refuses only files from the **future**. The asymmetry is deliberate — an over-strict equality check is what would make a schema bump wipe every student's ticks, because merge falls back to the fresh render when it cannot parse the existing file.
4. **Enum values are added, not repurposed.** `verification.state` may gain a value; the four current ones keep their meanings.

**Not guaranteed — may change without a major bump:**

- The **contents** of `derived.*`. The extraction heuristics improve, so `systems` may gain or lose a name.
- The **ordering** within arrays (currently sorted by id/key; treat as unspecified).
- Anything under `totals` beyond the documented keys.
- Whether an **optional** field is present at all. `verification` is absent until a verification run has happened. Treat absent and zero as different: absent means not measured, zero means measured as zero.

**Advice given to students in STORY-000:** read the fields you know, ignore the ones you do not, and render anyway if `schema_version` is higher than the one you built against.

**Rollback note:** a file written by v2 and read by a rolled-back v1 backend is refused with `ProgressFileUnsupportedVersion`. That fails safe — it never revokes a verification — but it does mean a rollback should be followed by a republish.

---

## What the Command Center CAN show

From `plan.json`:

- The project name and descriptor, the full requirement set with kind, priority, cluster, and **which stories fulfil each** (`fulfilled_by`) — the traceability view.
- Releases with `starts_on`, `ends_on`, `story_ids`, and which one is `is_demo_target`.
- The schedule: `build_start`, `build_end`, `demo_day`, `demo_release_key`.
- Per story: title, narrative, acceptance criteria, task guidance, failure paths, blockers, `due_on` **and** `due_baseline_on` — the pair that makes slippage visible.
- The agent roster with triggers, autonomy level, approval gates, escalation rules, and owned stories.
- `derived`: the measures, guardrails, systems and roles, extracted once by us so every student's page agrees.

From `progress.json`:

- Per story: `state`, criteria passed of total, what is `outstanding`, `verified_at`, the `commit_sha`, a clickable `commit_url`, and `points_awarded`.
- `totals` for the headline.

## What it CANNOT show, ever

This list is not a backlog. These are facts the files structurally do not contain, and a page that displays them is displaying an invention.

| Cannot show | Why |
|---|---|
| **The actual value of any KPI** | We hold the target the student committed to, never the measurement. That comes from the system they build, once it runs. Show "not measured yet", never `0` — a zero reads as a real result. |
| **Whether an integration is connected** | `derived.systems` is a list of *names taken from requirement text*. Nothing in the repo can reach HelloSign. Indicators stay grey and labelled "not checked from here". |
| **Agent run history, success rates, last-run times** | No agent has run. There is no telemetry, because there is no deployed system yet. Show "no runs recorded", never a 0% success rate. |
| **Whether the code is any good** | See "What 'verified' means" below. |
| **Live anything** | Data is as of the last sync, full stop. |
| **When the student last synced** | Only when the data last *changed*. See [Freshness](#freshness). |
| **Anything about other students or the cohort** | Not in the files, by design. |

---

## What "verified" means, and what it does not

This matters most on a profile, where the word is read by someone deciding whether to interview.

**Verified means:** the platform read the student's repo and found (a) every acceptance criterion for that story ticked in `progress.json`, **and** (b) a pushed commit naming that story that changed at least one file. Both halves. The commit sha is recorded and frozen at award time.

**Verified does not mean:**

- that the code is good, idiomatic, secure, or performant;
- that tests pass, or that meaningful tests exist — CI is explicitly not the bar today;
- that a human reviewed it;
- that the acceptance criteria were themselves well written;
- that the student could not have ticked the boxes dishonestly. They could. `progress.json` is a file in their own repo.

The defence is an **audit trail, not a proof**: the criteria come from the plan rather than from the file, invented criteria are rejected rather than counted, and every award names the commit behind it. This is a learning platform, not a payments system, and the defences are sized accordingly. See `docs/BUILD_VERIFICATION_CONTRACT.md`.

**A profile must therefore claim exactly this and no more.** "Verified against commit `4c1f9ab`" is true and checkable. "Verified working system" is not. Overclaiming on a document someone carries into an interview is worse than underclaiming, because it fails under exactly the scrutiny it was built to invite.

---

## The portfolio profile

The Command Center is for the builder while building. The profile is for a stranger deciding whether to interview them. Same data, different question, and a materially different consent situation.

### What makes a claim worth anything to a hiring manager

**Third-party verifiable without a login.** A hiring manager will not create an account on our portal. So every claim on a profile must be checkable from public artifacts: the repo, the commit, the story file, the live Command Center. This is why `verification.commit_url` is an absolute URL and not a bare sha — a sha is a citation only to someone who already has the repo open.

**Evidence of rigour is the differentiator.** What separates this from "I did a tutorial" is already in the data and needs no invention:

- requirements traced to stories (`requirements[].fulfilled_by`) — most portfolios have no requirements at all;
- a guardrail the student designed *and* enforced (`derived.guardrails` joined to the stories that fulfil it, and whether those are verified);
- failure paths handled per story (`stories[].failure_paths`, `derived.counts.failure_paths_total`);
- agents scoped with explicit autonomy limits and approval gates (`agents[]`, `derived.counts.agents_by_autonomy`) — designing an agent that is *deliberately not* autonomous is a judgement call worth showing.

**A skills view, reported not self-assessed.** Derive it from what the build actually contains: systems integrated (`derived.systems`), the kind of judgement automated (`agents[].purpose` and `autonomy_level`), the safety reasoning applied (`derived.guardrails`, `approval_gates`). Do **not** invent a skills taxonomy and do **not** render proficiency levels — "integrated HelloSign" is a fact, "HelloSign: Advanced" is a fabrication.

**Narrative, in the student's own words.** A dashboard says 12 stories and 67 points. A profile has to answer *what did you build, for whom, and why was it hard*. That content is genuinely valuable and it lives in `build_intake` today.

### Recommendation on what to publish — and the honest limit of it

**The problem.** A corporate learner's requirements can name their employer's internal systems and processes, and carry real operating numbers ("signature to kickoff drops from 9 days to 2"). Publishing that verbatim on a document we encourage them to send to recruiters could be a genuine problem for them at work. Meanwhile those same requirements are already sitting in `plan.json` in a repo that is public by default.

**Recommendation, in four parts.**

**1. Do not render the profile from `plan.json`.** Render it from `profile.json` (curated) joined with the *structural* facts, honouring the `include` flags. Two reasons, and the first is decisive: `plan.json` is ours and rewritten wholesale, so a student **cannot** redact it — any edit is overwritten on the next sync. A layer the student can actually control is a prerequisite for consent, not a nicety.

**2. Seed the narrative empty and have the student write it.** Do not auto-copy intake answers into a published profile. This is not only the safe choice, it is the better one: a summary in the student's own words is what a hiring manager wants to read, and the exercise of writing it is worth more than the paragraph. The intake answers remain available in the portal as a *prompt* for that writing — "you said the hard part was X, want to lead with that?" — which keeps the value without publishing their employer's phrasing.

**3. Default everything closed, opt in per category.** `disclosure: "private"` and all four `include` flags `false` on seed. Split rather than one switch because the categories carry very different risk: the *shape* of a build (12 stories, 3 guardrails, 8 verified, 2 systems, autonomy split) identifies nobody and is already impressive; a verbatim NFR with a real before-and-after number can identify an employer's operations to anyone in that industry. A student should be able to publish the first without the second.

**A profile stripped of specifics is worthless, so the default tier is deliberately not empty.** With every flag off, a profile can still show: the project descriptor the student wrote, story and release structure, verified counts with clickable commits, requirement *kinds and counts*, guardrail *count*, failure-path count, the agent roster's autonomy design, and the student's own headline, summary and challenge. That is already far beyond a typical portfolio.

**4. State the limit rather than implying a guarantee.** The `include` flags govern **what a published profile restates**. They cannot un-publish bytes already sitting in a public repo — `plan.json` is right next to `profile.json` and carries the verbatim requirements. **The control for the repo is repo visibility; the control for the profile is these flags.** Two exposures, two controls, and conflating them would be exactly the kind of false assurance that gets someone in trouble at work.

### Open risk, flagged rather than silently accepted

**Corporate learners' plans are in public repos today, before any profile exists.** That exposure predates this work and is not fixed by it. The recommended follow-up, which needs a decision rather than a patch:

- ask the disclosure question at **intake**, not at profile time, since that is when we learn the project is employer-internal;
- default employer-internal projects to a **private repo**, and accept that their Command Center then runs locally rather than on Pages (GitHub Pages on a private repo needs a paid plan);
- for those students, the profile becomes the *only* public artifact, which is the right shape anyway — curated, consented, and separate from their working repo.

This is a governance decision about defaults and cost, so it is escalated here rather than chosen in code.

---

## Worked example

Generated by the code, not written by hand. A one-story project, mid-build.

### `.colaberry/plan.json`

```json
{
  "schema_version": 2,
  "project_name": "Agreement to Onboarding",
  "descriptor": "Turns a signed agreement into a scheduled kickoff without anyone retyping it.",
  "requirements": [
    {
      "id": "REQ-001",
      "statement": "The system must create an onboarding record within 5 minutes of a signed agreement.",
      "kind": "FUNC", "priority": "must", "cluster": "Intake",
      "fulfilled_by": ["STORY-001"]
    },
    {
      "id": "REQ-002",
      "statement": "The system must never send a welcome pack for an unsigned agreement.",
      "kind": "SAFE", "priority": "must", "cluster": "Intake",
      "fulfilled_by": []
    },
    {
      "id": "REQ-003",
      "statement": "The system must reduce signature-to-kickoff from 9 days to 2 days.",
      "kind": "NFR", "priority": "must", "cluster": "Outcomes",
      "fulfilled_by": []
    },
    {
      "id": "REQ-004",
      "statement": "The system must read signed agreements from HelloSign.",
      "kind": "CONSTRAINT", "priority": "must", "cluster": "Intake",
      "fulfilled_by": ["STORY-001"]
    }
  ],
  "releases": [
    {
      "key": "r0", "name": "Walking skeleton",
      "goal": "One agreement becomes one onboarding record, audited.",
      "demo": "Sign a test agreement and show the record plus its audit line.",
      "week_start": 4, "week_end": 6,
      "story_ids": ["STORY-001"],
      "starts_on": "2026-08-27", "ends_on": "2026-08-27",
      "is_demo_target": true
    }
  ],
  "stories": [
    {
      "id": "STORY-001", "release": "r0",
      "title": "Create an onboarding record from a signed agreement",
      "narrative": "As an operations lead, I want a signed agreement to create the onboarding record, so that nobody retypes it.",
      "fulfills": ["REQ-001", "REQ-004"],
      "owner_agent": "AGENT-001",
      "acceptance": [
        "Given a signed agreement, when the webhook fires, then an onboarding record exists.",
        "Given an unsigned agreement, when the webhook fires, then no record is created.",
        "Trust — every created record names the agreement id it came from."
      ],
      "task_guidance": "Handle the HelloSign webhook, verify the signature, upsert on envelope id.",
      "failure_paths": [
        "HelloSign retries the same webhook twice",
        "The webhook arrives before the document is downloadable"
      ],
      "blocked_by": [],
      "due_on": "2026-08-27",
      "due_baseline_on": "2026-08-25"
    }
  ],
  "agents": [
    {
      "id": "AGENT-001", "name": "Agreement Reader",
      "purpose": "Reads a signed agreement and opens the onboarding record.",
      "trigger_type": "event", "trigger": "HelloSign envelope completed",
      "inputs": ["signed agreement PDF"], "outputs": ["onboarding record"],
      "autonomy_level": "acts_with_approval",
      "approval_gates": ["REQ-002"],
      "escalation_rules": ["the signer is not on the account"],
      "skills": ["pdf extraction"],
      "owns": ["STORY-001"]
    }
  ],
  "project": {
    "name": "Agreement to Onboarding",
    "descriptor": "Turns a signed agreement into a scheduled kickoff without anyone retyping it.",
    "repo_url": "https://github.com/acme-student/agreement-onboarding",
    "plan_version": 2,
    "plan_sha256": "9f2b7c…"
  },
  "schedule": {
    "build_start": "2026-08-20", "build_end": "2026-10-15", "demo_day": "2026-10-22",
    "build_weeks": 8, "demo_release_key": "r0", "roadmap_release_keys": [], "prep": []
  },
  "derived": {
    "measures": [
      { "id": "REQ-003", "statement": "The system must reduce signature-to-kickoff from 9 days to 2 days." }
    ],
    "guardrails": [
      { "id": "REQ-002", "statement": "The system must never send a welcome pack for an unsigned agreement." }
    ],
    "systems": ["HelloSign"],
    "roles": ["operations lead"],
    "counts": {
      "requirements_total": 4,
      "requirements_by_kind": { "CONSTRAINT": 1, "FUNC": 1, "NFR": 1, "SAFE": 1 },
      "stories_total": 1, "releases_total": 1, "agents_total": 1,
      "failure_paths_total": 2,
      "agents_by_autonomy": { "acts_with_approval": 1 }
    }
  }
}
```

Note `REQ-002`, the guardrail, has an empty `fulfilled_by`. That is a **real gap the page should surface**, not a row to hide: a safety promise with no story behind it is the most important thing on the screen.

### `.colaberry/progress.json`

```json
{
  "schema_version": 2,
  "project": "Agreement to Onboarding",
  "totals": {
    "stories_total": 1, "stories_verified": 1, "stories_submitted": 0,
    "stories_in_progress": 0, "stories_not_started": 0,
    "criteria_total": 3, "criteria_passed": 3, "points_awarded": 14
  },
  "stories": [
    {
      "id": "STORY-001",
      "release": "r0",
      "acceptance_total": 3,
      "criteria": [
        { "text": "Given a signed agreement, when the webhook fires, then an onboarding record exists.", "passed": true },
        { "text": "Given an unsigned agreement, when the webhook fires, then no record is created.", "passed": true },
        { "text": "Trust — every created record names the agreement id it came from.", "passed": true }
      ],
      "files_touched": ["src/webhooks/helloSign.ts", "src/onboarding/createRecord.ts"],
      "tests_added": ["src/__tests__/helloSignWebhook.test.ts"],
      "notes": "Upsert keyed on envelope id, so a replayed webhook is a no-op.",
      "updated_at": "2026-08-26T13:55:00.000Z",
      "verification": {
        "state": "verified",
        "criteria_passed": 3,
        "criteria_total": 3,
        "verified_at": "2026-08-26T14:02:11.000Z",
        "commit_sha": "4c1f9ab",
        "commit_url": "https://github.com/acme-student/agreement-onboarding/commit/4c1f9ab",
        "commit_at": "2026-08-26T13:59:02.000Z",
        "points_awarded": 14,
        "outstanding": []
      }
    }
  ]
}
```

The `criteria[].passed` values and the `files_touched` / `tests_added` / `notes` above are the **agent's** contribution, carried across by `mergeProgressFile`. The freshly rendered file always has them `false` and empty — that is the platform's side — and the merge is what produces the committed file shown here.

### `.colaberry/profile.json` (as seeded)

```json
{
  "schema_version": 1,
  "disclosure": "private",
  "headline": null,
  "summary": null,
  "challenge": null,
  "highlight_story_ids": [],
  "links": {
    "repo": "https://github.com/acme-student/agreement-onboarding",
    "command_center": "https://acme-student.github.io/agreement-onboarding/"
  },
  "include": {
    "requirement_statements": false,
    "measures": false,
    "systems": false,
    "narrative": false
  }
}
```

### Joining the two data files

They are **normalised, not duplicated** — neither repeats the other, and a page joins them on story id:

```js
const [plan, progress, manifest] = await Promise.all([
  fetch('.colaberry/plan.json').then(r => r.json()),
  fetch('.colaberry/progress.json').then(r => r.json()),
  fetch('.colaberry/manifest.json').then(r => r.json()),
]);

const progressById = new Map(progress.stories.map(s => [s.id, s]));

const rows = plan.stories.map(story => ({
  ...story,                                    // title, release, acceptance, due_on, due_baseline_on
  ...(progressById.get(story.id) ?? {}),       // criteria, verification, files_touched
}));

// Everything on screen is as of this moment, and only this moment.
const asOf = new Date(manifest.generated_at);
```

---

## Constraints on what may go in these files

**No secrets, ever.** These files are public by default on GitHub Pages. No tokens, no keys, no internal URLs, no connection strings. The platform never writes a credential into a student repo, and STORY-000 tells the student the same.

**No student PII beyond what they authored themselves.** No email addresses, no cohort rosters, no other students, no enrollment ids. `project.repo_url` and the student's own prose are the extent of it.

**Small enough to commit on every sync.** Both files are proportional to the plan (tens of stories, not thousands of rows) and carry no history, no logs and no per-run records. The size discipline and the no-churn discipline are the same discipline: what keeps these files small is that they hold current state only.

**Nothing volatile.** Restated because it is the invariant most easily broken by a well-meaning addition: **no field in `plan.json` or `progress.json` may carry a value that changes when nothing substantive changed.** No clocks, no run ids, no counters. Freshness lives in the manifest. A test asserts this by rejecting ISO timestamps in the rendered bytes.

---

## Where this is implemented

| Concern | File |
|---|---|
| plan.json shape and builder | `backend/src/services/sbp/planDocument.ts` |
| progress.json shape, parse, merge | `backend/src/services/sbp/verification/progressContract.ts` |
| profile.json shape and seed | `backend/src/services/sbp/profileContract.ts` |
| Assembling the file set | `backend/src/services/sbp/renderDocs.ts` |
| Server-side progress → file shape | `backend/src/services/sbp/buildProgressSnapshot.ts` |
| Commit path, idempotency, seed-once | `backend/src/services/sbp/repoWriter.ts` |
| Publish path | `backend/src/services/sbp/sbpOrchestrator.ts` (`publishBuild`) |
| Sync path | `backend/src/services/sbp/refreshRepoDocuments.ts` |
| STORY-000 prompt | `backend/src/services/sbp/commandCenterStory.ts` |
| Contract tests | `backend/src/services/sbp/__tests__/commandCenterDataContract.test.ts` |

Both write paths — publish and sync — render the same file set through the same renderer and the same writer, so they cannot drift.
