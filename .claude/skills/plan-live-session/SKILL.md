---
name: plan-live-session
description: Plan Ali's weekly live session end to end. Picks the topic from the 12-week curriculum, this fortnight's AI news and proven YouTube demand; writes and scores story angles; tightens the best one until it passes the Idea rubric; then writes a complete session blueprint (run-of-show, sound bites, slides, sourced facts, participation, live Claude Code demo, student build-along, content yield for an 18–24 minute avatar video plus Shorts/quote cards/LinkedIn/email, scores, checklist, and a build-class-deck handoff). Runs with no arguments and never asks a question unless interactive=true. Invoke on "/plan-live-session", "plan next week's live", "plan the live session on X", "what should this week's live be", "blueprint for Tuesday's live". It never builds the deck; build-class-deck does that from the blueprint.
user-invocable: true
---

# plan-live-session: the weekly live-session planner

Ali owes subscribers one live session every week. Each session does three jobs at once:

1. **Curriculum.** It feels like part of the course: students experience "live sessions every week"
   that help them through the week they are on.
2. **Build.** Ali builds something real on screen with Claude Code.
3. **Content.** It yields one 18–24 minute YouTube video scripted for the AI avatar, 5–7 Shorts,
   quote cards, a LinkedIn post and an email recap.

This skill picks the topic, crafts the story, tightens it against a rubric until it passes, and
writes a **session blueprint**. It never builds the deck; `build-class-deck` does that.

**It must be easy.** No arguments → a finished blueprint. **Never ask Ali a question** unless
`interactive=true`. Where an input is missing, take the default, write the assumption into
`meta.assumptions`, and keep going.

All commands below run from the repo root. `S=.claude/skills/plan-live-session/scripts`.

---

## Inputs (all optional)

| Parameter | Values | Default | Meaning |
|---|---|---|---|
| `source` | `auto` `curriculum` `news` `mix` | `auto` | Where the topic comes from. `auto` lets the data decide. |
| `topic` | text | none | Ali's own topic. Overrides the data pick; still matched to a curriculum week. |
| `week` | 1–12 | auto | Force a curriculum week. |
| `students_on` | 1–12 | unknown | The week most subscribers are on. Nearby weeks rank higher. |
| `build` | text | skill chooses | What to build live on screen. |
| `proof` | text | none | Real proof Ali can show (a deployed build, a learner result, a number). |
| `news` | text or URL | skill searches | Headline, facts or a link to use as source material. |
| `audience` | `students` `public` `public-preview` | `students` | Students only · public on YouTube with students in chat · first 20 minutes public, rest members-only. |
| `length` | 60 90 120 | 60 | Minutes. |
| `date` | YYYY-MM-DD | next open weekly slot | Air date. Drives news age. |
| `last_session` | text | read from history | What last week covered, for the callback. |
| `series` | text | none | Series name and episode number. |
| `guest` | text | none | Guest practitioner and role. |
| `avoid` | text | none | Topics, claims or tools to leave out. |
| `notes` | text | none | Anything else the plan must respect. |
| `angles` | 3–7 | 5 | How many story angles to craft. |
| `pass_mark` | 60–90 | 70 | Idea score required before the blueprint is written. |
| `interactive` | true/false | false | Pause for Ali's choice after topic picks and after angles. |
| `stop_after` | `picks` `angles` `idea` `blueprint` | `blueprint` | Stop early and print what exists. |
| `out` | path | `docs/live-sessions/` | Where blueprints are written. |
| `history` | path | `docs/live-sessions/history.json` | Testing only: point at a scratch history so test runs never pollute the real one. |

**Parsing.** Accept `key=value` pairs (quote values with spaces) **and** plain sentences. Map a
sentence onto the same parameters: "plan next week's live on subagents, students are on week 7" →
`topic="subagents" students_on=7`; "a 90 minute public one about the FDE academy news" →
`length=90 audience=public source=news topic="FDE academy"`. "next week" with no date → the default
date. Out-of-range values: clamp to the nearest allowed value and record it in `meta.assumptions`.
Print the resolved parameters as one line before Stage 1, marking defaults, e.g.
`source=auto · week=auto · students_on=unknown · audience=students · length=60 · date=2026-12-03 (default) · angles=5 · pass_mark=70 · stop_after=blueprint · out=docs/live-sessions/`.

