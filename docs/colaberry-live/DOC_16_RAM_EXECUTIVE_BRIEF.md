# Colaberry Live — Ram Executive Brief: How Colaberry Live Works

**Written for Ram Katamaraja.** DOC 16, ticket L11.6. Generated from `scripts/artifacts/tickets/l116Data.js` on 2026-11-08 — do not hand-edit, the build compares this file against the data.

> The question this brief answers, in the words of the document that commissioned it:
>
> *"What does this system do for the business, what does it cost/require, and how does it support growth?"*

## Read this first

Colaberry Live is **built, and has aired three times without once being measured.** Everything below that describes the system working describes it working under test. That is not a hedge - it is the single most useful fact in this document, and the section on risk explains what it has already cost. Where this brief cannot source something, it says so instead of estimating.

## Still owed: the briefing session

Conduct the briefing session with Ram and capture his follow-up questions and actions. Bootstrap R9 lists the session as a separate deliverable from the brief. It is an event between two people, so writing the brief does not complete the ticket. Owner: **Ali Muwwakkil**. This document does not complete the ticket on its own.

---

## Why Colaberry Live exists

Today a live class is an event. It happens, it ends, and what it leaves behind is a recording nobody uses and a memory of who attended. Colaberry Live exists to change what a class *is*: the class becomes the input to a pipeline that keeps producing after the class is over. The same ninety minutes yields a live broadcast, a replay that can be watched on demand, short clips for distribution, and a tracked path from a stranger watching to a named person with a Colaberry account. The teaching effort is unchanged. What changes is how many times that effort is used.

## How a single live class becomes a reusable media and lead-generation engine

One class feeds four surfaces. It is broadcast live to people entitled to watch it. It is recorded, and the recording is bound to the occurrence automatically rather than by someone remembering to do it. The replay is published for people who missed it. Clips are cut for YouTube and short-form distribution, which is where people who have never heard of Colaberry encounter it. Every one of those surfaces carries the same next step, and the bootstrap defines that path explicitly: `Watch -> Participate -> Prompt -> Build -> Save -> $0 Colaberry Account -> Community -> Completed Artifact -> Architect Progress`. The lead-generation claim is that sentence. A viewer who builds something and saves it has an account, and an account is a person marketing can talk to.

## How Ali creates a session

Ali creates a session in the admin portal. That session becomes a broadcast occurrence, which is the thing the system actually operates on: it holds the schedule, the provider binding that says where the video comes from, and the access rule that says who may watch. The states an occurrence can move through are defined in one place (`backend/src/services/broadcast/broadcastStateMachine.ts`) rather than scattered, which is why "go live" either works or refuses for a stated reason instead of half-starting.

## How the Timeline creates the experience

The Timeline is the scripted run of the class — the segments, the prompts put in front of viewers, and the cues that change what is on screen. It is the difference between streaming a meeting and producing a show. Because the Timeline drives the viewer's surface rather than the instructor narrating it, the experience is repeatable: the second class does not depend on remembering how the first one went, and a segment that worked can be reused.

## How Zoom, Cloudflare, Colaberry and YouTube work together

Each vendor does one job, and the boundaries are deliberate. **Zoom** is the room the class is taught in. **Cloudflare** delivers the video and signs each viewer's playback, so a link cannot be forwarded and reused indefinitely. **Colaberry** owns the page the viewer is actually on: the access decision, the interaction, and the record of what each person did. **YouTube** is where the class goes afterwards to be found by people who were not invited. **HeyGen** supplies the AI avatar and voice where a segment uses one. Zoom and Cloudflare are replaceable; the Colaberry layer is not, for the reason in the next section.

## Why Colaberry owns the interactive experience

The interactive layer is where the three things that matter commercially live: who is allowed to watch, what the learner built, and which viewer became a lead. If that sat on a vendor's platform, Colaberry could not gate a class to a specific cohort, could not keep the artifact a learner produced, and could not attribute a sign-up back to the class that caused it. The access decision is written to fail closed — if entitlement cannot be established, the answer is no rather than yes (`backend/src/services/broadcast/broadcastEntitlement.ts`). That is a business position as much as a technical one: it is the part that cannot be outsourced without giving away the relationship.

## What Piyush does

Piyush owns the studio and the show. That means the physical setup — cameras, audio routing, lighting, a wired network — the OBS scene collection that switches between inputs, and running the broadcast while Ali teaches. It is a production role, not a development one. It is also currently the longest pole: the studio is not installed yet, and the operator manual cannot honestly be written until it is, because a manual for equipment nobody has is untested prose.

## What marketing does

Marketing owns everything downstream of the recording. The clips, where they are posted, the campaigns that bring an audience to the next class, and the conversion path from a viewer to a $0 account. Marketing is the reason the media pipeline exists at all — without distribution, a replay is an archive rather than an asset.

## How the system reduces recurring production work

The saving is in the work that currently happens once per class and depends on someone remembering it: binding the recording to the right session, publishing the replay, cutting the clips, and knowing who watched. Those are automated, so the marginal cost of the tenth class is much closer to the teaching time than the first class was. This is the clearest business case in the system, and it is also the one most exposed to the risk below: automation that has never run in front of a real audience is a projection, not yet a saving.

## How the system supports the 10,000 Architect goal

**Not defined in this repository.** The phrase "10,000 Architect goal" appears exactly once in the bootstrap, inside this document's own list of things to explain, and nowhere else in the repository. There is no definition of the number, the time horizon, or what counts as one Architect, so any arithmetic here would be invented and Ram would be repeating a figure with nothing behind it.

