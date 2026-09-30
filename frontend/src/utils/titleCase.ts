/**
 * toTitleCase — format a curriculum title in Title Case for display, while
 * PRESERVING acronyms and brand casing (AI, API, MCP, GitHub, iOS) and lowering
 * the small connecting words. Used on generated/curriculum card titles only —
 * NOT on real external titles (video / testimonial / blog / podcast), which
 * carry their own authored casing.
 */

const SMALL = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'into', 'nor',
  'of', 'off', 'on', 'or', 'per', 'the', 'to', 'up', 'via', 'vs', 'with',
]);

// Domain acronyms/brands forced to uppercase even when the source is lowercase.
const ACRONYMS = new Set([
  'ai', 'api', 'ml', 'mcp', 'llm', 'gpt', 'ui', 'ux', 'sql', 'html', 'css', 'js',
  'url', 'id', 'aws', 'gcp', 'saas', 'kpi', 'roi', 'crm', 'pdf', 'csv', 'seo',
  'ceo', 'cto', 'hr', 'io', 'qa', 'rag',
]);

export function toTitleCase(input: string | null | undefined): string {
  const s = String(input ?? '');
  if (!s.trim()) return s;
  let wordIdx = 0;
  // Split on whitespace AND underscores. Competency slugs (`ai_foundations`,
  // `mcp_server`) reach card titles verbatim from backend/src/data/
  // weekBlueprints.ts; splitting on whitespace alone left them as a single
  // token, which defeated the ACRONYMS lookup below and rendered
  // "Ai_foundations" (reported by Swati Raman, 2026-08-24). An underscore run
  // collapses to one space so the slug reads as words.
  // Hyphens are deliberately NOT separators: real titles carry meaningful
  // hyphens ("GPT-Red", "non-technical", "Deep Dive - Business Analyst") and
  // splitting on them would silently re-case authored copy.
  return s.split(/([\s_]+)/).map((tok) => {
    if (/^[\s_]*$/.test(tok) && tok !== '') return tok.replace(/_+/g, ' '); // separator run
    if (!/[A-Za-z]/.test(tok)) return tok;      // punctuation/emdash/number — keep
    const first = wordIdx === 0;
    wordIdx += 1;
    // Preserve intentional casing: any uppercase letter after the first char
    // (GitHub, iOS) or an all-caps token (AI, API, MCP) stays verbatim.
    if (/[A-Z]/.test(tok.slice(1)) || tok === tok.toUpperCase()) return tok;
    const lower = tok.toLowerCase();
    const bare = lower.replace(/[^a-z]/g, '');
    if (ACRONYMS.has(bare)) return lower.replace(bare, bare.toUpperCase()); // AI, API, MCP…
    if (!first && SMALL.has(bare)) return lower; // small connecting word
    return lower.replace(/[a-z]/, (c) => c.toUpperCase()); // capitalize first letter
  }).join('');
}
