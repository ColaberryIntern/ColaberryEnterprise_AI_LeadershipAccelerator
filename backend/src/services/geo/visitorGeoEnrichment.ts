/**
 * Turning a stored visitor IP into a city, for `visitors.city`.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `visitors.city` and `visitors.country` have been declared on the model, read by
 * `visitorAnalyticsService` and required by the landing-page snack bar since each
 * was written - and NOTHING HAS EVER WRITTEN THEM. Measured on production
 * 2026-11-10: 0 of 6,408 visitor rows all time have a city, while 6,405 of them
 * have an IP. That is why the snack bar renders nothing on a page with 35 signups
 * in 72 hours: `composeSignupEvents` skips every row it cannot name, and with
 * `name_format: 'city_only'` a row without a city cannot be named.
 *
 * ── WHY THE LOGIC IS HERE AND THE DATABASE IS NOT ───────────────────────────
 *
 * This module holds no reference to the MaxMind reader and opens no file. The
 * caller passes a lookup function in. Two reasons, both practical:
 *
 *   1. The GeoLite2 database is ~60MB and the reader loads it. A unit test that
 *      imported it would pay that on every jest worker, on a CI runner, for logic
 *      that is pure string handling.
 *   2. The long-running backend must never load it either. Enrichment runs as a
 *      short-lived script (`scripts/enrichVisitorGeo.ts`) that exits, so the
 *      memory is transient on a host whose kernel journal counts 670 OOM kills.
 *
 * ── THE RULE THAT GOVERNS EVERY DECISION BELOW ──────────────────────────────
 *
 * Never write a city we are not confident in. The snack bar is public social
 * proof, and `snackbarFeedService`'s own header states the standard: "NOTHING IS
 * INVENTED... which is what keeps this on the right side of the FTC's rules on
 * fake social proof." A row with no city shows no card. A row with a WRONG city
 * shows a false statement about a real person's location. The first is free; the
 * second is the only outcome that actually costs something. So every doubt here
 * resolves to null.
 */

/**
 * The subset of a MaxMind City response this uses, as documentation of the three
 * paths that matter. `cityFromLookup` takes `unknown` rather than this type on
 * purpose - see the note on that function.
 */
export interface GeoCityResponse {
  city?: { names?: Record<string, string> } | null;
  country?: { iso_code?: string; names?: Record<string, string> } | null;
  location?: { accuracy_radius?: number } | null;
}

