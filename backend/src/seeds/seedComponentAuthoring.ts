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
  // Intelligence Pipeline types
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
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
  'You write the weekly Announcement for the AI Systems Architect Accelerator: the warm, friendly kickoff AND the MAP of everything the student will do this week. The WEEK CONTEXT above gives the week topic, objectives, outcomes, and level. THIS WEEK\'S ACTIVITIES above lists the ACTUAL curriculum items placed in this week, in journey order with each item\'s phase in brackets. Ground everything in both; invent nothing.',
  '',
  'VOICE: warm, encouraging, human, playful. Lots of friendly emoji. Plain English, no jargon, no hype.',
  'TITLE: exactly the words "This Week", then a space, an em dash, a space, then the week\'s topic EXACTLY as written in the WEEK CONTEXT above — copy it verbatim; do NOT paraphrase, shorten, or invent a different topic. Example: "This Week — Claude Code Foundations + Workspace".',
  'SUMMARY: one friendly, inviting sentence previewing the week.',
  '',
  'BODY_HTML: output the following, in order, and NOTHING else.',
  'FIRST, copy this <style> block VERBATIM, character for character — do not change any value, class name, or rule:',
  '<style>',
  '  body{max-width:1080px;margin:0 auto;background:#fbfaf7;color:#1a2024;padding:24px;line-height:1.6}',
  '  h1,h2,p{margin:0}',
  '  .awh{background:linear-gradient(135deg,#2a7d8c,#4c5bd4);color:#fff;border-radius:20px;padding:32px 26px;text-align:center;margin-bottom:24px}',
  '  .awh .w{font-size:40px;display:block;margin-bottom:10px}',
  '  .awh h1{color:#fff;font-size:24px;margin-bottom:10px;line-height:1.25}',
  '  .awh p{color:#eaf6f8;font-size:16px;line-height:1.6;max-width:54ch;margin:0 auto}',
  '  .awo{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-bottom:32px}',
  '  .awo .s{flex:1;min-width:140px;background:#fff;border:1px solid #e7e3da;border-radius:16px;padding:18px 16px;text-align:center}',
  '  .awo .s b{display:block;font-size:22px;color:#227d8e;line-height:1.15}',
  '  .awo .s span{display:block;font-size:11.5px;color:#5b6772;text-transform:uppercase;letter-spacing:.05em;font-weight:700;margin-top:7px}',
  '  .awe{font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#227d8e;margin-bottom:20px;text-align:center}',
  '  .awp{margin-bottom:32px}',
  '  .awp h2{font-size:18px;margin-bottom:16px;display:flex;align-items:center;gap:10px;justify-content:space-between}',
  '  .awp h2 .st{font-size:13px;font-weight:700;color:#8a94a0}',
  '  .awg{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}',
  '  .awk{display:flex;gap:14px;align-items:flex-start;background:#fff;border:1px solid #e7e3da;border-radius:16px;padding:18px 20px}',
  '  .awk .i{font-size:28px;line-height:1;flex:none}',
  '  .awk b{font-size:15.5px;display:block;margin-bottom:5px}',
  '  .awk .d{font-size:14px;color:#5b6772;line-height:1.55}',
  '  .awk .tm{display:inline-block;margin-top:8px;font-size:12.5px;font-weight:700;color:#8a94a0}',
  '  .awb{background:#e8f3f5;border:1px solid #cfe6ea;border-radius:18px;padding:24px 26px;margin-bottom:20px}',
  '  .awb h2{font-size:18px;margin-bottom:10px;color:#155e6b;display:flex;align-items:center;gap:10px}',
  '  .awb p{font-size:15px;color:#2c5560;line-height:1.7}',
  '  .awy{padding:8px 6px}',
  '  .awy h2{font-size:18px;margin-bottom:10px;color:#227d8e;display:flex;align-items:center;gap:10px}',
  '  .awy p{font-size:15px;line-height:1.7}',
  '</style>',
  '',
  'THEN the content, using ONLY these classes and this structure — no other classes, no inline style attributes, no <script>, no <img>. ALL time numbers come straight from THIS WEEK\'S ACTIVITIES (the total, the per-phase totals, and each activity\'s minutes) — use those exact numbers, never invent or re-estimate a time:',
  '  <div class="awh"><span class="w">👋</span><h1>a warm welcome that names the week</h1><p>one sentence on this week\'s big idea</p></div>',
  '  A top overview of how much work this week is — 3 stat tiles: <div class="awo"><div class="s"><b>⏱️ {total time from the header, e.g. ~4.5 hrs}</b><span>This week</span></div><div class="s"><b>📚 {N activities from the header}</b><span>Activities</span></div><div class="s"><b>🎓 {level from WEEK CONTEXT}</b><span>Level</span></div></div>',
  '  <p class="awe">🗺️ Your week, mapped</p>',
  '  Then, for EACH phase that has activities, in the journey order Prep, Learn, Practice, Build, Reflect, Share: <div class="awp"><h2><span>{phase emoji} {Phase name}</span><span class="st">{that phase\'s total minutes from the Phase totals line}</span></h2><div class="awg"> one card per activity in that phase: <div class="awk"><span class="i">{activity emoji}</span><span><b>{the activity\'s REAL title}</b><span class="d">{a short friendly phrase, max ~12 words, on what the student does}</span><span class="tm">⏱️ {that activity\'s minutes} min</span></span></div> </div></div>',
  '  <div class="awb"><h2>🖥️ Your Workspace + AI Mentor</h2><p>opening any lesson takes them into their Workspace, where they meet their personal AI Mentor Agent (who coaches, never just hands answers), alongside the community and their progress.</p></div>',
  '  <div class="awb"><h2>💬 Join the conversation</h2><p>warmly encourage a comment; remind them it is visible to the whole community and a great way to connect with fellow learners.</p></div>',
  '  <div class="awy"><h2>🎯 Why it matters</h2><p>one or two friendly sentences tying this week to becoming an AI Systems Architect, from the student outcomes / success criteria.</p></div>',
  '',
  'COVER EVERY activity from THIS WEEK\'S ACTIVITIES — do not skip, merge, or invent any; only omit pure system cards (badges/streaks/milestones). This is the full curriculum map for the week, not a teaser. Phase emojis: 🔥 Prep, 📚 Learn, 🧪 Practice, 🏗️ Build, 🪞 Reflect, 🤝 Share. Activity emoji by type: 📖 self study/reading, ✅ knowledge check/quiz/evaluation, 🎬 video, 👥 live class, 🔎 deep dive, 🎓 skills course, 🧪 prompt lab, 🏗️ implementation/build, 🔁 github sync, 📦 artifact, 🪞 reflection, 📝 survey, 🤝 community/discussion.',
  'Every opening tag has a matching closing tag; the CSS must be valid. Set questions to [] and reflection to "".',
  'completion: "Marked complete when the participant opens and reads the weekly announcement."',
].join('\n');

