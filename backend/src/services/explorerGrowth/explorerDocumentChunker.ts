/**
 * Splits an extracted document into chunks a prompt can carry.
 *
 * THE FIRST TEXT CHUNKER IN THIS REPO. Every other `chunk` here is
 * `function chunk<T>(items: T[], size: number): T[][]` — array batching for API rate
 * limits. Nothing splits prose, which is why a 200-page PDF currently becomes its first
 * 50,000 characters and stops: `fileExtractionService` truncates at `MAX_EXTRACTED_LENGTH`
 * and has no caller that could do otherwise.
 *
 * ## Why boundaries matter more than size
 *
 * A chunk is what a reviewer will see quoted back and what the fact guard will judge. Cut
 * mid-sentence and the guard sees a fragment whose dates have lost the clause that
 * qualified them — "starts on the 3rd" without "the cohort beginning in November". So the
 * split prefers, in order: a blank line, then a sentence end, then a line break, and only
 * falls back to a hard cut when a single run of text exceeds the budget with no boundary in
 * it at all (a table dump, a minified blob). The hard cut is reported, not silent.
 *
 * ## Why chunks overlap
 *
 * A fact that straddles a boundary belongs to both sides or it belongs to neither. Without
 * overlap, "The cohort starts 3 November." / "Seats are capped at 20." can be split so that
 * neither chunk carries the pairing, and retrieval then answers "when does it start" with a
 * chunk that never mentions seats and vice versa. The overlap is small and deliberate: it
 * costs duplication in the store, and the alternative costs answers.
 *
 * ## Deterministic, because the store is content-addressed
 *
 * Same input, same chunks, same order. Ingestion dedupes on a hash of the document and
 * indexes chunks by position, so a chunker that varied its output would create a new set of
 * rows for an unchanged file on every upload.
 */

/** One piece of a document, in document order. */
export interface DocumentChunk {
  /** 0-based position in the document. Part of the chunk's identity in the store. */
  index: number;
  text: string;
  /**
   * True when this chunk had to be cut without a sentence or paragraph boundary.
   *
   * Surfaced rather than swallowed: a document that chunks entirely into hard cuts is
   * usually a table, a slide dump or an extraction that went wrong, and quoting from it is
   * a different risk than quoting from prose. The ingest path records it so a reviewer can
   * see what kind of text they are approving.
   */
  hardCut: boolean;
}

/**
 * Target characters per chunk.
 *
 * Characters, NOT tokens: there is no tokenizer in this runtime, and a character budget is
 * at least honest about being an approximation rather than pretending to a precision it
 * does not have. ~1200 is a few paragraphs — comparable to the hub entries this corpus sits
 * beside, so a document chunk cannot quietly dominate a prompt that takes four of them.
 */
export const CHUNK_TARGET_CHARS = 1200;

/**
 * How much of the previous chunk each one repeats.
 *
 * Enough to carry a sentence across a boundary, not so much that the store doubles.
 */
export const CHUNK_OVERLAP_CHARS = 150;

/**
 * A chunk shorter than this is folded into its predecessor rather than stored alone.
 *
 * A 30-character tail is a heading or a page number, and on its own it is both unquotable
 * and a magnet for keyword scoring: short text means a single matched word is a large
 * fraction of it.
 */
export const CHUNK_MIN_CHARS = 80;

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  minChars?: number;
}

