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
  return s.split(/(\s+)/).map((tok) => {
    if (/^\s*$/.test(tok)) return tok;          // whitespace run — keep as-is
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
