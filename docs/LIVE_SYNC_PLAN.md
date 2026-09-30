# Live Sync and Completion Gating — the plan

**Written for:** Ali Muwwakkil
**Date:** 2026-08-15
**Test fixture:** `ColaberryIntern/AcceleratorTesting` — project `40a5cea6-ace8-4734-8220-7e62df2111e5`, enrollment `aced5b39-0b47-496a-b172-e1f5c042bf8a`. The first real repo binding on the platform.

---

## The one-sentence version

A student cannot mark a story complete by clicking. They finish the work, commit it with the story's name on it, and push — and the portal notices, ticks the boxes itself, and unlocks the story. The click is the *last* thing that happens, not the first.

---

## What we already have (verified in the code, not assumed)

Before planning anything I checked what is actually built. Three things in the brief turned out to be different on the ground, and all three differences are in our favour.

**1. The rule that decides "done" is already written, and it is pure.**
`backend/src/services/sbp/verification/verifyDecision.ts` holds the rule you ruled on: *every acceptance criterion ticked, AND a commit that names the story and changes at least one file. Both required, neither sufficient.* It has no database, no network, and no clock in it, so it can be tested from a literal — which matters, because this function decides whether somebody gets credit.

It already produces, per story: the state, which criteria passed, **the exact text of every criterion still outstanding**, the commit that is the evidence, and a plain-language list of reasons it is not verified yet. That last part is the whole of what the disabled button needs to say. It is already being computed and already being saved. Nothing on screen is using it.

**2. The verdict already reaches the browser.**
Every story the portal loads already carries a `verification` block — state, outstanding criteria, reasons, evidence commit — because `projectTreeDto.ts` puts it there. So the checkboxes and the button are not blocked on new backend work. They are blocked on the page choosing to read a field it is already being handed.

**3. A GitHub webhook already exists, and it is already signature-checked.**
The brief said no webhook exists. There is one, at `POST /api/webhook/github`. It verifies GitHub's HMAC signature with a timing-safe compare against `GITHUB_WEBHOOK_SECRET`, takes the raw request body (not a re-serialised parse — that bug was found live on the PaySimple webhook twice and the lesson is written into the file), and routes by repo to an enrollment.

What it does *not* do is any of the three things this workstream needs: it never calls the story verification, it does not filter out our own bot's commits, and it does not dedupe GitHub's redeliveries.

**This changes the risk on the webhook completely.** The brief was right that standing up a fresh public endpoint tonight would be reckless. But that is not the job any more. The job is adding three guarded behaviours to an endpoint that is already public, already authenticated, and already hardened. That is a much smaller and much safer change — small enough that it shipped in this same pass rather than being written up for later.

---

## What happens on each push, end to end

The student is in Claude Code. They finish a story, and they do two things — tick the criteria in `.colaberry/progress.json`, and commit with the story id in the message. Then `git push`.

1. **GitHub sends us a push event**, within a second or two of the push landing. It arrives at `/api/webhook/github` with a signature header.

2. **We check the signature before we look at anything else.** Wrong signature, no signature, or no secret configured: 401, and we never parse the body. This is the only thing standing between our endpoint and the open internet.

3. **We check whether we sent this push ourselves.** Our own writes to a student's repo are committed with the prefix `chore(colaberry):`. If every commit in the push carries that prefix, we stop. This is the loop-breaker: the platform writes the plan into the repo, which would otherwise look like a student push, which would trigger a sync, which could write again. A push that mixes our commits with the student's is *not* ignored — the student's work in it is real.

4. **We check whether we have already handled this delivery.** GitHub stamps every delivery with a unique id and *will* resend it if we are slow or we blip. Same id twice means we already did this work; we say 200 and do nothing. This is what stops a redelivery from awarding points twice.

5. **We look up whose repo this is** — repo owner and name to a GitHub connection to an enrollment to a project.

6. **We re-read the truth from GitHub ourselves.** This is the part I want to be explicit about, because it is a security property and not an implementation detail: *we do not believe the webhook payload.* The payload tells us something happened in a repo. It does not get to tell us what the commits said or what the progress file contains. We go and read `.colaberry/progress.json` and the commit history from GitHub directly. Anyone who can forge a payload past the signature check still cannot hand us a fake commit, because we never read the commits out of what they sent us.

