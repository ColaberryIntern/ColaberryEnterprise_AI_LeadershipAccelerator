/**
 * podcastTagger — PURE derivation of match signals for a podcast episode.
 *
 * The shared media-picker (see docs/PODCAST_PERSONALIZATION_SPEC.md) scores an episode
 * against a student's derived tags with `matchScore(itemTags, itemText, userTags)`. To
 * make an episode matchable we derive:
 *   - `tags`     : AI-topic + vendor keywords found in the title/description, plus
 *                  distinctive title tokens (mirrors the network-video ingest tagger).
 *   - `category` : one coarse subject bucket the admin can filter on ("curriculum subject").
 *
 * No I/O — trivially unit-testable.
 */

// Controlled AI-topic vocabulary. Each entry maps a regex to a canonical tag so that
// e.g. "GPT-5.5" and "ChatGPT" both yield `gpt`, and a student whose goal mentions
// "agents" overlaps an episode tagged `agents`.
const TOPIC_RULES: Array<[RegExp, string]> = [
  [/anthropic/i, 'anthropic'], [/\bclaude\b/i, 'claude'], [/openai/i, 'openai'],
  [/\bgpt\b|chatgpt/i, 'gpt'], [/google|deepmind/i, 'google'], [/\bgemini\b/i, 'gemini'],
  [/microsoft|copilot/i, 'microsoft'], [/nvidia/i, 'nvidia'], [/\bmeta\b|\bllama\b/i, 'meta'],
  [/\bxai\b|\bgrok\b/i, 'grok'], [/mistral/i, 'mistral'], [/\bapple\b/i, 'apple'],
  [/agent|agentic/i, 'agents'], [/automat/i, 'automation'], [/governance|policy|regulat/i, 'governance'],
  [/safety|alignment|guardrail/i, 'safety'], [/security|cyber/i, 'security'], [/defense|military/i, 'defense'],
  [/reason/i, 'reasoning'], [/multimodal|vision/i, 'multimodal'], [/\bvoice\b|speech/i, 'voice'],
  [/robot|humanoid/i, 'robotics'], [/hardware|chip|\bgpu\b|silicon/i, 'hardware'], [/quantum/i, 'quantum'],
  [/\bcode|coding|developer|programming/i, 'coding'], [/cursor/i, 'coding'],
  [/open[-\s]?source/i, 'opensource'], [/enterprise|business/i, 'enterprise'],
  [/\bdata\b/i, 'data'], [/analytic/i, 'analytics'], [/superintelligence|\bagi\b/i, 'agi'],
  [/\bmodel(s)?\b|\bllm\b/i, 'models'], [/fund|invest|acquisit|valuation/i, 'business'],
  [/china|geopolit|global/i, 'geopolitics'],
];

// Ordered subject buckets — first matching group wins (specific before general).
const CATEGORY_RULES: Array<[string[], string]> = [
  [['robotics', 'hardware'], 'robotics-hardware'],
  [['agents', 'automation'], 'agents-automation'],
  [['governance', 'safety', 'security', 'defense'], 'governance-safety'],
  [['coding'], 'tools-coding'],
  [['models', 'reasoning', 'multimodal', 'agi', 'gpt', 'claude', 'gemini', 'grok'], 'frontier-models'],
];

export const DEFAULT_PODCAST_CATEGORY = 'industry-news';

/** Derive topic/vendor tags from an episode's title + description (deterministic, deduped, capped). */
export function derivePodcastTags(title?: string | null, description?: string | null): string[] {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const tags = new Set<string>();
  if (text.trim()) {
    for (const [re, tag] of TOPIC_RULES) if (re.test(text)) tags.add(tag);
  }
  // Keep distinctive title tokens (>3 chars) so episode-specific terms are matchable too.
  (title || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .forEach((w) => {
      if (w.length > 3 && !STOPWORDS.has(w)) tags.add(w);
    });
  return [...tags].slice(0, 14);
}

/** Pick one coarse subject bucket for the episode (the admin-filterable "curriculum subject"). */
export function derivePodcastCategory(
  title?: string | null,
  description?: string | null,
  tags?: string[]
): string {
  const t = new Set(tags && tags.length ? tags : derivePodcastTags(title, description));
  for (const [needed, category] of CATEGORY_RULES) {
    if (needed.some((tag) => t.has(tag))) return category;
  }
  return DEFAULT_PODCAST_CATEGORY;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'your', 'about', 'what', 'when',
  'why', 'how', 'new', 'first', 'real', 'rise', 'dawn', 'age', 'era', 'why', 'are', 'not',
]);
