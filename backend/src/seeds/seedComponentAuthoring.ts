/**
 * seedComponentAuthoring — applies AUTHORED config (generation prompt, thumbnail,
 * visual identity, Parts, and I/O contracts) on top of the base curriculum-type
 * registry. The registry (typeRegistry.ts / typeSeeder) creates the rows with
 * behavior defaults; this seed layers the human-authored experience on top.
 *
 * Idempotent: keyed on slug, re-runnable, updates in place, never inserts a
 * duplicate. Run AFTER the base type seed. Rows that don't exist yet are reported
 * as `missing` (not created) so a typo never silently spawns a new type.
 * `renderers` merges KEY-WISE, so authoring one surface never wipes the other seven.
 *
 * As types are certified in Experience Studio (see the `build-curriculum-type`
 * skill), add their authored fields to COMPONENT_AUTHORING so the config survives
 * a reseed and promotes cleanly to prod.
 */
import CurriculumTypeDefinition, { CurriculumTypeDefinitionAttributes } from '../models/CurriculumTypeDefinition';

type AuthoredFields = Partial<CurriculumTypeDefinitionAttributes>;

// ── AI banner thumbnails ─────────────────────────────────────────────────────
// One unique AI-generated banner per curriculum type (consistent enterprise art
// direction + a small Colaberry wordmark chip), shipped as static assets in
// frontend/public/thumbnails/curriculum-types/ and served by the frontend build
// at /thumbnails/curriculum-types/<slug>.jpg. Replaces the deterministic
// gradient templateThumbnail() SVGs (and the earlier hand-drawn Overview vista
// — frontend/public/thumbnails/overview-vista.svg stays on disk but the AI
// banner supersedes it as Overview's picture).
// Regeneration pipeline: scripts/curriculum-type-thumbnails/ (see its README).
const THUMBNAIL_SLUGS = [
  'announcement', 'overview', 'live_class', 'event', 'video', 'testimonial',
  'podcast', 'blog', 'warmup', 'knowledge_check', 'survey', 'prompt_lab',
  'deep_dive', 'prompt_challenge', 'implementation_task', 'artifact_submission',
  'ai_video_feedback', 'mock_interview', 'anthropic_skills_jar',
  'certification_exercise', 'evaluation', 'question', 'discussion',
  'project_task', 'build_story', 'github_sync', 'reflection',
  'community_discussion', 'presentation', 'study_session', 'demo',
  'internship_activity', 'demo_tuesday', 'kes_wednesday', 'marketing_friday',
  'milestone', 'achievement', 'daily_streak', 'completion_badge',
  // legacy pre-registry types (seedCurriculumTypeDefinitions.ts) still shown
  // in the Experience Studio grid
  'executive_reality_check', 'prompt_template', 'ai_strategy',
];

const thumbnailUrlFor = (slug: string): string => `/thumbnails/curriculum-types/${slug}.jpg`;

const AI_THUMBNAILS: Record<string, AuthoredFields> = Object.fromEntries(
  THUMBNAIL_SLUGS.map((slug) => [slug, { thumbnail_url: thumbnailUrlFor(slug) }]),
);

// ── overview ─────────────────────────────────────────────────────────────────
// Overview's picture is its AI banner (short static URL, so BOTH the Library
// <img> and the prompt-driven thumbnail renderer reference the exact same
// picture — an LLM can copy a short URL verbatim; it cannot reliably reproduce
// a data-URI).
const OVERVIEW_THUMBNAIL_URL = thumbnailUrlFor('overview');

