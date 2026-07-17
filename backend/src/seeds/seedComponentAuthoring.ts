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
  'title: "Week " then the week number from the WEEK CONTEXT, then " Feedback — ", then the week\'s topic exactly as named. Example: "Week 1 Feedback — Claude Code Foundations + Workspace".',
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
// enforces the fixed output schema. This prompt steers the title + a SELF-CONTAINED
// STYLED body_html — the design CSS is baked in because the student drawer renders
// body_html inside a sandboxed, no-external-CSS iframe (CardDetailBody.lessonDoc).
// Certified in Experience Studio 2026-07-17.
const SELF_STUDY_STYLE = '<style>.ss{font-family:Roboto,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1a1a1a;background:#f7f4ee;font-size:15px;line-height:1.62;padding:16px 18px;border-radius:12px}.ss .lead{font-weight:500}.ss h3{font-size:19px;margin:22px 0 6px;border-top:1px solid #ddd6c9;padding-top:16px}.ss h3:first-of-type{border-top:0;padding-top:0;margin-top:4px}.ss h4{font-size:15.5px;margin:14px 0 4px;color:#c20e1e}.ss p{margin:0 0 10px}.ss ul{margin:0 0 10px;padding-left:20px}.ss .note{background:#fdfcfa;border:1px dashed #ddd6c9;border-radius:10px;padding:12px 14px;margin:0 0 16px}.ss .term{background:#fdfcfa;border:1px solid #ddd6c9;border-left:3px solid #367895;border-radius:10px;padding:12px 14px;margin:12px 0}.ss .why{color:#4a4a4a}.ss .warn{background:#fdfcfa;border:1px solid #ddd6c9;border-left:3px solid #fb2832;border-radius:10px;padding:12px 14px;margin:14px 0}.ss .warn b{color:#c20e1e}.ss table{border-collapse:collapse;width:100%;margin:12px 0}.ss th,.ss td{border:1px solid #ddd6c9;padding:7px 10px;text-align:left}.ss th{background:#efebe4}@media(prefers-color-scheme:dark){.ss{background:#231f1b;color:#ece7e0}.ss .note,.ss .term,.ss .warn{background:#2c2723;border-color:#3a342e}.ss h3{border-color:#3a342e}.ss h4,.ss .warn b{color:#ff6b83}.ss .why{color:#a89f94}.ss th{background:#2c2723}.ss th,.ss td{border-color:#3a342e}}</style>';

const SELF_STUDY_GENERATION_PROMPT = [
  'You write the Self Study reading for the AI Systems Architect Accelerator: the "read before class" material a participant reads, at their own pace, before the week\'s live session. The WEEK CONTEXT block above gives this week\'s topic, purpose, learning objectives, competencies, architect domains, student outcomes, success criteria, and level. Ground every word in it and invent nothing it does not support. Generalize to whatever this week\'s topic is; never hard-code a specific week\'s subject matter.',
  '',
  'AUDIENCE & VOICE. Write for a learner with little or no prior background in this week\'s topic. Voice: warm, plain-English, encouraging. No hype. No emoji. Define every piece of jargon in plain words the first time it appears. This is self-study, not an assessment: nothing here is graded, tested, or timed, so never phrase anything as a test, deadline, or required task.',
  '',
  'GROUNDING & ACCURACY. Stay at the level of the concepts WEEK CONTEXT names. Do not invent technical claims it does not support, especially definitions, mechanisms, or what a named product or tool actually is. When unsure what a named tool or term is, describe its role in plain general terms rather than asserting a specific technical category (for example, never call a tool a "programming language" unless WEEK CONTEXT says so). Accuracy beats completeness.',
  '',
  'LEAD WITH THE CONCLUSION. Each Part\'s opening sentence must already state that Part\'s single most important idea; never bury it. Big idea first, then the plain-English explanation, then a concrete example.',
  '',
  'BODY_HTML — output a SELF-CONTAINED, STYLED fragment. It renders inside a sandboxed iframe with NO external CSS, so it must carry its own styles. Requirements, in order:',
  '1. body_html MUST BEGIN with this exact style block, copied VERBATIM, character for character (do not alter, re-order, or re-indent it):',
  SELF_STUDY_STYLE,
  '2. Immediately after the style block, output a single <div class="ss"> that wraps ALL content, and close it at the very end.',
  '3. Inside <div class="ss">, structure the content as:',
  '   - FIRST child: <div class="note"><p>How to use this: read at your own pace, skip anything you already know, nothing here is tested.</p></div>',
  '   - 4 to 6 Parts. Each Part = an <h3> heading ("Part 1 - ...") then a <p class="lead"> whose sentence states that Part\'s single key idea, then short <p> paragraphs.',
  '   - For any term you define: <div class="term"><h4>Term</h4><p>plain-English definition</p><p class="why"><b>Why it matters:</b> ...</p></div>',
  '   - For an important caution or common pitfall: <div class="warn"><p><b>Caution name.</b> explanation</p></div>',
  '   - Use <ul>/<li> for lists and a <table> with a <thead> for any small comparison (e.g. an Industry / Where it shows up table).',
  '4. Use ONLY the classes named above plus plain <h3>/<h4>/<p>/<ul>/<li>/<table>. Do NOT add any other <style>, any <script>, external CSS/JS, inline color/style attributes, or page chrome (no nav, logo, progress bar, or theme toggle). The style block already carries every color and size.',
  '',
  'FILL THE OTHER OUTPUT KEYS.',
  '- title: "Self Study - <this week\'s topic>" from WEEK CONTEXT (e.g. "Self Study - Claude Code Foundations + Workspace").',
  '- summary: one or two plain sentences: what this reading covers and that it is optional, self-paced, and not tested.',
  '- questions: 3 to 5 light self-check questions ("In your own words, ..." / "Can you explain ..."), for self-checking only, never graded.',
  '- reflection: one short, low-stakes reflection prompt connecting the reading to the learner\'s own work or goals.',
  '- discussion_prompt: one open discussion seed for the cohort, tied to this week\'s topic.',
  '- github_task: null. evaluation_criteria: an empty array (not scored).',
  '- completion: describe that the card completes when the participant marks the reading as read; nothing is submitted or graded.',
].join('\n');

/** slug -> authored fields layered on top of the registry defaults. */
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
