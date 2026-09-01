---
name: build-class-deck
description: Build, rebuild or repair ONE live class deck (the "Present" teaching deck for a session in /admin/accelerator) so it passes Ali's authoring contract — no terminal blocks, real commentary on every slide, two disjoint presenter screens, and a run-of-show that actually fits the room. Invoke when Ali says "build the deck for week N", "rebuild Thursday's class", "update session N", "the slide notes are wrong/blank/duplicated", "no terminal codes", "this slide has no commentary", when a class ran over and needs cutting, or before any session that has never been audited. Also invoke to audit every upcoming session at once.
---

# build-class-deck — the live class deck builder

A **class deck** is the HTML teaching deck an instructor opens with ▶ Present on
`/admin/accelerator`. It is built from three layers, and knowing which layer owns
what is most of this skill:

| Layer | Lives in | Changing it needs |
|---|---|---|
| Authored week content | `backend/src/data/weeks/weekN.ts` | a **deploy** |
| Per-session override | `live_sessions.kit_config_json` | a **DB write only** |
| Generated scaffolding | `kitSpecDaySlides.ts` | a deploy (or `slideNotes`) |

**The override wins.** A session with a `kit_config_json` ignores the week file
for whatever category it overrides. This has burned us: on 2026-09-01 a
load-balancer correction was merged, deployed, and still wrong on screen,
because Session 12's override superseded the corrected week file and had not
been re-applied. **Always verify by reading the database back, never by reading
your diff.**

---

## Ali's settings — these are not suggestions

Every deck must satisfy all of these. They came from him presenting live and
hitting each failure in front of a room.

### 1. No terminal. Everything is a prompt.

> "No terminal codes — everything must be built as a prompt." (2026-08-31, mid-class)

A student never types a shell command. If a step needs a terminal, the prompt
directs **Claude Code to drive the terminal**. Write it so Claude Code
*discovers* facts rather than having them hardcoded — the old Inspector block
hardcoded `build/server.js`, which was wrong for anyone whose server built
elsewhere and was the likeliest way that step failed in the room.

Every prompt should say some version of: *"Run these steps yourself — do not
print commands for me to copy and paste."*

### 2. Every slide has real commentary. No exceptions.

> "This slide doesn't have any commentary — that shouldn't happen. ever." (2026-08-31)

Teach slides carry an authored `script`. **Everything else is generated** —
segment openers, story beats, question slides, cover, break, trailer,
checkpoints — and each ships one hardcoded tip reused identically every week.
Use `KitConfig.slideNotes` to replace them. Beware: a tip that is *true of every
slide of its kind* ("Wait for the pulse to catch up") is boilerplate even though
it is not empty. Say what to verify on **this** slide.

### 3. The two presenter screens must share nothing

> "The pre click and the post click text should be completely different… The preclick should setup the atmosphere and environment before I say what's in the post click." (2026-08-31)

| Screen | When | Contains |
|---|---|---|
| Arrival (pre-click) | landing on the slide | SITUATION · ROOM · MOOD · OPEN · DO · NOTE |
| Read (post-click) | diagram full-screened | the slide's `body`, plus SAY lines |

`splitScript` enforces it. Colours: **SITUATION** violet · **ROOM** blue ·
**MOOD** green · **OPEN** gold · **SAY** gold · **DO** blue · **NOTE** grey.
OPEN shares SAY's gold deliberately — they never share a screen, and both mean
"words you speak".

Write scripts as tagged lines. Untagged still renders (one grey block), so it is
a warning not a failure — but colour-coding is the point.

```
SITUATION: where we are in the story; what just happened
ROOM:      what is on screen, what to have ready
MOOD:      the energy to set before speaking
OPEN:      the first words out of your mouth
DO:        an action — run it, ask it, wait
SAY:       spoken verbatim
NOTE:      commentary, pacing, what to watch for
```

### 4. Shorter than authored. Volume is what makes a class overrun.

Weeks 4 and 5 both ran past the end and never reached the last two segments.
The cause was **not** pace:

| | W4 authored | W4 as presented | W5 | W6 authored | W6 rebuilt |
|---|---|---|---|---|---|
| teach slides | 22 | 22 | 22 | 21 | **16** |
| body prose | 13,787 | 11,450 | 15,435 | 14,903 | **8,762** |
| live builds | 4 | 4 | 4 | 4 | **2** |

**Rules that follow:**
- **At most TWO live builds** in a 30-minute micro-build window. Convert the
  rest to `code.kind: 'review'` teaching prompts — full prompt on screen, taught
  line by line, with the reasoning written *into the prompt as comments*, and
  the room runs them before the next class.
- **Never cut questions.** They cost 1–2 minutes each and they hold the room.
  Cut prose and live builds instead.
- **Move the best moment early.** The `challenge` (95–110) and `trivia`
  (110–117) segments are where the overrun lands. Anything you care about goes
  in `architecture` (~min 45) instead. Leave a genuinely expendable
  self-diagnosis poll in the tail.

### 5. One narrative spine everyone can follow

> "Make sure you have an overall narrative, good examples, and questions throughout to keep them engaged… have a great story everyone can understand and follow."

Pick a spine a non-engineer would understand and restate it in the roadmap
slide, in every segment eyebrow, and at the close. Week 6 used **the night
shift**: a helper that works while you watch becomes a worker who works while
you sleep, and the four protocol upgrades became the four things any night
worker needs — no keys of their own (sampling), a duty to call in
(notifications), a floor they stay on (roots), a posting somebody signed
(transport).

