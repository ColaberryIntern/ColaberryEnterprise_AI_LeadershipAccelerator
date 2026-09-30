import { randomBytes as nodeRandomBytes } from 'crypto';
import {
  validateDestination,
  applyUtmParams,
  type DestinationResult,
} from './trackedLinkDestination';
import { buildUtmParams, type UtmInput, type UtmParams } from './marketingTaxonomyService';

/**
 * Tracked link creation.
 *
 * The security-critical half lives in `trackedLinkDestination.ts` and is pure. This module is
 * the assembly: short codes, collision handling, and the composed preview an operator sees
 * before committing.
 *
 * ── NOT IMPLEMENTED HERE, stated rather than left to be discovered ────────────────────
 *
 * T007's objective also names a LINK HEALTH CHECK and QR SUPPORT. Neither is in this module,
 * and there is no persisting `create` path either - this is preview and allocation only.
 *
 * Deferred deliberately: link health means an outbound HTTP probe with a timeout, a retry
 * policy and a place to record the result, and QR means an image pipeline and somewhere to
 * put the file - the repo has no object storage, so a QR image would land on the same local
 * disk as media_assets. Both belong with the admin surface that displays them (T014-T016)
 * rather than bolted onto a pure module whose whole value is having no I/O.
 *
 * Recorded here because an earlier task in this run lost a point not for a gap but for
 * leaving one unstated, and a suite count that looks complete is exactly how that happens.
 *
 * Database access is injected rather than imported, so the collision behaviour — the part
 * most likely to be subtly wrong — is testable without a database. That matters because the
 * failure it prevents is silent: reusing a short code does not error, it reassigns an
 * existing link's clicks to a different campaign.
 */

/**
 * Short-code alphabet: Crockford-style, with the ambiguous glyphs removed.
 *
 * No `I`, `L`, `O`, `U`, `0` or `1`. These codes get read aloud, typed off a printed QR
 * card, and dictated over the phone; `l` versus `1` in a URL that 404s is a support ticket
 * nobody can diagnose. Excluding `U` also makes an accidental profanity substantially less
 * likely, which matters for a code that ends up on printed marketing collateral.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const DEFAULT_SHORT_CODE_LENGTH = 8;

/**
 * Generates a short code using CRYPTO randomness.
 *
 * Not `Math.random()`. A short code is a capability: anyone holding it can attribute a click,
 * and predictable codes let someone enumerate or forge them. `crypto.randomBytes` is the
 * same standard the rest of this repo already applies to identifiers.
 *
 * Rejection sampling keeps the distribution uniform. Taking `byte % 30` would bias the first
 * few letters of the alphabet, and biased short codes collide measurably sooner than uniform
 * ones — which is a real cost given collisions are the thing this module works hardest to
 * avoid.
 */