// ── Intelligence Pipeline types (news / research / tools / video / quote /
//    architecture / build / MCP / technique / market) ─────────────────────────
// These 10 types are reusable content GENERATORS: each turns one external item
// into a standalone Timeline Card carrying a fixed executive quality standard.
// They are DUAL-MODE. When materialized by an ingestion pipeline (e.g. the AI
// News Flash cron) the runtime passes the real item through the {{item_*}} vars,
// so the card summarizes THAT item. When merely scheduled on a week by the
// Composer (or previewed in Experience Studio) no item is passed, so the prompt
// falls back to a representative example grounded in the week's WEEK CONTEXT.
// Only generation_prompt drives the runtime; it emits the fixed 9-key schema.
interface IntelPromptConfig {
  role: string;          // one line: what this card type is
  unit: string;          // what one item is, singular (e.g. "an AI news item")
  titleRule: string;     // how to format the title
  leadHeading: string;   // heading of the first body section (the item itself)
  leadBody: string;      // what the first body section must contain (type-specific)
  sources: string;       // example sources, for the fallback-example instruction
  reflectionSeed: string;
  discussionSeed: string;
  github?: string;       // when set, github_task instruction; otherwise null
}

const intelGenerationPrompt = (c: IntelPromptConfig): string => [
  `You write ${c.role} for the AI Systems Architect Accelerator — a continuously-updated intelligence card that keeps enterprise AI architects current. Executive voice: clear, calm, authoritative (Bloomberg meets Salesforce). No hype, no emojis, no marketing language.`,
  '',
  'DATA SOURCE — read this first. An ITEM may be provided below through variables:',
  '  ITEM title:   {{item_title}}',
  '  ITEM source:  {{item_source}}',
  '  ITEM url:     {{item_url}}',
  '  ITEM date:    {{item_date}}',
  '  ITEM excerpt: {{item_excerpt}}',
  `If the ITEM title above is non-empty, base the ENTIRE card on that specific real item (${c.unit}). If the ITEM title is empty, do NOT invent a fake source — instead produce ONE representative, clearly-illustrative example (${c.unit}) grounded in the WEEK CONTEXT above, so the card previews sensibly. Never fabricate a URL, a citation, a metric, or a quote you were not given; when a fact is not supplied, describe the role in general terms and lower the confidence.`,
  '',
  `title: ${c.titleRule}`,
  '',
  'summary: one sentence (under ~30 words) stating the single most important takeaway.',
  '',
  'body_html: clean, self-contained, VALID and fully balanced HTML. Use ONLY <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>, <a> (with href) and <table>/<thead>/<tbody>/<tr>/<th>/<td>. NO <script>, NO <style>, NO inline style attributes, NO <img> (the reader supplies the styling and the card supplies the thumbnail). Every opening tag must have a matching closing tag. Emit these sections IN THIS ORDER, each opened by an <h3>:',
  `  1. <h3>${c.leadHeading}</h3> — ${c.leadBody}`,
  '  2. <h3>Why it matters</h3> — one short paragraph on why this is significant right now.',
  '  3. <h3>Why an AI Systems Architect should care</h3> — one short paragraph tying it to the architect\'s role (systems design, model/tool selection, governance, enterprise fit).',
  '  4. <h3>Implications</h3> — a <ul> with exactly three <li>, each led by a bold label: <li><strong>Business:</strong> …</li> <li><strong>Technical:</strong> …</li> <li><strong>Enterprise:</strong> …</li>.',
  '  5. <h3>Recommended next action</h3> — one concrete, specific action the architect (or their team) could take this week.',
  '  6. <h3>Related</h3> — a <ul> with three <li> led by bold labels: <li><strong>Skills:</strong> …</li> <li><strong>Technologies:</strong> …</li> <li><strong>Curriculum:</strong> which parts of the AI Systems Architect path this connects to</li>. Keep each to a short comma-separated list.',
  '  7. <h3>Source</h3> — one short <p>: when a real ITEM was given, "Source: {{item_source}} · {{item_date}}" and, if a url was given, a single <a href="{{item_url}}">link</a>; otherwise write "Source: illustrative example (no live item)". End the paragraph with "Confidence: High|Medium|Low" reflecting how well-grounded the card is (Low whenever it is an illustrative example or facts were missing).',
  '',
  `reflection: ${c.reflectionSeed}`,
  `discussion_prompt: ${c.discussionSeed}`,
  'questions: [].',
  c.github ? `github_task: ${c.github}` : 'github_task: null.',
  'evaluation_criteria: [].',
  'completion: "Marked complete when the participant reads the card."',
  '',
  'Length: about 180 to 300 words of body. Be specific and concrete; prefer real nouns over abstractions.',
].join('\n');

