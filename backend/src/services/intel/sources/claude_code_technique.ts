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

/**
 * Authored set (constant, not user input) of Claude Code techniques. Grown from
 * ~20 to ~55 (2026-08-10, content-supply fix) — see ai_tool_of_the_day.ts's
 * catalog-size comment for why: at 2/day this type was fully exhausting its list
 * in ~10 days, then going silent until the 30-day retention window recycled the
 * oldest cards, an ~18-day dead zone every cycle. ~55 items keeps the list from
 * running dry before the recycle window opens.
 */
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
  { title: 'Use /clear between unrelated tasks', pointer: 'Reset the conversation when switching to something unrelated so old context stops competing for the model’s attention.', url: null },
  { title: 'Reference file:line for precise pointers', pointer: 'Cite exact locations like config.ts:42 in prompts so Claude jumps straight to the right code instead of searching broadly.', url: null },
  { title: 'Use git worktrees for parallel branches', pointer: 'Run independent Claude sessions on separate worktrees so concurrent work never collides in the same checkout.', url: null },
  { title: 'Batch independent tool calls together', pointer: 'When several lookups don’t depend on each other, request them in one message instead of one-at-a-time round trips.', url: null },
  { title: 'Ask for the plan before risky changes', pointer: 'Have Claude explain its approach to a migration or deletion before executing it, catching a bad plan while it’s still cheap to redirect.', url: `${DOCS}common-workflows` },
  { title: 'Keep pull requests small and focused', pointer: 'One logical change per PR makes an agent-authored diff easy for a human to actually review.', url: null },
  { title: 'Give Claude the real test failure output', pointer: 'Paste the actual error and stack trace rather than paraphrasing it, so the model diagnoses the real problem.', url: null },
  { title: 'Chain Claude Code into CI for automated checks', pointer: 'Run it non-interactively in a pipeline step to triage failures or review diffs on every push.', url: `${DOCS}common-workflows` },
  { title: 'Prefer editing existing files over new ones', pointer: 'Extending an established pattern keeps the codebase consistent instead of scattering near-duplicate logic.', url: null },
  { title: 'Use .claudeignore for noisy directories', pointer: 'Exclude build output, vendored code, and large generated files so they never crowd out real context.', url: null },
  { title: 'Verify with a fresh session, not the author', pointer: 'A different session (or subagent) grading a change catches mistakes the original session is blind to.', url: null },
  { title: 'Keep a scratchpad for multi-step tasks', pointer: 'Track progress in a working file during a long task so state survives context compaction.', url: null },
  { title: 'Ask Claude to flag assumptions explicitly', pointer: 'Request a short list of what it assumed rather than let ambiguity get silently guessed away.', url: null },
  { title: 'Use output styles to match team conventions', pointer: 'Configure how Claude formats responses so its output fits your team’s existing norms by default.', url: null },
  { title: 'Pin dependency versions when reproducibility matters', pointer: 'Explicit versions stop an agent-run install from silently drifting the toolchain underneath a build.', url: null },
  { title: 'Use the IDE extension for inline diffs', pointer: 'Reviewing changes inline in your editor is faster than reading a full-file dump in the terminal.', url: null },
  { title: 'Write the CHANGELOG entry alongside the code', pointer: 'Ask Claude to summarize what changed and why in the same session, while the reasoning is still fresh.', url: null },
  { title: 'Review agent-authored SQL before applying it', pointer: 'Migrations and schema changes deserve a human read, even when the query itself looks correct.', url: null },
  { title: 'Use structured commit messages for traceability', pointer: 'A consistent commit format makes it easy to trace which session or task produced a given change later.', url: null },
  { title: 'Ask for a rollback plan with any risky deploy', pointer: 'Know how to undo a change before you ship it, not after something breaks.', url: null },
  { title: 'Explore before a large rename', pointer: 'Grep every reference first so a rename’s full blast radius is known before any file changes.', url: null },
  { title: 'Prefer several small diffs over one rewrite', pointer: 'Incremental changes are easier to verify, review, and revert than one large, all-at-once rewrite.', url: null },
  { title: 'Keep secrets out of prompts entirely', pointer: 'Reference environment variable names, never paste the actual key or token into a conversation.', url: null },
  { title: 'Use extended thinking for hard multi-step problems', pointer: 'Let Claude reason through a genuinely difficult problem at length before it starts writing code.', url: null },
  { title: 'Match code style already in the file', pointer: 'Ask Claude to follow the surrounding file’s conventions rather than impose a different personal style.', url: null },
  { title: 'Use headless JSON output for pipelines', pointer: 'Structured output lets another program consume Claude Code’s results programmatically, not just a human.', url: null },
  { title: 'Confirm before any destructive git operation', pointer: 'Force-push, hard reset, and history rewrites deserve an explicit pause, not silent execution.', url: null },
  { title: 'Ask "what would break this" before shipping', pointer: 'Have Claude actively try to find the failure modes of its own change before calling it done.', url: null },
  { title: 'Use a dedicated review agent for large diffs', pointer: 'A second agent focused only on finding problems catches more than the same agent re-reading its own work.', url: null },
  { title: 'Keep CLAUDE.md instructions current', pointer: 'Stale project rules cost more context than they save — prune and update them as the codebase evolves.', url: `${DOCS}memory` },
  { title: 'Ask for the smallest fix that solves the bug', pointer: 'Resist scope creep on a bug fix; a targeted patch is easier to verify than an opportunistic refactor.', url: null },
  { title: 'Use hooks to block dangerous commands', pointer: 'A PreToolUse hook can reject a command outright before it ever runs, not just warn about it after.', url: `${DOCS}hooks` },
  { title: 'Name the exact acceptance criteria upfront', pointer: 'Telling Claude precisely what "done" looks like produces a more verifiable result than an open-ended ask.', url: null },
  { title: 'Reuse a proven prompt as a Skill, not a one-off', pointer: 'If you’ve typed the same multi-step instructions twice, package it once and invoke it by name.', url: `${DOCS}skills` },
  { title: 'Let failing tests drive the fix, not guesswork', pointer: 'Run the suite first, read the real failure, then fix — rather than pattern-matching what "looks" broken.', url: null },
  { title: 'Separate maker and checker across sessions', pointer: 'The session that writes a risky change should not be the same one that signs off on it.', url: null },
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
