# DOC 07 — YouTube, Media Production & Weekly Content Engine

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1, consolidating §12 and §13 |
| **Basecamp ticket** | L11.8 (this document) · L8.1–L8.4 (the work) |
| **Owners** | **Sohail Syed** (distribution, campaign, audience growth) · **Piyush Prajapati** (edit, clips, media production) |
| **Written** | 2026-11-03 |
| **Start here** | DOC 00 · clip-marker mechanics in DOC 03 row 11 |

This is release **R7**. One live session becomes a week of media.

> **Read this before planning R7 from the build plan.** `CLAUDE_CODE_COLABERRY_LIVE_7_PHASE_BUILD.md`
> **under-covers this entire release.** Its nearest task, P6-05, is scoped to in-portal
> *"source-grounded summaries, chapters, lesson links and approved teaser clips"* — that is the
> replay surface, not an editor handoff. **Nothing in P1 through P7 produces an edited long-form
> video, Shorts, thumbnails, titles, descriptions, social captions or a videographer handoff.**
> Build the seven phases to completion and you still do not have R7. The bootstrap is the
> authoritative scope here, not the build plan.

---

## YouTube Live distribution

YouTube is **reach and distribution.** It is not the source of truth and it is not the record.

Colaberry remains authoritative for: session; broadcast occurrence; access; prompts; participation;
build progress; community; replay metadata; and Architect conversion.

The delivery architecture (DOC 02) makes this concrete — Cloudflare Stream Live is the in-app
delivery layer, and YouTube is a **simulcast output** hanging off the same Zoom RTMP production
source. A YouTube outage degrades reach; it must not degrade the class.

**Current state: NOT BUILT.** Simulcast is **L8.1**, open, owned by Sohail. The external
prerequisites in DOC 00 — channel ownership, live-stream eligibility, stream destination, key and
API handling, a test or unlisted event, post-live replay ownership — are unverified.

---

## Raw live replay policy

The raw live recording is **not** automatically kept and **not** automatically deleted. The
requirements set four dispositions, and the judgment is a human's:

| Quality of the airing | Disposition |
|---|---|
| **Strong** | Keep public |
| **Acceptable** | Evaluate after the edited version publishes |
| **Poor technical quality** | Unlisted |
| **Sensitive or failed** | Private |

> **Do not automatically delete every raw live, and do not automatically keep every raw live
> public.** Both are the same mistake in opposite directions: one destroys the only record of what
> happened, the other publishes a class where the audio failed for eleven minutes.

**Current state: NOT BUILT.** Defining and implementing the retention policy is the second half of
**L8.1**. Today there is no policy field, no disposition workflow, and no place the decision is
recorded.

---

## The fifteen outputs of one live session

This is the weekly package the requirements specify. It is the yardstick for R7:

| # | Output | State |
|---|---|---|
| 1 | 1 live broadcast | **BUILT** (DOC 02) |
| 2 | 1 raw replay | **BUILT** — lifecycle through `replay_ready`, Range-capable transport |
| 3 | 1 edited long-form YouTube video | **NOT BUILT** |
| 4 | 5–7 Shorts | **NOT BUILT** |
| 5 | Prompt Drop assets | **NOT BUILT** |
| 6 | Clips | **PARTIAL** — markers and a CSV export exist; see below |
| 7 | Transcript | **NOT BUILT** |
| 8 | Chapter markers / timestamps | **NOT BUILT** |
| 9 | Thumbnail options | **NOT BUILT** |
| 10 | Titles | **NOT BUILT** |
| 11 | Descriptions | **NOT BUILT** |
| 12 | Social captions | **NOT BUILT** |
| 13 | Email / community recap | **NOT BUILT** |
| 14 | Replay workspace | **PARTIAL** — the replay exists; discovery and listing is L8.3 |
| 15 | Next-live CTA | **PARTIAL** — a projected slide only; `CompanionState` has no CTA field |

**Two of fifteen are built.** That is the honest reading of R7 as of 2026-11-03.

---

## Clips: the one brick that exists, and what it taught

**Clip markers got their reader on 2026-11-01** — `SessionClipList` on the Class Kit, plus a CSV
export. This is R7's first real deliverable and the only part of the media engine that exists.

Four findings came out of building it, and **all four are planning input for the rest of this
document** rather than closed history:

1. **A marker is a start point; an editor needs a range.** One row is written per slide advance, with
   no end. The out point is the next marker's in point — derivable from rows already held — and for
   the **last** marker it is the end of the recording, knowable only from `ended_at`. Real rows have
   a null `ended_at`, so **the last clip of an airing legitimately has no end** and is reported as
   unknown rather than measured against `now`, which would grow its duration every time the file was
   downloaded.
2. **Every advance writes a marker, so most rows are not clip candidates.** A 38-minute class
   produces dozens; a handful are worth cutting. **Handing an editor forty undifferentiated rows
   leaves him scrubbing the video, which is the precise cost this feature exists to remove.** The
   authored note is recoverable because the label precedence is
   `publicValue || segmentLabel || slideTitle` — a label matching neither fallback is the authored
   sentence. The proper fix is for the write path to store what it chose, which needs a column on a
   shipped table and only helps future markers.
3. **A plain `<a href>` export would 401**, and this is a trap for every future admin export in this
   repo. The admin JWT lives in `localStorage` and is attached by the `api` interceptor as a Bearer
   header, so an anchor straight to a CSV route carries no `Authorization` at all. The file is
   fetched through `api` and saved client-side.
4. **Two gaps remain on the write side:** the deck's own `M` key writes to an in-memory array lost on
   tab close, and a `deck_drifted` advance records nothing at all. So the markers an instructor
   *deliberately* sets are the ones most likely to be lost.

