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

// ── overview ─────────────────────────────────────────────────────────────────
// Fixed teal "vista" watermark (aerial view over land + water). Lives as a real
// static asset — frontend/public/thumbnails/overview-vista.svg — served at this
// short URL, so BOTH the Library <img> and the prompt-driven thumbnail renderer
// can reference the exact same picture (an LLM can copy a short URL verbatim;
// it cannot reliably reproduce a 3.4KB data-URI). Ships in the same deploy as
// this seed, so the switch from the interim data-URI is atomic.
const OVERVIEW_THUMBNAIL_URL = '/thumbnails/overview-vista.svg';

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

/** slug -> authored fields layered on top of the registry defaults. */
export const COMPONENT_AUTHORING: Record<string, AuthoredFields> = {
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
