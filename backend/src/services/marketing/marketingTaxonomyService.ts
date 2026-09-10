/**
 * Canonical campaign taxonomy and UTM generation.
 *
 * Pure. No I/O, no database, no clock of its own — every function takes what it needs. That
 * is deliberate: this module decides what a campaign is CALLED for the rest of time, and a
 * function whose output depends on ambient state cannot be reasoned about or replayed.
 *
 * ── Why generated, not typed by hand ──────────────────────────────────────────────────
 *
 * The spec's rule is that campaign tracking must be generated rather than improvised, and the
 * reason is visible in this codebase already: `campaigns.tracking_link` is a single free-text
 * VARCHAR, and `marketingAnalyticsService` selects `NULL AS platform, NULL AS creative`
 * because nothing ever populated a structured equivalent. Hand-typed tracking degrades into
 * unqueryable strings, one typo at a time.
 *
 * ── The one rule that matters most: a published slug is FROZEN ────────────────────────
 *
 * `utm_campaign` is the join key between a click that happened months ago and the campaign it
 * belonged to. Editing it does not rename a campaign — it silently reassigns history, because
 * the clicks already recorded still carry the old value and now match nothing. That is why
 * the slug is derived from stable inputs rather than the display name, which anybody can edit
 * at any time, and why `assertSlugChangeAllowed` refuses the edit outright once published.
 */

/** Providers we generate `utm_source` for. Lowercase, no aliases — one spelling each. */
export type UtmSource =
  | 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok'
  | 'x' | 'google' | 'email' | 'direct' | 'referral';

export const UTM_SOURCES: readonly UtmSource[] = [
  'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok',
  'x', 'google', 'email', 'direct', 'referral',
];

/** Normalized mediums. Deliberately few: an open vocabulary is what makes reporting useless. */
export type UtmMedium =
  | 'paid_social' | 'organic_social' | 'cpc' | 'email' | 'referral' | 'qr' | 'direct';

export const UTM_MEDIUMS: readonly UtmMedium[] = [
  'paid_social', 'organic_social', 'cpc', 'email', 'referral', 'qr', 'direct',
];

/** Matches `campaigns.utm_campaign_slug VARCHAR(200)` — see ensureMarketingCampaignSchema. */
export const MAX_SLUG_LENGTH = 200;
/** Each segment is capped so one long input cannot consume the whole budget. */
export const MAX_SEGMENT_LENGTH = 40;

export interface CampaignSlugParts {
  brand: string;
  objective: string;
  offer: string;
  audience: string;
  /** Any date inside the target quarter. Passed in, never read from the clock. */
  date: Date;
}

export class TaxonomyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'TaxonomyError';
    this.code = code;
  }
}

/**
 * Letters that NFKD does not decompose, and their transliterations.
 *
 * Module-scope so the array is built once rather than per call, and so the set is reviewable
 * in one place. Uppercase forms are listed explicitly rather than relying on a later
 * toLowerCase, so the mapping is total regardless of call order.
 */
const NO_DECOMPOSITION: Array<[RegExp, string]> = [
  [/\u00C6/g, 'AE'], [/\u00E6/g, 'ae'],   // AE ligature
  [/\u0152/g, 'OE'], [/\u0153/g, 'oe'],   // OE ligature
  [/\u00D8/g, 'O'],  [/\u00F8/g, 'o'],    // O with stroke
  [/\u00DE/g, 'TH'], [/\u00FE/g, 'th'],   // thorn
  [/\u00D0/g, 'D'],  [/\u00F0/g, 'd'],    // eth
  [/\u0110/g, 'D'],  [/\u0111/g, 'd'],    // D with stroke
  [/\u0141/g, 'L'],  [/\u0142/g, 'l'],    // L with stroke
  [/\u1E9E/g, 'SS'], [/\u00DF/g, 'ss'],   // eszett, capital and small
];

/**
 * Normalizes one segment to `[a-z0-9-]`.
 *
 * Diacritics are folded rather than stripped, so "Führung" becomes `fuhrung` instead of
 * `fhrung` — a slug that silently drops letters is worse than one that transliterates them,
 * because it reads as a typo forever.
 */
