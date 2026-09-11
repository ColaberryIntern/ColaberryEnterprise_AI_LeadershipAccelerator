/**
 * Destination validation for tracked links. PURE — no I/O, no database.
 *
 * ── Why this is its own module, and why it is pure ────────────────────────────────────
 *
 * `/r/:shortCode` is a PUBLIC endpoint that 302s a visitor to whatever destination was stored
 * against the code. That makes the stored destination a redirect target supplied at
 * configuration time and executed at request time — which is precisely the shape of an open
 * redirect. If an attacker can get an arbitrary URL into `tracked_links.destination_url`, the
 * platform becomes a redirector that lends Colaberry's domain reputation to a phishing page.
 *
 * The whole security decision therefore lives in a pure function that can be exhaustively
 * tested without a database, and is applied at WRITE time (so a bad destination never lands)
 * and again at REDIRECT time (so a row written before a rule tightened cannot be replayed).
 * Validating only on write would leave existing rows grandfathered past any future fix.
 *
 * The allowlist itself comes from `brand_domains` via the existing
 * `journeyLinkRewriter.getLinkableHostnames`, which already fails SAFE to an empty set. That
 * behaviour is inherited deliberately: a lookup failure must never widen what we are willing
 * to redirect to.
 */

export type DestinationRejectionCode =
  | 'NOT_A_STRING'
  | 'EMPTY'
  | 'UNPARSEABLE'
  | 'DISALLOWED_SCHEME'
  | 'EMBEDDED_CREDENTIALS'
  | 'HOST_NOT_ALLOWED'
  | 'ALLOWLIST_EMPTY';

export interface DestinationResult {
  ok: boolean;
  /** Normalized absolute URL, present only when ok. */
  url?: string;
  hostname?: string;
  code?: DestinationRejectionCode;
  reason?: string;
}

/**
 * Only these two schemes are ever redirect targets.
 *
 * An allowlist, not a denylist. A denylist of `javascript:`/`data:` misses `vbscript:`,
 * `blob:`, `filesystem:`, and whatever a browser adds next — and being wrong here is an XSS
 * or a credential-phishing vector, not a broken link.
 */
const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/**
 * Normalizes a hostname for comparison against the allowlist.
 *
 * Lowercased, and a single trailing dot removed. `example.com.` is the fully-qualified form
 * of `example.com` and resolves identically in a browser, so treating them as different
 * hostnames would let one slip past an allowlist containing the other.
 *
 * `URL` has already converted any Unicode host to punycode by this point, which is what
 * closes the homograph gap — `аpple.com` with a Cyrillic а arrives here as `xn--pple-43d.com`
 * and simply fails to match.
 */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/**
 * Validates a destination against an allowlist of hostnames.
 *
 * Returns a result rather than throwing: a caller usually needs to explain the rejection to
 * an operator, and an exception loses the distinction between "you typed the wrong domain"
 * and "the allowlist could not be loaded".
 */