What the repository *does* define is the mechanism a goal like that would run on. Every surface a class produces ends at the same funnel — `Watch -> Participate -> Prompt -> Build -> Save -> $0 Colaberry Account -> Community -> Completed Artifact -> Architect Progress` — and "Architect Progress" is its last step. So the system's contribution is that it turns one teaching event into a repeatable intake, and that the intake is instrumented end to end. Turning that into a number needs the goal defined first.

## What costs and vendors are involved

The vendors are knowable; the amounts are **Not defined in this repository**, and deliberately so. The bootstrap defers them twice in its own text — "use current vendor/product pages at execution time", and a release step to "confirm billing/cost visibility" — because a price written into a document is wrong within a quarter. Rather than estimate, here is the complete list of what is paid for and what each one buys, so the invoices can be read against it:

| Vendor | What it buys | Where it shows in the system |
|---|---|---|
| **Zoom** | The room the class is actually taught in | `docs/colaberry-live/DOC_05_STUDIO_EQUIPMENT_OBS_ZOOM.md` |
| **Cloudflare** | Delivers the stream and signs each viewer's playback | `backend/src/services/broadcast/providers/cloudflareStreamProvider.ts` |
| **Colaberry** | The interactive surface, the access decision and the record | `backend/src/services/broadcast/broadcastEntitlement.ts` |
| **YouTube** | Distribution and discovery after the class | `docs/colaberry-live/DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md` |
| **HeyGen** | The AI avatar and voice, where a segment uses one | `docs/colaberry-live/DOC_06_AI_AVATAR_AND_VOICE.md` |

Two cost notes that are structural rather than numeric. The delivery cost scales with minutes watched, not with the number of classes, so a popular replay costs more than an unwatched live class. And the studio is a one-off capital cost sitting with Piyush, not a recurring line.

## What risks exist

The largest risk is the simplest: **no airing has ever been measured.** As of the L0.3 review on 2026-11-02, 12 of the 39 open tickets cannot be finished by writing code, because their acceptance criteria require a real class to have happened — three viewers on separate networks, a recorded latency, a replay verified after the fact. Everything in this brief that describes the system working describes it working in tests.

What has happened is narrower than it sounds. Checked against production on 2026-11-09, the database holds 2 occurrence rows - a technical airing on 15 October and a test on 20 October - while a third airing on 13 October survives only as a recording outside the platform, with no occurrence row at all. The viewer telemetry tables are empty: 0 non-staff viewers have ever been recorded watching any of them. Because the viewer was only wired to report on 2026-10-20, that emptiness is not proof the earlier two had no audience; it proves nothing has been measured since. No Colaberry Live class has been aired to an audience anyone can count.

That distinction has already cost something real, which is the honest reason to take it seriously: four complete, well-tested units shipped that nothing called, and one of them meant a live class recorded zero viewers for five days while the server logs showed people watching. The register in `docs/colaberry-live/DOC_11_SYSTEM_ARCHITECTURE_HANDBOOK.md` now grades every capability by whether it has run in production, in a test, or never.

The second risk is people: 10 tickets are blocked on a named person having access or hardware, most of them the studio. The third is concentration — there is one provider adapter, so a Cloudflare outage is a canceled class rather than a degraded one.

## What is automated

The occurrence lifecycle and what each transition is allowed to do. The access decision for every viewer, failing closed. Playback-grant expiry, computed in one place so a link cannot outlive its session. Binding the recording to the occurrence. Publishing the replay. Collecting who is watching, counting distinct people rather than open tabs. Each of those has tests; the testing strategy and the evidence behind each claim are cataloged in `docs/COLABERRY_LIVE_TESTING_STRATEGY.md`.

## What still requires a human

Teaching the class. Running the studio and the show. The go/no-go call before a public airing. Deciding whether a replay is published or withheld. And the judgment calls the system deliberately refuses to make on its own — Claude Code does not close a ticket, merge its own work, or send on anyone's behalf. The briefing session that accompanies this document is itself one of these: a document cannot discharge it.

## What metrics show success

What is instrumented, and what each number means, matters more here than a target. The live audience is counted as **distinct enrolled people currently watching**, not open tabs and not cumulative joins, with a freshness window so someone who closed their laptop stops counting, and staff and test accounts excluded (`backend/src/services/broadcast/broadcastTelemetryService.ts`). When collection fails, the surface returns no number at all rather than a zero, because a confident zero is indistinguishable from an empty room and is the more expensive mistake.

Beyond the live count: replay views, clip performance on YouTube, and $0 account creations attributed to a class — the funnel's own steps.

**What no metric shows yet.** That question was open until 2026-11-09, when the owed command (`scripts/explainBroadcastTelemetry.js`) was finally run against production alongside a read-only census. The answer is that every number above has nothing in it, and now for a sourced reason rather than an assumed one: `broadcast_viewer_sessions`, `broadcast_viewer_people` and `broadcast_occurrence_metrics` are all empty, so 0 viewers have ever been recorded. The measurement path itself is sound - the expected index `idx_bvs_active` exists and the planner chooses it - so what is missing is an audience, not an instrument.

---

## What this brief could not source

- **What costs and vendors are involved** — Not defined in this repository. Settled by: Ram or Ali reading the current vendor invoices. The bootstrap defers this twice in its own text — "use current vendor/product pages at execution time" and "confirm billing/cost visibility" — so the amounts were never meant to live in the repository.
- **How the system supports the 10,000 Architect goal** — Not defined in this repository. Settled by: Ram defining the number, the horizon and what counts as one Architect. The phrase appears exactly once in the bootstrap, inside this document's own requirement list, and nowhere else in the repository.

*State claims checked on 2026-11-09. An airing is an event version control cannot show, so the absence of a record is reported as what was checked rather than as proof that nothing aired.*

