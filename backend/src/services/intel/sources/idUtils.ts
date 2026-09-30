/**
 * idUtils — tiny, pure helpers for deriving STABLE guids in intel source adapters.
 *
 * Not a source adapter (no self-registration). Extracted per the CLAUDE.md
 * rule-of-three: `toSlug` is used by the tool, technique, and MCP adapters to turn
 * a human name/title into a stable, namespaced guid, and `shortHash` gives the
 * quote adapter a stable key from the quote text. Keeping the derivation in one
 * place means every adapter produces the same guid for the same seed, which is
 * exactly what the engine's (pipeline, guid) dedup and rotation depend on.
 *
 * Pure — no I/O, no DB, no clock — so it is trivially unit-testable and the guids
 * are deterministic across runs and machines.
 */
import { createHash } from 'crypto';

/**
 * Lowercase, ASCII-fold, and hyphenate a human string into a URL/guid-safe slug.
 * Deterministic and idempotent: the same input always yields the same slug, so a
 * seed's guid never drifts between runs. Falls back to 'item' for an all-symbol
 * input so a guid is never empty.
 */
export function toSlug(input: string): string {
  const slug = (input || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

/**
 * Stable short hex digest of a string (first 12 hex chars of SHA-1). Used to key a
 * curated entry by its content (e.g. a quote) so reordering the source array never
 * shifts guids — only editing the text itself does.
 */
export function shortHash(input: string): string {
  return createHash('sha1').update(input || '').digest('hex').slice(0, 12);
}
