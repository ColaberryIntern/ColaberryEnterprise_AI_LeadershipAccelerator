# plan-live-session scorecards

Four scorecards. **Grade harshly.** A score goes up only when the text on the page earned it, never
because the next stage would be easier. When two scores seem equally fair, take the lower one.

---

## 1. Idea scorecard (0–100): does this angle deserve the week?

Used in Stage 4 on every angle and in Stage 5 while tightening. Each line is 0–5: **3 means it meets
the benchmark, 5 means it is proven** by evidence gathered in this run. Total = Σ(score ÷ 5 × weight).
Do the arithmetic with `scripts/score_idea.js`, not by hand.

| Line (`key`) | Weight | 1 | 3 | 5 |
|---|---|---|---|---|
| Proven demand (`demand`) | 20 | No similar video has performed | A similar video beat its channel's median | A video on this exact angle ran 3× a channel's median in the last 90 days |
| Right viewer (`viewer`) | 15 | Hobbyists who will never enrol | Working professionals who could become FDEs | The exact person on the program page |
| Five-word promise (`promise`) | 15 | Needs a sentence to explain | Clear, under 50 characters | Five words or fewer, under 30 characters |
| Tension (`tension`) | 10 | Neutral and informational | A clear benefit | Stakes, a contrarian claim or a mistake to avoid |
| Proof only I have (`proof`) | 15 | Opinion anyone could give | A demo I built | A real deployed build or learner result on screen |
| Series fit (`series`) | 10 | A one-off | Fits a loose theme | A named episode in a recurring series |
| News hook (`news`) | 15 | No reason to publish this week | A story from the last 90 days as proof point | A story under 14 days old that touches the viewer's job or pay |

**Caps** (applied by `score_idea.js`):
- No `proof` input given → "Proof only I have" cannot exceed **2**.
- Tension ≤ 1 **and** Demand ≤ 1 → total capped at **50**.
- Proof = 0 → total capped at **60**.

**Scoring discipline**
- `demand` needs a named video with a view count found in this run, compared with its channel's
  median over its ten most recent uploads (method in SKILL.md Stage 1.4). No channel median →
  2 at most. No evidence found → 1 at most.
- `news` needs a dated story. Its age decides the ceiling: under 14 days can reach 5, 14–90 days 3, older 1.
- `viewer`: "the exact person on the program page" is the 35–60 enterprise professional in
  `TWELVE_WEEK_STORY_ARC.md`, who has never written production code and is changing careers toward
  forward deployed AI engineering. Developer-hobbyist framing scores 1–2.
- `series`: 5 when the session is a named, numbered episode of a recurring series. The weekly
  live is one: with no `series=`, the skill names it "Weekly Live · Episode N" (N from
  `history.js episode`), which earns 5. A one-off special that sits outside that run scores 1.
- `news` is stricter than topic scoring's `newsFit` on purpose: here the story must touch the
  viewer's job or pay to reach 5.
- **Ceiling without `proof=`:** 91; with demand ≤ 1 as well, 75. Default `pass_mark` 70 is
  reachable on a default run only if the other lines are genuinely strong.

---

## 2. Live scorecard: Room (0–50) and Yield (0–50)

Used in Stage 6, section 10. Five lines each, 0–10 per line. Anchors at 2 / 6 / 10; score between them freely.

### Room: will the people in the session stay and learn?

| Line | 2 | 6 | 10 |
|---|---|---|---|
| **Cold open** | Starts with an agenda or a greeting | Shows the finished result | Shows the finished result in ≤ 5 minutes **and** calls back to last session by name |
| **Pace** | A segment runs over 10 minutes | Every segment ≤ 10 minutes | A new segment every 8–10 minutes, pace changes at story beats, total ≤ 90 minutes where possible |
| **Participation** | Questions only at the end | A chat prompt in most segments | A chat prompt in **every** segment, 6–10 questions across all four kinds, a hot seat or Q&A |
| **Build credibility** | Slides only, nothing runs | One live build | Two or more live builds, one deliberate failure or teardown, a fallback ready in a second tab |
| **Student relevance** | Generic topic, no curriculum tie | Matches the week's theme | Matches the week's beat and deliverable, uses a recurring story device, points at the student's own build plan, ends with an open loop to next week |

### Yield: how much publishable content does it leave behind?

| Line | 2 | 6 | 10 |
|---|---|---|---|
| **Clip density** | Fewer than 5 standalone lines | 10 sound bites | 10+ sound bites, every one scoring ≥ 70, all seven kinds present, spread across segments |
| **Shorts readiness** | No obvious Shorts | 6 Shorts titles | 6 Shorts, each mapped to a sound bite **and** a segment with a clean full-screen visual, cuttable to 40–55 seconds |
| **Long-form path** | Nothing to edit down to 18–24 minutes | A clear edit path | The edit path is 18–24 minutes, the first 20 minutes stand alone, the avatar script needs no live context |
| **Title and thumbnail** | Title over 50 characters | Title ≤ 34 characters | About five words, ≤ 30 characters, contrarian or stakes framing, thumbnail text ≤ 10 characters |
| **Distribution pack** | Only the video | Video + LinkedIn | Video, Shorts, 3 quote cards, LinkedIn post, email recap, next-live CTA, and `publicValue` on every slide |

`scores.room.lines` and `scores.yield.lines` record each line as `{ "score": n, "why": "..." }`.
`topFixes` names the two changes that would add the most points across all three scores, with the
points each would add.

---

## 3. Video scorecard (0–25): the edited 18–24 minute avatar video

Not scored in the blueprint itself (the video does not exist yet). Use it when `contentYield.video`
is turned into the avatar script, and when a past session's results are filled into `history.json`.

| Line | 1 | 3 | 5 |
|---|---|---|---|
| **First 12 words** | Greeting, name, or "in this video" | Addresses "you", states the topic | Addresses "you" with a stake or a contrarian claim, no greeting, no subscribe ask |
| **Title** | Over 50 characters | ≤ 34 characters | ~5 words, ≤ 30 characters, negative/contrarian framing where honest |
| **Thumbnail** | A paragraph of text | ≤ 10 characters of text | ≤ 10 characters, one face or one result, no clutter |
| **Retention structure** | One long talk | Chapters | A new beat every 2–3 minutes, the finished result in the first minute, a payoff near the end |
| **Length and CTA** | Under 12 or over 35 minutes | 15–28 minutes | 18–24 minutes, one CTA at the end pointing at the next live |

---

## 4. Sound-bite scorecard (0–100)

Scored only by `scripts/score_soundbite.js`; this table explains what it does. Rewrite anything under 70.

| Rule | Points |
|---|---|
| Start | 40 |
| 8–28 words | +15 |
| Under 6 words | −22 |
| Over 40 words | −15 |
| Contains a number | +10 |
| Contains a contrast word (but, instead, never, stop, not, mistake, fail) | +12 |
| Addresses "you" | +8 |
| Contains a stakes word (biggest, only, every, first, worst) | +6 |
| First-person story verb (we built, we shipped, we cut) | +6 |
| Starts with and, so, but, because, it, this, that, they | −15 |
| Each filler (um, you know, kind of, basically) | −7 |
| Clamp | 0–100 |

The blueprint has stricter hard rules than the scorer: every bite is **8–25 words**, makes sense
with zero context, and never starts with "and", "so", "it" or "this". The validator enforces both.
Typical passing shapes: contrast + "you" (75), number + contrast (77), number + "you" (73).