**`topic` vs `week`.** `week` wins for the curriculum week. `topic` alone → pick the week whose
theme/beat it fits best (say which and why in `dataPick.reason`). Both → use both; if they clash,
keep `week` and frame the topic as that week's lesson.

---

## The pipeline

Print **one short progress line per stage** (`Stage 2/7 · scored 12 weeks → week 5, 71.0`).
Intermediate files go in `<out>/.work/<date>/` (git-ignored). **If a stage fails**, keep what is
finished, write `<out>/.work/<date>/partial.json` with every completed stage's output, and tell Ali
exactly which stage to re-run and why. Never discard finished work.

### Stage 1 — Load the data

1. **History and date first** (everything else is filed under the date). Add `--history=<history>`
   to **every** `history.js` and `score_topics.js` call when `history=` was given:
   ```
   node $S/history.js init       [--history=<history>]
   node $S/history.js next-date  [--history=<history>]   # only when date= was not given
   node $S/history.js last       [--history=<history>]   # only when last_session= was not given
   node $S/history.js episode    [--history=<history>]   # only when series= was not given
   ```
   `next-date` returns the next open weekly slot at least one day out; if it prints an
   "assumption:" line, copy it into `meta.assumptions`. No previous session → the callback is to the
   student's current week ("you just finished…"), recorded as an assumption. If `last` says
   `notYetAired: true`, or it is more than 7 days before the new date, the callback says "last
   session", never "last week", and describes what it *covers*, not what happened in it.
   **Series default:** the weekly live *is* a recurring series. With no `series=`, use
   `"Weekly Live · Episode <episode>"` and record that as an assumption; it scores the Idea rubric's
   `series` line as a named episode in a recurring series.
   Now set `<work>` = `<out>/.work/<date>/` and create it (`mkdir -p <work>`).
   If `next-date` says no air time is set, write "time to be confirmed (Central)" wherever a
   time would go; never invent one.