7. **We run the decision** — the published plan (the authority on what the stories and criteria actually are), plus the progress file, plus the real commits.

8. **We save the verdict for every story**, and for any story that just crossed into verified, we grant completion and record the evidence.

9. **The open portal page picks it up** and animates.

The important asymmetry: the **plan** is the authority on what the criteria are, never the progress file. A student who adds a fifth criterion to a four-criterion story cannot make it easier to satisfy, and one who deletes three cannot either. The file only supplies the ticks; the plan supplies the list.

---

## What makes the boxes tick

Today's checkboxes are `localStorage` only. They are a scratchpad — the student ticks them, nothing is reported anywhere, and clearing the browser loses them. They look exactly like a claim about the work and they are not one.

They become a **view of server truth**, with two visibly different states:

- **Confirmed** — the sync read this criterion as passing in the repo. Filled, in the confirmed colour, with the evidence behind it.
- **Self-ticked, not confirmed** — the student ticked it here in the browser and the repo does not back it up yet. Visibly a *different thing*: outline rather than fill, muted, and labelled as not yet confirmed.

A self-tick must never be able to dress itself up as a confirmation. That is the rule I am building to, and it is the reason I am keeping the local ticks at all rather than deleting them: as a working scratchpad they are genuinely useful for a student figuring out what is left, and the honest way to keep them is to make them look like what they are.

Where the confirmed state comes from: the verdict gives us the exact text of every *outstanding* criterion, and the story gives us the full ordered list. A criterion is confirmed when it is in the list and not in the outstanding set. No new backend field, no guessing.

---

## What unlocks "Mark done"

Nothing the student can click. The button is unlocked by `verified_at` being stamped on the task, and `verified_at` is only ever stamped by the platform after a sync confirms both halves of the rule.

The server already refuses to be talked out of this. A client that PATCHes its own task to `complete` gets a **409** with a sentence explaining that completion is granted, not claimed. Before that existed, anyone could open devtools and mark their own stories done, which made the whole chain theatre.

So the button is a *reflection* of a decision made elsewhere. Which means a disabled button with no explanation would be the cruellest possible version of this feature — the student is staring at proof that something is wrong and no clue what.

**The disabled button says what is missing, by name.** We have that text already; it is the `reasons` and `outstanding` the decision produces. In practice:

> **Waiting on GitHub to confirm 2 things**
> — the 401 path returns a problem+json body
> — a commit naming STORY-003 (add `Story: STORY-003` to your commit message and push)

Not "incomplete". Not a grey rectangle. The actual sentences, from the actual plan, in the order they are outstanding.

---

## Where the points land

On the transition into verified, once, ever.

Points are recorded against `points_config` key `project_story_verified`, keyed on the story plus the commit sha that proved it (`STORY-003@a1b2c3d`). That sha is **frozen at award time** in `verified_ref` and read back from there, never re-derived from the current repo — so a student who later squashes or force-pushes still keeps exactly what they were granted. The repo does not get a vote in what was already banked.

There are three independent guards against paying twice, which is deliberate for anything that awards credit:

1. Completion is first-write-wins — a replay never moves `verified_at`.
2. Evidence is recorded only on the *transition* (the task had no `verified_at` when we read it), so a second sync over the same commit records nothing.
3. The evidence record has a unique idempotency key in the database, so even two syncs racing each other — both seeing "not verified yet" at the same instant — produce exactly one award.

**The number:** a verified story pays a share of the capstone's **800 Builder XP** budget, split across its stories — a 20-story build pays 40 a story, a 30-story build pays 27. The split rounds per story rather than distributing a remainder, so the arithmetic a student can do in their head from the two numbers they can see matches what they were actually paid.

It **fails closed at zero** in every degenerate case: config row missing, budget unset, zero stories. Awarding nothing is recoverable — the evidence trail is still written and a re-run after a fix pays correctly — whereas awarding a guessed number is not. The UI shows the points chip only above zero, so a fail-closed zero never renders as a celebration of nothing.

---

## What the webhook needs