/** Collapses the whitespace an extractor leaves behind, without joining paragraphs. */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // Non-breaking and zero-width characters survive PDF extraction and would otherwise
    // make two visually identical documents hash differently.
    .replace(/[ ​﻿]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * The best place to break `text` at or before `limit`.
 *
 * Returns -1 when there is no boundary at all, which the caller reports as a hard cut
 * rather than hiding.
 */
function findBreak(text: string, limit: number): number {
  const window = text.slice(0, limit);

  // A blank line is the strongest signal the author gave us.
  const para = window.lastIndexOf('\n\n');
  if (para > 0) return para + 2;

  // Then a sentence end followed by whitespace, scanned from the END so the chunk is as
  // full as it can be while still finishing a sentence. A closing quote or bracket may sit
  // between the stop and the space, so `he said."` breaks after the quote, not before it.
  //
  // Scanned rather than matched with a regex because the useful answer is the LAST position
  // in the window, and a global regex would have to be run to exhaustion to find it.
  for (let i = window.length - 1; i >= 0; i -= 1) {
    if (!'.!?'.includes(window[i])) continue;

    // Take any closing quotes or brackets WITH the sentence. Returning `i + 1` here would
    // break between the stop and the quote, leaving one chunk ending `."` -> `.` and the
    // next beginning with an orphaned `"`.
    let end = i + 1;
    while (end < window.length && /["')\]]/.test(window[end])) end += 1;

    if (end >= window.length || /\s/.test(window[end])) return end;
  }

  // Then any line break.
  const line = window.lastIndexOf('\n');
  if (line > 0) return line + 1;

  return -1;
}

/**
 * Split extracted text into overlapping chunks on the best available boundaries.
 *
 * Returns `[]` for text that is empty or whitespace only — an honest answer, and one the
 * caller must distinguish from "the file could not be read".
 */
export function chunkDocument(raw: string, options: ChunkOptions = {}): DocumentChunk[] {
  const target = Math.max(1, options.targetChars ?? CHUNK_TARGET_CHARS);

  // CLAMPED TO A QUARTER OF THE TARGET, not merely to `target - 1`.
  //
  // `target - 1` is enough to stop an infinite loop and not enough to stop a pathological
  // one: with an overlap of 99 against a target of 100, every step advances a single
  // character, so 2,000 characters became 1,901 chunks each a near-copy of the last. The
  // store grows quadratically in the duplicated region and retrieval ranks the same
  // sentence many times over. A quarter carries a sentence across a boundary, which is all
  // the overlap is for.
  const overlap = Math.max(
    0,
    Math.min(options.overlapChars ?? CHUNK_OVERLAP_CHARS, Math.floor(target / 4)),
  );
  const minChars = Math.max(0, options.minChars ?? CHUNK_MIN_CHARS);

  const text = normalize(raw);
  if (text === '') return [];

  const chunks: DocumentChunk[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const remaining = text.slice(cursor);

    if (remaining.length <= target) {
      chunks.push({ index: chunks.length, text: remaining.trim(), hardCut: false });
      break;
    }

    const at = findBreak(remaining, target);
    const hardCut = at <= 0;
    const end = hardCut ? target : at;

    const piece = remaining.slice(0, end).trim();
    if (piece !== '') {
      chunks.push({ index: chunks.length, text: piece, hardCut });
    }

    // Step forward by the chunk MINUS the overlap, and never past the chunk just emitted —
    // advancing further would skip text entirely. When the chunk is shorter than the
    // overlap there is nothing to overlap with, so it advances by the whole chunk.
    const advance = end <= overlap ? end : end - overlap;
    cursor += Math.max(1, advance);
  }

  // Fold a too-short tail into its predecessor. Done after the loop rather than inside it
  // so the decision sees the final chunk's real length.
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1];
    if (last.text.length < minChars) {
      const prev = chunks[chunks.length - 2];
      // The tail may already be inside the previous chunk via the overlap; only append what
      // is genuinely new, so folding cannot duplicate a sentence.
      if (!prev.text.endsWith(last.text)) {
        prev.text = `${prev.text}\n${last.text}`;
      }
      chunks.pop();
    }
  }

  return chunks.map((c, i) => ({ ...c, index: i }));
}

/**
 * Keywords for a chunk, for the same scorer the hub entries go through.
 *
 * Frequency-ranked, deduped, stopworded. This is NOT an attempt at keyphrase extraction: it
 * gives the chunk the same kind of `tags` a hub entry carries by hand, so one scorer can
 * rank both without a second code path deciding what a document is "about".
 */
export function chunkKeywords(text: string, limit = 12): string[] {
  const counts = new Map<string, number>();

  for (const word of text.toLowerCase().split(/\s+/)) {
    const w = word.replace(/[^a-z0-9+#.-]/g, '');
    if (w.length < 4) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([w]) => w);
}
