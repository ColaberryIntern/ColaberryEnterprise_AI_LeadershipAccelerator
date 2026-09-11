import { getProviderCapabilities, isStale, type ContentType, type ProviderKey } from '../publishing/providerCapabilities';
import type { Variant } from './composerVariants';

/**
 * composerValidation — does each variant fit its platform? Specific reasons, never a bare "no".
 *
 * Reads the capability registry (T020) and nothing else: the composer must not carry its own
 * idea of a character limit, because two limits for one platform is how content passes here
 * and dies at the network. Every problem is reported with the provider, the field, the limit
 * and the actual value, because "invalid" sends an operator hunting and "LinkedIn: 3,412 of
 * 3,000 characters" sends them to the right line.
 *
 * BLOCK vs WARN. A hard provider limit blocks - the network would reject it and there is no
 * arguing with that. A stale capability entry warns: the check ran, but against limits older
 * than we are willing to trust, and the operator should know the answer might be out of date.
 */

export interface VariantProblem {
  provider: ProviderKey;
  field: 'text' | 'hashtags' | 'contentType' | 'media' | 'links' | 'registry';
  severity: 'block' | 'warn';
  message: string;
}

export interface VariantValidation {
  provider: ProviderKey;
  ok: boolean;
  problems: VariantProblem[];
}

export interface SubmissionValidation {
  /** False if ANY variant has a blocking problem. Submission must not proceed. */
  ok: boolean;
  variants: VariantValidation[];
  /** Flat list of every blocking problem across all variants, for the submit button's reason. */
  blockers: VariantProblem[];
}

export interface VariantContext {
  contentType: ContentType;
  mediaCount: number;
  /** Absolute URLs referenced by the variant text. */
  links: readonly string[];
}

function countHashtags(text: string): number {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

export function validateVariant(variant: Variant, ctx: VariantContext, now: number = Date.now()): VariantValidation {
  const caps = getProviderCapabilities(variant.provider);
  const problems: VariantProblem[] = [];
  const name = caps.displayName;

  // ── Registry freshness: a warning, because the check DID run ──────────────────────────────
  if (isStale(caps, now)) {
    problems.push({
      provider: variant.provider, field: 'registry', severity: 'warn',
      message: `${name} limits were last verified on ${caps.asOf} and may be out of date.`,
    });
  }

  // ── Content type ──────────────────────────────────────────────────────────────────────────
  if (!caps.contentTypes.includes(ctx.contentType)) {
    problems.push({
      provider: variant.provider, field: 'contentType', severity: 'block',
      message: `${name} does not accept ${ctx.contentType} posts (supports: ${caps.contentTypes.join(', ')}).`,
    });
  }

  // ── Text length ───────────────────────────────────────────────────────────────────────────
  const len = variant.text.length;
  if (len > caps.text.maxChars) {
    problems.push({
      provider: variant.provider, field: 'text', severity: 'block',
      message: `${name}: ${len.toLocaleString()} of ${caps.text.maxChars.toLocaleString()} characters - ${(len - caps.text.maxChars).toLocaleString()} over.`,
    });
  }
  if (len === 0 && ctx.contentType === 'text') {
    problems.push({ provider: variant.provider, field: 'text', severity: 'block', message: `${name}: a text post cannot be empty.` });
  }

  // ── Hashtags ──────────────────────────────────────────────────────────────────────────────
  if (caps.text.maxHashtags !== null) {
    const n = countHashtags(variant.text);
    if (n > caps.text.maxHashtags) {
      problems.push({
        provider: variant.provider, field: 'hashtags', severity: 'block',
        message: `${name}: ${n} hashtags, limit ${caps.text.maxHashtags}.`,
      });
    }
  }

  // ── Media count ───────────────────────────────────────────────────────────────────────────
  if (ctx.mediaCount > 0) {
    if (caps.image === null && caps.video === null) {
      problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name} does not accept media.` });
    } else if (caps.image && ctx.mediaCount > caps.image.maxPerPost) {
      problems.push({
        provider: variant.provider, field: 'media', severity: 'block',
        message: `${name}: ${ctx.mediaCount} media items, limit ${caps.image.maxPerPost} per post.`,
      });
    }
  } else if ((ctx.contentType === 'image' || ctx.contentType === 'video' || ctx.contentType === 'carousel')) {
    problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name}: a ${ctx.contentType} post needs at least one media item.` });
  }

  // ── Links where they cannot be clicked ────────────────────────────────────────────────────
  if (caps.linkBehavior === 'no_clickable_links' && ctx.links.length > 0 && /https?:\/\//.test(variant.text)) {
    problems.push({
      provider: variant.provider, field: 'links', severity: 'warn',
      message: `${name} does not make links in the caption clickable. Route the link through the bio or a first comment.`,
    });
  }

  return { provider: variant.provider, ok: problems.every((p) => p.severity !== 'block'), problems };
}

/**
 * Validate every variant. Submission is blocked if any ONE variant blocks, because a post that
 * publishes to four networks and fails on the fifth is partially published - one of the
 * exceptional states the lifecycle has to handle, and one the composer should refuse to
 * create on purpose.
 */
export function validateSubmission(
  variants: readonly Variant[],
  ctxFor: (provider: ProviderKey) => VariantContext,
  now: number = Date.now(),
): SubmissionValidation {
  const results = variants.map((v) => validateVariant(v, ctxFor(v.provider), now));
  const blockers = results.flatMap((r) => r.problems.filter((p) => p.severity === 'block'));
  return { ok: blockers.length === 0, variants: results, blockers };
}
