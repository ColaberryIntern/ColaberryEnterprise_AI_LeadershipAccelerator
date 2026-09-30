# Worked examples — five shipped, certified types

These are the real, in-prod authored configs from `backend/src/seeds/seedComponentAuthoring.ts`
(`COMPONENT_AUTHORING`). Copy the shape; adapt the prompt. They cover the four archetypes you'll
reuse: **zero-input reading** (Overview, Self Study), **zero-input scored** (Knowledge Check,
Evaluation), and **zero-input feedback** (Survey). All five are `inputs: []` / `variable_keys: []`
— the runtime supplies the week via WEEK CONTEXT.

> Reminder: the authored fields below live in `seedComponentAuthoring.ts` (promotes to prod on
> boot). Registry metadata (render_band, xp, flags, competencies) + the student chip live in
> `typeRegistry.ts`. Ship both.

---

## 1. Overview — generic render band, week-summary with roster

Archetype: passive read, zero input, uses the section roster. `slug: overview`, `render_band: overview`.

```js
overview: {
  student_label: 'Overview',
  category: 'Learn',
  icon: 'bi-binoculars',
  badge_class: 'bg-info',
  estimated_time: 8,
  capabilities: ['bookmarks', 'comments', 'likes'],
  inputs: [],
  variable_keys: [],                       // zero author input — runtime injects blueprint + week roster
  outputs: [
    { key: 'title', type: 'string', description: 'Overview — {week topic}' },
    { key: 'body_html', type: 'html', description: '4-part week overview' },
    { key: 'summary', type: 'string', description: 'One-sentence week summary' },
  ],
  completion_rules: { on: 'view' },
  evaluation_type: 'none',
  generation_prompt: OVERVIEW_GENERATION_PROMPT,
  thumbnail_url: '/thumbnails/curriculum-types/overview.jpg',
  renderers: { thumbnail: OVERVIEW_THUMBNAIL_RENDERER },   // same picture, title overlaid
  approved: true,
  status: 'ready',
},
```

Generation prompt (the pattern to copy — note: title format spelled out exactly, grounded in
WEEK CONTEXT, roster used when present, unused keys set explicitly, executive voice, word budget):

```
You write the Week Overview … The WEEK CONTEXT block above gives this week's topic, focus,
learning objectives, competencies, architect domains, student outcomes, success criteria, and
level. Ground everything in it and invent nothing it does not support.

title: the word "Overview", then a space, an em dash, a space, then the week's topic exactly as
named in the WEEK CONTEXT. Example: "Overview — Claude Code Foundations + Workspace".

body_html: clean, self-contained, VALID and fully balanced HTML (no scripts, no inline styles).
Emit exactly these four parts in order:
  1. <p> one/two-sentence welcome naming the week's big idea </p>
  2. <p><strong>What you'll cover</strong></p> then a <ul> of 3–6 short <li> — when a THIS WEEK'S
     ACTIVITIES list is provided above, draw items from it; otherwise use the learning objectives
  3. <p><strong>Why it matters</strong></p> then <p> tie the week to the AI Systems Architect path </p>
  4. <p><strong>By the end of this week you'll be able to…</strong></p> then a <ul> of 2–3 <li>
     capability statements from student outcomes or success criteria
Every opening tag must have a matching closing tag.

summary: one sentence. completion: "Marked complete when the participant opens and reads the overview."
Return questions as [], reflection as "", discussion_prompt as "", github_task as null,
evaluation_criteria as [].
Voice: executive — clear, calm, authoritative. ~150–230 words. No hype, no emojis. Em dash only in the title.
```

The thumbnail renderer overlays the title on the fixed vista picture — it copies the exact
`<img src="/thumbnails/curriculum-types/overview.jpg" …>` verbatim so the Library tile and the
rendered thumbnail are the same image.

---

## 2. Self Study — bespoke reader render band (`warmup`)

Archetype: immersive reader; **the content carries NO styling/nav/script — the reader supplies it.**
The label diverges from the slug: `slug: warmup`, `label/student_label: 'Self Study'`,
`render_band: 'warmup'`. This is the type that taught us "slug is an FK; never rename."

```js
warmup: {
  label: 'Self Study',
  student_label: 'Self Study',
  description: 'Read-before-class self-study material … Not tested, not timed.',
  category: 'Self Study',
  icon: 'bi-journal-text',
  badge_class: 'bg-primary',
  estimated_time: 20,
  capabilities: ['reflection', 'discussion', 'bookmarks', 'comments', 'likes'],
  inputs: [],
  variable_keys: [],
  outputs: [
    { key: 'title', type: 'string', description: 'Self Study — {week topic}' },
    { key: 'body_html', type: 'html', description: 'Self-contained styled reading (Parts, term cards, callouts)' },
    { key: 'summary', type: 'string', description: 'One-sentence framing' },
  ],
  completion_rules: { on: 'view' },
  evaluation_type: 'none',
  generation_prompt: SELF_STUDY_GENERATION_PROMPT,
  thumbnail_url: '/thumbnails/curriculum-types/warmup.jpg',
  approved: true,
  status: 'published',
},
```

Generation prompt — load-bearing instructions (the full text is in the seed; these are the parts
that matter for reuse of a bespoke-reader type):

- Ground every word in WEEK CONTEXT; **generalize to whatever the week's topic is; never hard-code a
  specific week's subject.**
- Audience: little/no prior background; warm, plain-English; define jargon on first use; nothing
  graded/tested/timed.
- **Grounding & accuracy guard:** stay at the level WEEK CONTEXT names; don't invent technical
  claims or mis-describe a named tool; accuracy beats completeness.
- Depth: 5–6 Parts, each opening with its key idea then 2–4 paragraphs + a concrete beginner example;
  include ≥1 comparison table and ≥1 caution.