/** Safe property read for data that arrived from outside this program. */
function prop(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

export interface GeoResult {
  city: string | null;
  country: string | null;
}

export const NO_GEO: GeoResult = { city: null, country: null };

/**
 * How vague a fix may be and still be called a city, in kilometres.
 *
 * MaxMind returns `accuracy_radius`: the radius it believes the true location
 * sits within. A 1000km radius on a US IP is not a city, it is a time zone with a
 * city's name attached - and printing "Someone in Wichita" for somebody in Denver
 * is exactly the false claim this module exists to avoid. 200km keeps metro-level
 * answers and drops the ones that are really country-level guesses wearing a city
 * label.
 */
export const DEFAULT_MAX_ACCURACY_RADIUS_KM = 200;

/**
 * THE CONTRACT WITH THE SNACK BAR, and the reason this is not just `String(city)`.
 *
 * `snackbarFeedService.cleanCity` accepts `/^[\p{L} .'-]{2,60}$/u` and silently
 * returns null for anything else. So a city this module stores that does not
 * match is a row that LOOKS enriched and still renders nothing - the worst of
 * both, because the column stops being a useful signal of what is left to do.
 *
 * Deliberately a copy of that expression rather than an import: the two modules
 * are allowed to disagree one day (that one guards a public page, this one guards
 * a write), and a shared constant would hide the day they should. The test pins
 * them together instead, so the copy cannot drift silently.
 *
 * MEASURED CONSEQUENCE, 2026-11-10: this rejects "Plano, TX" because the
 * expression has no comma in it. So a stored city can never carry its state, and
 * the snack bar's own comment promising "Someone in Plano, TX" cannot happen as
 * the code stands. Storing the bare city is the honest reading of the sanitizer;
 * widening it to allow a comma is a separate decision about a public surface.
 */
const SNACKBAR_SAFE_CITY = /^[\p{L} .'-]{2,60}$/u;

export function isSnackbarSafeCity(city: string | null | undefined): boolean {
  return typeof city === 'string' && SNACKBAR_SAFE_CITY.test(city.trim());
}

/**
 * Reduce whatever is in `visitors.ip_address` to one bare address.
 *
 * The column is written from `req.ip`, which with `trust proxy` set is a single
 * address - but this is historical data going back to the first row, written by
 * several code paths over time, so it tolerates the shapes that actually turn up:
 * a forwarded chain, an IPv4-mapped IPv6 address, a bracketed IPv6 host, a
 * trailing port.
 *
 * Returns null rather than a guess for anything it does not recognise.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  let ip = raw.trim();
  if (!ip) return null;

  // `X-Forwarded-For` style chain: the CLIENT is the first entry. The last is the
  // nearest proxy, which is our own nginx and geolocates to a datacenter.
  if (ip.includes(',')) ip = ip.split(',')[0].trim();

  // `[2001:db8::1]:443`
  const bracketed = ip.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
  if (bracketed) ip = bracketed[1];

  // `1.2.3.4:5678`. Only when there is exactly one colon, so an IPv6 address -
  // which is mostly colons - is never truncated here.
  if ((ip.match(/:/g) || []).length === 1 && /^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$/.test(ip)) {
    ip = ip.split(':')[0];
  }

  // `::ffff:203.0.113.5` - an IPv4 address wearing IPv6 clothes.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) ip = mapped[1];

  if (!ip) return null;
  const isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
  if (isV4) {
    // Reject 999.1.1.1 and friends rather than hand them to a reader.
    if (ip.split('.').some((o) => Number(o) > 255)) return null;
    return ip;
  }
  // Loose IPv6 shape check: hex groups and colons only, at least two colons.
  if (/^[0-9a-f:]+$/i.test(ip) && (ip.match(/:/g) || []).length >= 2) return ip.toLowerCase();
  return null;
}

/**
 * Is this an address that can belong to a person on the public internet?
 *
 * 423 of the last 3,085 visitor rows hold a private address - captures where a
 * proxy's address was recorded instead of the forwarded client. Those cannot be
 * located, and a reader asked about 10.0.0.5 returns either nothing or something
 * meaningless. Skipped, never guessed.
 */
export function isPublicIp(ip: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127) return false;            // unspecified, loopback
    if (a === 10) return false;                         // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return false;  // RFC1918
    if (a === 192 && b === 168) return false;           // RFC1918
    if (a === 169 && b === 254) return false;           // link-local
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT, RFC6598
    if (a === 192 && b === 0) return false;             // IETF protocol assignments / TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a >= 224) return false;                         // multicast and reserved
    return true;
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return false;
  if (/^f[cd]/.test(v6)) return false;  // unique local, fc00::/7
  if (/^fe[89ab]/.test(v6)) return false; // link-local, fe80::/10
  if (/^ff/.test(v6)) return false;     // multicast
  return /^[0-9a-f:]+$/.test(v6);
}

/** Both gates in one question, for the caller's filter. */
export function isEnrichableIp(raw: string | null | undefined): boolean {
  const ip = normalizeIp(raw);
  return ip !== null && isPublicIp(ip);
}

/**
 * A reader response becomes a city and a country, or becomes nothing.
 *
 * `country` is the ISO code ("US"), not the name: it is two characters, it never
 * changes spelling, and nothing renders it to a visitor today.
 */
/**
 * Takes `unknown`, not a typed response, and that is deliberate.
 *
 * `maxmind`'s `open<T extends Response>` constrains its generic to mmdb-lib's own
 * union, so a hand-written interface cannot be passed to it without a cast - and
 * a cast would be a claim about data this program did not produce. The honest
 * description of what arrives here is "whatever was in a binary database file",
 * so it is narrowed rather than asserted, and every path below already had to
 * handle a missing or malformed field anyway.
 */
export function cityFromLookup(
  lookup: unknown,
  maxAccuracyRadiusKm: number = DEFAULT_MAX_ACCURACY_RADIUS_KM,
): GeoResult {
  if (!lookup || typeof lookup !== 'object') return NO_GEO;

  const isoRaw = prop(prop(lookup, 'country'), 'iso_code');
  const country = typeof isoRaw === 'string' && /^[A-Z]{2}$/.test(isoRaw.trim().toUpperCase())
    ? isoRaw.trim().toUpperCase()
    : null;

  // A fix too vague to be a city still tells us the country, and the country is
  // worth keeping - it is a true statement, and nothing renders it publicly.
  const radius = prop(prop(lookup, 'location'), 'accuracy_radius');
  if (typeof radius === 'number' && Number.isFinite(radius) && radius > maxAccuracyRadiusKm) {
    return { city: null, country };
  }

  const nameRaw = prop(prop(prop(lookup, 'city'), 'names'), 'en');
  if (typeof nameRaw !== 'string') return { city: null, country };
  const name = nameRaw.trim();
  if (!isSnackbarSafeCity(name)) return { city: null, country };

  return { city: name, country };
}

/** Nothing worth writing: used by the caller to count skips honestly. */
export function isEmptyResult(result: GeoResult): boolean {
  return result.city === null && result.country === null;
}
