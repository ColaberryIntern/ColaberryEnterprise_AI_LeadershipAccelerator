/**
 * buildContextualSuggestionV2 — context-aware, goal-aware, progress-aware
 * suggestion generator.
 *
 * Pipeline:
 *   1) CONTEXT — call the CB context walker on the BC todo URL. Pulls
 *      every BC comment + linked Vault docs + attached emails into one
 *      LLM-readable concatenated string.
 *   2) COMPREHENSION — one structured LLM call (GPT-4o-mini, cheap, ~$0.001)
 *      that returns a JSON shape: { goal, progress_so_far, last_action,
 *      next_step, blockers, tools_needed[] }.
 *   3) PROMPT BUILD — deterministic assembly of the long Claude Code
 *      prompt from the JSON. Embeds a "read the ticket first" step,
 *      goal restatement, current-state summary, next-step decomposition,
 *      and per-tool sections with "if this skill doesn't exist yet,
 *      create it like this" subsections when applicable.
 *   4) BASIC STEPS — distill the long prompt into 3-5 short
 *      human-readable action verbs for the email body. Long prompt goes
 *      behind a Copy button.
 *
 * Cost guardrails: one LLM call per task. Falls back to the deterministic
 * template (buildOpsSuggestionLite) on any LLM error so the email still
 * ships SOMETHING useful even if OpenAI is down or we exceed a budget cap.
 *
 * Memory: results cached for 30 min keyed on bc_id + bc_updated_at so
 * re-running the same task in the same window is free.
 */

const path = require('path');
const fs = require('fs');

const CACHE_PATH = path.resolve(__dirname, '../../../tmp/contextual-suggestion-cache.json');
const CACHE_TTL_MS = 30 * 60 * 1000;
const MODEL = process.env.CONTEXTUAL_SUGGESTION_MODEL || 'gpt-4o-mini';
const MAX_CONTEXT_CHARS = 60_000; // ~15k tokens; trims oldest comments first

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return {}; }
}
function saveCache(c) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
  } catch (_) { /* non-fatal */ }
}

const SYSTEM_PROMPT = `You are CB, the AI ops agent for Colaberry. Your job: given the full context of one Basecamp todo (title + description + every comment + linked docs + emails), output a strict JSON object describing what is actually going on.

You will return ONLY valid JSON matching this shape:
{
  "goal": "ONE sentence: what is this whole ticket trying to accomplish? Be concrete, not generic.",
  "progress_so_far": "2-4 sentences summarizing what has already been done on this ticket. Reference specific comments / artifacts / decisions. If nothing has happened, say 'nothing yet'.",
  "last_action": "ONE sentence: the most recent meaningful event on the ticket (someone posted X, someone produced Y, Ali decided Z).",
  "next_step": "ONE sentence: the single most concrete next action the assignee should take RIGHT NOW. Be specific. Not 'review the artifact' but 'review the V6 ad mockup and pick one of the 3 caption options before press deadline Thursday'.",
  "blockers": ["array of strings. Anything blocking the next step. Empty array if nothing."],
  "tools_needed": [
    {
      "name": "the tool / skill / agent / MCP",
      "exists": true | false,
      "why": "why this specific tool is the right one for this specific step",
      "creation_note": "ONLY if exists=false. One sentence on what to create."
    }
  ],
  "complexity": "trivial" | "medium" | "deep",
  "estimated_minutes": 5 | 15 | 30 | 60 | 120
}

Rules:
- Read the context CAREFULLY. Do not output generic advice. Reference specific things from the context.
- Tools you can suggest from this repo: sendWithBcAttach (outbound email + auto-attach), CB context walker, Gmail MCP, Drive MCP, Calendar MCP, CCPP MSSQL, Basecamp API, OpenAI, Mandrill, /admin/ops Approval Workspace, the existing skills (baseline-ui, frontend-design, screenshot-review, telemetry-emission, openclaw-outreach, fixing-accessibility, fixing-motion-performance, ui-ux-design, build-ai-ops-command-center). If you would recommend a NEW skill that doesn't exist yet, set exists=false and write a one-line creation_note.
- If the context shows the task is BLOCKED on someone else, set blockers and make next_step "wait for [person] [reason]" or "follow up with [person] on [thing]".
- If the task is DONE, set next_step to "close this ticket" with closure_note.
- Output JSON only. No prose before or after.`;