// Zero author input: the runtime prepends the week's Blueprint ("WEEK CONTEXT",
// see getBlueprintContext) and — for SECTION_ROSTER_TYPES — the week's actual
// activity roster ("THIS WEEK'S ACTIVITIES", see sectionCurriculumContext), and
// enforces the fixed output schema. This prompt steers title + body_html.
const OVERVIEW_GENERATION_PROMPT = [
  'You write the Week Overview for the AI Systems Architect Accelerator: the framing card a participant reads before the week begins. The WEEK CONTEXT block above gives this week\'s topic, focus, learning objectives, competencies, architect domains, student outcomes, success criteria, and level. Ground everything in it and invent nothing it does not support.',
  '',
  'title: the word "Overview", then a space, an em dash, a space, then the week\'s topic exactly as named in the WEEK CONTEXT. Example: "Overview — Claude Code Foundations + Workspace".',
  '',
  'body_html: clean, self-contained, VALID and fully balanced HTML (no scripts, no inline styles). Emit exactly these four parts in order:',
  '  1. <p> a one or two sentence welcome naming the week\'s big idea </p>',
  '  2. <p><strong>What you\'ll cover</strong></p> then a <ul> of 3 to 6 short <li> items describing what the student will actually DO this week — when a THIS WEEK\'S ACTIVITIES list is provided above, draw the items from it (name the videos, labs, courses, and builds); otherwise use the learning objectives',
  '  3. <p><strong>Why it matters</strong></p> then <p> one or two sentences tying the week to the AI Systems Architect path </p>',
  '  4. <p><strong>By the end of this week you\'ll be able to…</strong></p> then a <ul> of 2 to 3 <li> capability statements from the student outcomes or success criteria',
  'Every opening tag must have a matching closing tag. Do not leave any stray or unbalanced tags.',
  '',
  'summary: one sentence describing what the week covers.',
  'completion: "Marked complete when the participant opens and reads the overview."',
  'Return questions as [], reflection as "", discussion_prompt as "", github_task as null, evaluation_criteria as [].',
  '',
  'Voice: executive — clear, calm, authoritative. About 150 to 230 words. No hype, no emojis. The only em dash appears in the title, not the body.',
].join('\n');

// The prompt-driven thumbnail surface: every Overview thumbnail is the SAME
// fixed vista picture with only the title changing on top of it.
const OVERVIEW_THUMBNAIL_RENDERER = [
  'Render this "Overview" as a compact 320x180 thumbnail card.',
  'Structure: a relatively-positioned rounded-corner card that contains, full-bleed,',
  `EXACTLY this image tag (copy the src verbatim, do not alter it): <img src="${OVERVIEW_THUMBNAIL_URL}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`,
  'and the card title overlaid bottom-left in white (the image has a built-in dark scrim there). Nothing else — no summary, no badges, no extra decoration.',
  'Output clean, self-contained, accessible HTML (no scripts). Use the content:',
  '{{content}}',
].join('\n');

// ── survey (weekly feedback) ─────────────────────────────────────────────────
// Zero author input: the runtime prepends the week's Blueprint ("WEEK CONTEXT")
// and enforces the fixed output schema. This prompt steers the ~10 feedback
// questions (rendered as a 1–5 agreement scale by the survey form) + one open
// prompt, grounded in the week the card sits on.
const SURVEY_GENERATION_PROMPT = [
  'You write the Week Feedback Survey for the AI Systems Architect Accelerator: a short weekly check-in a participant fills out at the end of the week so we can understand their experience, how well they are learning, and what to improve. The WEEK CONTEXT block above gives this week\'s topic, focus, learning objectives, competencies, architect domains, student outcomes, success criteria, and level. Ground the questions in it; keep them specific to this week where natural.',
  '',
  'title: "Week " then the week number from the WEEK CONTEXT, then " Feedback — ", then the week\'s topic in Title Case (capitalize each significant word; keep acronyms like AI, API, MCP as-is). Example: "Week 1 Feedback — Claude Code Foundations + Workspace".',
  '',
  'summary: one sentence telling the participant this is a quick, anonymous-feeling weekly check-in that helps us improve their experience.',
  '',
  'body_html: ONE short <p> (about 25–40 words) framing the survey — thank them, say it takes ~2 minutes, and that their answers shape next week. Valid, self-contained, fully balanced HTML. No headings, no lists, no inline styles.',
  '',
  'questions: an array of EXACTLY 10 concise first-person AGREEMENT STATEMENTS. Each is rated by the student on a 1–5 scale (1 = Strongly disagree, 5 = Strongly agree), so write STATEMENTS, not open questions, and never number them. Cover this spread, roughly in this order, adapted to the week\'s topic and objectives:',
  '  1. Clarity — "This week\'s material was clear and well explained."',
  '  2. Pace — "The pace of this week worked well for me."',
  '  3. Confidence on objectives — a statement that I can now do the week\'s main objective/competency (name it from the WEEK CONTEXT).',
  '  4. Relevance — "What I learned this week is relevant to becoming an AI Systems Architect."',
  '  5. Hands-on — "The hands-on activities helped me actually learn, not just watch."',
  '  6. Support — "When I got stuck, I could get the help or guidance I needed."',
  '  7. Workload — "The amount of work this week was manageable."',
  '  8. Engagement — "I felt engaged and motivated throughout the week."',
  '  9. Progress — "I feel I made real progress toward my goals this week."',
  '  10. Recommend — "I would recommend this week\'s experience to a peer."',
  'Rephrase each to reference the week\'s actual topic/objective where it reads naturally; keep every statement under ~18 words.',
  '',
  'reflection: ONE open-ended prompt (a single sentence) asking what would make next week better for them, or anything they want us to know. Example: "In one or two sentences: what would make next week a better experience for you?"',
  '',
  'completion: "Marked complete when the participant submits their answers."',
  'Return discussion_prompt as "", github_task as null, evaluation_criteria as [].',
  '',
  'Voice: warm, respectful, concise. No hype, no emojis. Em dash only in the title.',
].join('\n');

