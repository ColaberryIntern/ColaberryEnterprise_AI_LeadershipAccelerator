/**
 * communityRituals — the 12 weekly Community Rituals for the AI Systems Architect
 * Accelerator. The end-of-week `community_discussion` card rotates: each week runs
 * a different social ritual, tied to what students just built, always tagged with
 * the week. Cohort Wins (Week 5) is one of the twelve.
 *
 * This is ONE config, twelve entries — the panel (CommunityRitualPanel / render_band
 * 'peer_wins'), the composer, the wall, likes, and comments are the same everywhere;
 * only this config changes per week. Every ritual is still a real community_posts row
 * (category per ritual) so it all flows into the existing Community feed + leaderboard.
 *
 * The config is CLIENT-SAFE: `publicRitual()` is sent verbatim to the panel, which
 * renders the composer + tiles straight from it. Add/adjust a week here and both the
 * backend behavior and the student UI update together — no per-week frontend code.
 */

/** A single composer input for a ritual. */
export interface RitualField {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  /** text = one-line; textarea = multi-line; list = one item per line → chips;
   *  link = optional URL (mirrored into media_urls); choice = pick one of `choices`. */
  kind: 'text' | 'textarea' | 'list' | 'link' | 'choice';
  choices?: string[];
  /** render the value in a monospace box (e.g. a prompt to copy). */
  mono?: boolean;
  maxLength?: number;
}

/** How the wall renders a post for this ritual. */
export type RitualVariant =
  | 'standard'       // headline + expandable story
  | 'chips'          // a `list` field rendered as chips (skills, agents)
  | 'prompt'         // a `mono` field in a copy-able code box
  | 'qa'             // a question + answer (comment) count + "solved"
  | 'debate'         // a `choice` side + a live agree/push-back split bar
  | 'before_after'   // two fields shown as a before → after strip
  | 'manifesto';     // celebratory, larger card

export interface RitualConfig {
  key: string;
  week: number;
  name: string;
  icon: string;              // one emoji
  accent: string;            // hex — the panel's accent for this week
  category: string;          // maps to an existing community category (feed reuse)
  ask: string;               // the prompt shown to the student
  lead: string;              // one supporting sentence under the header
  postCta: string;           // the submit button label
  fields: RitualField[];
  headlineField: string;     // which field becomes the tile headline
  variant: RitualVariant;
  reaction: { emoji: string; label: string };   // the like/kudos, labelled per ritual
  mechanic: { icon: string; caption: string };   // the energy line under the wall
  /** two field keys [before, after] for the before_after variant. */
  beforeAfter?: [string, string];
}

const TEAL = '#367895', DEEPTEAL = '#2E6A86', GREEN = '#5BA63C', GOLD = '#E8920C', CORAL = '#D97757';