export function slugifySegment(input: string): string {
  let folded = input
    .normalize('NFKD')
    // U+0300 to U+036F is the Combining Diacritical Marks block that NFKD splits out.
    // escapes, not literal marks: literal combining characters are invisible in a diff and
    // do not survive every encoding round-trip intact.
    .replace(/[\u0300-\u036f]/g, '');

  // Letters with NO NFKD decomposition must be transliterated explicitly, or they are lost.
  //
  // An earlier version special-cased eszett alone and dropped the rest of its family, so
  // "AEther" (with the AE ligature) became "ther" - silently losing a letter, which is
  // precisely what the docstring above promises does not happen. NFKD decomposes
  // a-with-diaeresis into a + combining mark; it does NOT decompose the AE/O-slash/thorn/
  // eth/d-stroke/l-stroke family, because those are distinct letters rather than decorated
  // ones. Caught in review.
  for (const [pattern, replacementText] of NO_DECOMPOSITION) {
    folded = folded.replace(pattern, replacementText);
  }

  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.slice(0, MAX_SEGMENT_LENGTH).replace(/-+$/g, '');
}

/** `2026-08-14` -> `2026q3`. */
export function quarterCode(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new TaxonomyError('INVALID_DATE', 'A valid date is required to derive the quarter code.');
  }
  // UTC throughout: a campaign must not land in a different quarter depending on who looks.
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}q${quarter}`;
}

/**
 * Builds the canonical slug: `{brand}-{objective}-{offer}-{audience}-{yyyyq#}`.
 *
 * Throws rather than silently producing a degraded slug. A campaign whose slug came out as
 * `--2026q3` because three inputs were punctuation would be indistinguishable from another
 * one that did the same, and both would be permanent.
 */
export function buildCampaignSlug(parts: CampaignSlugParts): string {
  const segments: Array<[string, string]> = [
    ['brand', parts.brand],
    ['objective', parts.objective],
    ['offer', parts.offer],
    ['audience', parts.audience],
  ];

  const slugged: string[] = [];
  for (const [name, raw] of segments) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      throw new TaxonomyError('EMPTY_SEGMENT', `Campaign slug segment "${name}" is required.`);
    }
    const s = slugifySegment(raw);
    if (s === '') {
      throw new TaxonomyError(
        'UNSLUGGABLE_SEGMENT',
        `Campaign slug segment "${name}" contains no usable characters: ${JSON.stringify(raw)}`,
      );
    }
    slugged.push(s);
  }

  const slug = [...slugged, quarterCode(parts.date)].join('-');

  // Defensive, and CURRENTLY UNREACHABLE — deliberately kept, and deliberately labelled.
  //
  // The segment cap already bounds the result: 4 segments x MAX_SEGMENT_LENGTH (40) = 160,
  // plus 3 joining hyphens, plus the quarter suffix. A 4-digit year gives '-yyyyqN' = 7, so
  // 170 - but JS Date reaches year 275760, making the true worst case '-275760q4' = 9, i.e.
  // 172. Either way it is under MAX_SLUG_LENGTH of 200, so no input reaches this branch
  // today. The 6-digit case was pointed out in review; the conclusion is unchanged but the
  // arithmetic now states the real bound rather than the convenient one.
  //
  // It stays because the bound is a consequence of two constants that live apart and could
  // drift — raise MAX_SEGMENT_LENGTH to 50 and the worst case becomes 210. `MAX_SLUG_LENGTH
  // is enforceable given MAX_SEGMENT_LENGTH` is asserted in the test suite, so if that ever
  // stops holding, a test says so rather than a truncated slug silently colliding two
  // campaigns in production.
  //
  // Truncating instead of throwing would be the harmful choice: two campaigns differing only
  // past the cut would share a slug, and one campaign's clicks would be attributed to the
  // other, permanently.
  /* istanbul ignore next -- unreachable while 4*MAX_SEGMENT_LENGTH + 7 <= MAX_SLUG_LENGTH */
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new TaxonomyError(
      'SLUG_TOO_LONG',
      `Generated slug is ${slug.length} characters, over the ${MAX_SLUG_LENGTH} limit. Shorten a segment rather than truncating, which would collide.`,
    );
  }
  return slug;
}

/**
 * Resolves a collision by appending `-2`, `-3`, ... against a set of taken slugs.
 *
 * Returns the candidate unchanged when free. The suffix is deliberately visible rather than a
 * hash: an operator seeing `-2` understands there is another campaign by that name, whereas a
 * random suffix reads as noise and gets copied around.
 */