// ── Self Study (read-before-class) ───────────────────────────────────────────
// Zero author input: the runtime prepends the week Blueprint ("WEEK CONTEXT") and
// enforces the fixed output schema. body_html is CLEAN <section id data-nav> content —
// the immersive reader (CardDetailBody.readerDoc, render_band 'warmup') supplies ALL
// styling plus the sticky top nav + scrollspy + progress + read-gating, AND DRAWS every
// visual (illustrations, diagrams, icon term-cards, stat callouts) from data attributes,
// so the content carries NO <style>/<nav>/<script>/<svg>/<img>. Visuals are REQUIRED here
// (Ali 2026-07-18): a prose-only reading is unacceptable. Certified in Experience Studio.
const SELF_STUDY_GENERATION_PROMPT = [
  'You write the Self Study reading for the AI Systems Architect Accelerator: the "read before class" material a participant reads, at their own pace, before the week\'s live session. The WEEK CONTEXT block above gives this week\'s topic, purpose, learning objectives, competencies, architect domains, student outcomes, success criteria, and level. Ground every word in it and invent nothing it does not support. Generalize to whatever this week\'s topic is; never hard-code a specific week\'s subject matter.',
  '',
  'AUDIENCE & VOICE. Write for a learner with little or no prior background. Warm, plain-English, encouraging. No hype. No emoji. Define every piece of jargon in plain words the first time it appears. Self-study: nothing is graded, tested, or timed.',
  '',
  'GROUNDING & ACCURACY. Stay at the level of the concepts WEEK CONTEXT names. Do not invent technical claims, definitions, mechanisms, or what a named product or tool actually is; when unsure, describe its role in plain general terms (never call a tool a "programming language" unless WEEK CONTEXT says so). Accuracy beats completeness.',
  '',
  'DEPTH — this must feel THOROUGH, not a summary. 5 to 6 Parts. Each Part opens with its single key idea, then gives TWO to FOUR substantive paragraphs with a concrete example a beginner can picture. Two different weeks must read as clearly different from each other.',
  '',
  'VISUALS ARE REQUIRED, NOT OPTIONAL. This reading must feel richly visual — a picture or diagram in almost every Part, never a wall of text. A prose-only reading is unacceptable. The reader UI DRAWS every visual for you from simple data attributes (you never write SVG or images). You MUST include ALL of the following:',
  '  (a) AT LEAST 2 illustrations (the "pictures"): <figure class="illus" data-illus="NAME"><figcaption>one-line caption</figcaption></figure>. NAME is EXACTLY one of: ai-network (AI / models / learning), terminal (code / commands / a tool), pipeline (a process or data flow), documents (docs / notes / records), conversation (prompting or chatting with AI), growth (progress / results / ROI), automation (automating work), idea (a concept / insight). Put one illustration in the intro so the reading OPENS with a picture.',
  '  (b) AT LEAST 2 diagrams: <figure class="figure" data-diagram="TYPE" data-items="Label A|Label B|Label C"><figcaption>one-line takeaway</figcaption></figure>. TYPE is EXACTLY one of: nested (concepts inside each other, widest first, e.g. Artificial Intelligence|Machine Learning|Deep Learning), layers (a stack of levels), flow (a left-to-right sequence, e.g. Explore|Plan|Code|Commit), cycle (a repeating loop, e.g. Context|Tools|Permissions), steps (a numbered how-to). 2 to 5 SHORT labels each (cycle/steps labels 1-2 words). Find the hierarchies, stacks, sequences, and loops in this week\'s material — almost every technical topic has them.',
  '  (c) AT LEAST 3 icon term-cards for the week\'s key vocabulary, grouped: <div class="cardgrid"><div class="term" data-icon="ICON"><h3>Term</h3><p class="why">plain definition, then why it matters</p></div> ...more... </div>. ICON is EXACTLY one of: brain (learning/ML), chip (a model/compute), scissors (splitting/tokens), window (context/memory), book (reading/docs), chat (a prompt/conversation), gauge (a setting/limit), flag (a goal/plan), check (a rule/verification), bulb (an idea).',
  '  (d) A row of stat callouts wherever the week has numbers or memorable facts: <div class="stats"><div class="stat"><b>10x</b><span>what it measures</span></div> ...2 to 4 stats... </div>. Keep each big value short.',
  '',
  'BODY_HTML — output clean, semantic, VALID HTML made of <section> blocks ONLY. The reader UI supplies all styling, the sticky navigation, AND draws the visuals, so DO NOT include any <style>, <script>, <nav>, <svg>, <img>, inline style attributes, or a wrapping <div>. Structure:',
  '  - FIRST: <section id="intro" data-nav="Overview"><p class="lead">The big picture: one or two sentences on why this week matters.</p><figure class="illus" data-illus="..."><figcaption>a one-line caption</figcaption></figure><p>a short orienting paragraph that also notes this is optional, self-paced, and not tested.</p></section>',
  '  - Then one <section id="p1" data-nav="Short Label">, <section id="p2" data-nav="...">, ... per Part, ids p1..pN in order. data-nav is a SHORT 1-3 word tab label for that Part (e.g. "AI Basics", "Key Terms", "Why AI"). Each section = <h2>Part 1 - Full Heading</h2> then <p class="lead">the key idea</p> then the paragraphs, WITH that Part\'s visual(s) woven in.',
  '  - For a caution: <div class="warn"><p><b>Caution.</b> ...</p></div>. Use <ul>/<li> for lists and a <table> with a <thead> for a small comparison.',
  '  - Allowed tags ONLY: <section> (each with a unique id AND a data-nav label), <h2>, <h3>, <p> (optional class "lead" or "why"), <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <div class="cardgrid">, <div class="term" data-icon="...">, <div class="stats">, <div class="stat">, <div class="warn">, <figure class="illus" data-illus="...">, <figure class="figure" data-diagram="..." data-items="...">, <figcaption>, <b>. Nothing else — no <style>, <script>, <svg>, <img>, <nav>, or inline style attributes.',
  '',
  'FILL THE OTHER OUTPUT KEYS.',
  '- title: "Self Study - <this week\'s topic>" from WEEK CONTEXT (e.g. "Self Study - Claude Code Foundations + Workspace").',
  '- summary: one plain sentence: what this reading covers and that it is optional, self-paced, and not tested.',
  '- questions: 4 to 6 light self-check questions ("In your own words, ..." / "Can you explain ..."), for self-checking only, never graded.',
  '- reflection: one short, low-stakes reflection prompt connecting the reading to the learner\'s own work or goals.',
  '- discussion_prompt: one open discussion seed for the cohort, tied to this week\'s topic.',
  '- github_task: null. evaluation_criteria: an empty array (not scored).',
  '- completion: describe that the card completes when the participant marks the reading as read; nothing is submitted or graded.',
].join('\n');

