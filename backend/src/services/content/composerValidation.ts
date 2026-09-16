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

/** What is known about one attachment without opening it: what the upload step recorded. */
export interface MediaFacts {
  mimeType: string;
  byteSize: number | null;
  /** Display size, rotation applied. */
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** h264, h265, av1, vp9 ... for video; null for images. */
  codecFamily: string | null;
}

export interface VariantContext {
  contentType: ContentType;
  mediaCount: number;
  /** One entry per attachment, in order. `mediaCount` must equal its length when present. */
  media?: readonly MediaFacts[];
  /** Absolute URLs referenced by the variant text. */
  links: readonly string[];
}

/**
 * Aspect ratios in providerCapabilities are written as "9:16", "1.91:1". A clip is accepted
 * when it is within 2% of any of them, because encoders round (1080x1920 is 9:16 exactly,
 * 1080x1350 is 4:5, but 1080x1349 also exists and no one meant it).
 */
export function matchesAspect(width: number, height: number, allowed: readonly string[]): boolean {
  const ratio = width / height;
  return allowed.some((spec) => {
    const [w, h] = spec.split(':').map(Number);
    if (!w || !h) return false;
    return Math.abs(ratio - w / h) / (w / h) <= 0.02;
  });
}

function mb(bytes: number): string { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function secs(ms: number): string { return ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${Math.round(ms / 1000)}s`; }

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

  // ── Each attachment against the network's rules ───────────────────────────────────────────
  // Only what the upload recorded; nothing is opened here. A null fact is skipped, not failed:
  // an older row with no duration is a gap in evidence, not a rule broken.
  for (const m of ctx.media ?? []) {
    const isVideo = m.mimeType.startsWith('video/');
    const rule = isVideo ? caps.video : caps.image;
    if (!rule) {
      problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name} does not accept ${isVideo ? 'video' : 'images'}.` });
      continue;
    }
    if (m.byteSize !== null && m.byteSize > rule.maxSizeMb * 1024 * 1024) {
      problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name}: ${isVideo ? 'video' : 'image'} is ${mb(m.byteSize)}, limit ${rule.maxSizeMb} MB.` });
    }
    if (isVideo && caps.video) {
      if (m.durationMs !== null && m.durationMs > caps.video.maxDurationSec * 1000) {
        problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name}: video is ${secs(m.durationMs)}, limit ${secs(caps.video.maxDurationSec * 1000)}.` });
      }
      if (m.codecFamily !== null && !caps.video.codecs.includes(m.codecFamily)) {
        problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name}: video is ${m.codecFamily.toUpperCase()}; accepted: ${caps.video.codecs.map((c) => c.toUpperCase()).join(', ')}. Re-export as H.264 MP4.` });
      }
      if (m.width && m.height && !matchesAspect(m.width, m.height, caps.video.aspectRatios)) {
        // A warning: networks letterbox or crop rather than refuse, but the operator should
        // know the clip will not show the way it was cut.
        problems.push({ provider: variant.provider, field: 'media', severity: 'warn', message: `${name}: video is ${m.width}x${m.height}; expected ${caps.video.aspectRatios.join(' or ')}. It may be cropped or letterboxed.` });
      }
    } else if (!isVideo && caps.image) {
      if (m.width !== null && m.width < caps.image.minWidthPx) {
        problems.push({ provider: variant.provider, field: 'media', severity: 'block', message: `${name}: image is ${m.width}px wide, minimum ${caps.image.minWidthPx}px.` });
      }
    }
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