export const RITUALS: Record<number, RitualConfig> = {
  1: {
    key: 'roll_call', week: 1, name: 'Roll Call', icon: '👋', accent: TEAL, category: 'Introductions',
    ask: 'Introduce yourself to the cohort. Who are you, what do you do, and the one thing you want AI to take off your plate?',
    lead: 'Everyone meets everyone on day one. The movement starts with faces and intent.',
    postCta: 'Introduce myself',
    fields: [
      { key: 'intro', label: "I'm…", placeholder: 'Dana Okoye, Ops Director at Meridian Freight', required: true, kind: 'text', maxLength: 200 },
      { key: 'want', label: 'The one thing I want AI to do for me', placeholder: 'Turn our Monday ops chaos into a 1-page brief', required: true, kind: 'textarea' },
    ],
    headlineField: 'intro', variant: 'standard',
    reaction: { emoji: '👋', label: 'Welcome' },
    mechanic: { icon: '👋', caption: 'introduced themselves this week' },
  },
  2: {
    key: 'skill_drop', week: 2, name: 'Skill Drop', icon: '🧩', accent: GREEN, category: 'General',
    ask: 'You shipped 3 Agent Skills this week. Name them, and tell us which one surprised you.',
    lead: 'They built three skills this week. Now they show them off and watch the cohort total climb.',
    postCta: 'Drop my skills',
    fields: [
      { key: 'skills', label: 'My 3 skills', placeholder: 'invoice-parser\ntone-checker\nstandup-writer', required: true, kind: 'list' },
      { key: 'surprise', label: 'The one that surprised me', placeholder: "tone-checker caught phrasing I'd never notice", kind: 'textarea' },
    ],
    headlineField: 'surprise', variant: 'chips',
    reaction: { emoji: '👏', label: 'Cheer' },
    mechanic: { icon: '📈', caption: 'skills shipped by the cohort this week' },
  },
  3: {
    key: 'show_and_tell', week: 3, name: 'Show & Tell', icon: '🎬', accent: GOLD, category: 'General',
    ask: 'Demo your workflow assistant. What does it do, and what did it replace?',
    lead: 'First real assistant. They demo it and quantify what it replaced.',
    postCta: 'Show & tell',
    fields: [
      { key: 'does', label: 'My assistant does…', placeholder: 'Drafts our weekly client status report from raw notes', required: true, kind: 'text' },
      { key: 'before', label: 'Before', placeholder: '2 hrs of copy-paste', kind: 'text' },
      { key: 'after', label: 'After', placeholder: '30 seconds', kind: 'text' },
      { key: 'link', label: 'Link or screenshot', placeholder: 'https://loom.com/…', kind: 'link' },
    ],
    headlineField: 'does', variant: 'before_after', beforeAfter: ['before', 'after'],
    reaction: { emoji: '🔥', label: 'Fire' },
    mechanic: { icon: '⏱️', caption: 'assistants demoed this week' },
  },
  4: {
    key: 'steal_this_prompt', week: 4, name: 'Steal This Prompt', icon: '✂️', accent: CORAL, category: 'General',
    ask: 'Drop your single best prompt from your library. What is it for, and who should steal it?',
    lead: 'A prompt library is only as good as it is shared. Best prompts spread across the cohort.',
    postCta: 'Share the prompt',
    fields: [
      { key: 'prompt', label: 'My best prompt', placeholder: "You are a skeptical CFO. List the 3 numbers you'd challenge first…", required: true, kind: 'textarea', mono: true },
      { key: 'forwhat', label: "What it's for", placeholder: 'Pressure-testing any business case before I send it', kind: 'text' },
    ],
    headlineField: 'forwhat', variant: 'prompt',
    reaction: { emoji: '✂️', label: 'Steal it' },
    mechanic: { icon: '🏅', caption: 'prompts shared this week' },
  },
  5: {
    key: 'cohort_wins', week: 5, name: 'Cohort Wins', icon: '🏆', accent: DEEPTEAL, category: 'Wins',
    ask: "You shipped your first MCP server. What did you build, what was the breakthrough, and one tip for whoever's next?",
    lead: 'First MCP server shipped. The guided win: what you built, the breakthrough, one tip for next.',
    postCta: 'Post my win',
    fields: [
      { key: 'built', label: 'What I built', placeholder: 'A read-only MCP server for my recipe pantry', required: true, kind: 'text' },
      { key: 'breakthrough', label: 'Breakthrough or hardest part', placeholder: 'Getting stdio transport to connect inside Claude Code', kind: 'textarea' },
      { key: 'tip', label: "One tip for whoever's next", placeholder: 'Verify the server in Claude Code before wiring any UI', kind: 'textarea' },
      { key: 'link', label: 'Link', placeholder: 'https://github.com/…', kind: 'link' },
    ],
    headlineField: 'built', variant: 'standard',
    reaction: { emoji: '👏', label: 'Cheer' },
    mechanic: { icon: '🏆', caption: 'classmates shipped this section' },
  },
  6: {
    key: 'unblock_me', week: 6, name: 'Unblock Me', icon: '🧗', accent: TEAL, category: 'Support',
    ask: 'Integration is where it gets hard. What are you stuck on right now, and what have you already tried?',
    lead: 'Integration week is where people get stuck. The ritual turns struggle into group problem-solving.',
    postCta: 'Ask the cohort',
    fields: [
      { key: 'stuck', label: "What I'm stuck on", placeholder: "My MCP server times out on our CRM's rate limit", required: true, kind: 'text' },
      { key: 'tried', label: "What I've already tried", placeholder: 'Retries with backoff, but it still 429s under load', kind: 'textarea' },
    ],
    headlineField: 'stuck', variant: 'qa',
    reaction: { emoji: '🙋', label: 'Me too' },
    mechanic: { icon: '🧗', caption: 'blockers posted this week — answer one' },
  },
  7: {
    key: 'meet_my_team', week: 7, name: 'Meet My Team', icon: '🤝', accent: GREEN, category: 'General',
    ask: "Introduce your multi-agent team like you'd introduce new hires. Who's on it, and what does each one do?",
    lead: 'They built a multi-agent team. Introduce it like introducing new hires.',
    postCta: 'Introduce my team',
    fields: [
      { key: 'agents', label: 'My agents (one per line: name — what it does)', placeholder: 'Researcher — gathers sources\nDrafter — writes v1\nReviewer — checks facts + tone', required: true, kind: 'list' },
    ],
    headlineField: 'agents', variant: 'chips',
    reaction: { emoji: '👏', label: 'Cheer' },
    mechanic: { icon: '🤖', caption: 'agents the cohort now runs' },
  },
  8: {
    key: 'never_again', week: 8, name: 'Never Again', icon: '⚙️', accent: GOLD, category: 'General',
    ask: "What's the boring thing you'll never do by hand again? And how often did it used to eat your week?",
    lead: "The satisfying flex: the boring thing you'll never do by hand again.",
    postCta: 'Post my automation',
    fields: [
      { key: 'automated', label: 'What I automated', placeholder: 'Compiling the weekly leadership board report', required: true, kind: 'text' },
      { key: 'before', label: 'Was', placeholder: '90 min every Monday', kind: 'text' },
      { key: 'after', label: 'Now', placeholder: 'runs itself', kind: 'text' },
    ],
    headlineField: 'automated', variant: 'before_after', beforeAfter: ['before', 'after'],
    reaction: { emoji: '🔥', label: 'Respect' },
    mechanic: { icon: '💥', caption: 'workflows automated this week' },
  },
  9: {
    key: 'war_story', week: 9, name: 'War Story', icon: '🛡️', accent: CORAL, category: 'General',
    ask: 'Reliability is earned. Tell us how something broke this week, and exactly how you hardened it.',
    lead: 'Reliability is earned. Failure gets normalized as the lesson, not the shame.',
    postCta: 'Tell the war story',
    fields: [
      { key: 'broke', label: 'How it broke', placeholder: 'A retry loop with no cap sent 200 duplicate emails', required: true, kind: 'text' },
      { key: 'fixed', label: 'How I hardened it', placeholder: 'Added an idempotency key + a max-attempts cap', kind: 'textarea' },
    ],
    headlineField: 'broke', variant: 'standard',
    reaction: { emoji: '🛡️', label: 'Respect' },
    mechanic: { icon: '🏛️', caption: 'war stories in the failure museum this week' },
  },
  10: {
    key: 'hot_take', week: 10, name: 'Hot Take', icon: '⚖️', accent: DEEPTEAL, category: 'General',
    ask: '"A human must approve every agent action before it runs." Pick a side and defend it.',
    lead: 'Governance is judgment. A provocative prompt splits the room and sparks real debate.',
    postCta: 'Stake my claim',
    fields: [
      { key: 'side', label: 'My side', required: true, kind: 'choice', choices: ['Agree', 'Push back'] },
      { key: 'because', label: 'Because…', placeholder: 'Tier by reversibility, not by blanket rule', required: true, kind: 'textarea' },
    ],
    headlineField: 'because', variant: 'debate',
    reaction: { emoji: '💬', label: 'Good point' },
    mechanic: { icon: '⚖️', caption: 'takes staked this week' },
  },
  11: {
    key: 'teach_one_thing', week: 11, name: 'Teach One Thing', icon: '💡', accent: TEAL, category: 'General',
    ask: 'You can see the whole system now. Teach the cohort ONE architecture principle you finally get, in a single sentence.',
    lead: 'You can see the whole system now. Teaching it to the cohort is how it locks in.',
    postCta: 'Teach the cohort',
    fields: [
      { key: 'thing', label: 'The one thing I can now teach', placeholder: 'Design the failure path before the happy path', required: true, kind: 'text' },
      { key: 'sentence', label: 'In one sentence', placeholder: "If you can't name what happens when it breaks, you haven't designed it yet.", kind: 'textarea' },
    ],
    headlineField: 'thing', variant: 'standard',
    reaction: { emoji: '💡', label: 'I learned this' },
    mechanic: { icon: '💡', caption: 'lessons taught this week' },
  },
  12: {
    key: 'architect_manifesto', week: 12, name: 'Architect Manifesto', icon: '🎓', accent: GREEN, category: 'Wins',
    ask: "You're an AI Systems Architect now. What did you build, who have you become, and what's your commitment for what's next?",
    lead: 'The finale. Capstone, identity, and a commitment for what comes next, all on one wall.',
    postCta: 'Post my manifesto 🎉',
    fields: [
      { key: 'capstone', label: 'My capstone', placeholder: 'A governed intake-to-invoice agent for our 40-person ops team', required: true, kind: 'text' },
      { key: 'become', label: "The architect I've become", placeholder: 'Someone who ships AI my company can actually trust', kind: 'text' },
      { key: 'commitment', label: 'My commitment', placeholder: 'Roll one more workflow onto it every month', kind: 'text' },
    ],
    headlineField: 'capstone', variant: 'manifesto',
    reaction: { emoji: '🎉', label: 'Congrats' },
    mechanic: { icon: '🎓', caption: 'architects graduated' },
  },
};

