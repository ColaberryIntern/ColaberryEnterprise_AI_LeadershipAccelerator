/**
 * Explorer Growth OS — learner timezone resolution. Plan §16.3, §35 D-3;
 * EPIC 9/10.
 *
 * §35 D-3: "There is no per-lead timezone. Call windows use the CAMPAIGN's
 * timezone, defaulting to America/Chicago. Calling a learner at a
 * locally-inappropriate hour is a TCPA exposure. Mitigation: derive timezone
 * from visitors.country/city or area code, and REFUSE TO DIAL WHEN TIMEZONE IS
 * UNKNOWN."
 *
 * THIS SERVICE MOSTLY SAYS NO, AND THAT IS THE CORRECT BEHAVIOUR. Guessing a
 * timezone to unblock a call is the failure mode: an inferred zone that is
 * wrong by three hours is a 6am call to a stranger and a TCPA claim, and the
 * inference is invisible in the outcome — the call connects either way, and
 * nothing in our data records that we guessed.
 *
 * So the resolution table is deliberately SMALL and unambiguous. Every entry is
 * a region that sits wholly in one zone. Anything else refuses, including cases
 * a fuller table could resolve. A narrow table that is right is worth more than
 * a broad one that is right most of the time, because "most of the time" here
 * is measured in calls to real people at hours they did not agree to.
 */

export type TimezoneResolution =
  | { known: true; timezone: string; source: 'profile' | 'region' | 'country' }
  | { known: false; reason: string };

export interface TimezoneInputs {
  /** Already stored on the profile by an earlier resolution. Trusted. */
  storedTimezone?: string | null;
  /** ISO 3166-1 alpha-2, e.g. "US". */
  country?: string | null;
  /** US state / CA province code, e.g. "TX". */
  region?: string | null;
}

/**
 * Regions that sit WHOLLY within one zone.
 *
 * Deliberately excluded, because they are split and a state-level guess is a
 * coin flip: FL, TX, KS, NE, ND, SD, TN, KY, IN, MI, OR, ID, AK. A learner in
 * west Texas is an hour off a learner in Houston, and we cannot tell which.
 */
const UNAMBIGUOUS_US_REGIONS: Readonly<Record<string, string>> = {
  // Eastern
  ME: 'America/New_York', NH: 'America/New_York', VT: 'America/New_York',
  MA: 'America/New_York', RI: 'America/New_York', CT: 'America/New_York',
  NY: 'America/New_York', NJ: 'America/New_York', PA: 'America/New_York',
  DE: 'America/New_York', MD: 'America/New_York', DC: 'America/New_York',
  VA: 'America/New_York', WV: 'America/New_York', NC: 'America/New_York',
  SC: 'America/New_York', GA: 'America/New_York', OH: 'America/New_York',
  // Central
  IL: 'America/Chicago', WI: 'America/Chicago', MN: 'America/Chicago',
  IA: 'America/Chicago', MO: 'America/Chicago', AR: 'America/Chicago',
  LA: 'America/Chicago', MS: 'America/Chicago', AL: 'America/Chicago',
  OK: 'America/Chicago',
  // Mountain
  MT: 'America/Denver', WY: 'America/Denver', CO: 'America/Denver',
  NM: 'America/Denver', UT: 'America/Denver',
  AZ: 'America/Phoenix', // no DST, and wholly one zone
  // Pacific
  CA: 'America/Los_Angeles', WA: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  HI: 'Pacific/Honolulu',
};

/** Countries small enough to have exactly one zone. */
const SINGLE_ZONE_COUNTRIES: Readonly<Record<string, string>> = {
  GB: 'Europe/London', IE: 'Europe/Dublin', FR: 'Europe/Paris',
  DE: 'Europe/Berlin', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels',
  IT: 'Europe/Rome', ES: 'Europe/Madrid', PT: 'Europe/Lisbon',
  PL: 'Europe/Warsaw', SE: 'Europe/Stockholm', NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen', FI: 'Europe/Helsinki',
  IN: 'Asia/Kolkata', PK: 'Asia/Karachi', BD: 'Asia/Dhaka',
  SG: 'Asia/Singapore', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
  NG: 'Africa/Lagos', KE: 'Africa/Nairobi', ZA: 'Africa/Johannesburg',
  AE: 'Asia/Dubai', IL: 'Asia/Jerusalem', NZ: 'Pacific/Auckland',
};

/** Is this a timezone this runtime actually understands? */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve, or refuse.
 *
 * Order matters: a stored value beats a fresh inference, because it was
 * resolved once against better evidence and re-deriving it every call would let
 * a learner's zone flicker as their signals change.
 */
export function resolveLearnerTimezone(inputs: TimezoneInputs): TimezoneResolution {
  const stored = (inputs.storedTimezone ?? '').trim();
  if (stored) {
    if (!isValidTimezone(stored)) {
      // A stored value we cannot interpret is worse than none: it looks
      // authoritative and would silently pass through to a call window.
      return { known: false, reason: `stored timezone "${stored}" is not a valid IANA zone` };
    }
    return { known: true, timezone: stored, source: 'profile' };
  }

  const country = (inputs.country ?? '').trim().toUpperCase();
  const region = (inputs.region ?? '').trim().toUpperCase();

  if (country === 'US' || country === 'CA') {
    const zone = UNAMBIGUOUS_US_REGIONS[region];
    if (zone) return { known: true, timezone: zone, source: 'region' };
    return {
      known: false,
      reason: region
        ? `${region} spans more than one timezone — a state-level guess is a coin flip`
        : 'US learner with no region — country alone spans six zones',
    };
  }

  if (country) {
    const zone = SINGLE_ZONE_COUNTRIES[country];
    if (zone) return { known: true, timezone: zone, source: 'country' };
    return { known: false, reason: `no unambiguous zone for country ${country}` };
  }

  return { known: false, reason: 'no timezone, country or region on record' };
}

/** §16.2: learner-LOCAL business hours. */
export const BUSINESS_HOUR_START = 9;
export const BUSINESS_HOUR_END = 18;

/**
 * Is it currently business hours where the learner is?
 *
 * Uses `Intl` against the resolved zone rather than an offset, so DST is the
 * platform's problem rather than ours. An offset stored six months ago is
 * wrong for half the year, and wrong in the direction of calling an hour early.
 *
 * Weekends are excluded. A cold call at 10am Sunday is legal and still wrong.
 */
export function isWithinLocalBusinessHours(timezone: string, at: Date): boolean {
  if (!isValidTimezone(timezone)) return false;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(at);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;

  if (!Number.isFinite(hour) || !weekday) return false;
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  return hour >= BUSINESS_HOUR_START && hour < BUSINESS_HOUR_END;
}

/**
 * The §16.2 call-window check, resolution included.
 *
 * Returns false whenever the zone is unknown — the refusal §35 D-3 requires.
 */
export function mayCallNow(inputs: TimezoneInputs, at: Date): { allowed: boolean; reason: string } {
  const resolved = resolveLearnerTimezone(inputs);
  if (!resolved.known) {
    return { allowed: false, reason: `timezone unknown — ${resolved.reason}` };
  }
  if (!isWithinLocalBusinessHours(resolved.timezone, at)) {
    return { allowed: false, reason: `outside ${BUSINESS_HOUR_START}:00-${BUSINESS_HOUR_END}:00 in ${resolved.timezone}` };
  }
  return { allowed: true, reason: `within business hours in ${resolved.timezone}` };
}
