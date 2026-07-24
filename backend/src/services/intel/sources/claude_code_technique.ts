/**
 * claude_code_technique — CURATED intel source: one Claude Code / agentic-coding
 * technique per run.
 *
 * collect() returns a static, authored set of techniques as seed items. It does NOT
 * fetch and NEVER throws. guid is `cctech:<slug-of-title>` so it is stable per
 * technique and the engine can dedup + rotate on it.
 *
 * title = the technique, excerpt = a short pointer on how/why to use it, url = the
 * Claude Code docs (or best-practices) page where relevant, else null.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { toSlug } from './idUtils';

const SLUG = 'claude_code_technique';
const SOURCE = 'Claude Code';

const DOCS = 'https://docs.claude.com/en/docs/claude-code/';
const BEST_PRACTICES = 'https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start';

interface CuratedTechnique {
  title: string;
  pointer: string; // short "how/why" pointer
  url: string | null;
}

/** Authored set (constant, not user input) of ~20 techniques. */
const TECHNIQUES: readonly CuratedTechnique[] = [
  { title: 'Use subagents to split exploration from editing', pointer: 'Spin up read-only Explore subagents to map a subsystem, then edit in the main session with the full picture and a clean context window.', url: BEST_PRACTICES },
  { title: 'CLAUDE.md as a living operating contract', pointer: 'Keep project rules, conventions, and guardrails in CLAUDE.md so every session loads the same context instead of re-deriving it.', url: `${DOCS}memory` },
  { title: 'Plan mode before large refactors', pointer: 'Have Claude produce a plan and get it approved before touching code, so a bad approach is caught cheaply.', url: `${DOCS}common-workflows` },
  { title: 'Maker/checker separation for verification', pointer: 'Never let the agent that wrote the code be its sole reviewer; run an independent verification pass over the diff.', url: null },
  { title: 'Custom slash commands for repeated workflows', pointer: 'Save reusable prompt templates as slash commands in .claude/commands so a multi-step workflow is one keystroke.', url: `${DOCS}slash-commands` },
  { title: 'Skills package repeatable expertise', pointer: 'Capture a proven multi-step procedure once as a Skill and invoke it by name rather than re-explaining it each time.', url: `${DOCS}skills` },
  { title: 'Hooks enforce deterministic automation', pointer: "Use lifecycle hooks to run formatters, tests, or guards the model can't skip, moving must-happen steps out of the prompt.", url: `${DOCS}hooks` },
  { title: 'MCP servers extend the tool surface', pointer: 'Connect Model Context Protocol servers to give Claude typed, auditable access to your own systems and data.', url: `${DOCS}mcp` },
  { title: 'Tests as the gate on every change', pointer: 'Give the agent a fast test command so it can self-verify each edit before moving on, tightening the build-break-harden loop.', url: null },
  { title: 'Let Claude run code and read the output', pointer: 'Give it the ability to execute, observe errors, and iterate rather than guessing at behavior from source alone.', url: null },
  { title: 'Commit early and often for safe checkpoints', pointer: 'Small, frequent commits let you roll back a bad agent step without losing the good work around it.', url: null },
  { title: 'Point Claude at the right files', pointer: 'Name the files and symbols involved to narrow the context instead of asking the model to search the whole repo blindly.', url: null },
  { title: 'Use screenshots and images for UI work', pointer: 'Paste a mockup or a broken screen so Claude can match the visual target instead of describing it in prose.', url: null },
  { title: 'Separate planning from execution', pointer: 'Ask "what will you do" first, review it, then say "do it", so the approach is validated before any code lands.', url: BEST_PRACTICES },
  { title: 'Parallelize independent work across agents', pointer: 'Fan out unrelated tasks to concurrent subagents in one message to cut wall-clock time on large jobs.', url: BEST_PRACTICES },
  { title: 'Keep the context window lean', pointer: 'Prefer targeted reads over dumping whole directories so the model’s attention stays on what actually matters.', url: null },
  { title: 'Write the failing test first', pointer: 'Have Claude reproduce a bug with a test before fixing it, so the fix is provably correct and stays fixed.', url: null },
  { title: 'Use headless mode for CI and scripts', pointer: 'Run Claude Code non-interactively to automate pipelines, batch edits, and scheduled jobs.', url: `${DOCS}common-workflows` },
  { title: 'Resume sessions to preserve context', pointer: 'Continue a prior session instead of re-explaining the task, keeping the accumulated understanding intact.', url: null },
  { title: 'Curate settings.json permissions', pointer: 'Allowlist genuinely safe commands to cut permission prompts without opening the door to destructive ones.', url: `${DOCS}settings` },
];

/** Curated: return the authored techniques as normalized seed items. Never throws. */
export async function collect(): Promise<NormalizedIntelItem[]> {
  try {
    const seen = new Set<string>();
    const items: NormalizedIntelItem[] = [];
    for (const t of TECHNIQUES) {
      const guid = `cctech:${toSlug(t.title)}`;
      if (seen.has(guid)) continue; // guard against an accidental duplicate title
      seen.add(guid);
      items.push({ guid, source: SOURCE, title: t.title, url: t.url, excerpt: t.pointer, publishedAt: null });
    }
    return items;
  } catch {
    return []; // contract: collect() never throws.
  }
}

registerIntelSource({
  slug: SLUG,
  label: 'Claude Code Technique',
  enableEnv: 'CLAUDE_CODE_TECHNIQUE_INGEST_ENABLED',
  maxPerRunEnv: 'CLAUDE_CODE_TECHNIQUE_MAX_PER_RUN',
  collect,
});