The endpoint exists. These are the properties being added, and why each one is not optional.

| Property | Why |
|---|---|
| **Signature verification** | Already there. HMAC-SHA256 over the raw bytes, timing-safe compare, secret from `GITHUB_WEBHOOK_SECRET`. Never logged. The raw body matters — a parsed-and-re-serialised body can never be byte-identical, and that exact bug killed the PaySimple webhook twice. |
| **Bot-commit filter** | `chore(colaberry):` is the prefix on every commit the platform writes. A push that is *entirely* ours is ignored. Without this, our own write into the repo can trigger a sync that writes again. |
| **Idempotent on delivery id** | GitHub retries. A retry that re-runs the award path is a double-award, so the delivery id is recorded and a repeat is a no-op 200. |
| **Never trust the payload** | The payload identifies a repo. Everything that decides credit — the progress file, the commit messages, which files changed — is read from GitHub by us, authenticated as us. |
| **Answer fast, work after** | GitHub wants a response in seconds and counts slow responses against the endpoint's health. We validate, dedupe, and return 200; the verification runs after. A failure in that work is logged as a defect, never a 500 back to GitHub, because a 500 makes GitHub retry a delivery that was actually fine. |
| **Ordering** | Two pushes seconds apart can arrive out of order. This does not need solving, and that is a property of the design rather than luck: every run re-reads the *current* state of the repo and re-derives from scratch. The later run always sees at least as much as the earlier one, and completion never revokes. Out-of-order deliveries converge on the same answer. |

**Secrets:** `GITHUB_WEBHOOK_SECRET` is an environment variable on the production backend. It is never logged, never returned in a response, never in the repo.

### Getting the webhook ONTO a repo — decided

The handler was the easy half. Installing the hook on thirty student repos was the open question, and the answer avoids asking anybody for access.

**The student's own Claude Code registers it, as part of Story 000.** It is already running in their folder, already authenticated as them. It has exactly the access needed and we never acquire any. That is the student-owned-repo decision applied one level further out: we hold a pointer and the evidence, never a token and never a scope.

The command is idempotent by construction — it looks for a hook already pointing at our URL and updates it, creating one only when there is none. Story 000 gets re-run; a bare create would stack duplicates, and a student with three hooks gets three deliveries per push.

`repo` scope is enough for a repo the student owns. If GitHub refuses, `gh auth refresh -h github.com -s admin:repo_hook` is the fix, and the panel says so.

**And a real fallback, because `gh` missing or signed-out is Thursday, not an edge case.** The panel carries a direct link to the exact GitHub webhook page with the payload URL and secret laid out to copy — about a minute by hand, deliberately not styled as a consolation prize.

### The secret: one per repo, and it never touches a file

This needed a design change rather than a detail.

**Before: one shared `GITHUB_WEBHOOK_SECRET` for every student repo.** Survivable while the platform installed every hook itself and the secret was shown to nobody. It stops being survivable the moment students register their own, because the secret must be *shown* to whoever registers it — and one shared secret shown to thirty students lets any one of them forge push events for everybody else's repo.

**Now: one secret per connection.** A leak costs exactly one repo, and it belongs to the student who leaked it.

Three rules hold it:

1. **It never touches a file.** Student repos are public by default, and Story 000's prompt is *rendered into the repo* as part of their docs — so the secret can never appear in the prompt, in `CLAUDE.md`, or in a `.env` an agent creates out of helpfulness. It is surfaced only in the authenticated workspace panel and passed as a command argument. The copy says so in the imperative, twice, because Claude Code stops and asks about anything resembling a credential, and here that is exactly what we want.
2. **It is stable.** Re-opening the panel returns the same secret. Rotating silently would leave a correctly-registered hook signing with something we no longer accept, and the symptom would be "my pushes stopped working" with nothing on screen to explain it.
3. **Legacy hooks still work.** Every hook registered through the old OAuth flow signs with the shared secret, so verification falls back to it when a connection carries none of its own. Dropping that would look clean in a diff and take a cohort offline.