Story beats are human and specific and end with a **punch** aphorism. Polls have
four plausible options, a `reveal` that reasons, and a `presenterTip` that says
how to *run* it ("expect the room to split hard", "send mentors to the last two
options immediately").

### 6. Teach in the prompts, even where nothing is built

> "Allow teaching in the prompts even if we aren't building something with that step."

A `kind: 'review'` prompt renders as "📖 REVIEW TOGETHER — do not paste" and
drops the rescue row. Put the *why* inside the prompt as comments:

```
1. Declare the logging capability when the server is constructed.
   # WHY: without the declaration the client drops every log message on the
   # floor. Nothing errors. You will think your code is broken and it is not.
```

### 7. Write for the room that will actually be there

If a Monday was a holiday, the Thursday deck must never say "as we said on
Monday". Say the shape of the night out loud at the top, including a non-standard
finish time.

---

## Hard traps

**Slide ids are `<segmentId>-<index>` and are NOT unique.** The cover and the
cold-open segment slide are both `cold-open-0`. Key `slideNotes` as `kind:id`
to disambiguate. **Never renumber slide ids — the live poll key IS the slide
id**, so renumbering orphans votes mid-class.

**`teachToSlides` filters by segment id.** A slide tagged with a segment that is
not in the run-of-show renders **nowhere**, silently. Valid Architecture Day:
`cold-open, checkin, business-problem, architecture, deconstruct, reset,
micro-build, challenge, trivia, trailer`. Build Day: `result-preview, readiness,
build-map, guided-build, reset, failure, demos, broadcast, cta`.

**Checkpoint slides are not overridable.** The buildmap and CP0..CPn render from
the week's `buildMap`/`checkpoints` in `classSessionPlan.ts`. Week 4's Build Day
was rebuilt around five prompts while five checkpoint slides still advertised
"8 prompts". Either keep the checkpoint count, or set
`checkpointsEnabled: false`.

**`detectDayKind` matches the literal phrase `architecture day`.** For a
combined class, "Week 7 · Architecture **+ Build** Day" resolves to `build`
(correct, keeps checkpoints); "Architecture Day + Build Day" would flip it to
`architecture` and silently drop the entire build.

**The run-of-show scales proportionally.** At 150 minutes `build-map` is still
only 12 minutes. Put long teaching inside `guided-build` (63 min) or the pace
tracker reads as badly behind all night.

**`.js` under `backend/src/scripts` never reaches `dist`** (no `allowJs`). Deck
composer scripts run from your laptop or via `docker cp`, never from the image.

---

## The process

### Step 1 — audit first, always

```bash
scp backend/src/scripts/auditClassDecks.js root@95.216.199.47:/tmp/audit.js
ssh root@95.216.199.47 'docker cp /tmp/audit.js accelerator-backend:/app/audit.js \
  && docker exec accelerator-backend node /app/audit.js'
```

Runs against the **rendered** deck for every scheduled session. `--all` includes
completed/cancelled; pass a session id for a verbose single-session report.
Exit 1 on any hard failure, so it can gate a deploy.

### Step 2 — decide the layer

- Wrong/stale content that every future cohort should get fixed → **edit
  `weekN.ts`**, needs a deploy.
- Shape of one specific night (cutting, reordering, a combined class) →
  **`kit_config_json` override**, DB write only.
- Commentary on generated slides → **`slideNotes`**, DB write only.

Prefer the week file. An override is a fork you have to maintain.

### Step 3 — compose, do not transcribe

For a big rebuild, write a composer script that requires the authored
`WEEK_N_PACK` from `dist` and assembles the override from slides that already
exist. See `session15-week7-combined.js`: it lifted six architecture slides from
a cancelled Monday, re-segmented them to `guided-build`, and prepended them to
Thursday's authored build slides. No 19-slide hand-copy to drift from source.

### Step 4 — apply

```js
const { saveKitConfig } = require('/app/dist/services/sessionKitConfigService');
saveKitConfig(sessionId, config)   // mergeKitConfig fills unset categories with defaults
```

`null` for a category means "use the authored defaults". An `overrides` array is
a **full replacement**, never a merge.

### Step 5 — verify from the database

Rebuild the spec via `getKitConfig(sessionId)` — not your in-memory object — and
re-run the audit. Then confirm the presenter phone:

```js
const { getPresenterNotes } = require('/app/dist/services/sessionLiveStateService');
```

It derives both screens server-side from the session's own spec, so **tab age no
longer matters** — if notes look wrong, suspect content, not a stale Present tab.

### Step 6 — rollback

```sql
UPDATE live_sessions SET kit_config_json = NULL WHERE id = '<session>';
```

Restores the authored deck exactly.

---

## Reference files

| What | Where |
|---|---|
| Audit tool | `backend/src/scripts/auditClassDecks.js` |
| Architecture Day rebuild | `backend/src/scripts/session-decks/session12-week6-monday.js` |
| Commentary for generated slides | `backend/src/scripts/session-decks/session12-slide-notes.js` |
| Composed combined class | `backend/src/scripts/session-decks/session15-week7-combined.js` |
| Contract enforcement | `classKit/kitHtml.ts` (`splitScript`), `classKit/kitConfig.ts` (`slideNotes`) |
| Two-screen renderer | `services/sessionKitDocService.ts` (`paint`, the category CSS) |
| Phone derivation | `services/sessionLiveStateService.ts` (`getPresenterNotes`) |

## Definition of done

- [ ] `auditClassDecks.js` reports **0 failures** for the session
- [ ] Verified by reading `getKitConfig` back from the database, not from a diff
- [ ] Every code block is a Claude Code prompt
- [ ] Every slide has commentary written for *that* slide
- [ ] Arrival and read screens share no text
- [ ] Checkpoint count still matches the buildmap (Build Day)
- [ ] Slide count and prose are **below** the authored baseline, not above
- [ ] Session log entry in `docs/sessions/CC-<id>.md`
