# DOC 06 — AI Avatar + Voice AI Recording & Training

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1, which requires every requirement in its §11 |
| **Source** | Piyush Prajapati — *"Guides for Improving Video Production Quality and AI Avatar Creation"*, 2026-10-08 |
| **Basecamp ticket** | L11.8 (this document) · L9.1–L9.4 (the work) |
| **Owner** | **Piyush Prajapati** (production) with **Ali Muwwakkil** (the person being cloned, and the only person who can consent) |
| **Written** | 2026-11-03 |
| **Start here** | DOC 00 · equipment in DOC 05 |

This is release **R6**. It covers **both** the visual avatar and the voice clone — the requirements
are explicit that this is not visual-only work.

**Two rules govern everything below, and neither is negotiable:**

> **1. Do not create a voice clone or an avatar without Ali's explicit participation and consent.**
>
> **2. Verify the vendor's CURRENT official workflow on the execution date.** Not from this document,
> not from memory, not from a guide written in October. Vendor avatar pipelines change their
> requirements between product tiers and between months.

Prerequisite: **DOC 05's equipment step comes first.** Piyush's order of operations is buy and set
up the equipment, then record, then sample, then production.

---

## Avatar recording behavior

Ali can speak naturally about a familiar topic. **Do not require him to memorize a complete script
for the training recording** — a memorized read produces exactly the stiffness the QA pass at the
end of this document is designed to catch.

Recommended format:

- explain something he already teaches;
- imagine one student sitting behind the camera;
- prepare roughly three cues:
  1. what he does,
  2. one common beginner problem,
  3. his advice;
- practice once;
- record naturally.

---

## Eye contact

- use a small marker beside the camera lens;
- look toward the lens;
- blink naturally;
- allow natural facial expression;
- if cues are needed, keep a **very short** cue card close to lens position;
- **avoid reading from side monitors**;
- hide the self-preview after framing, where that helps;
- if full text becomes necessary, research and use a **lens-aligned teleprompter**;
- **avoid a wide scrolling text column**, which causes visible eye scanning.

Eye direction is the first item on the QA scorecard, and it is the one defect that cannot be fixed in
post. Everything in this section exists to protect it.

---

## Standard recording baseline

For normal Digital Twin-style training footage, per Piyush's current guidance:

**Camera and framing**

- webcam or phone on a stable mount;
- eye level;
- landscape;
- 1080p;
- 30 FPS;
- head and upper torso visible.

**Environment**

- soft, steady lighting;
- a clear microphone;
- a quiet room;
- **record Ali only** — no second person in frame or on the audio.

**If using OBS, make a dedicated avatar scene** — and note this is a *different* scene from DOC 05's
teaching scene:

- camera fills the frame;
- USB mic;
- **no screen capture**;
- **no overlays**;
- **no desktop audio**.

**Recording discipline**

- keep the mic out of Ali's face;
- **record locally rather than recording the avatar training footage through Zoom** — Zoom's
  compression and its automatic gain are both wrong for training footage;
- around **two minutes** for the standard Digital Twin flow;
- an **uninterrupted** take;
- a 2–3 second pause at the beginning;
- natural sentence breaks;
- eyes near the lens;
- gestures below chest level;
- avoid abrupt head turns;
- **avoid cuts and splicing.**

---

## HeyGen flow-specific research

**Do not assume the standard two-minute requirement applies to every HeyGen product.**

Before recording, Piyush or Claude must **verify the current official HeyGen workflow being used.**
Piyush's note says Avatar V may use a shorter motion clip — a 15-second flow, for example — and a
more expressive delivery. A two-minute calm take fed into a product that wants fifteen expressive
seconds produces a poor avatar and wastes the session with Ali.

**This is ticket L9.1: verify the CURRENT official HeyGen workflow on the execution date.** It is
open, it is owned by Piyush, and it is a hard prerequisite for L9.2 (the recording).

**Record the final selected process in Basecamp**, so the next avatar — a refresh, a second
presenter — does not re-derive it.

---

## Consent

- **The cloned person must provide their own consent.** Ali, in person, on the recording. Nobody
  consents on his behalf.
- The separate vendor consent statement must be recorded **exactly as the vendor flow instructs**,
  including any displayed code.
- **Do not paraphrase vendor-required consent language.** The wording and the on-screen code are the
  vendor's legal artifact; a paraphrase can invalidate the clone and, worse, can make it look valid
  when it is not.

Capturing consent exactly as required is an explicit acceptance criterion of L9.2, not a courtesy
step.

---

