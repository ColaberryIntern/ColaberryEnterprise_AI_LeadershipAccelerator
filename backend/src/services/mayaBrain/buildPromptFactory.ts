/**
 * OH1i (T3): the build-prompt factory.
 *
 * Ali (MAYA_CONTENT_BRAIN.html): "A build prompt is not a tip. It is a complete brief that,
 * pasted into Claude or ChatGPT, builds something real and sophisticated. Ideas come from what
 * builders are sharing right now; every prompt is test-built before Maya sends it."
 *
 *   1. read   the most viral "someone built X" signals of the last week (openclaw_signals)
 *   2. write  an AI turns one idea into a full build prompt: a role, plan first, build steps,
 *             hardening, and a runnable proof
 *   3. check  structuralCheck: all four sections, a concrete stack, a runnable acceptance test,
 *             no banned words. A prompt that fails is dropped, never stored
 *   4. store  a DRAFT row in maya_brain_items, test_build_status 'pending'
 *
 * What it does NOT do: run the prompt with an agent. That real test-build is a person's job
 * for now (they run it, then mark it passed or failed in the admin API), and nothing reaches a
 * learner until they have AND someone approved it. The AI call, the signal reader and the
 * writer are all injected, so tests run with stubs and no network.
 */
import { findBannedCopy, bannedCopyInstruction } from '../content/bannedCopyMatch';
import { BANNED_COPY_RULES } from '../content/bannedCopyRule';
import { viralityScore, isBuildSignal } from './viralSignals';
import { createDraft, defaultQuery, type BrainItem, type Query } from './mayaBrainItems';

export interface FactorySignal {
  id: string;
  platform: string;
  source_url: string;
  title: string;
  content_excerpt: string | null;
  details: Record<string, any> | null;
  created_at?: string | Date;
}

export interface DraftedPrompt {
  title: string;
  prompt: string;
  stack: string[];
  acceptance_test: string;
}

/** system, user -> raw model text. Injected; the default uses the instrumented OpenAI client. */
export type CompleteFn = (system: string, user: string) => Promise<string>;

export const SECTION_LABELS = ['Plan first', 'Build', 'Make it solid', 'Prove it'] as const;