/** slug -> authored fields layered on top of the registry defaults. */
// ── knowledge_check (quiz) + evaluation ──────────────────────────────────────
// The QUESTIONS are auto-generated per card by assessmentService (blueprint- +
// competency-aware); these prompts only frame the card's title/summary. The
// interactive assessment is code-driven (AssessmentPanel).
const KNOWLEDGE_CHECK_GENERATION_PROMPT = [
  'You write the framing for a quick Knowledge Check at the START of a week in the AI Systems Architect Accelerator. The WEEK CONTEXT above gives the week\'s topic and competencies.',
  'title: the word "Knowledge Check", a space, an em dash, a space, then the week\'s topic from the WEEK CONTEXT.',
  'summary: one sentence — a quick, low-stakes check of what the student knows coming into this week; no pressure, and they see the correct answers right away.',
  'body_html: one short <p> saying this sets their starting point for the section, to be compared against the end-of-week Evaluation.',
  'Return questions as [], reflection as "", discussion_prompt as "", github_task as null, evaluation_criteria as []. Encouraging, executive tone. No emojis.',
].join('\n');

const EVALUATION_GENERATION_PROMPT = [
  'You write the framing for the end-of-section Evaluation in the AI Systems Architect Accelerator. The WEEK CONTEXT above gives the week\'s topic and competencies.',
  'title: the word "Evaluation", a space, an em dash, a space, then the week\'s topic from the WEEK CONTEXT.',
  'summary: one sentence — the graded check that measures how far the student has come this section; 70% or higher to pass and earn points.',
  'body_html: one short <p> noting this is scored, needs 70% to pass, can be retried, and shows growth since the entry Knowledge Check.',
  'Return questions as [], reflection as "", discussion_prompt as "", github_task as null, evaluation_criteria as []. Executive tone. No emojis.',
].join('\n');