2. **Curriculum** (never copy it into the skill; the repo is the source of truth):
   ```
   node $S/load_curriculum.js > <work>/curriculum.json
   ```
   It reads `backend/src/data/canonicalCourse.ts`, `backend/src/data/classSessionPlan.ts` (the
   week's assignment is its deliverable) and `docs/training-program-2026-q3/TWELVE_WEEK_STORY_ARC.md`,
   and returns per week: theme, intensive, act, beat, Academy course, deliverable, and the recurring
   devices (2 AM question, the person who isn't there, trust rung, own project, dragon callback).
   Also skim `docs/training-program-2026-q3/CANONICAL_COURSE_STRUCTURE.md` for the chosen week.
   A non-empty `gaps` array is not fatal: use what exists and list the gap in `meta.assumptions`.
3. **News, in two passes** (the leading week depends on the news, so do not search for it first).
   If `news=` is a URL, fetch it. If it is text, search for the original story and fetch it.
   Otherwise:
   - *Pass 1, broad:* web searches for the **14 days before today** (news cannot come from the
     future, even when `date` is weeks out) on: forward deployed engineer; Anthropic and Claude
     Code releases; MCP; agent skills; subagents; enterprise AI deployment. `ageDays` is still
     counted to the air date, so a date far out lowers the news ceilings; say so in the Stage 1 line.
   - Score provisionally (Stage 2 command, leaving `demand` out of every week so it scores neutral
     2), then *pass 2:* search the top three weeks' own keywords (theme words plus the
     deliverable), gather demand (step 4), and re-score. With `week=` given, the "top three" are
     the forced week and its two neighbors.
   One event reported by two publishers is **one** story (keep the better source, cite both in
   `sources`). A release-notes or changelog page counts as the story's source when the entry's
   own text is on it, even if the page holds other entries.
   **Keep at most six stories**, each with headline, publisher, URL, publication date and
   `ageDays` from `date`. Fetch each one you keep: a story seen only in a search snippet is not a
   source, and neither is an index or listing page (a news index, a changelog's table of
   contents). Fetch the story's own page. Respect `avoid`.
4. **Demand.** For each top-three week, find YouTube videos on the topic from the last 90 days
   and compare each promising one with its channel's median. A web-fetch tool cannot read
   YouTube (the pages render in JavaScript), so use the script, which reads the data the page
   embeds:
   ```
   node $S/yt_demand.js search "<topic keywords>" --limit=10     # views, age, channel handle
   node $S/yt_demand.js channel @<handle> --n=10                 # median of 10 latest uploads ≥ 14 days old
   node $S/yt_demand.js video <id>                               # exact views + publish date
   ```
   Record title, channel, views, channel median, ratio, URL, date in `demand[]`, and the pages
   it printed as `source:` in `sources` (`fetchedThisRun: true`).
   If the channel median cannot be read, the video counts only as "beats the topic's typical
   results" and caps at demand 2. No number seen → no demand evidence; do not infer it. If no
   tool in this session returns YouTube view counts at all, score demand 0 for every week and say
   so in `meta.assumptions`: a uniform 0 does not change the ranking, and the Idea `demand` line
   stays at 1.
5. Write `<work>/signals.json`: `{ "weeks": { "<n>": { demand, buildability, newsFit,
   evidenceCount, evidence } } }`, each score 0–5, `evidenceCount` = stories + videos behind the
   week, `evidence` a one-line reason naming them. **Omit `demand`** for a week you never searched
   (it scores a neutral 2); write `0` only when you searched and found nothing.
   - **buildability**: can the week's deliverable be shown working in about 20 minutes, live, with
     a recorded fallback? 5 only if Ali could build it from an empty folder in 20 minutes with
     Claude Code; 3 if it needs a prepared starter repo; 1 if it cannot run live.
   - **newsFit** (is there a reason this week?): 5 = a story under 14 days old whose *main subject*
     is this week's topic; 4 = main subject, 14–90 days; 3 = a passing mention under 14 days;
     2 = passing mention, 14–90 days; 0 = none.
   - **demand**: 5 = a video on this topic ran ≥ 3× its channel median; 3 = beat its channel
     median; 2 = beats the topic's typical results with no channel median; 1 = videos exist, none
     outperformed; 0 = nothing found.
   Grade these signals as harshly as the Idea rubric: a 5 needs the evidence written in
   `evidence`, and a perfect 100 topic score should be rare enough to double-check.
   The Idea rubric's `news` line is deliberately stricter than `newsFit`: topic scoring asks "is
   this week topical?", the Idea score asks "does the story touch the viewer's job or pay?".

### Stage 2 — Score the topic candidates

```
node $S/score_topics.js --curriculum=<work>/curriculum.json --signals=<work>/signals.json \
  --history=<history> --date=<date> --source=<source> [--students-on=N] [--week=N] --json > <work>/ranking.json
```
(drop `--json` to print the table). Weights for `auto`/`mix`: closeness 30, not yet covered 20,
demand 20, build-ability 15, news fit 15. `source=news` raises news fit to 30; `source=curriculum`
drops it to 5 (see `WEIGHT_SETS` in the script). Ties go to news fit, then demand, then evidence
count, then build-ability. Print the **top six** with every factor visible. Use the top row
unless `week` or `topic` was given. `interactive=true` → show the table and wait for Ali's pick.
`stop_after=picks` → print the table and stop.

### Stage 3 — Craft the story angles

Write `angles` distinct angles, **one per lens**, in this order: `build-story`, `news-consequence`,
`mistake-teardown`, `student-journey` (must use one recurring story device from the week),
`contrarian-take`; for 6–7 add `comparison` then `prediction`. Each angle has:
- `title`: max 34 characters, aim for five words (evidence E1)
- `angle`: one line
- `promise`: what the viewer gets, five words or fewer if possible (scored by the `promise` line)
- `openingLine`: about 12 words, addresses "you", no greeting, no subscribe ask (E4)
- `whyNow`: the dated reason this week
- `proofNeeded`: what must be on screen for this to be believable
- `device`: the recurring story device used (required for `student-journey`, else optional).
  Not every week has every device (Week 5 has no 2 AM question and no "person who isn't there");
  the trust ladder rung and "their own project" exist for every week, so fall back to those.

Demand for an angle may reuse the week's videos from Stage 1.4, capped at 4 unless a video's
title matches the angle itself. Set `originalTitle` on every angle to its title before Stage 5
(the same as `title` when it was never rewritten).

Save them as `<work>/angles.json` (format in the header of `scripts/score_idea.js`), with your
`lines` scores and a one-line `why` per line.

Apply `source`:
- `curriculum`: the week leads; news is at most a one-line cold open.
- `news`: the story leads; the week is the lesson it teaches.
- `mix` / `auto`: weave both. News is why it matters this week; the curriculum is what gets built.

### Stage 4 — Score against the Idea rubric

Score every angle with the Idea scorecard in `references/rubric.md`, **harshly**. Do the arithmetic
with
```
node $S/score_idea.js --file=<work>/angles.json --table --write=<work>/angles.scored.json [--proof-given]
```
(`--proof-given` only when `proof=` was supplied). It applies the caps and prints the table
Stage 4 shows Ali: lens, title, the seven line scores after caps, total. Under it, print each
angle's opening line. `stop_after=angles` → print the table and stop; the `.work` files
(`curriculum.json`, `signals.json`, `ranking.json`, `angles.json`, `angles.scored.json`) stay, and
nothing is written to the blueprint folder or history. `interactive=true` → wait for Ali's choice.

**Ceiling check.** The table's `Ceiling` column is each angle's best reachable total: every
movable line at 5, demand and news held where the evidence put them (with no `proof=`, proof
stays at 2). Print the chosen angle's ceiling in the Stage 4 line. Demand, proof and news cannot
be rewritten into existence.

**Promise scoring:** clarity beats mechanics. A five-word promise the target viewer cannot
understand without a sentence of explanation ("Build your first MCP server") scores the lower
anchor that applies.

### Stage 5 — Tighten until it passes

Take the highest-scoring angle (or Ali's choice; ties → the higher ceiling, then higher
`tension`, then lens order). Round 0 in the log is its starting score.
While its total is under `pass_mark`, rewrite the **two weakest movable lines** and re-score,
**up to four rounds**. "Weakest" = most weighted points lost (`(5 − score) ÷ 5 × weight`).
"Movable" = a line a rewrite can honestly change: `viewer`, `promise`, `tension` (rewrite title,
promise, opening line, framing) and `series`. **Never** `demand` or `news` (evidence either exists
or not) and `proof` only when `proof=` was given. Raise a score only when the rewrite earned it.
Log each round in `header.tighteningLog`: round, `angleLens`, title, score, what changed. Keep the
pre-tightening title in `angles[].originalTitle`.

**Stop early** when the ceiling (every movable line at 5) is still under `pass_mark`: log one
round saying so and why, and do not spend the rounds. If it fails after four rounds, switch to the
next-best angle once (four more rounds, round numbers continue). If that also fails, use whichever
angle has the higher final total (tie → the first), write the blueprint anyway with
`meta.belowPassMark: true`, and say so at the top of the report.
`stop_after=idea` → print the final angle, its score and the log, and stop.

### Stage 6 — Write the blueprint

Read and obey `docs/training-program-2026-q3/TWELVE_WEEK_STORY_ARC.md` (authoring rules) and
`.claude/skills/build-class-deck/SKILL.md` (Ali's settings: no terminal, real commentary on every
slide, two disjoint presenter screens, shorter than authored, one narrative spine, teach in the
prompts). **Where the two disagree, `build-class-deck` wins**: the arc's rule 2 still mentions
`kind: 'review'`, which `build-class-deck` §6 retired. Write `blueprint.json` against
`references/blueprint.schema.json` with the Write tool (never a shell heredoc). Look at
`references/example-blueprint.md` for the expected depth.

1. **Header.** Title, opening line, promise (what a student can do afterwards), air date,
   audience, length, curriculum week with theme, beat, Academy course link and deliverable
   (flatten the loader's object to one string: `"<title>: <item>; <item>"`), the
   story device used, the lens, `lastSessionCallback`, the data-pick table (`dataPick.rows` = the
   ranking rows, `dataPick.weights` = the ranking's `weights`), and the tightening log.
2. **Run-of-show.** Minutes sum to `length`; no segment over 10 minutes; each segment's `start`
   is the sum of the ones before. Segment 1 is `cold-open`, ≤ 5 minutes, shows the finished result
   and calls back to last session. At least two `live-build` segments; one `teardown` (or deliberate
   failure); one `hot-seat` or `qa`; the last segment is `recap`: recap, assign the build-along,
   name next week. `audience=public-preview` → set `publicEndsAtMinute` (a segment boundary ≥ 20)
   and make everything before it stand alone (no "as you'll see later"). Every segment: start,
   minutes, mode, three talking points, the on-screen build, one chat prompt, one clean full-screen
   visual, its sound-bite ids. A new segment every 8–10 minutes (E8).
3. **Sound bites.** At least ten, word for word. Each 8–25 words, a direct statement that makes
   sense with zero context, never starting with "and", "so", "it" or "this". At least one each of
   kind `news-take`, `number`, `mistake`, `framework`, `prediction`, `contrarian`, `story-30s`.
   Score every one: `node $S/score_soundbite.js --file=<work>/bites.json`. Rewrite anything under
   70 and store the scorer's exact number. A `number` bite uses a number from the facts table.
   The `story-30s` bite is the story's 8–25-word line (the one the clip is titled by); put the full
   ~75-word, 30-second story in its `story` field.
4. **Slides.** 10–14, in segment order. Each: `type` (title, teach, demo, story, poll, data, quote,
   close), title, at most three short bullets, an exact description of the visual, a speaker note,
   and `publicValue` (what this moment is worth as public content; it is the clip's label).
   Every `teach` slide carries a mermaid `flowchart LR` with **≤ 7 nodes** and 1–3-word labels.
   **Nothing on a slide is a terminal command.** Anything typed lives in `instruction`, written as
   an instruction to Claude Code that says "Run these steps yourself — do not print commands for
   me to copy and paste." Put the *why* inside the instruction as `# WHY:` comments. The
   validator rejects any slide line, including inside `instruction`, that begins with a shell verb
   (`npm`, `git`, `cd`, `node`, `docker`, `$`, `>` …): describe the outcome, let Claude Code pick
   the command.
5. **Facts and data points.** Every real-world claim (a number, name, price, product name, date,
   result or affiliation about the world) in the audience-facing sections (slides, sound bites,
   speaker notes, participation, demo, students, content yield), plus **every** number in public
   copy. Ranking evidence (`dataPick`, `demand`, `news`) is already sourced through `sources` and
   needs no fact rows. Each fact has a source, URL, publication date and `status`. Structural numbers of the
   session itself (segment minutes, checkpoint numbers, "20 fictional companies" in sample data)
   are not facts. `sourced` **only** when the claim appears in a source fetched in this run (that URL
   must be in `sources` with `fetchedThisRun: true`). Everything else is `verify`. **Never invent a
   statistic, model name, price, result or affiliation.** Curriculum facts cite the repo file as
   source with `url: null` and status `verify`. Check every claim about Colaberry, the program,
   pricing, credentials, partners or outcomes against `frontend/src/config/claimsRegistry.ts`:
   `registry.applies: true` with the matching `key`, or `key: null` and a note "not registered".
   A claim whose entry is `VERIFIED` and approved for public routes may go public: set
   `registryVerified: true` and cite the entry's `evidenceSource` (status stays `verify` unless a
   page fetched this run also shows it). The validator warns on any number in public copy that
   matches no sourced, illustrative or registry-verified fact; clear every such warning.
   A claim whose registry entry is `DO_NOT_PUBLISH` or `NEEDS_VERIFICATION` does not appear in
   public-facing copy (LinkedIn, video, Shorts, quote cards, public segments) at all. Neither does
   a `verify` number. A number from a labeled teaching scenario (the curriculum's made-up
   incident) is not a real-world claim: mark it `verify` with `illustrative: true`, and it may go
   public only with a visible "illustrative" label.
6. **Participation.** 6–10 questions mixing `roll-call`, `diagnostic`, `judgment-poll` and
   `self-check`, each with its answer (a self-check's answer says what a good answer looks like).
   3–5 story beats, each a concrete person, a specific moment and a stake, ending with a punch.
   No invented real people: use a role ("a claims analyst in Dallas"), Ali's own first-hand story,
   or a story from a fetched source.
7. **Live demo plan.** Goal, numbered steps, the exact instructions Ali gives Claude Code (each
   says to run the steps itself), what could go wrong, and a fallback (a recorded run or saved
   result ready in a second tab). The demo uses a sandbox or sample data, never client or student data.
8. **For the students.** The build-along assignment, how to apply it to their own build plan,
   and the open question that brings them back next week. Next week's date for the recap and
   `nextLiveCta` comes from `node $S/history.js next-date --from=<date> [--history=<history>]`;
   copy any "assumption:" line it prints (e.g. a skipped holiday) into `meta.assumptions`.
9. **Content yield.** Edited-video title (≤ 34 chars), thumbnail text (≤ 10 chars), the video's
   first two sentences (spoken by the avatar, no live context needed); six Shorts titles each
   mapped to a sound bite and its segment; three quote cards; a LinkedIn post (plain, ≤ 1,300
   characters, never the word "free"); an email subject and two-line recap; the next-live CTA.
   `publicValue` on every slide (section 4).
10. **Scores.** Idea (the chosen angle's final total); Room and Yield out of 50 each with the Live
    scorecard in `references/rubric.md`, each line `{score, why}` (five lines, 0–10, the total is
    their sum); the two fixes worth the most points.
11. **Pre-show checklist and risks.** Always include, word for word: "No keys, client data or
    student data on screen", "News sources re-checked on the air date", "Clip-marker button
    tested". Add the session-specific ones (fallback tab open, sandbox reset, Zoom/YouTube link).
12. **Deck handoff.** Read `KitConfig` in `backend/src/services/classKit/kitConfig.ts`, `TeachSlide`
    in `backend/src/data/classTeachContent.ts`, `StoryBeat`/`Interaction` in
    `backend/src/data/classSessionPlan.ts` and the run-of-show templates in
    `backend/src/services/classKit/runOfShow.ts`, then fill `deckHandoff`:
    - `session`: title, publicTitle, week, `dayKind` (`build` unless the session is mostly
      teaching, then `architecture`).
    - `segments`: the blueprint's segments with `startMin`/`endMin`, `label`, a deck `mode`
      (`open|present|interact|build|break|close`), `purpose`, `publicValue`, and `deckSegment`:
      the **valid** segment id of that day kind each one lands in (Build Day: `result-preview,
      readiness, build-map, guided-build, reset, failure, demos, broadcast, cta`; Architecture Day:
      `cold-open, checkin, business-problem, architecture, deconstruct, reset, micro-build,
      challenge, trivia, trailer`).
      **Teach slides render only in some of those:** Build Day `build-map, guided-build,
      failure`; Architecture Day `checkin, business-problem, architecture, deconstruct,
      micro-build` (the validator reads this from `kitSpecDaySlides.ts`). Content for any other
      segment travels as `opening`, `interactions`, `storyBeats` or `slideNotes`, never `teach`.
    - `teach`: one `TeachSlide` per blueprint slide that teaches or demos (`segment` = the deck
      segment id, `eyebrow`, `title`, `body`, `bullets`, `diagram`, and `code` as
      `{label, code, kind:'paste', pasteWhere:'Claude Code', expectedResult, stopCondition, rescue}`
      for instructions; never `kind:'review'`), with `script` as tagged lines: SITUATION / ROOM /
      MOOD / OPEN / DO / NOTE for the arrival screen and SAY for the read screen, sharing no text.
      The deck's segment order is fixed (Build Day: guided-build comes before failure). Map in
      time order. Standard Build Day mapping: cold open → `result-preview`; first teach/poll →
      `readiness` or `build-map`; build 1 and the teardown → `guided-build`; a build after the
      teardown → `failure` (it is the recovery); hot seat / Q&A → `demos`; recap → `cta`. When
      the order still cannot be kept, place each slide in the nearest valid segment and add an
      `unmapped` entry naming the reorder.
      Template segments with no blueprint content (readiness, reset, broadcast) still render;
      list each as an `unmapped` entry ("renders as template default").
    - `slideNotes`: commentary for the generated slides (cover, segment openers, story beats,
      questions, close). Read `backend/src/services/classKit/kitSpecDaySlides.ts` for the
      generated slide ids of the day kind; it looks a note up as `<kind>:<id>` first, then the bare
      `id`. Key by `kind:id` where the id is ambiguous: Architecture Day `cold-open-0` is both
      cover and opener; Build Day `result-preview-0` is both (`cover:result-preview-0`,
      `segment:result-preview-0`). Build Day ids seen in a test run: `rules:result-preview-1`,
      `segment:readiness-0`, `buildmap:build-map-0`, `checkpoint:build-map-<N>`, `break:reset-0`,
      `demos:demos-0`, `broadcast:broadcast-0`, `assignment:cta-0`, `beforeafter:cta--1`; story
      beats `<seg>-900+i`, interactions `<seg>-950+i`, teach `<seg>-200+i`. Confirm against the
      file before relying on one; a wrong key is silently ignored.
    - `checkpointsEnabled`: the week's CP0..CPn checkpoint slides render unless this is false.
      Keep `true` only when the live builds follow the week's authored checkpoints; otherwise
      `false` (build-class-deck, "Checkpoint slides are not overridable").
    - `interactions`: `InteractionPlacement`s (`kind` prediction|poll|trivia, `q`, `options`,
      `answer` index for trivia, `reveal`, `segment`, `presenterTip`). Map judgment-poll and
      roll-call → `poll`, diagnostic with a right answer → `trivia`, self-check → `poll` with 3–4
      self-rating options and the good-answer text in `reveal` (a deck poll needs options).
    - `storyBeats`: `StoryBeatOverride`s (`icon`, `eyebrow`, `title`, `body`, `punch`, `segment`).
    - `opening`: Build Day reads only `opening.resultPreview`; Architecture Day reads
      `opening.coldOpen` (and `opening.hook`). Fill the one the day kind reads, `{title, body}`.
    - `unmapped`: every blueprint field the deck cannot carry, with the reason. Do not guess a
      mapping. Known ones: custom segment start/end times (the deck scales a fixed template to the
      session length), `publicEndsAtMinute`, the content-yield section, per-slide `publicValue`
      (the deck reads `publicValue` per run-of-show segment, not per slide).

### Stage 7 — Save, validate and report

The folder is `<out>/<date>-<slug>/` where `slug` is the title in kebab-case (≤ 60 chars).

```
node $S/validate_blueprint.js <dir>/blueprint.json      # fix and re-run until VALID
node $S/render_blueprint.js <dir>                       # writes blueprint.md and sources.md
node $S/history.js append <dir>/blueprint.json [--history=<history>]
```
`blueprint.md` and `sources.md` are always rendered from the JSON, never hand-written, so the two
cannot disagree. `sources.md` lists every URL fetched, with access date. Do not append to history
until the blueprint validates.

**Report** (and nothing longer):
```
<title>
Idea <n>/100 · Room <n>/50 · Yield <n>/50   [⚠ below pass mark]
Facts still marked verify: <n> of <m>
Files: <dir>/blueprint.md · <dir>/blueprint.json · <dir>/sources.md
Build the deck: /build-class-deck blueprint=<dir>/blueprint.json
```
Then one line on any assumption Ali should know about (the default date, an unknown `students_on`).

---

## Rules that apply everywhere

- **No questions** unless `interactive=true`. Defaults and assumptions instead.
- **Never invent a fact.** If it was not in a source fetched this run or in the repo, it is
  `verify`, and a number nobody can source does not go on a public surface.
- **American spelling.** Never the word "free" in public copy. Times in Central (CST/CDT) with the
  zone written out.
- **No terminal on screen.** Everything typed is an instruction to Claude Code to run it itself.
- **The viewer** is the 35–60 enterprise professional from the story arc, not a hobbyist developer.
  Write so a non-engineer can follow the spine.
- **Respect `avoid`** in every section, including news selection and sound bites.
- **One narrative spine**, restated in the cold open, a segment title and the recap.

## Files

| What | Where |
|---|---|
| Scorecards (Idea, Live Room/Yield, Video, Sound bite) | `references/rubric.md` |
| Benchmarks and their sources | `references/evidence.md` |
| Blueprint schema | `references/blueprint.schema.json` |
| Worked example | `references/example-blueprint.md` |
| Curriculum loader | `scripts/load_curriculum.js` |
| Topic scorer | `scripts/score_topics.js` |
| Idea arithmetic + caps | `scripts/score_idea.js` |
| Sound-bite scorer | `scripts/score_soundbite.js` |
| YouTube demand (views, channel median) | `scripts/yt_demand.js` |
| Validator | `scripts/validate_blueprint.js` |
| Markdown + sources renderer | `scripts/render_blueprint.js` |
| History (init, next-date, last, append) | `scripts/history.js` |
| Output and history | `docs/live-sessions/` (see its README) |