- **`body_html` = `<section>` blocks ONLY — NO `<style>/<script>/<nav>`, no images, no inline
  styles, no wrapping `<div>`.** First `<section id="intro" data-nav="Overview">`; then
  `<section id="p1" data-nav="Short Label">` … `pN`, each `data-nav` a 1–3 word tab label. Allowed
  tags only: `section` (unique `id` + `data-nav`), `h2`, `h3`, `p` (class `lead`/`why`), `ul`,
  `ol`, `li`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, `div class="term"`, `div class="warn"`, `b`.
- title `"Self Study - <week topic>"`; questions = 4–6 ungraded self-checks; reflection = 1 low-stakes
  prompt; discussion_prompt = 1 cohort seed; github_task null; evaluation_criteria `[]`.

---

## 3. Survey — bespoke live survey render band

Archetype: weekly feedback; the **1–5 scale is code** (`CardSurveyExperience`); the prompt steers
the ~10 Likert statements + one open prompt. `slug: survey`, `render_band: survey`.

```js
survey: {
  student_label: 'Weekly Feedback',
  category: 'Reflect',
  icon: 'bi-clipboard-check',
  badge_class: 'bg-warning',
  estimated_time: 5,
  capabilities: ['reflection', 'comments'],   // written reflection + comment thread; scale is code
  inputs: [],
  variable_keys: [],
  outputs: [
    { key: 'title', type: 'string', description: 'Week {n} Feedback — {week topic}' },
    { key: 'questions', type: 'string[]', description: '~10 Likert (1–5) feedback statements' },
    { key: 'reflection', type: 'string', description: 'One open feedback prompt' },
    { key: 'summary', type: 'string', description: 'One-sentence framing' },
  ],
  completion_rules: { on: 'submit' },
  evaluation_type: 'none',
  generation_prompt: SURVEY_GENERATION_PROMPT,
  thumbnail_url: '/thumbnails/curriculum-types/survey.jpg',
  approved: true,
  status: 'ready',
},
```

Prompt pattern: `questions` = EXACTLY 10 first-person **agreement statements** (not questions),
each rated 1–5, covering a fixed spread (clarity, pace, confidence-on-objective, relevance,
hands-on, support, workload, engagement, progress, recommend), each rephrased to the week's actual
topic, <18 words, never numbered. `reflection` = one open "what would make next week better."
title `"Week {n} Feedback — {topic in Title Case}"`. Warm, concise, em dash only in the title.

---

## 4 & 5. Knowledge Check + Evaluation — scored render bands (`quiz` / `evaluation`)

Archetype: **the questions are auto-generated by `assessmentService`** (blueprint + competency
aware) and rendered by the code `AssessmentPanel`. The generation prompt only frames title/summary
+ a one-line `body_html`. Knowledge Check = entry baseline (no pass gate); Evaluation = end-of-section,
**75% pass gate enforced in `assessmentService`** and documented in `completion_rules`.

```js
knowledge_check: {
  student_label: 'Knowledge Check', category: 'Assess',
  icon: 'bi-question-circle', badge_class: 'bg-info', estimated_time: 5,
  capabilities: ['quiz', 'scoring', 'ai_chat'],
  inputs: [], variable_keys: [],
  outputs: [
    { key: 'score', type: 'number', description: '0-1 entry-check score (the section baseline)' },
    { key: 'competency_scores', type: 'object', description: 'per-competency correct/total' },
  ],
  completion_rules: { on: 'submit' },
  evaluation_type: 'none',
  generation_prompt: KNOWLEDGE_CHECK_GENERATION_PROMPT,
  thumbnail_url: '/thumbnails/curriculum-types/knowledge_check.jpg',
  approved: true, status: 'ready',
},
evaluation: {
  student_label: 'Evaluation', category: 'Assess',
  icon: 'bi-clipboard-check', badge_class: 'bg-danger', estimated_time: 12,
  capabilities: ['quiz', 'scoring', 'ai_chat', 'retry'],
  inputs: [], variable_keys: [],
  outputs: [
    { key: 'score', type: 'number', description: '0-1 evaluation score' },
    { key: 'passed', type: 'boolean', description: 'true when score >= 0.75' },
    { key: 'competency_scores', type: 'object', description: 'per-competency correct/total' },
  ],
  completion_rules: { on: 'evaluate', min_score: 0.75 },   // 75% gate — enforced in assessmentService
  evaluation_type: 'rubric',
  generation_prompt: EVALUATION_GENERATION_PROMPT,
  thumbnail_url: '/thumbnails/curriculum-types/evaluation.jpg',
  approved: true, status: 'ready',
},
```

Framing prompts are short — e.g. Evaluation: title `"Evaluation — {week topic}"`; summary =
"the graded check … 75% or higher to pass and earn points"; `body_html` = one `<p>` noting it's
scored, needs 75%, can be retried, and shows growth since the entry Knowledge Check; all other
keys empty.

---

## Pattern summary (what every one of these does right)

1. `inputs: []`, `variable_keys: []` — lean on WEEK CONTEXT, don't ask the author for anything.
2. `title` format spelled out **exactly**, grounded in the week's topic/number from WEEK CONTEXT.
3. Every unused output key set explicitly (`questions: []`, `github_task: null`, …).
4. `body_html` rules match the render band: self-contained CSS for generic bands; **no** styling
   for bespoke-reader/scored bands (the renderer owns it).
5. Parts (`capabilities`) match the behavior; scored/live-UI interactivity is code, not prompt.
6. `thumbnail_url` = short static asset path; `approved: true` only after sign-off.
7. Shipped via `seedComponentAuthoring.ts` (+ `typeRegistry.ts` for the chip/metadata).