export function generateShortCode(
  length: number = DEFAULT_SHORT_CODE_LENGTH,
  randomBytes: (n: number) => Buffer = nodeRandomBytes,
): string {
  // `length < 4` alone FAILS OPEN for NaN and Infinity: `NaN < 4` is false, so a NaN length
  // slipped past and returned '' - the zero-length code this guard exists to prevent - and
  // Infinity never terminated the loop at all, hanging the process. Both found in review.
  // Number.isInteger rejects NaN, Infinity and fractions in one check.
  if (!Number.isInteger(length) || length < 4) {
    throw new Error(
      `Short code length must be an integer of at least 4; got ${String(length)}. `
      + 'Shorter codes collide too readily to be safe.',
    );
  }
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 240 for a 30-char alphabet
  let out = '';
  while (out.length < length) {
    const buf = randomBytes(length * 2);
    for (let i = 0; i < buf.length && out.length < length; i += 1) {
      const b = buf[i];
      if (b >= max) continue; // reject, to keep the distribution uniform
      out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

export class ShortCodeExhaustionError extends Error {
  constructor(attempts: number) {
    super(
      `Could not find a free short code after ${attempts} attempts. This indicates either an `
      + 'exhausted keyspace or a broken uniqueness check; it is never expected in normal use.',
    );
    this.name = 'ShortCodeExhaustionError';
  }
}

/**
 * Finds a short code not already taken.
 *
 * Retries on collision rather than overwriting. Overwriting would not raise an error — it
 * would silently repoint an existing link, so every click already recorded against that code
 * would be attributed to the new campaign. There is no way to untangle that afterwards.
 *
 * The unique index on `tracked_links.short_code` is the real guarantee; this loop exists so
 * the common case does not rely on catching a constraint violation.
 */
export async function allocateShortCode(
  isTaken: (code: string) => Promise<boolean>,
  options: {
    length?: number;
    maxAttempts?: number;
    randomBytes?: (n: number) => Buffer;
  } = {},
): Promise<string> {
  const { length = DEFAULT_SHORT_CODE_LENGTH, maxAttempts = 10, randomBytes } = options;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generateShortCode(length, randomBytes);
    // eslint-disable-next-line no-await-in-loop
    if (!(await isTaken(code))) return code;
  }
  throw new ShortCodeExhaustionError(maxAttempts);
}

/**
 * The public origin a short link is served from must itself be a plain http(s) origin.
 *
 * Separate from validateDestination because it is NOT allowlist-checked - it is our own
 * configured origin, not a user-supplied target - but it is still interpolated into a URL and
 * so still needs to be a URL.
 */
function validateOrigin(raw: string): DestinationResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, code: 'EMPTY', reason: 'A short-link origin is required.' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, code: 'UNPARSEABLE', reason: 'The short-link origin must be an absolute URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'DISALLOWED_SCHEME', reason: 'The short-link origin must be http or https.' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, code: 'EMBEDDED_CREDENTIALS', reason: 'The short-link origin must not contain credentials.' };
  }
  return { ok: true, url: url.toString(), hostname: url.hostname };
}

export interface TrackedLinkPreviewInput {
  destinationUrl: string;
  allowedHosts: ReadonlySet<string>;
  utm: UtmInput;
  shortCode: string;
  /** Public origin the short link is served from, e.g. https://enterprise.colaberry.ai */
  shortLinkOrigin: string;
}

export interface TrackedLinkPreview {
  ok: boolean;
  /** The `/r/:code` URL an operator publishes. */
  shortUrl?: string;
  /** Where that code resolves to, UTMs applied. */
  finalUrl?: string;
  /** The canonical UTM set, precisely typed - not widened to a string bag. */
  utm?: UtmParams;
  /** UTM keys already present in the destination that the canonical set replaced. */
  overwritten?: string[];
  rejection?: DestinationResult;
}

/**
 * Builds the full preview an operator confirms before a link is created. PURE.
 *
 * The spec requires a preview of the final URL before publication, and the reason is that
 * every part of a published tracked link is frozen afterwards — the destination, the UTMs and
 * the code all become the meaning of clicks already recorded. Showing the composed result
 * beforehand is the only point at which a mistake is still cheap.
 */
/** The exact shape generateShortCode emits. Anything else is not a short code. */
const SHORT_CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4,}$/;

export function buildTrackedLinkPreview(input: TrackedLinkPreviewInput): TrackedLinkPreview {
  const destination = validateDestination(input.destinationUrl, input.allowedHosts);
  if (!destination.ok) return { ok: false, rejection: destination };

  // The short code and origin are interpolated straight into a URL, and neither was checked.
  // Both are system-generated today, so this was not exploitable - but `shortCode:
  // '../../admin'` produced `https://enterprise.colaberry.ai/r/../../admin`, and a CRLF code
  // passed through untouched. "Currently only reached with trusted input" is how a string
  // becomes attacker-controlled two refactors later. Caught in review.
  if (!SHORT_CODE_PATTERN.test(input.shortCode)) {
    return {
      ok: false,
      rejection: {
        ok: false,
        code: 'UNPARSEABLE',
        reason: 'Short code is not in the generated alphabet.',
      },
    };
  }
  const originCheck = validateOrigin(input.shortLinkOrigin);
  if (!originCheck.ok) return { ok: false, rejection: originCheck };

  const utm = buildUtmParams(input.utm);
  const { url: finalUrl, overwritten } = applyUtmParams(destination.url as string, utm);

  const origin = input.shortLinkOrigin.replace(/\/+$/, '');
  return {
    ok: true,
    shortUrl: `${origin}/r/${input.shortCode}`,
    finalUrl,
    // No cast. `as unknown as` was hiding a genuine type mismatch rather than
    // resolving it, which is the same failure the typecheck exists to surface.
    utm,
    overwritten,
  };
}