const AI_NEWS_FLASH_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an AI News Flash — a concise executive briefing on one piece of AI news',
  unit: 'an AI news item',
  titleRule: 'the news headline itself, rewritten as a crisp Title-Case headline under ~12 words (keep acronyms like AI, API, MCP, LLM as-is). No "AI News Flash" prefix.',
  leadHeading: 'What happened',
  leadBody: 'two or three sentences stating plainly what was announced or reported, who did it, and when.',
  sources: 'Anthropic, OpenAI, Google DeepMind, Microsoft AI, Meta AI, Hugging Face, NVIDIA, the GitHub blog',
  reflectionSeed: 'one sentence asking how this news could change something the participant is building or planning.',
  discussionSeed: 'one open prompt inviting the cohort to weigh in on what this means for enterprise AI.',
});

const AI_RESEARCH_DIGEST_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an AI Research Digest — a plain-English explainer of one AI research paper',
  unit: 'an AI research paper',
  titleRule: 'the paper\'s idea in plain Title-Case English under ~12 words (not the raw academic title). No prefix.',
  leadHeading: 'The paper, in plain English',
  leadBody: 'explain what the paper does and its core innovation so a non-researcher understands it, then note (as sub-points in the same section if useful) its business value, its architecture impact, and one concrete implementation idea.',
  sources: 'arXiv, Papers with Code, Nature, MIT, Stanford, CMU, Anthropic Research, OpenAI Research',
  reflectionSeed: 'one sentence asking where a technique from this paper might apply in the participant\'s own work.',
  discussionSeed: 'one open prompt asking whether this research is ready for enterprise use yet, and why.',
});