One consequence worth stating plainly: verification now has to know *which repo* a delivery is for before it can pick a key, so the body is parsed before the signature is checked. That is safe under a condition the code holds strictly — the parsed body selects **a key and nothing else**, and no read, write, or side effect happens until the HMAC is verified over the raw bytes. An attacker choosing which key we check against still has to produce a valid signature under it.

**What a leaked secret actually buys is small, by design.** Forging a push gets a verification pass on one repo. It does not get a verified story, because nothing that decides credit is read from the payload — the progress file and the commits are re-read from GitHub by us. The worst case is making us re-read a repo we would have read anyway.

## What happens when the webhook is not there

The webhook is an *accelerator*, not a dependency. Every path still works without it:

- **Webhook not configured** (no secret set, or the repo has no webhook installed) — the "Sync from GitHub" button does exactly what it does today. The student presses it and gets the same verification, with the same result.
- **Webhook fails or GitHub cannot reach us** — GitHub retries on its own schedule. Meanwhile the Sync button still works, and the poll below still picks up anything a background sync produced.
- **GitHub rate-limits us** — verification returns a classified reason ("try again in about 40 seconds — nothing was lost") rather than an error. Nothing is written and nothing already earned is lost. This loop never revokes.
- **The progress file is malformed** — rejected, with the parse problem named. Explicitly *not* read as "nothing is done", and existing verifications are untouched.

- **The student never registers it at all** — and this is the one to be most explicit about, because Story 000 now asks them to. **Nothing is lost and nothing is gated.** Their criteria still tick, their stories still verify, their points still land, in exactly the same sequence with the same animation. The only difference is that they press **Sync from GitHub** first instead of GitHub telling us. Story 000 says this out loud rather than implying the step is mandatory, because a student who believes a skipped setup step has broken their build will stop and ask instead of building.

The rule I am holding to: **the hook is an upgrade, never a requirement.** Nothing in this system may become unreachable because a webhook did not fire, was never installed, or was installed wrong. A student who ignores the whole thing gets the identical outcome one button press later.

---

## Latency — what is actually instant

I want to be straight about this rather than let "live" imply magic.

| Step | Real timing |
|---|---|
| Push lands on GitHub → webhook hits us | **1–3 seconds**, typically. GitHub's own dispatch, not ours. |
| Signature check, dedupe, respond 200 | **milliseconds** |
| Reading the repo (progress file + commit detail) | **1–4 seconds**. Several GitHub API calls, including per-commit detail — that is how we know a commit actually changed a file rather than just carrying a message. This is the slow part and it is unavoidable. |
| Decision + database writes | **well under a second** |
| **Push → truth is in our database** | **≈ 3–8 seconds** |
| Open portal page notices | **+0–5 seconds** (see below) |
| **Push → the student sees boxes tick** | **≈ 5–12 seconds, typically under 10** |

So: **not instant, but comfortably inside "watch it happen".** In a split screen, the student pushes, looks over, and within about ten seconds the portal moves. That is the honest number. Anyone promising sub-second is describing a different architecture.

### How the page finds out — and why a poll

The page needs to notice a change it did not cause. Three ways to do that, and I checked what the stack already has before proposing any of them:

- **WebSocket** — needs a new dependency, a connection to hold open, its own auth handshake, and reconnection logic. For a page that changes a handful of times an hour, this is a lot of moving parts to own.
- **Server-Sent Events** — lighter, no dependency, but still a long-lived connection per open workspace, and long-lived connections through nginx and Cloudflare have their own buffering and idle-timeout behaviour that would need proving out in production.
- **A short poll while the workspace is open** — a request every few seconds, only while a student actually has the story open, stopped when the tab is hidden.

**I am building the poll**, and it is not a compromise. The event we are waiting for happens a few times an hour at most, the page is only open while someone is actively working, and a poll has no connection to drop, nothing to reconnect, no proxy behaviour to discover in production, and no new dependency. It degrades to exactly nothing when the tab is backgrounded. The cost is a few seconds of latency on a thing that already takes several seconds upstream — which is to say, no meaningful cost at all.

If we later have many students in workspaces at once and the request volume shows up, SSE is the upgrade, and it slots in behind the same interface. Building it first would be paying for a problem we do not have.

