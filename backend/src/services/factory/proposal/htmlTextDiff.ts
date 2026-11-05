/**
 * htmlTextDiff — a PURE, deterministic, HTML-AWARE word diff between two proposal-document versions, so a reviewer
 * can see what changed from one draft to the next. It strips tags to the readable text, tokenizes on words, and runs
 * a classic LCS word diff into {same|add|del} segments.
 *
 * DEPENDENCY DECISION (PROMPT allowed "add a small vetted dependency if none exists, and justify it"): adding a new
 * npm dependency is an ESCALATE-tier change under CLAUDE.md, so we ship this in-repo LCS instead of pulling a diff
 * library. It is bounded (token cap) so the O(n*m) table can never blow up on a large document, and it is unit-tested.
 * No I/O, never throws; garbage in -> an empty diff.
 */
export interface DiffSegment { type: 'same' | 'add' | 'del'; text: string; }

const MAX_TOKENS = 4000; // cap each side so the LCS table stays bounded on a large document

/** Strip HTML tags to readable text and tokenize into words (whitespace-separated), capped. Pure. */
export function stripToWords(html: string | null | undefined): string[] {
  const text = String(html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return [];
  return text.split(' ').slice(0, MAX_TOKENS);
}

/** LCS word diff of two token arrays into ordered segments. Consecutive same-type tokens are coalesced. Pure. */
export function diffWords(a: string[], b: string[]): DiffSegment[] {
  const n = a.length, m = b.length;
  // LCS length table.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const raw: DiffSegment[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { raw.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { raw.push({ type: 'del', text: a[i] }); i++; }
    else { raw.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { raw.push({ type: 'del', text: a[i] }); i++; }
  while (j < m) { raw.push({ type: 'add', text: b[j] }); j++; }

  // Coalesce consecutive same-type tokens into one segment.
  const out: DiffSegment[] = [];
  for (const seg of raw) {
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.text += ' ' + seg.text;
    else out.push({ ...seg });
  }
  return out;
}

/** Diff two versions' HTML into readable {same|add|del} segments. Pure + total. */
export function diffVersionsHtml(aHtml: string | null | undefined, bHtml: string | null | undefined): DiffSegment[] {
  return diffWords(stripToWords(aHtml), stripToWords(bHtml));
}
