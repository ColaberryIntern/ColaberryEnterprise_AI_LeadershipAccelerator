/**
 * What a campaign governance config must contain to count as one (C0.12).
 *
 * ## Why this file exists
 *
 * `validateCampaignForPublish` asked one question about governance: does a row exist for
 * this campaign? It never read a field of it. Measured in production on 2026-11-01:
 * `campaign_governance_configs` held **zero rows against 47 campaigns**, so the question
 * always answered no and nobody had to think about what the answer would mean once it
 * answered yes.
 *
 * It would have meant very little. Every column in that table carries a database default,
 * so `PUT /api/admin/governance/campaigns/:id` with an empty body creates a complete row,
 * and an existence check reads it as governance. The C0.12 ticket names this outcome
 * exactly: *"a governance record that governs nothing is worse than its absence, because
 * the gate then reads green."*
 *
 * So this module is the substance test. It is deliberately separate from both the
 * validator and the admin route so that the write path and the read path cannot disagree
 * about what a valid config is.
 *
 * ## Why a ramp profile is the required field
 *
 * Of the six configurable columns, five are rate ceilings and floors that only bite once
 * sending is under way. `ramp_profile` is the only one that constrains how fast a campaign
 * reaches people in the first place, and it is the only column whose database default is
 * NULL - that is, the only one a hollow row leaves empty. Requiring it means a config
 * cannot be created without somebody deciding the send shape, which is the decision the
 * gate is actually guarding.
 *
 * ## Why zero is not the strictest ceiling
 *
 * `autonomousRampService` compares with `>=`, so `max_unsubscribe_rate = 0` pauses a
 * campaign that has had no unsubscribes at all. Zero is a trap rather than a tight rule,
 * which is why the bands below are open at the bottom. The resolver used to mask this by
 * coalescing a stored zero away with `||`; that masking is removed, so the band is now the
 * only thing standing between a zero and a campaign that can never run.
 */

/** The ramp shape `autonomousRampService` consumes. Mirrors its internal RampProfile. */
export interface CampaignRampProfile {
  /** Leads admitted per phase, in order. `-1` means "everyone remaining". */
  readonly phase_sizes: readonly number[];
  /** Health score at or above which the ramp advances a phase. */
  readonly advance_threshold: number;
  /** Health score below which the ramp pauses for review rather than holding. */
  readonly hold_threshold: number;
  /** How long a phase must run before it is judged. */
  readonly evaluation_window_hours: number;
}

/** The persisted columns this module judges. Loose on purpose: Sequelize returns strings. */
export interface GovernanceConfigShape {
  readonly max_unsubscribe_rate?: unknown;
  readonly max_bounce_rate?: unknown;
  readonly max_sms_failure_rate?: unknown;
  readonly min_open_rate?: unknown;
  readonly min_reply_rate?: unknown;
  readonly ramp_profile?: unknown;
}

/**
 * Accepted ranges, open at the bottom because zero is a trap (see the header).
 *
 * The three `max_*` columns are DECIMAL(5,2) and their defaults read as whole percents
 * (1.5, 5, 10). The two `min_*` columns are DECIMAL(5,4) and their defaults read as
 * fractions (0.1, 0.01). That is a real unit split inside one table, and it is enforced
 * here rather than described, so a percentage cannot be written into a fraction column.
 */
export const CONFIG_BANDS = {
  max_unsubscribe_rate: { min: 0, max: 100, unit: 'percent' },
  max_bounce_rate: { min: 0, max: 100, unit: 'percent' },
  max_sms_failure_rate: { min: 0, max: 100, unit: 'percent' },
  min_open_rate: { min: 0, max: 1, unit: 'fraction' },
  min_reply_rate: { min: 0, max: 1, unit: 'fraction' },
} as const;

export type ConfigBandKey = keyof typeof CONFIG_BANDS;

export const BAND_KEYS: readonly ConfigBandKey[] = Object.keys(CONFIG_BANDS) as ConfigBandKey[];

/** The largest ramp phase count worth having. Beyond this a ramp is a schedule, not a ramp. */
const MAX_PHASES = 12;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read a stored threshold without the `||` coalesce that used to hide a zero.
 *
 * Returns the default only when the column is genuinely absent or unreadable. A stored
 * zero comes back as zero, which `validateGovernanceConfig` then rejects as out of band -
 * loudly, at the point of decision, rather than silently at send time.
 */
export function readThreshold(value: unknown, fallback: number): number {
  const n = finite(value);
  return n === null ? fallback : n;
}

/**
 * Coerce a stored `ramp_profile` into the shape the ramp service consumes, or null.
 *
 * Returns null rather than throwing, because a malformed profile and an absent one lead to
 * the same place: the campaign is not publishable and the hardcoded type profile is used
 * until somebody fixes the config.
 */
export function normalizeRampProfile(value: unknown): CampaignRampProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const sizes = Array.isArray(raw.phase_sizes) ? raw.phase_sizes : null;
  if (!sizes || sizes.length === 0 || sizes.length > MAX_PHASES) return null;

  const phase_sizes: number[] = [];
  for (const entry of sizes) {
    const n = finite(entry);
    // `-1` is the service's sentinel for "everyone remaining". Any other non-positive
    // size would admit nobody, which makes the phase a silent stall.
    if (n === null || !Number.isInteger(n) || (n <= 0 && n !== -1)) return null;
    phase_sizes.push(n);
  }
  // A `-1` anywhere but last would make every later phase unreachable.
  const sentinel = phase_sizes.indexOf(-1);
  if (sentinel !== -1 && sentinel !== phase_sizes.length - 1) return null;

  const advance = finite(raw.advance_threshold);
  const hold = finite(raw.hold_threshold);
  const window = finite(raw.evaluation_window_hours);
  if (advance === null || hold === null || window === null) return null;
  if (advance < 0 || advance > 100 || hold < 0 || hold > 100) return null;
  // A hold threshold at or above the advance threshold leaves no band to hold in, so the
  // ramp would either advance or pause with nothing in between.
  if (hold >= advance) return null;
  if (window <= 0) return null;

  return { phase_sizes, advance_threshold: advance, hold_threshold: hold, evaluation_window_hours: window };
}

export interface GovernanceConfigVerdict {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Judge a config's contents. Pure - no I/O, so both the route and the publish validator
 * can call it and reach the same verdict.
 */
export function validateGovernanceConfig(config: GovernanceConfigShape | null | undefined): GovernanceConfigVerdict {
  if (!config) {
    return { valid: false, errors: ['Campaign governance config must be created before going live'] };
  }

  const errors: string[] = [];

  for (const key of BAND_KEYS) {
    const band = CONFIG_BANDS[key];
    const n = finite(config[key]);
    if (n === null) {
      errors.push(`${key} is not set`);
      continue;
    }
    // Open at the bottom: see the header on why zero is a trap rather than a tight rule.
    if (n <= band.min || n > band.max) {
      errors.push(
        `${key} must be greater than ${band.min} and at most ${band.max} (${band.unit}), got ${n}`,
      );
    }
  }

  if (normalizeRampProfile(config.ramp_profile) === null) {
    errors.push(
      'ramp_profile must declare phase_sizes, advance_threshold, hold_threshold and '
      + 'evaluation_window_hours. A config without a send shape does not constrain how '
      + 'fast the campaign reaches people, which is the decision this gate guards.',
    );
  }

  return { valid: errors.length === 0, errors };
}