function trimContext(ctx, maxChars) {
  if (ctx.length <= maxChars) return ctx;
  // Keep the head (title + description + early comments) and the tail
  // (latest comments where the next step usually is). Drop the middle.
  const headSize = Math.floor(maxChars * 0.35);
  const tailSize = Math.floor(maxChars * 0.65);
  return ctx.slice(0, headSize) + '\n\n[...middle trimmed for context budget...]\n\n' + ctx.slice(-tailSize);
}

async function callOpenAI({ apiKey, contextStr, todoTitle }) {
  // Repo node_modules lives at REPO/node_modules. From this file:
  // backend/src/scripts/lib -> ../../../../node_modules
  const { getInstrumentedOpenAI } = require(path.resolve(__dirname, './openaiInstrumented'));
  const client = getInstrumentedOpenAI({ workflow_id: 'contextual_suggestion' }, { apiKey });
  const userMsg = `Todo title: ${todoTitle}\n\n--- Full ticket context ---\n${trimContext(contextStr, MAX_CONTEXT_CHARS)}`;
  const r = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });
  const text = r.choices?.[0]?.message?.content || '{}';
  const usage = r.usage || {};
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  // GPT-4o-mini pricing: $0.15/MTok in, $0.60/MTok out (as of 2026-06)
  const inCost = (usage.prompt_tokens || 0) * 0.15 / 1_000_000;
  const outCost = (usage.completion_tokens || 0) * 0.60 / 1_000_000;
  return {
    parsed,
    raw: text,
    usage,
    estimated_cost_usd: +(inCost + outCost).toFixed(5),
  };
}

function buildBasicStepsFromAnalysis(analysis) {
  // Distill the long prompt into 3-5 short action verbs for the human.
  const out = [];
  if (analysis.blockers && analysis.blockers.length > 0) {
    out.push(`Resolve blocker: ${analysis.blockers[0]}`);
  }
  // The next_step itself is step 1
  out.push(analysis.next_step);
  // If tools are needed and any don't exist, surface creation as a step
  for (const tool of (analysis.tools_needed || []).slice(0, 2)) {
    if (tool.exists === false && tool.creation_note) {
      out.push(`Create ${tool.name}: ${tool.creation_note}`);
    }
  }
  // Cap at 5
  return out.slice(0, 5);
}

function buildLongPromptFromAnalysis({ analysis, todo, contextStr }) {
  const toolsBlock = (analysis.tools_needed || []).map((t) => {
    const head = `### ${t.name}${t.exists === false ? ' (DOES NOT EXIST YET — create it first)' : ''}`;
    const why = `**Why this one:** ${t.why}`;
    const creation = t.exists === false && t.creation_note
      ? `\n**Creation step:** ${t.creation_note}\nBefore using this tool, create it. Follow the pattern of the closest existing tool in the repo (look in \`scripts/ops-engine/\`, \`.claude/skills/\`, or \`backend/src/services/\`). Commit + push + verify it loads.`
      : '';
    return `${head}\n${why}${creation}`;
  }).join('\n\n');

  const blockersBlock = (analysis.blockers || []).length
    ? `\n## Blockers to resolve first\n${analysis.blockers.map((b) => `- ${b}`).join('\n')}\n`
    : '';

  return `# Task: ${todo.title}

## What this ticket is trying to accomplish
${analysis.goal}

## What has already been done
${analysis.progress_so_far}

**Last action:** ${analysis.last_action}

## What you need to do RIGHT NOW
${analysis.next_step}

Complexity: **${analysis.complexity || 'medium'}** · Estimated: **~${analysis.estimated_minutes || 30} minutes**
${blockersBlock}

## Read the ticket first (always)
Before writing any code or sending any message, pull the FULL context with the CB walker so you see everything I see:
\`\`\`
node scripts/ops-engine/cb-context-walker.js ${todo.bc_app_url || `https://app.basecamp.com/3945211/buckets/${todo.project_id}/todos/${todo.bc_id}`}
\`\`\`
That returns every BC comment, every linked Vault doc, every attached email thread. Read it before deciding anything.

## Tools / Skills / Agents / MCPs you will use
${toolsBlock || '(no specific tools needed — use the base Claude Code tool set)'}

## Auto-attach contract
Every outbound (email / BC comment / artifact) goes through \`sendWithBcAttach\` with \`ticketId: ${todo.bc_id}\`. Em-dashes are stripped automatically. Vault uploads happen on every produced doc.

## Done definition
After you ship the next-step action:
1. Post the result back on this BC ticket as a structured comment. Color-code by outcome (green = applied + sent, amber = partial, red = blocked + escalating).
2. Attach any artifact (PDF / xlsx / HTML doc) via sendWithBcAttach so it lands on the ticket AND in Vault.
3. Update the todo status if the next-step resolves the ticket entirely.

## Stop conditions
- Do NOT send any external email to a new party without Ali approving the recipients first.
- Do NOT commit to money, contracts, hiring, or anything that crosses a CLAUDE.md governance boundary.
- If the context is ambiguous, post a 1-comment summary of your read + the 2-3 branches + recommend one + wait for Ali's go.

Start by running the walker. Then propose your concrete plan in 5 bullets before executing.`;
}

