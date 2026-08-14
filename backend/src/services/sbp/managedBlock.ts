/**
 * A managed block inside a file the student owns.
 *
 * The pipeline writes CLAUDE.md into every student repo. Students already have
 * a CLAUDE.md with their own conventions in it, and the writer replaced the
 * whole file — so a republish silently deleted work they had written. It also
 * compared against our own manifest rather than the file's real contents, so
 * an edit made by hand was not even noticed before being overwritten.
 *
 * Their file is theirs. We own a delimited block inside it and nothing else:
 * replace the block if it is there, append it if it is not, leave every other
 * line exactly as found.
 *
 * Pure string handling, no I/O, so the splice rules are testable without a
 * repo.
 */

export const BLOCK_BEGIN = '<!-- COLABERRY:BEGIN — managed by the build pipeline. Edits inside this block are overwritten. -->';
export const BLOCK_END = '<!-- COLABERRY:END -->';

/** Matches a previously written block, however its inner text has changed. */
const BLOCK_RE = /<!-- COLABERRY:BEGIN[\s\S]*?<!-- COLABERRY:END -->/;

/**
 * Put `block` into `existing`, returning the whole file.
 *
 * - no existing file → the block alone
 * - existing file with our markers → the block replaces what is between them
 * - existing file without our markers → the block is appended, their content
 *   untouched above it
 */
export function spliceManagedBlock(existing: string | null | undefined, block: string): string {
  const wrapped = `${BLOCK_BEGIN}\n${block.trim()}\n${BLOCK_END}`;
  const prior = (existing ?? '').replace(/\s+$/, '');

  if (!prior) return `${wrapped}\n`;
  if (BLOCK_RE.test(prior)) return `${prior.replace(BLOCK_RE, wrapped)}\n`;
  return `${prior}\n\n${wrapped}\n`;
}

/** True when this file already carries a managed block. */
export function hasManagedBlock(content: string | null | undefined): boolean {
  return BLOCK_RE.test(content ?? '');
}

/**
 * What the student wrote, with our block removed — used to prove a splice did
 * not disturb it.
 */
export function withoutManagedBlock(content: string | null | undefined): string {
  return (content ?? '').replace(BLOCK_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}