/** The fallback ritual for a community_discussion card with no week (or an out-of-range
 *  week): Cohort Wins — a safe, generic "share what you did" that always works. */
export const DEFAULT_RITUAL: RitualConfig = RITUALS[5];

/** Resolve the ritual for a card's week (1..12), falling back to DEFAULT_RITUAL. */
export function ritualForWeek(week: number | null | undefined): RitualConfig {
  if (typeof week === 'number' && RITUALS[week]) return RITUALS[week];
  return DEFAULT_RITUAL;
}

/** The student-facing chip/crumb label for a card: the week's ritual name for a
 *  community_discussion card, otherwise the type's own label. Keeps the feed tile
 *  and the drawer/workspace header on the SAME per-week ritual identity. */
export function ritualStudentLabel(type: string, week: number | null | undefined, fallback: string): string {
  return type === 'community_discussion' ? ritualForWeek(week).name : fallback;
}

/** The client-safe view sent to the panel (identical shape today; a seam for
 *  hiding any future server-only fields). */
export function publicRitual(r: RitualConfig) {
  return {
    key: r.key, week: r.week, name: r.name, icon: r.icon, accent: r.accent,
    ask: r.ask, lead: r.lead, postCta: r.postCta,
    fields: r.fields, headlineField: r.headlineField, variant: r.variant,
    reaction: r.reaction, mechanic: r.mechanic, beforeAfter: r.beforeAfter ?? null,
  };
}
export type PublicRitual = ReturnType<typeof publicRitual>;