/**
 * Main entry. todo shape: { bc_id, project_id, title, description, bc_app_url, bc_updated_at }
 * bcGet: function for the walker. Optional - if omitted, falls back to deterministic template.
 *
 * Returns { basic_steps, long_prompt, analysis, context_used_chars, cost_usd, source, cached }.
 *   source: 'contextual_v2' | 'fallback_template'
 *   cached: true if served from cache
 */
async function buildContextualSuggestion({ todo, bcGet, bucketId, openaiKey }) {
  const cacheKey = `${todo.bc_id}:${todo.bc_updated_at || ''}`;
  const cache = loadCache();
  const hit = cache[cacheKey];
  if (hit && Date.now() - hit.cached_at < CACHE_TTL_MS) {
    return { ...hit.value, cached: true };
  }

  const fallbackResult = () => {
    const { buildSuggestion, generatePrompt } = require(path.resolve(__dirname, './buildOpsSuggestionLite'));
    const sug = buildSuggestion(todo);
    return {
      basic_steps: sug.steps.slice(0, 5),
      long_prompt: generatePrompt(todo),
      analysis: { goal: '(template fallback - no context analysis)', progress_so_far: '', next_step: sug.one_line, blockers: [], tools_needed: sug.resources.map((r) => ({ name: r.name, exists: true, why: r.why })) },
      context_used_chars: 0,
      cost_usd: 0,
      source: 'fallback_template',
      cached: false,
    };
  };

  if (!openaiKey) return fallbackResult();

  // 1. WALK
  let contextStr = '';
  try {
    if (bcGet && bucketId) {
      const { walkContext, formatContextForLlm } = require(path.resolve(__dirname, '../../../scripts/ops-engine/cb-context-walker'));
      const ctx = await walkContext({ bcGet, bucketId, recId: todo.bc_id });
      contextStr = formatContextForLlm(ctx);
    } else {
      contextStr = `Title: ${todo.title}\n\nDescription: ${todo.description || '(none)'}\n\n(Walker not available - using title + description only.)`;
    }
  } catch (err) {
    contextStr = `Title: ${todo.title}\n\nDescription: ${todo.description || '(none)'}\n\n(Walker failed: ${err.message})`;
  }

  // 2. COMPREHEND
  let llmResult;
  try {
    llmResult = await callOpenAI({ apiKey: openaiKey, contextStr, todoTitle: todo.title });
  } catch (err) {
    console.warn('[contextualV2] LLM call failed, falling back to template:', err.message);
    return fallbackResult();
  }
  if (!llmResult.parsed) {
    console.warn('[contextualV2] LLM returned unparseable JSON, falling back to template');
    return fallbackResult();
  }

  // 3. BUILD
  const analysis = llmResult.parsed;
  const basic_steps = buildBasicStepsFromAnalysis(analysis);
  const long_prompt = buildLongPromptFromAnalysis({ analysis, todo, contextStr });

  const value = {
    basic_steps,
    long_prompt,
    analysis,
    context_used_chars: contextStr.length,
    cost_usd: llmResult.estimated_cost_usd,
    source: 'contextual_v2',
    cached: false,
  };

  // 4. CACHE
  cache[cacheKey] = { cached_at: Date.now(), value };
  saveCache(cache);

  return value;
}

module.exports = { buildContextualSuggestion };