export function resolveSlugCollision(
  candidate: string,
  taken: Iterable<string>,
  maxAttempts = 50,
): string {
  const takenSet = new Set(taken);
  if (!takenSet.has(candidate)) return candidate;

  for (let n = 2; n <= maxAttempts; n += 1) {
    const suffixed = `${candidate}-${n}`;
    if (suffixed.length > MAX_SLUG_LENGTH) {
      throw new TaxonomyError(
        'SLUG_TOO_LONG',
        `Collision suffix would exceed the ${MAX_SLUG_LENGTH} character limit.`,
      );
    }
    if (!takenSet.has(suffixed)) return suffixed;
  }
  throw new TaxonomyError(
    'COLLISION_UNRESOLVED',
    `Could not find a free slug after ${maxAttempts} attempts on "${candidate}".`,
  );
}

export interface UtmInput {
  source: UtmSource;
  medium: UtmMedium;
  /** The campaign's stable slug. NEVER its display name. */
  campaignSlug: string;
  /** Stable creative/variant code -> utm_content. */
  variantCode?: string | null;
  /** Paid keyword or audience dimension -> utm_term. */
  term?: string | null;
}

export interface UtmParams {
  utm_source: UtmSource;
  utm_medium: UtmMedium;
  utm_campaign: string;
  utm_content?: string;
  utm_term?: string;
}

/**
 * Builds the canonical UTM set.
 *
 * Rejects an unknown source or medium instead of passing it through. An open vocabulary is
 * precisely how reporting rots: `facebook`, `Facebook` and `fb` become three channels, and
 * nobody notices until a quarterly number is wrong.
 */
export function buildUtmParams(input: UtmInput): UtmParams {
  if (!UTM_SOURCES.includes(input.source)) {
    throw new TaxonomyError('UNKNOWN_SOURCE', `Unknown utm_source "${input.source}".`);
  }
  if (!UTM_MEDIUMS.includes(input.medium)) {
    throw new TaxonomyError('UNKNOWN_MEDIUM', `Unknown utm_medium "${input.medium}".`);
  }
  if (!input.campaignSlug || input.campaignSlug.trim() === '') {
    throw new TaxonomyError('MISSING_CAMPAIGN_SLUG', 'utm_campaign requires a campaign slug.');
  }
  // Spec section 7's strongest rule is that utm_campaign is a stable slug and NEVER a display
  // name that can be freely edited. Until this guard existed, the module rejected an
  // off-vocabulary SOURCE at runtime while trusting the caller on the one field the whole
  // design exists to protect - so 'My Campaign Name!' passed straight through into a
  // permanent tracking parameter, and every click recorded under it would carry a value that
  // changes the next time somebody renames the campaign.
  //
  // The shape asserted here is exactly what buildCampaignSlug emits, so the generator and the
  // validator cannot disagree.
  if (!/^[a-z0-9-]+$/.test(input.campaignSlug)) {
    throw new TaxonomyError(
      'MALFORMED_CAMPAIGN_SLUG',
      'utm_campaign must be a canonical slug of [a-z0-9-], not a display name. Got '
      + JSON.stringify(input.campaignSlug)
      + '. Generate it with buildCampaignSlug.',
    );
  }

  const params: UtmParams = {
    utm_source: input.source,
    utm_medium: input.medium,
    utm_campaign: input.campaignSlug,
  };
  const content = input.variantCode ? slugifySegment(input.variantCode) : '';
  if (content) params.utm_content = content;
  const term = input.term ? slugifySegment(input.term) : '';
  if (term) params.utm_term = term;
  return params;
}

/** Paid mediums, for the organic/paid split reporting depends on. */
const PAID_MEDIUMS = new Set<UtmMedium>(['paid_social', 'cpc']);

export function isPaidMedium(medium: UtmMedium): boolean {
  return PAID_MEDIUMS.has(medium);
}

/**
 * May this campaign's slug be changed?
 *
 * Once published, no. The slug is the join key between historical clicks and the campaign
 * they belonged to; editing it does not rename anything, it orphans every click already
 * recorded under the old value and silently reassigns the campaign's history to nothing.
 *
 * Returns a result rather than throwing, because a caller usually wants to explain this to an
 * operator rather than fail a request.
 */
export function assertSlugChangeAllowed(args: {
  currentSlug: string | null;
  proposedSlug: string;
  publishedAt: Date | null;
}): { allowed: boolean; reason?: string } {
  if (!args.currentSlug) return { allowed: true };
  if (args.currentSlug === args.proposedSlug) return { allowed: true };
  if (!args.publishedAt) return { allowed: true };
  return {
    allowed: false,
    reason:
      'This campaign has published tracked links, so its tracking slug is frozen. Changing it '
      + 'would orphan every click already recorded against the old slug. Create a new campaign '
      + 'version instead.',
  };
}