**The design consequence for the Shorts workflow:** 5–7 Shorts per session cannot be selected from
forty auto-markers. Either the write path learns to distinguish an authored moment from an ordinary
advance, or the editor handoff carries a ranked shortlist. **That choice is the first real decision
in R7** and it is not made yet.

---

## Transcript, timestamps, hooks and thumbnails

All four are **NOT BUILT**, and they share one dependency: a recording that is reliably bound to its
occurrence, which **does** exist (`broadcastRecordingBinding.ts`, with `broadcast_source_refs`
UNIQUE — L8.4).

- **Transcript** — the input to chapters, hooks, captions and the recap. Nothing produces one today.
- **Timestamps / chapter markers** — the clip markers are timecoded against `content_started_at`,
  "the only trustworthy class clock" (DOC 03). Chapters are a presentation of those markers, so this
  is closer than the others.
- **Suggested hooks** — derived from the transcript, not invented. Any hook that quotes the class
  must be traceable to a timecode.
- **Thumbnail concepts** — frames plus the authored segment label.

> **One standing rule, from this repo's content practice: every on-screen claim must trace to a
> verifiable source.** Never invent a duration, a price, or a date for a thumbnail, a title or a
> Short. And **measure** a delivered video's duration with `ffprobe` rather than computing it — a
> concat that drops an unreadable segment still exits 0.

---

## Replay page and discovery

The replay must be findable, and watchable only by someone entitled to watch it.

**Current state: PARTIAL.** The lifecycle, the Range-capable transport and the recording binding all
exist. Replay discovery and listing in the portal is **L8.3**, open. Replay metadata is
lifecycle-only — no chapters, no description, and **nothing joins the clip markers to the replay**.

**The access rule applies unchanged to replays.** Entitlement is fail-closed, a preview grant is
bounded by the preview deadline rather than the token TTL, and a private occurrence is omitted from
ineligible discovery rather than shown-and-refused. A replay surface is a new reader of the
entitlement contract, so it must be tested for the un-entitled and unauthenticated caller, not only
the happy path (DOC 02).

---

## Colaberry CTA and the audience-to-builder funnel

The funnel the program is measured against:

```
Watch → Participate → Prompt → Build → Save → $0 Colaberry Account → Community
      → Completed Artifact → Architect Progress
```

**Do not reduce success to YouTube subscribers.** The requirements are explicit. What gets tracked:

| Tracked | State |
|---|---|
| live views, unique viewers, average watch time, returning viewers | **Code shipped, never exercised.** L4.9 wired the player to the heartbeat endpoint — before it, measurement recorded nothing at all. The ticket is airing-gated: the code is in the tree and no production airing has produced a row through it. |
| Prompt Drop opens, prompt copies | **NOT BUILT** |
| poll votes | **BUILT** |
| Builder Room participation | **PARTIAL** — the thread has a reader since 2026-10-31 |
| build starts, build completions | **NOT BUILT** — no server-side notion of build steps exists |
| $0 account creations | tracked outside this subsystem |
| completed artifacts, Activated Architects | **NOT BUILT** as a Colaberry Live measurement |

**An Activated Architect** has a Colaberry account, at least one tracked build, and at least one
created or submitted artifact. If that definition changes, it is recorded in **DOC 01**, not here.

> **The middle of this funnel cannot be measured today.** "Build starts" and "build completions"
> have no server-side representation, so every metric from *Build* onward is unmeasurable regardless
> of audience size. That is a bigger hole than any single missing output above, because it means the
> program cannot currently tell whether a strong airing produced builders.

**The CTA itself is PARTIAL** — a projected slide, with no field in `CompanionState`. A viewer on a
phone cannot be handed the next step.

---

## Post-show handoff to Piyush, the videographer and marketing

The handoff is the point of this release, and it is the part with the least existing machinery.

What a handoff has to carry, per the requirements and the clip findings above:

- the recording, bound to its occurrence (**exists** — L8.4);
- a **ranked** clip shortlist with in and out points, not forty raw markers (**the open design
  decision**);
- the transcript and chapter markers (**not built**);
- the authored segment labels and Prompt Drop text (**authored, not exported**);
- the retention disposition for the raw live (**no policy field exists**);
- the title, description, thumbnail and caption drafts (**not built**);
- who does what next, and by when.

**Current state: NOT BUILT.** There is no production brief, no media brief artifact, and no defined
moment at which an airing becomes an editor's job. **L8.2** — one live session to one long-form edit
plus 5–7 Shorts — is the ticket, it is open, and it is owned by Piyush.

---

## Current state and what is not done

| Item | Ticket | Owner | State |
|---|---|---|---|
| Simulcast to YouTube + raw-replay retention policy | **L8.1** | Sohail | **OPEN** |
| One live session → one long-form edit + 5–7 Shorts | **L8.2** | Piyush | **OPEN** |
| Replay discovery and listing in the portal | **L8.3** | Ali | **OPEN** — one criterion left: mutation evidence for the replay entitlement filter |
| Bind recordings to occurrences | **L8.4** | Ali | **Code shipped** — `broadcastRecordingBinding.ts`, `broadcast_source_refs` UNIQUE. One criterion left: a mutation record. |

**Not built, in one list:** the edited long-form video; the 5–7 Shorts; the transcript; chapter
markers; suggested hooks; thumbnail concepts; titles; descriptions; social captions; the email and
community recap; Prompt Drop assets; the raw-live retention policy and its disposition workflow; the
replay-to-clip join; a CTA that reaches a phone; the production/media brief; and every funnel metric
from *Build* onward.

**Built:** the live broadcast, the raw replay, the recording binding, and clip markers with a CSV
export.

**Two of fifteen outputs, and the build plan does not cover the other thirteen.** That is the single
most important sentence in this document for anyone planning the program's remaining work.