// ── announcement (the friendly weekly kickoff) ───────────────────────────────
// The FIRST card in every section (pre_class). A roster-summary type
// (SECTION_ROSTER_TYPES) whose runtime prepends the week Blueprint ("WEEK
// CONTEXT") AND the week's real activity roster ("THIS WEEK'S ACTIVITIES"), so it
// scans the section and reports what's ahead in a warm, emoji-rich "mini report".
// Generic render band → it ships its own self-contained CSS inside body_html
// (lessonDoc preserves <style>). Week 0 is hand-authored + locked (the free-
// preview welcome); weeks 1+ generate live from this prompt and reset when the
// week's curriculum changes.
const ANNOUNCEMENT_GENERATION_PROMPT = [
  'You write the weekly Announcement for the AI Systems Architect Accelerator: the warm, friendly kickoff card that is the FIRST thing a participant sees when they open the week. The WEEK CONTEXT block above gives this week\'s topic, focus, learning objectives, competencies, architect domains, student outcomes, success criteria, and level. The THIS WEEK\'S ACTIVITIES block above lists the ACTUAL cards placed in this week. Ground everything in both and invent nothing they do not support.',
  '',
  'VOICE: warm, encouraging, human, a little playful. Use emoji generously as friendly section icons and inline accents. Plain English, no jargon, no hype. This is the friendly front door to the week, not a formal briefing.',
  '',
  'TITLE: the words "This Week", a space, an em dash, a space, then the week\'s topic exactly as named in the WEEK CONTEXT. Example: "This Week — Claude Code Foundations + Workspace".',
  '',
  'SUMMARY: one friendly sentence previewing what the week is about and inviting them in.',
  '',
  'BODY_HTML: clean, self-contained, VALID, fully-balanced HTML with ONE <style> block at the top (no external URLs, no @import, NO <script>, no event handlers, no <img>). It renders in a single narrow ~400px column, so design airy with short lines and generous spacing.',
  'STYLE (match this friendly brand look): warm off-white page background (#fbfaf7); dark ink text (#1a2024). A HERO band with a teal-to-indigo gradient background (linear-gradient(135deg,#2a7d8c,#4c5bd4)), white text, rounded 16px corners, generous padding. Small uppercase section eyebrows in teal (#227d8e, letter-spacing, bold). Activity items as white rounded cards (border 1px solid #e7e3da, radius 12px, padding ~12px) with the emoji on the left. Pill chips with a soft teal tint (background #e8f3f5, teal text, rounded 999px). Soft tinted callout bands (radius 14px) for the Workspace and conversation sections. Keep corners rounded (12 to 16px) and leave real whitespace between every section. Emit these sections in order:',
  '  1. HERO band: a big friendly welcome (wave or sparkle emoji) and one sentence naming this week\'s big idea from the WEEK CONTEXT.',
  '  2. A small row of 3 to 4 friendly "at a glance" pill chips grounded in the WEEK CONTEXT (e.g. the level, and how many things they will do this week). NEVER include any estimate of hours or minutes anywhere.',
  '  3. "✨ What you\'ll cover this week": 4 to 7 short cards, EACH drawn from a real item in THIS WEEK\'S ACTIVITIES above. Use the actual activity titles (name the videos, labs, courses, live classes, builds, readings) with a friendly one-line description of what the student will DO. Give each a matching emoji (🎬 video, 🎧 podcast, 📰 blog, 🧪 lab, 🏗️ build, 🎓 course, 👥 live class, 📖 reading, ✅ quiz, 🔎 deep dive, 🔁 sync). Pick the most important activities; skip meta/system cards.',
  '  4. "🎯 Why it matters": one or two friendly sentences tying this week to becoming an AI Systems Architect, from the student outcomes / success criteria.',
  '  5. "🖥️ Your Workspace + AI Mentor": tell them that opening any lesson takes them into their Workspace, where they meet their personal AI Mentor Agent (who coaches, never just hands answers), alongside the community and their progress.',
  '  6. "💬 Join the conversation": warmly encourage a comment, and remind them it is visible to the whole community and a great way to connect with fellow learners.',
  '',
  'Keep the visible prose drawer-sized and skimmable (roughly 220 to 320 words plus the activity cards). Every opening tag must have a matching closing tag and the CSS must be valid.',
  'Set questions to [] and reflection to "".',
  'completion: "Marked complete when the participant opens and reads the weekly announcement."',
].join('\n');