## Voice AI and voice clone training

**This project must explicitly include voice work, not just visual-avatar work.** If HeyGen's
selected avatar workflow recommends a separate voice clone, that path is included too.

The work to specify and execute:

- determine the selected voice-clone / voice-AI provider and the exact workflow;
- verify the current official training requirements **on the execution date**;
- the recording environment;
- microphone setup;
- required duration;
- speaking style;
- pronunciation coverage;
- pacing;
- emotion range;
- noise floor;
- **consent**;
- upload;
- sample generation;
- QA;
- retake criteria;
- **a safe-use policy** — when AI Ali may be used, and when Real Ali is required.

**The safe-use policy is the part that outlives the recording session**, and it is a decision for Ali
rather than for production. A cloned voice that can say anything, used by anyone, in any context, is
a reputational exposure that no amount of QA addresses. L9.4 covers the *Real Ali versus AI Ali*
usage policy, and it should be written before the clone is used anywhere a student or customer sees
it — not after.

---

## Avatar QA

After creation, generate a short sample and score it on thirteen dimensions:

| | |
|---|---|
| eye direction | voice clarity |
| mouth movement | naturalness |
| lip sync | pacing |
| expression | pronunciation |
| voice similarity | visual artifacts |
| hand and gesture behavior | branding |
| **overall credibility** | |

> **If it feels stiff or unnatural, create a retake ticket rather than accepting it because the
> pipeline technically completed.**
>
> That sentence is the whole point of this section. "The render succeeded" is not the acceptance
> criterion; a credible Ali is. A pipeline that completes and produces an uncanny avatar has failed
> at the only thing it was for.

The QA artifact is the scored sample — the clip plus the thirteen scores — not a statement that QA
was done.

---

## Current state and what is not done

| Item | Ticket | Owner | State |
|---|---|---|---|
| **Verify the CURRENT official HeyGen workflow on the execution date** | **L9.1** | Piyush | **OPEN — and it gates everything else here** |
| **Record approved avatar training footage, with consent captured exactly as required** | **L9.2** | Ali | **OPEN** — needs L9.1 and DOC 05's equipment |
| **Voice clone: select provider, verify current requirements, record, QA** | **L9.3** | Piyush | **OPEN** |
| **Avatar QA and the Real Ali versus AI Ali usage policy** | **L9.4** | Ali | **OPEN** |

**Nothing in R6 has started.** No avatar exists, no voice clone exists, no sample has been scored,
and no safe-use policy has been written.

**What this means for planning.** Every item here needs a person in a room with hardware, and L9.1
specifically needs a vendor's live documentation read on the day. A Claude Code session cannot
advance any of it, and should not record it as progressing. The one thing a session *can* usefully
do is the thing this document is: capture the requirement precisely enough that the recording
session with Ali happens once rather than twice.

## Where this sits in the definition of done

**Three of the 48 definition-of-done conditions are this document** — band *Avatar and voice*,
items 24–26 (`docs/COLABERRY_LIVE_TRACEABILITY_MATRIX.md`). **Zero of the three are satisfied, and
none of the three is a launch blocker.**

| # | Condition | Ticket | What settles it |
|---|---|---|---|
| 24 | HeyGen avatar training is complete | L9.1, L9.2 | L9.1's sourced research first — the current official workflow, cited with URL and access date — then Ali recording the approved footage under L9.2 with the consent wording captured verbatim |
| 25 | Voice-AI / voice-clone training is complete **if selected** | L9.3 | Piyush naming a provider, **or a written decision not to clone a voice at all.** Either answer closes this item; the absence of a decision is what holds it open. |
| 26 | AI Ali sample is reviewed | L9.4 | A sample scored per dimension **by a reviewer outside the project**, plus the Real Ali versus AI Ali usage policy and an answered disclosure question |

Two things worth reading off that table:

- **Item 25 is conditional, and a "no" closes it.** It reads *if selected*. Deciding not to clone a
  voice satisfies the condition as completely as cloning one does. It is open because no decision
  exists, not because work is outstanding — which makes it one of the cheapest items on the board,
  and Ali's rather than Piyush's.
- **L0.3 proposes the whole avatar group as the program's first cut**, precisely because no launch
  test depends on it. That is the right order: an AI Ali presenting a broadcast that cannot stream
  solves nothing. If the launch date is re-set and something has to give, this is the group to give.

Item 26 also requires a reviewer **outside the project**, which is the only external-review
requirement anywhere in the 48 — worth lining up early, because it cannot be done by the people who
made the avatar.