const VAGUE_STACK = /^(any|anything|your choice|whatever|a framework|a database|a language|some library|tbd|n\/a)$/i;
const COMMAND_RE = /(`[^`]{3,}`|\b(npm|npx|pnpm|yarn|node|python3?|pytest|pip|uv|go test|go run|cargo|docker|make|curl|deno|bun)\b)/i;
const EXPECT_RE = /\b(expect|expected|should|must|passes|returns|shows|prints)\b/i;
const MIN_PROMPT_CHARS = 500;
const MAX_PROMPT_CHARS = 6000;

/**
 * The structural test-build: can this prompt plausibly build something real? Pure. Returns the
 * problems in plain words; empty means it passes. It is a gate in front of a human, not a
 * replacement for one: a prompt that passes here still waits for a real agent test-build.
 */
export function structuralCheck(d: Partial<DraftedPrompt> | null | undefined): string[] {
  const problems: string[] = [];
  const prompt = String(d?.prompt || '');
  const title = String(d?.title || '');
  if (!title.trim()) problems.push('no title');
  if (prompt.length < MIN_PROMPT_CHARS) problems.push(`too short to build anything real (${prompt.length} chars, need ${MIN_PROMPT_CHARS})`);
  if (prompt.length > MAX_PROMPT_CHARS) problems.push(`too long to paste (${prompt.length} chars, max ${MAX_PROMPT_CHARS})`);
  if (!/^\s*you are an?\s+\S+/i.test(prompt)) problems.push('missing the role ("You are a ...") at the start');

  let at = -1;
  for (const label of SECTION_LABELS) {
    const re = new RegExp(`(^|\\n)\\s*\\d\\.\\s*${label.replace(/ /g, '\\s+')}\\s*:`, 'i');
    const m = re.exec(prompt);
    if (!m) { problems.push(`missing section "${label}"`); continue; }
    if (m.index < at) problems.push(`section "${label}" is out of order`);
    at = m.index;
  }
  if (!/wait for my (ok|okay|approval|go[- ]ahead)/i.test(prompt)) problems.push('plan-first does not wait for approval before building');

  const stack = Array.isArray(d?.stack) ? d!.stack.map((s) => String(s).trim()).filter(Boolean) : [];
  const concrete = stack.filter((s) => !VAGUE_STACK.test(s) && prompt.toLowerCase().includes(s.toLowerCase()));
  if (concrete.length === 0) problems.push('no concrete stack named in the prompt (e.g. a real library or framework)');

  const accept = String(d?.acceptance_test || '');
  const proveIdx = prompt.search(/\d\.\s*Prove\s+it\s*:/i);
  const proveText = proveIdx >= 0 ? prompt.slice(proveIdx) : '';
  if (!COMMAND_RE.test(accept) || !EXPECT_RE.test(accept)) {
    problems.push('acceptance test is not runnable (needs a command and an expected result)');
  }
  if (proveText && !COMMAND_RE.test(proveText)) problems.push('"Prove it" gives no command to run');

  const hits = findBannedCopy(`${title}\n${prompt}`, BANNED_COPY_RULES);
  if (hits.length) problems.push(`banned word: ${hits.map((h) => h.text).join(', ')}`);
  return problems;
}

/** "Show HN: X (Hacker News, 412 points)" - the credit line a learner sees. */
export function sourceLabel(s: FactorySignal): string {
  const d = s.details || {};
  const where: Record<string, string> = {
    hackernews: 'Hacker News', github: 'GitHub', devto: 'dev.to', producthunt: 'Product Hunt', youtube: 'YouTube', hashnode: 'Hashnode',
  };
  const count = s.platform === 'hackernews' ? (d.points != null ? `${d.points} points` : '')
    : s.platform === 'github' ? (d.stars != null ? `${d.stars} stars` : '')
    : s.platform === 'devto' || s.platform === 'hashnode' ? (d.positive_reactions_count != null ? `${d.positive_reactions_count} reactions` : '')
    : s.platform === 'producthunt' ? (d.votes_count != null ? `${d.votes_count} upvotes` : '')
    : s.platform === 'youtube' ? (d.view_count != null ? `${d.view_count} views` : '') : '';
  const meta = [where[s.platform] || s.platform, count].filter(Boolean).join(', ');
  return `${String(s.title || '').slice(0, 200)} (${meta})`.slice(0, 300);
}

export function factorySystemPrompt(): string {
  return [
    'You write build prompts for working professionals learning to build with AI.',
    'A build prompt is a complete brief that, pasted into Claude or ChatGPT, builds something real and sophisticated',
    '(not a toy, not a tip). You are given one thing a builder recently shared publicly. Write a prompt that has the',
    'learner build their OWN version of the idea, useful at work, in an afternoon.',
    '',
    'The prompt MUST have exactly this shape:',
    '- It starts with the role: "You are a senior <kind of> engineer."',
    '- One sentence saying what to build.',
    '- "1. Plan first:" list the files, the libraries and the steps, and wait for my OK.',
    '- "2. Build:" the concrete features, in order.',
    '- "3. Make it solid:" error handling, limits, edge cases, and keeping it responsive or safe.',
    '- "4. Prove it:" a short manual test plus the exact commands to run it locally and what each should show.',
    '- It ends with: "Explain each decision in one sentence as you go."',
    'Name a concrete stack (real libraries and frameworks). Never require a paid service or an API key the learner',
    'would have to buy; prefer local or open-source tools. American spelling.',
    '',
    bannedCopyInstruction(BANNED_COPY_RULES, 'a prompt that breaks one is discarded'),
    '',
    'Reply with JSON only: {"title": "<6-10 word title>", "prompt": "<the full prompt>", "stack": ["<library>", ...],',
    '"acceptance_test": "<the command to run and the result it should show>"}',
  ].join('\n');
}

export function factoryUserPrompt(s: FactorySignal): string {
  return [
    `WHAT A BUILDER SHARED (${s.platform}): ${s.title}`,
    s.content_excerpt ? `THEIR DESCRIPTION: ${String(s.content_excerpt).slice(0, 600)}` : '',
    `SOURCE: ${s.source_url}`,
  ].filter(Boolean).join('\n');
}

export function parseDraft(raw: string): DraftedPrompt | null {
  try {
    const cleaned = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const j = JSON.parse(cleaned);
    if (!j || typeof j !== 'object') return null;
    return {
      title: String(j.title || ''),
      prompt: String(j.prompt || ''),
      stack: Array.isArray(j.stack) ? j.stack.map(String) : [],
      acceptance_test: String(j.acceptance_test || ''),
    };
  } catch {
    return null;
  }
}

export const defaultComplete: CompleteFn = async (system, user) => {
  const { getInstrumentedOpenAI } = await import('../openaiInstrumented');
  const { getSetting } = await import('../settingsService');
  const { env } = await import('../../config/env');
  const client = getInstrumentedOpenAI({ agent_id: 'maya_build_prompt_factory', prompt_version: 'build-prompt-v1' });
  const model = (await getSetting('ai_model')) || env.aiModel;
  const r = await client.chat.completions.create({
    model, temperature: 0.6, max_tokens: 2000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return r.choices[0]?.message?.content || '';
};

/** The week's build ideas, most viral first, minus those the shelf already has a row for. */
export async function readTopBuildSignals(
  opts: { limit?: number; days?: number; query?: Query } = {},
): Promise<Array<FactorySignal & { virality: number }>> {
  const q = opts.query ?? defaultQuery;
  const rows = await q<FactorySignal>(
    `SELECT s.id, s.platform, s.source_url, s.title, s.content_excerpt, s.details, s.created_at
       FROM openclaw_signals s
      WHERE s.created_at > NOW() - make_interval(days => CAST(:days AS int))
        AND s.platform IN ('hackernews', 'github', 'devto', 'producthunt', 'youtube', 'hashnode')
        AND NOT EXISTS (SELECT 1 FROM maya_brain_items b WHERE b.kind = 'build_prompt' AND b.signal_id = s.id)
      ORDER BY s.created_at DESC
      LIMIT 5000`,
    { days: Math.max(1, Math.floor(opts.days ?? 7)) },
  );
  return rows
    .filter((s) => isBuildSignal({ platform: s.platform, title: s.title, content_excerpt: s.content_excerpt || '', details: s.details || {} }))
    .map((s) => ({ ...s, virality: viralityScore(s.platform, s.details || {}) }))
    .filter((s) => s.virality > 0)
    .sort((a, b) => b.virality - a.virality)
    .slice(0, opts.limit ?? 3);
}

export interface FactoryOutcome {
  signal_id: string;
  source_url: string;
  virality: number;
  result: 'drafted' | 'rejected' | 'duplicate' | 'error' | 'would_draft';
  problems: string[];
  title?: string;
  item_id?: string;
}

export interface FactoryDeps {
  readSignals: () => Promise<Array<FactorySignal & { virality: number }>>;
  complete: CompleteFn;
  saveDraft: (input: Parameters<typeof createDraft>[0]) => Promise<BrainItem | null>;
}

/**
 * The factory entry point. `dryRun` composes and checks but stores nothing. Every outcome is
 * returned (and the caller prints it), including rejected prompts and why.
 */
export async function runBuildPromptFactory(
  opts: { dryRun?: boolean; limit?: number; deps?: Partial<FactoryDeps> } = {},
): Promise<FactoryOutcome[]> {
  const deps: FactoryDeps = {
    readSignals: () => readTopBuildSignals({ limit: opts.limit ?? 3 }),
    complete: defaultComplete,
    saveDraft: (input) => createDraft(input),
    ...(opts.deps || {}),
  };
  const out: FactoryOutcome[] = [];
  const signals = await deps.readSignals();
  for (const s of signals) {
    const base = { signal_id: s.id, source_url: s.source_url, virality: s.virality };
    try {
      const draft = parseDraft(await deps.complete(factorySystemPrompt(), factoryUserPrompt(s)));
      const problems = draft ? structuralCheck(draft) : ['the model did not return the JSON shape'];
      if (!draft || problems.length) { out.push({ ...base, result: 'rejected', problems, title: draft?.title }); continue; }
      if (opts.dryRun) { out.push({ ...base, result: 'would_draft', problems: [], title: draft.title }); continue; }
      const notes = [
        'Structural check passed: role, plan first, build, make it solid, prove it; concrete stack; runnable acceptance test; no banned words.',
        `Stack: ${draft.stack.join(', ')}`,
        `Acceptance test: ${draft.acceptance_test}`,
        'Agent test-build NOT run yet: a person must run this prompt and mark it passed or failed before it can be approved.',
      ].join('\n');
      const row = await deps.saveDraft({
        kind: 'build_prompt', title: draft.title, body: draft.prompt, source_url: s.source_url,
        source_label: sourceLabel(s), virality: s.virality, signal_id: s.id, test_build_notes: notes,
      });
      out.push(row ? { ...base, result: 'drafted', problems: [], title: draft.title, item_id: row.id } : { ...base, result: 'duplicate', problems: [] });
    } catch (err: any) {
      out.push({ ...base, result: 'error', problems: [String(err?.message || err)] });
    }
  }
  return out;
}
