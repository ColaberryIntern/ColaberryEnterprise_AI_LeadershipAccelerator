import {
  getProviderCapabilities,
  type ProviderCapabilities,
  type ProviderKey,
} from '../publishing/providerCapabilities';

/**
 * composerVariants — per-platform variants of one canonical message, with the operator's
 * edits treated as the one thing generation may never touch.
 *
 * THE RULE (spec 8.1 step 5): never silently overwrite Sohail's copy. A variant the operator
 * has edited is THEIRS. Regenerating - because the canonical changed, because they asked for a
 * fresh take, because a template was swapped - replaces only variants that are still machine
 * output. Edited ones are kept byte-for-byte and, if the canonical they were derived from has
 * since changed, marked STALE so the operator knows to look, rather than either overwritten
 * (their work gone) or left silently current (their work now describes a message that no
 * longer exists).
 *
 * WHY PROVENANCE IS ON THE VARIANT. "Was this edited?" cannot be inferred from the text -
 * an operator might edit a variant back to exactly what generation produced. So each variant
 * carries `source` (generated | edited) and the fingerprint of the canonical it came from, and
 * the composer sets `source: 'edited'` the moment a human touches the text.
 *
 * GENERATION IS DETERMINISTIC HERE. Deriving a variant means fitting the canonical to the
 * provider's limits - truncating at a word boundary, dropping links where the provider makes
 * them unclickable. An AI-assisted draft (spec 8.1 step 3) is a different input to the same
 * pipeline, and when it lands its provenance goes on the content item (ai_model,
 * ai_prompt_version), not here.
 */

export interface Variant {
  provider: ProviderKey;
  text: string;
  /** Whether a human has touched this text since it was generated. */
  source: 'generated' | 'edited';
  /** Fingerprint of the canonical message this variant was derived from or edited against. */
  canonicalFingerprint: string;
  /** True when `source` is edited and the canonical has changed since - the operator's copy
   * describes a message that no longer exists. Never set on generated variants; those are
   * simply regenerated. */
  stale: boolean;
}

/** Cheap, stable, collision-irrelevant: this only has to detect "did it change". */
export function fingerprint(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

const URL_RE = /https?:\/\/[^\s)]+/g;

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const ellipsis = '…';
  const cut = text.slice(0, max - ellipsis.length);
  const lastSpace = cut.lastIndexOf(' ');
  // Only back up to the word boundary if it leaves most of the budget in use; otherwise a
  // single very long word would truncate to almost nothing.
  const at = lastSpace > (max - ellipsis.length) * 0.6 ? lastSpace : cut.length;
  return `${cut.slice(0, at).trimEnd()}${ellipsis}`;
}

/**
 * Fit the canonical to one provider. Pure and deterministic.
 */
export function deriveVariantText(canonical: string, caps: ProviderCapabilities): string {
  let text = canonical.trim();

  // Where the platform makes links unclickable (Instagram captions, TikTok), leaving the URL
  // in the text is noise that costs characters and gets nobody anywhere. Dropped, and the
  // composer routes the link through the bio/first-comment path instead.
  if (caps.linkBehavior === 'no_clickable_links') {
    text = text.replace(URL_RE, '').replace(/\s{2,}/g, ' ').trim();
  }

  return truncateAtWord(text, caps.text.maxChars);
}

/**
 * Generate or regenerate variants for a set of providers.
 *
 * Existing variants are consulted, and this is the whole point:
 *   - an EDITED variant is returned unchanged, with `stale` set if the canonical moved
 *   - a GENERATED variant is replaced
 *   - a provider with no existing variant gets a fresh one
 *
 * Returns a NEW array; the input is never mutated, so a caller holding the previous state can
 * diff it or offer undo.
 */
export function generateVariants(
  canonical: string,
  providers: readonly ProviderKey[],
  existing: readonly Variant[] = [],
): Variant[] {
  const fp = fingerprint(canonical);
  const byProvider = new Map(existing.map((v) => [v.provider, v]));

  return providers.map((provider) => {
    const prior = byProvider.get(provider);
    if (prior && prior.source === 'edited') {
      // The operator's copy. Kept byte-for-byte; flagged if it now describes an older message.
      return { ...prior, stale: prior.canonicalFingerprint !== fp };
    }
    return {
      provider,
      text: deriveVariantText(canonical, getProviderCapabilities(provider)),
      source: 'generated',
      canonicalFingerprint: fp,
      stale: false,
    };
  });
}

/**
 * The operator edited a variant. Records the edit and pins it to the CURRENT canonical, so it
 * is not immediately stale, and so a later regeneration knows to leave it alone.
 */
export function applyEdit(variant: Variant, text: string, canonical: string): Variant {
  return { ...variant, text, source: 'edited', canonicalFingerprint: fingerprint(canonical), stale: false };
}

/**
 * The operator explicitly discards their edit and wants the machine version back. This is the
 * ONLY path that replaces edited text, and it is the operator's own action, never a side effect
 * of regeneration.
 */
export function revertToGenerated(variant: Variant, canonical: string): Variant {
  return {
    provider: variant.provider,
    text: deriveVariantText(canonical, getProviderCapabilities(variant.provider)),
    source: 'generated',
    canonicalFingerprint: fingerprint(canonical),
    stale: false,
  };
}
