/**
 * sourceChunker — split an extracted source document into bounded, embeddable chunks for retrieval.
 *
 * Pure and deterministic (no I/O), so it is unit-testable on its own. The strategy packs whole paragraphs together up
 * to a soft token budget, keeping related prose in one chunk; a single paragraph that is itself over the hard ceiling
 * is split on sentence boundaries, then on a hard character length as a last resort, so no chunk ever exceeds the
 * ceiling and no text is dropped. Order is preserved: concatenating the chunks' text in index order reproduces the
 * input's paragraphs in sequence.
 */

export interface SourceChunk {
  index: number;
  text: string;
  tokenEstimate: number;
}

/** ~4 chars per token is the usual rough rule for English; good enough for budgeting, never for billing. */
const CHARS_PER_TOKEN = 4;
const DEFAULT_TARGET_TOKENS = 800;
const DEFAULT_HARD_TOKENS = 1000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface ChunkOptions {
  /** Soft budget: packing stops adding paragraphs once a chunk reaches this. */
  targetTokens?: number;
  /** Hard ceiling: no emitted chunk exceeds this; an oversized paragraph is split to fit. */
  hardTokens?: number;
}

/** Split an oversized block into pieces each at or under `hardChars`, preferring sentence boundaries. */
function splitOversized(block: string, hardChars: number): string[] {
  const out: string[] = [];
  // Sentence-ish boundaries first (., !, ? followed by whitespace), falling back to raw slicing.
  const sentences = block.split(/(?<=[.!?])\s+/);
  let buf = '';
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = ''; };
  for (const s of sentences) {
    if (s.length > hardChars) {
      // A single sentence longer than the ceiling: hard-slice it.
      flush();
      for (let i = 0; i < s.length; i += hardChars) out.push(s.slice(i, i + hardChars));
      continue;
    }
    if ((buf + ' ' + s).trim().length > hardChars) flush();
    buf = buf ? `${buf} ${s}` : s;
  }
  flush();
  return out;
}

export function chunkText(raw: string, opts: ChunkOptions = {}): SourceChunk[] {
  const targetTokens = Math.max(1, opts.targetTokens ?? DEFAULT_TARGET_TOKENS);
  const hardTokens = Math.max(targetTokens, opts.hardTokens ?? DEFAULT_HARD_TOKENS);
  const hardChars = hardTokens * CHARS_PER_TOKEN;

  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  // Paragraphs are runs separated by one or more blank lines; a lone newline stays inside a paragraph.
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  // Any paragraph over the hard ceiling becomes several blocks; the rest pass through as single blocks.
  const blocks: string[] = [];
  for (const p of paragraphs) {
    if (estimateTokens(p) > hardTokens) blocks.push(...splitOversized(p, hardChars));
    else blocks.push(p);
  }

  const chunks: SourceChunk[] = [];
  let buf = '';
  const push = () => {
    const t = buf.trim();
    if (t) chunks.push({ index: chunks.length, text: t, tokenEstimate: estimateTokens(t) });
    buf = '';
  };
  for (const b of blocks) {
    const candidate = buf ? `${buf}\n\n${b}` : b;
    if (buf && estimateTokens(candidate) > targetTokens) {
      push();
      buf = b;
    } else {
      buf = candidate;
    }
  }
  push();
  return chunks;
}