// ── Pure composition + validation (no DB — kept here so it is unit-testable
//    without the model graph, and reused by peerWinsService) ───────────────────
export type RitualValues = Record<string, string | string[]>;

const MAX_FIELD = 2000;
const MAX_LIST_ITEMS = 12;

export function isHttp(s: string): boolean { return /^https?:\/\//i.test(s); }
function badRequest(msg: string): Error { return Object.assign(new Error(msg), { status: 400 }); }

export function valueToText(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(', ');
  return typeof v === 'string' ? v : '';
}

/** PURE — validate + normalize submitted field values against the ritual, or throw 400. */
export function normalizeValues(ritual: RitualConfig, raw: RitualValues): RitualValues {
  const out: RitualValues = {};
  for (const f of ritual.fields) {
    const v = raw ? raw[f.key] : undefined;
    if (f.kind === 'list') {
      const items = (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [])
        .map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_LIST_ITEMS).map((s) => s.slice(0, MAX_FIELD));
      if (f.required && items.length === 0) throw badRequest(`Add at least one: ${f.label}`);
      if (items.length) out[f.key] = items;
      continue;
    }
    const s = typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.join(' ').trim() : '';
    if (f.kind === 'choice') {
      if (s && !(f.choices || []).includes(s)) throw badRequest(`Pick one for ${f.label}`);
      if (f.required && !s) throw badRequest(`Pick one for ${f.label}`);
      if (s) out[f.key] = s;
      continue;
    }
    if (f.kind === 'link') {
      if (s && isHttp(s)) out[f.key] = s.slice(0, 1000);   // drop non-URLs quietly
      continue;
    }
    if (f.required && !s) throw badRequest(`${f.label} is required`);
    if (s) out[f.key] = s.slice(0, MAX_FIELD);
  }
  return out;
}

/** PURE — the community-feed body for a ritual post (so it reads well in the main feed). */
export function composeBody(ritual: RitualConfig, values: RitualValues): string {
  const parts: string[] = [`${ritual.icon} ${ritual.name} · Week ${ritual.week}`];
  for (const f of ritual.fields) {
    if (f.kind === 'link') continue;
    const t = valueToText(values[f.key]);
    if (t) parts.push(`${f.label}: ${t}`);
  }
  return parts.join('\n\n');
}

export function linkField(ritual: RitualConfig): RitualField | undefined {
  return ritual.fields.find((f) => f.kind === 'link');
}

/** PURE — the tile headline: the ritual's headline field, else the first filled field. */
export function headlineOf(ritual: RitualConfig, values: RitualValues): string {
  const t = valueToText(values[ritual.headlineField]);
  if (t) return t;
  for (const f of ritual.fields) {
    if (f.kind === 'link') continue;
    const v = valueToText(values[f.key]);
    if (v) return v;
  }
  return ritual.name;
}