export const COMPONENT_AUTHORING: Record<string, AuthoredFields> = {
  ...AI_THUMBNAILS,
  warmup: {
    label: 'Self Study',
    student_label: 'Self Study',
    description: 'Read-before-class self-study material: the vocabulary and mental models a participant needs before the live session. Not tested, not timed. Warm, plain-English, structured so the key idea of each Part lands first.',
    category: 'Self Study',
    icon: 'bi-journal-text',
    badge_class: 'bg-primary',
    estimated_time: 20,
    capabilities: ['reflection', 'discussion', 'bookmarks', 'comments', 'likes'],
    inputs: [],
    variable_keys: [], // zero author input — the runtime injects the week blueprint
    outputs: [
      { key: 'title', type: 'string', description: 'Self Study — {week topic}' },
      { key: 'body_html', type: 'html', description: 'Self-contained styled reading (Parts, term cards, callouts)' },
      { key: 'summary', type: 'string', description: 'One-sentence framing' },
    ],
    completion_rules: { on: 'view' },
    evaluation_type: 'none',
    generation_prompt: SELF_STUDY_GENERATION_PROMPT,
    thumbnail_url: thumbnailUrlFor('warmup'),
    approved: true,
    status: 'published',
  },
  survey: {
    student_label: 'Weekly Feedback',
    category: 'Reflect',
    icon: 'bi-clipboard-check',
    badge_class: 'bg-warning',
    estimated_time: 5,
    // Parts the survey actually gives the student: a written reflection (the open
    // feedback question) + a cohort comment thread. The rating scale itself is
    // code-driven (CardSurveyExperience), not a toggizable Part.
    capabilities: ['reflection', 'comments'],
    inputs: [],
    variable_keys: [], // zero author input — the runtime injects the week blueprint
    outputs: [
      { key: 'title', type: 'string', description: 'Week {n} Feedback — {week topic}' },
      { key: 'questions', type: 'string[]', description: '~10 Likert (1–5) feedback statements' },
      { key: 'reflection', type: 'string', description: 'One open feedback prompt' },
      { key: 'summary', type: 'string', description: 'One-sentence framing' },
    ],
    completion_rules: { on: 'submit' },
    evaluation_type: 'none',
    generation_prompt: SURVEY_GENERATION_PROMPT,
    thumbnail_url: thumbnailUrlFor('survey'),
    approved: true,
    status: 'ready',
  },
  announcement: {
    student_label: 'Announcement',
    category: 'Announce',
    icon: 'bi-megaphone',
    badge_class: 'bg-info',
    estimated_time: 2,
    // Friendly week-opener: scans the week roster (SECTION_ROSTER_TYPES) and
    // reports what's ahead. AI Mentor chat + community comments/likes on the card.
    capabilities: ['ai_chat', 'comments', 'likes', 'bookmarks'],
    inputs: [],
    variable_keys: [], // zero author input — the runtime injects blueprint + week roster
    outputs: [
      { key: 'title', type: 'string', description: 'This Week — {week topic}' },
      { key: 'body_html', type: 'html', description: 'Friendly emoji "mini report" scanning the week' },
      { key: 'summary', type: 'string', description: 'One-sentence friendly framing' },
    ],
    completion_rules: { on: 'view' },
    evaluation_type: 'none',
    generation_prompt: ANNOUNCEMENT_GENERATION_PROMPT,
    thumbnail_url: thumbnailUrlFor('announcement'),
    approved: true,
    status: 'published',
  },
  overview: {
    student_label: 'Overview',
    category: 'Learn',
    icon: 'bi-binoculars',
    badge_class: 'bg-info',
    estimated_time: 8,
    capabilities: ['bookmarks', 'comments', 'likes'],
    inputs: [],
    variable_keys: [], // zero author input — the runtime injects blueprint + week roster
    outputs: [
      { key: 'title', type: 'string', description: 'Overview — {week topic}' },
      { key: 'body_html', type: 'html', description: '4-part week overview' },
      { key: 'summary', type: 'string', description: 'One-sentence week summary' },
    ],
    completion_rules: { on: 'view' },
    evaluation_type: 'none',
    generation_prompt: OVERVIEW_GENERATION_PROMPT,
    thumbnail_url: OVERVIEW_THUMBNAIL_URL,
    renderers: { thumbnail: OVERVIEW_THUMBNAIL_RENDERER },
    approved: true,
    status: 'ready',
  },
  knowledge_check: {
    student_label: 'Knowledge Check',
    category: 'Assess',
    icon: 'bi-question-circle',
    badge_class: 'bg-info',
    estimated_time: 5,
    // Code-driven assessment (AssessmentPanel + assessmentService). Questions are
    // auto-generated from the week blueprint — no author input. Parts signal what
    // the student gets (the panel is code-driven, so they don't gate behavior).
    capabilities: ['quiz', 'scoring', 'ai_chat'],
    inputs: [],
    variable_keys: [],
    outputs: [
      { key: 'score', type: 'number', description: '0-1 entry-check score (the section baseline)' },
      { key: 'competency_scores', type: 'object', description: 'per-competency correct/total' },
    ],
    completion_rules: { on: 'submit' },
    evaluation_type: 'none',
    generation_prompt: KNOWLEDGE_CHECK_GENERATION_PROMPT,
    thumbnail_url: thumbnailUrlFor('knowledge_check'),
    approved: true,
    status: 'ready',
  },
  evaluation: {
    student_label: 'Evaluation',
    category: 'Assess',
    icon: 'bi-clipboard-check',
    badge_class: 'bg-danger',
    estimated_time: 12,
    capabilities: ['quiz', 'scoring', 'ai_chat', 'retry'],
    inputs: [],
    variable_keys: [],
    outputs: [
      { key: 'score', type: 'number', description: '0-1 evaluation score' },
      { key: 'passed', type: 'boolean', description: 'true when score >= 0.70' },
      { key: 'competency_scores', type: 'object', description: 'per-competency correct/total' },
    ],
    // 70% pass gate — enforced in assessmentService; documented here.
    completion_rules: { on: 'evaluate', min_score: 0.70 },
    evaluation_type: 'rubric',
    generation_prompt: EVALUATION_GENERATION_PROMPT,
    thumbnail_url: thumbnailUrlFor('evaluation'),
    approved: true,
    status: 'ready',
  },
};