const AI_TOOL_OF_THE_DAY_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an AI Tool of the Day — an enterprise-readiness profile of one AI tool',
  unit: 'an AI tool',
  titleRule: 'the tool\'s name, then " — ", then a three-to-six-word description of what it does.',
  leadHeading: 'The tool',
  leadBody: 'cover, as a short paragraph plus a compact <ul>: purpose, website/vendor, pricing model, enterprise readiness (security, SSO, data handling), rough popularity, primary business use cases, its technical stack, notable pros and cons, and a couple of alternatives.',
  sources: 'the tool\'s own docs and vendor site, plus independent reviews',
  reflectionSeed: 'one sentence asking whether this tool fits a system the participant is designing, and where it would slot in.',
  discussionSeed: 'one open prompt inviting a build/buy debate for this tool in an enterprise context.',
});

const AI_VIDEO_STREAM_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an AI Video Stream card — a briefing on one high-quality AI video, talk, keynote, or podcast',
  unit: 'an AI video or talk',
  titleRule: 'the video/talk title in Title Case under ~14 words. No prefix. The video itself plays in the card player; this text is the accompanying briefing.',
  leadHeading: 'What the video covers',
  leadBody: 'summarize the talk in two or three sentences (speaker, venue, core thesis), then a short <ul> of 3 to 5 key moments or takeaways and the skills it teaches.',
  sources: 'YouTube, conference talks, keynotes and podcasts from Anthropic, Google, Microsoft, OpenAI, NVIDIA',
  reflectionSeed: 'one sentence asking which idea from the talk the participant would try first.',
  discussionSeed: 'one open prompt asking the cohort to share the single most useful moment.',
});

const AI_QUOTE_OF_THE_DAY_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an AI Quote of the Day — a short, thought-provoking quote from an AI leader with context',
  unit: 'a quote from an AI leader',
  titleRule: 'a 3-to-6-word Title-Case phrase capturing the quote\'s theme. No prefix, no quotation marks in the title.',
  leadHeading: 'The quote',
  leadBody: 'a <blockquote> with the quote verbatim (only if provided; otherwise a clearly-illustrative paraphrase), then a <p> naming the person, their organization, the date/occasion, the original source, and one or two sentences of context and historical significance.',
  sources: 'interviews, keynotes, essays and posts by named AI leaders',
  reflectionSeed: 'one reflective question asking the participant whether they agree with the quote and why.',
  discussionSeed: 'one open prompt inviting the cohort to react to the quote from their own experience.',
});

const AI_ARCHITECTURE_BREAKDOWN_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an AI Architecture Breakdown — an explanation of how one real AI system is built',
  unit: 'a real AI product or system',
  titleRule: 'the system\'s name, then " — ", then "Architecture Breakdown".',
  leadHeading: 'The system',
  leadBody: 'explain, as a short paragraph plus a compact <ul>, how the system is put together across as many of these as apply: overall architecture, agents, data flow, models used, MCP / tool integration, vector database, memory, observability, and governance. Be concrete about the pattern, not the marketing.',
  sources: 'engineering blogs, talks, and public docs for systems like Cursor, Claude, ChatGPT, Perplexity, Netflix, Tesla, Spotify, Amazon',
  reflectionSeed: 'one sentence asking which part of this architecture the participant would reuse in their own system.',
  discussionSeed: 'one open prompt asking what the cohort would design differently and why.',
});

const BUILD_BREAKDOWN_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'a Build Breakdown — a dissection of one impressive AI build shared by a developer',
  unit: 'an impressive AI build',
  titleRule: 'the build\'s name or one-line description in Title Case under ~12 words. No prefix.',
  leadHeading: 'What was built',
  leadBody: 'describe what the build does and why it is impressive, then a compact <ul> covering its architecture, the key lessons learned, the prompt techniques used, and its business applications. Reference the repository if a url was provided.',
  sources: 'GitHub, X/Twitter, Reddit, and developer blogs',
  reflectionSeed: 'one sentence asking what the participant would build using the same approach.',
  discussionSeed: 'one open prompt asking the cohort which technique from this build they want to try.',
  github: 'a short, optional "try it" task — e.g. clone or recreate one small piece of this build in a repo and open a PR. One or two sentences.',
});

