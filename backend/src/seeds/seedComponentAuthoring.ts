/**
 * seedComponentAuthoring — applies AUTHORED config (generation prompt, thumbnail,
 * visual identity, Parts, and I/O contracts) on top of the base curriculum-type
 * registry. The registry (typeRegistry.ts / typeSeeder) creates the rows with
 * behavior defaults; this seed layers the human-authored experience on top.
 *
 * Idempotent: keyed on slug, re-runnable, updates in place, never inserts a
 * duplicate. Run AFTER the base type seed. Rows that don't exist yet are reported
 * as `missing` (not created) so a typo never silently spawns a new type.
 *
 * As types are certified in Experience Studio (see the `build-curriculum-type`
 * skill), add their authored fields to COMPONENT_AUTHORING so the config survives
 * a reseed and promotes cleanly to prod.
 */
import CurriculumTypeDefinition, { CurriculumTypeDefinitionAttributes } from '../models/CurriculumTypeDefinition';

type AuthoredFields = Partial<CurriculumTypeDefinitionAttributes>;

// ── overview ─────────────────────────────────────────────────────────────────
// Fixed teal "vista" watermark (aerial view over land + water), embedded as a
// self-contained data-URI SVG so the same image renders on every Overview card.
const OVERVIEW_VISTA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675" role="img" aria-label="Overview vista overlooking land and water">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#062b33"/><stop offset="55%" stop-color="#0d5967"/><stop offset="100%" stop-color="#2fa7b3"/></linearGradient>
<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#37b4c0"/><stop offset="100%" stop-color="#0a4551"/></linearGradient>
<linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0a3b44"/><stop offset="100%" stop-color="#052228"/></linearGradient>
<radialGradient id="sun" cx="68%" cy="46%" r="34%"><stop offset="0%" stop-color="#dff6f5" stop-opacity="0.55"/><stop offset="100%" stop-color="#dff6f5" stop-opacity="0"/></radialGradient>
<linearGradient id="scrim" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="#04191d" stop-opacity="0.78"/><stop offset="45%" stop-color="#04191d" stop-opacity="0.20"/><stop offset="100%" stop-color="#04191d" stop-opacity="0"/></linearGradient>
<radialGradient id="vig" cx="50%" cy="42%" r="72%"><stop offset="70%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#02171b" stop-opacity="0.42"/></radialGradient>
</defs>
<rect x="0" y="0" width="1200" height="312" fill="url(#sky)"/>
<ellipse cx="816" cy="300" rx="440" ry="180" fill="url(#sun)"/>
<rect x="0" y="300" width="1200" height="375" fill="url(#sea)"/>
<g stroke="#bfeef0" stroke-opacity="0.16" stroke-width="2"><line x1="120" y1="352" x2="1080" y2="352"/><line x1="220" y1="388" x2="1000" y2="388"/><line x1="300" y1="420" x2="900" y2="420"/><line x1="380" y1="452" x2="820" y2="452"/></g>
<path d="M0 300 Q 210 268 420 288 Q 560 302 700 300 L 700 320 Q 480 330 0 322 Z" fill="#0b4e5a" fill-opacity="0.7"/>
<path d="M0 675 L0 372 Q 180 344 340 400 Q 470 446 560 542 Q 610 596 640 675 Z" fill="url(#land)"/>
<g stroke="#3fd0d8" stroke-opacity="0.18" stroke-width="2" fill="none"><path d="M40 640 Q 210 520 380 560"/><path d="M40 588 Q 220 470 360 512"/><path d="M60 536 Q 210 434 330 470"/><path d="M90 486 Q 200 410 300 436"/></g>
<path d="M0 372 Q 180 344 340 400 Q 470 446 560 542" stroke="#dff6f5" stroke-opacity="0.35" stroke-width="3" fill="none"/>
<rect x="0" y="337" width="1200" height="338" fill="url(#scrim)"/>
<rect x="0" y="0" width="1200" height="675" fill="url(#vig)"/>
<text x="60" y="612" font-family="Georgia,serif" font-size="34" letter-spacing="10" fill="#dff6f5" fill-opacity="0.14">OVERVIEW</text>
</svg>`;

const OVERVIEW_THUMBNAIL_URL = 'data:image/svg+xml;base64,' + Buffer.from(OVERVIEW_VISTA_SVG).toString('base64');

// Zero author input: the runtime prepends the week's Blueprint as "WEEK CONTEXT"
// (see getBlueprintContext), and enforces the fixed output schema. This prompt
// steers title + body_html against that injected context.
const OVERVIEW_GENERATION_PROMPT = [
  'You write the Week Overview for the AI Systems Architect Accelerator: the framing card a participant reads before the week begins. The WEEK CONTEXT block above gives this week\'s topic, focus, learning objectives, competencies, architect domains, student outcomes, success criteria, and level. Ground everything in it and invent nothing it does not support.',
  '',
  'title: the word "Overview", then a space, an em dash, a space, then the week\'s topic exactly as named in the WEEK CONTEXT. Example: "Overview — Claude Code Foundations + Workspace".',
  '',
  'body_html: clean, self-contained, VALID and fully balanced HTML (no scripts, no inline styles). Emit exactly these four parts in order:',
  '  1. <p> a one or two sentence welcome naming the week\'s big idea </p>',
  '  2. <p><strong>What you\'ll cover</strong></p> then a <ul> of 3 to 5 short <li> items from the learning objectives',
  '  3. <p><strong>Why it matters</strong></p> then <p> one or two sentences tying the week to the AI Systems Architect path </p>',
  '  4. <p><strong>By the end of this week you\'ll be able to…</strong></p> then a <ul> of 2 to 3 <li> capability statements from the student outcomes or success criteria',
  'Every opening tag must have a matching closing tag. Do not leave any stray or unbalanced tags.',
  '',
  'summary: one sentence describing what the week covers.',
  'completion: "Marked complete when the participant opens and reads the overview."',
  'Return questions as [], reflection as "", discussion_prompt as "", github_task as null, evaluation_criteria as [].',
  '',
  'Voice: executive — clear, calm, authoritative. About 150 to 220 words. No hype, no emojis. The only em dash appears in the title, not the body.',
].join('\n');

/** slug -> authored fields layered on top of the registry defaults. */
export const COMPONENT_AUTHORING: Record<string, AuthoredFields> = {
  overview: {
    student_label: 'Overview',
    category: 'Learn',
    icon: 'bi-binoculars',
    badge_class: 'bg-info',
    estimated_time: 8,
    capabilities: [],
    inputs: [],
    outputs: [
      { key: 'title', type: 'string', description: 'Overview — {week topic}' },
      { key: 'body_html', type: 'html', description: '4-part week overview' },
      { key: 'summary', type: 'string', description: 'One-sentence week summary' },
    ],
    completion_rules: { on: 'view' },
    evaluation_type: 'none',
    generation_prompt: OVERVIEW_GENERATION_PROMPT,
    thumbnail_url: OVERVIEW_THUMBNAIL_URL,
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
    await row.update(fields);
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
