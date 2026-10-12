// cb-context-budget.js: fit an assembled context block to a token budget before it is sent.
//
// Why this exists. cb-context-walker.js caps every PART of the 4-layer walk (60k bytes per
// document, 40k per external page, 4000 chars per comment) but nothing caps the AGGREGATE.
// Layer 3 renders every comment on the thread, and a thread that something posts to on a
// schedule has no upper bound. On recording 10049371244 the assembled block reached ~177k
// tokens against gpt-4o's 128k limit, so the API rejected the call before the model ever
// saw it and CB posted nothing for four days straight. Per-item caps cannot catch that; the
// only thing that can is a budget on the total.
//
// The shape of the trim matters. The head carries LAYER 1 and LAYER 2 (which list, which
// task, what was asked) and the tail carries the most recent comments, so both ends are
// load-bearing and the middle is the oldest, least relevant history. We keep both ends and
// drop the middle, leaving a visible marker so the model is told it is reading an excerpt
// rather than being quietly handed a truncated thread and left to infer the gap.

const CHARS_PER_TOKEN = 4; // gpt-4o English prose averages ~4 chars/token; deliberately coarse

// Derived, not guessed. Measured on prod 2026-10-12 against recording 10049371244:
//   model limit                                    128,000
//   SYSTEM_PROMPT 2,616 + lessons 289 + tools ~3,000  -5,900
//   room for the model's own reply                   -4,000
//                                                  = 118,100 theoretically available
// The observed failure reported 180,071 total against a 129,471-token walk, a gap this
// breakdown does not fully account for, so the default is set well below the theoretical
// ceiling rather than at it. 70,000 tokens is still ~280,000 characters of thread, and it
// leaves ~52,000 tokens of headroom for whatever that unexplained difference turns out to
// be. Raise it with CB_CONTEXT_BUDGET_TOKENS once the gap is understood, not before.
const DEFAULT_BUDGET_TOKENS = 70000;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

/**
 * Fit `text` to `budgetTokens`, keeping the head and tail and dropping the middle.
 * Splits on line boundaries so a comment is never cut mid-sentence.
 * Returns { text, trimmed, originalTokens, finalTokens, droppedLines }.
 */
function fitToBudget(text, options = {}) {
  const budgetTokens = Number(options.budgetTokens) > 0 ? Number(options.budgetTokens) : DEFAULT_BUDGET_TOKENS;
  const headShare = Number.isFinite(options.headShare) ? options.headShare : 0.55;
  const src = String(text == null ? '' : text);
  const originalTokens = estimateTokens(src);

  if (originalTokens <= budgetTokens) {
    return { text: src, trimmed: false, originalTokens, finalTokens: originalTokens, droppedLines: 0 };
  }

  const lines = src.split('\n');
  const marker = (n, tok) =>
    `\n... [context trimmed to budget: ${n} lines (~${tok.toLocaleString()} tokens) of older ` +
    `middle content removed. The head and the most recent entries are intact.] ...\n`;

  // The marker is itself part of the budget, so charge for it before dividing the remainder.
  const markerCost = estimateTokens(marker(999999, 999999));
  const usable = Math.max(0, budgetTokens - markerCost);
  const headBudget = Math.floor(usable * headShare);
  const tailBudget = usable - headBudget;

  const head = [];
  let headTokens = 0;
  for (const line of lines) {
    const t = estimateTokens(line) + 1;
    if (headTokens + t > headBudget) break;
    head.push(line);
    headTokens += t;
  }

  const tail = [];
  let tailTokens = 0;
  for (let i = lines.length - 1; i >= head.length; i--) {
    const t = estimateTokens(lines[i]) + 1;
    if (tailTokens + t > tailBudget) break;
    tail.unshift(lines[i]);
    tailTokens += t;
  }

  const droppedLines = lines.length - head.length - tail.length;
  // Nothing was actually dropped: the budget fit on line boundaries after all.
  if (droppedLines <= 0) {
    const joined = lines.join('\n');
    return { text: joined, trimmed: false, originalTokens, finalTokens: estimateTokens(joined), droppedLines: 0 };
  }

  const droppedTokens = originalTokens - headTokens - tailTokens;
  const out = head.join('\n') + marker(droppedLines, Math.max(0, droppedTokens)) + tail.join('\n');
  return {
    text: out,
    trimmed: true,
    originalTokens,
    finalTokens: estimateTokens(out),
    droppedLines,
  };
}

module.exports = { estimateTokens, fitToBudget, CHARS_PER_TOKEN };