const MCP_SERVER_SPOTLIGHT_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'an MCP Server Spotlight — a profile of one Model Context Protocol server',
  unit: 'an MCP server',
  titleRule: 'the MCP server\'s name, then " — ", then "MCP Server".',
  leadHeading: 'The server',
  leadBody: 'explain what this MCP server does and why it is useful, then a compact <ul> covering its purpose, installation, architecture, example calls, business value, and integration points.',
  sources: 'the server\'s repository and docs, and the MCP registry',
  reflectionSeed: 'one sentence asking which of the participant\'s projects this server could plug into.',
  discussionSeed: 'one open prompt asking the cohort where an MCP server like this adds the most leverage.',
  github: 'a short task — install this MCP server locally, wire it into a Claude Code project, and commit the config. One or two sentences.',
});

const CLAUDE_CODE_TECHNIQUE_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'a Claude Code Technique — an advanced Claude Code workflow explained with a practical example',
  unit: 'a Claude Code technique',
  titleRule: 'the technique named as a Title-Case phrase under ~10 words. No prefix.',
  leadHeading: 'The technique',
  leadBody: 'explain the technique and when to use it (hooks, agents, subagents, memory, planning, testing, GitHub workflows, prompt engineering, or architecture), then a short numbered <ol> of steps and a concrete worked example.',
  sources: 'Claude Code docs, engineering posts, and community workflows',
  reflectionSeed: 'one sentence asking where this technique would save the participant the most time.',
  discussionSeed: 'one open prompt asking the cohort to share their own variation of this technique.',
  github: 'a short task — apply this technique in a real repo (e.g. add the hook / subagent / test) and commit it. One or two sentences.',
});

const MARKET_INTELLIGENCE_GENERATION_PROMPT = intelGenerationPrompt({
  role: 'a Market Intelligence card — an enterprise-AI market or industry signal (the kind Opportunity Pulse surfaces)',
  unit: 'a market / industry AI signal',
  titleRule: 'the signal as a crisp Title-Case headline under ~12 words. No prefix.',
  leadHeading: 'The signal',
  leadBody: 'state the market signal plainly, then a compact <ul> covering as many as apply: emerging industry, AI buying trend, funding, enterprise demand, government opportunity, hiring trend, and AI maturity by industry.',
  sources: 'Opportunity Pulse, funding and hiring data, industry reports',
  reflectionSeed: 'one sentence asking how this market signal could shape the participant\'s positioning or roadmap.',
  discussionSeed: 'one open prompt asking the cohort which industry is the biggest AI opportunity right now.',
});

// Every intelligence card takes the same external item through these vars.
const INTEL_ITEM_VARS = ['item_title', 'item_source', 'item_url', 'item_excerpt', 'item_date'];