export async function seedComponentAuthoring(): Promise<{ updated: string[]; missing: string[] }> {
  const updated: string[] = [];
  const missing: string[] = [];
  for (const [slug, fields] of Object.entries(COMPONENT_AUTHORING)) {
    const row = await CurriculumTypeDefinition.findOne({ where: { slug } });
    if (!row) {
      missing.push(slug);
      continue;
    }
    const patch: AuthoredFields = { ...fields };
    // Merge renderer surfaces key-wise: authoring `thumbnail` must never wipe
    // the other seven generated surfaces.
    if (fields.renderers && typeof fields.renderers === 'object') {
      const existing = row.renderers && typeof row.renderers === 'object' ? row.renderers : {};
      patch.renderers = { ...existing, ...fields.renderers };
    }
    await row.update(patch);
    updated.push(slug);
  }
  return { updated, missing };
}

// Allow direct execution: `node dist/seeds/seedComponentAuthoring.js`
if (require.main === module) {
  seedComponentAuthoring()
    .then((r) => {
      console.log('[seedComponentAuthoring] updated=' + JSON.stringify(r.updated) + ' missing=' + JSON.stringify(r.missing));
      process.exit(0);
    })
    .catch((e) => {
      console.error('[seedComponentAuthoring] ERROR ' + (e && e.message ? e.message : e));
      process.exit(1);
    });
}

export default seedComponentAuthoring;