Concretely: poll every 5 seconds while a story is open and the tab is visible; stop when hidden; resume and fetch immediately on return. A student who pushes and switches to the portal gets an immediate check on focus, which in practice makes it feel faster than the 5-second number suggests.

---

## The moment

When the confirmation lands, it should feel like something. This is the payoff of the entire system and it is worth doing properly.

- The criteria tick **in sequence**, roughly 90ms apart, rather than all snapping at once. Sequence is what makes it read as *being checked* rather than *having been rerendered*.
- Then the story flips to **verified**.
- Then the points appear.

Two hard rules on this:

1. **`prefers-reduced-motion` is respected.** Reduced motion gets the same information, arriving in the same order, without the movement.
2. **We never animate something that did not happen.** The animation is driven by the difference between the last confirmed state and the new one. A criterion that was already confirmed five minutes ago does not re-tick for drama. If the sync confirms nothing, nothing moves. An animation that fires on a non-event is a lie told with CSS, and it would poison trust in every other animation in the product.

---

## Build order, and what landed

Each of these was independently shippable and useful on its own. All five landed.

**(a) Checkboxes reflect server truth.** ✅ Confirmed vs self-ticked are visibly different on three channels at once — colour, weight, and a written label — because colour alone dies in a screenshot and for a colour-blind reader. A confirmed box is read-only: there is no such thing as un-confirming your own evidence. The header count now reads "*n* of *m* **confirmed**", where it used to count self-ticks.

**(b) "Mark done" gated, with the reason named.** ✅ Disabled until `verified_at`, and an amber panel above it lists the outstanding criteria verbatim from the plan plus the missing commit. Amber rather than red: nothing has gone wrong, the work is simply not finished.

**(c) The live channel.** ✅ A five-second poll while the story is open and the tab is visible; stops on hide, fetches immediately on return, and stops permanently once the story verifies.

**(d) The webhook.** ✅ Story verification wired into the existing signature-checked endpoint, with the bot-commit filter and a `github_webhook_deliveries` ledger keyed on GitHub's delivery id. Plus per-repo signing secrets, a student-run idempotent registration command in Story 000, and a manual fallback in the workspace panel.

**(e) The moment.** ✅ Sequenced ticks at 90ms, then the verified card, then the points chip — and only for changes the page actually witnessed.

Even if (d) had not landed, (a) through (c) would still be worth shipping: with the Sync button as the trigger, the student presses Sync and watches the same sequence play. (d) removes the button press. Nothing else changes — which is exactly why it was safe to add last.

### What you will see on `AcceleratorTesting` today

Open the story workspace. Under **Your repo** there is now a block called **Let the platform see your pushes** — that repo has never sent us a delivery, so its dot is grey. Open it, copy the command, and run it in the repo folder. It registers the hook with your own `gh` credentials; the platform never sees a token.

Then in Claude Code: tick the story's criteria in `.colaberry/progress.json`, commit with the story id in the message (`STORY-001: ...` or a `Story: STORY-001` trailer), and push.

Within roughly five to twelve seconds, with no clicking: the confirmed criteria tick in sequence about 90ms apart, the story flips to a green **Verified from your repo** card naming the evidence commit, the points chip appears, and the button changes from "Mark done — waiting on GitHub" to "Mark done". Re-open the block afterwards and the dot is green with "your last push reached us just now".

If you skip the registration entirely, everything above still happens — you press **Sync from GitHub** first. That is the fallback, and it is meant to stay usable forever.

**One caveat, stated because it is the kind of thing that bites on a Thursday:** this needs `GITHUB_WEBHOOK_URL` set on the production backend. If it is unset the block renders nothing at all rather than showing a broken setup, and every student is on the Sync button. Worth confirming before the cohort runs Story 000.

---

## What this does not claim

Worth writing down so it is not discovered later as a surprise.

This is an **audit trail, not a proof**. A student can hand-edit `.colaberry/progress.json` and tick every box. What the platform holds is the commit sha behind every award and a criteria list that came from the plan rather than from the student — which is enough to review, enough to spot, and enough to be honest about. Tests passing in CI would be the stronger bar and it is explicitly not the bar today.

This is a learning platform. The defences are sized for it, deliberately.