// Shared authored shape for the 10 intelligence types — only icon/label/Parts/
// prompt differ. completion on view, not scored; content is program-wide.
const intelAuthoring = (o: {
  slug: string;
  student_label: string;
  icon: string;
  badge_class: string;
  estimated_time: number;
  capabilities: string[];
  generation_prompt: string;
  extraVars?: string[];
}): AuthoredFields => ({
  student_label: o.student_label,
  category: 'Intelligence',
  icon: o.icon,
  badge_class: o.badge_class,
  estimated_time: o.estimated_time,
  capabilities: o.capabilities,
  inputs: [],
  variable_keys: [...INTEL_ITEM_VARS, ...(o.extraVars || [])],
  outputs: [
    { key: 'title', type: 'string', description: 'Headline for the item' },
    { key: 'summary', type: 'string', description: 'One-sentence takeaway' },
    { key: 'body_html', type: 'html', description: 'Executive card: what · why · architect relevance · business/technical/enterprise implications · next action · related · source' },
    { key: 'reflection', type: 'string', description: 'One reflection prompt' },
    { key: 'discussion_prompt', type: 'string', description: 'One cohort discussion seed' },
  ],
  completion_rules: { on: 'view' },
  evaluation_type: 'none',
  generation_prompt: o.generation_prompt,
  thumbnail_url: thumbnailUrlFor(o.slug),
  approved: true,
  status: 'published',
});

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

  // ── Intelligence Pipeline types ────────────────────────────────────────────
  ai_news_flash: intelAuthoring({
    slug: 'ai_news_flash', student_label: 'AI News Flash', icon: 'bi-newspaper', badge_class: 'bg-info',
    estimated_time: 6, capabilities: ['ai_chat', 'comments', 'likes', 'bookmarks', 'sharing'],
    generation_prompt: AI_NEWS_FLASH_GENERATION_PROMPT,
  }),
  ai_research_digest: intelAuthoring({
    slug: 'ai_research_digest', student_label: 'AI Research Digest', icon: 'bi-journal-richtext', badge_class: 'bg-primary',
    estimated_time: 12, capabilities: ['ai_chat', 'reflection', 'comments', 'bookmarks'],
    generation_prompt: AI_RESEARCH_DIGEST_GENERATION_PROMPT,
  }),
  ai_tool_of_the_day: intelAuthoring({
    slug: 'ai_tool_of_the_day', student_label: 'AI Tool of the Day', icon: 'bi-tools', badge_class: 'bg-success',
    estimated_time: 8, capabilities: ['ai_chat', 'comments', 'likes', 'bookmarks', 'sharing'],
    generation_prompt: AI_TOOL_OF_THE_DAY_GENERATION_PROMPT,
  }),
  ai_video_stream: intelAuthoring({
    slug: 'ai_video_stream', student_label: 'AI Video Stream', icon: 'bi-play-btn', badge_class: 'bg-danger',
    estimated_time: 15, capabilities: ['video', 'transcript', 'comments', 'bookmarks'],
    generation_prompt: AI_VIDEO_STREAM_GENERATION_PROMPT, extraVars: ['item_video_url'],
  }),
  ai_quote_of_the_day: intelAuthoring({
    slug: 'ai_quote_of_the_day', student_label: 'AI Quote of the Day', icon: 'bi-chat-quote', badge_class: 'bg-secondary',
    estimated_time: 3, capabilities: ['reflection', 'comments', 'likes', 'bookmarks'],
    generation_prompt: AI_QUOTE_OF_THE_DAY_GENERATION_PROMPT,
  }),
  ai_architecture_breakdown: intelAuthoring({
    slug: 'ai_architecture_breakdown', student_label: 'Architecture Breakdown', icon: 'bi-diagram-3', badge_class: 'bg-primary',
    estimated_time: 15, capabilities: ['ai_chat', 'reflection', 'comments', 'bookmarks'],
    generation_prompt: AI_ARCHITECTURE_BREAKDOWN_GENERATION_PROMPT,
  }),
  build_breakdown: intelAuthoring({
    slug: 'build_breakdown', student_label: 'Build Breakdown', icon: 'bi-hammer', badge_class: 'bg-success',
    estimated_time: 12, capabilities: ['ai_chat', 'github', 'comments', 'bookmarks'],
    generation_prompt: BUILD_BREAKDOWN_GENERATION_PROMPT,
  }),
  mcp_server_spotlight: intelAuthoring({
    slug: 'mcp_server_spotlight', student_label: 'MCP Server Spotlight', icon: 'bi-hdd-network', badge_class: 'bg-info',
    estimated_time: 10, capabilities: ['ai_chat', 'github', 'comments', 'bookmarks'],
    generation_prompt: MCP_SERVER_SPOTLIGHT_GENERATION_PROMPT,
  }),
  claude_code_technique: intelAuthoring({
    slug: 'claude_code_technique', student_label: 'Claude Code Technique', icon: 'bi-terminal', badge_class: 'bg-dark',
    estimated_time: 12, capabilities: ['ai_chat', 'github', 'reflection', 'comments'],
    generation_prompt: CLAUDE_CODE_TECHNIQUE_GENERATION_PROMPT,
  }),
  market_intelligence: intelAuthoring({
    slug: 'market_intelligence', student_label: 'Market Intelligence', icon: 'bi-graph-up-arrow', badge_class: 'bg-warning',
    estimated_time: 8, capabilities: ['ai_chat', 'comments', 'bookmarks', 'sharing'],
    generation_prompt: MARKET_INTELLIGENCE_GENERATION_PROMPT,
  }),
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