export function validateDestination(
  rawUrl: string | null | undefined,
  allowedHosts: ReadonlySet<string>,
): DestinationResult {
  // Type-guard BEFORE touching the value. This function's contract is that it returns a
  // result rather than throwing, and `rawUrl.trim()` on a non-string threw a TypeError -
  // contradicting its own docstring. It never produced an unsafe accept, but a throw in a
  // route handler becomes a 500, or worse gets caught upstream by something that treats an
  // exception as "could not validate" rather than "reject". Caught in review.
  //
  // `null` and `undefined` are reported as EMPTY, not NOT_A_STRING, because the signature
  // DECLARES them: they mean "no destination supplied", which is a caller doing something
  // reasonable. NOT_A_STRING is for `{}`, `42`, a Date - values the signature never permitted,
  // which mean the caller has a bug rather than a blank field. Collapsing the two would tell
  // an operator their empty form field was a type error.
  if (rawUrl === null || rawUrl === undefined) {
    return { ok: false, code: 'EMPTY', reason: 'A destination URL is required.' };
  }
  if (typeof rawUrl !== 'string') {
    return {
      ok: false,
      code: 'NOT_A_STRING',
      reason: 'A destination URL must be a string.',
    };
  }
  if (rawUrl.trim() === '') {
    return { ok: false, code: 'EMPTY', reason: 'A destination URL is required.' };
  }

  // An empty allowlist means the brand-domain lookup failed or no domains are configured.
  // Reported distinctly from "this host is not allowed": the operator's action differs
  // (configure a domain vs correct the URL), and conflating them sends people hunting the
  // wrong problem.
  if (allowedHosts.size === 0) {
    return {
      ok: false,
      code: 'ALLOWLIST_EMPTY',
      reason:
        'No linkable brand domains are configured, so no destination can be verified. '
        + 'Add a brand domain before creating tracked links.',
    };
  }

  let url: URL;
  try {
    // No base URL is passed on purpose. Supplying one would resolve a protocol-relative
    // `//evil.com` or a bare path against our own origin and quietly manufacture a valid
    // absolute URL out of input that was never absolute.
    url = new URL(rawUrl.trim());
  } catch {
    return {
      ok: false,
      code: 'UNPARSEABLE',
      reason: 'The destination must be a complete absolute URL, including https://.',
    };
  }

  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    return {
      ok: false,
      code: 'DISALLOWED_SCHEME',
      reason: `Only http and https destinations are allowed; got "${url.protocol}".`,
    };
  }

  // `https://good.example.com@evil.test/` parses with hostname `evil.test` and username
  // `good.example.com`. The host check below already catches it, but embedded credentials
  // have no legitimate use in a marketing destination and are a deception pattern in their
  // own right, so they are refused explicitly rather than incidentally.
  if (url.username !== '' || url.password !== '') {
    return {
      ok: false,
      code: 'EMBEDDED_CREDENTIALS',
      reason: 'Destination URLs must not contain embedded credentials.',
    };
  }

  // NOTE ON PORTS: the allowlist holds hostnames, so `https://colaberry.ai:8080/x` is
  // accepted. That is deliberate rather than overlooked - `brand_domains.hostname` stores no
  // port, and inventing one here would reject a legitimate staging origin. It is recorded
  // because a non-standard port on an allowlisted host is still a host we control, so the
  // redirect target remains ours; if that stops being true, the allowlist needs origins
  // rather than hostnames.
  const hostname = normalizeHostname(url.hostname);
  if (!allowedHosts.has(hostname)) {
    return {
      ok: false,
      code: 'HOST_NOT_ALLOWED',
      reason:
        `"${hostname}" is not a configured brand domain. Tracked links may only point at `
        + 'domains registered for a brand.',
    };
  }

  return { ok: true, url: url.toString(), hostname };
}

/**
 * Merges UTM parameters into a destination URL.
 *
 * Existing query parameters are preserved, and a UTM already present in the destination is
 * OVERWRITTEN by the generated one. That direction is deliberate: the generated set is the
 * canonical taxonomy, and a hand-typed `utm_source=Facebook` left in place is exactly the
 * drift the taxonomy exists to eliminate. The overwrite is reported so a caller can tell the
 * operator rather than silently changing what they typed.
 */
export function applyUtmParams<T extends object>(
  absoluteUrl: string,
  params: T,
): { url: string; overwritten: string[] } {
  const url = new URL(absoluteUrl);
  const overwritten: string[] = [];

  // Generic over the object rather than typed `Record<string, string | undefined>`.
  //
  // A `Record` parameter refuses an interface without an index signature, so passing the
  // precisely-typed `UtmParams` was a compile error. The two ways out were both worse: adding
  // an index signature to `UtmParams` would stop TypeScript catching a typo like `utm_sorce`,
  // and casting at the call site would hide exactly the kind of mismatch the typecheck exists
  // to surface. Accepting any object and narrowing each value at runtime keeps the caller's
  // type precise and is strictly safer, since it also rejects a non-string value that a cast
  // would have waved through.
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== 'string' || value === '') continue;
    if (url.searchParams.has(key) && url.searchParams.get(key) !== value) {
      overwritten.push(key);
    }
    url.searchParams.set(key, value);
  }

  return { url: url.toString(), overwritten };
}
