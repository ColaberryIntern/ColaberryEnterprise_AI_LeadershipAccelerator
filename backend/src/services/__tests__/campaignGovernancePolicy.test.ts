/**
 * C0.12's acceptance criteria, as tests.
 *
 * The ticket's threat model is not a missing config - it is a present one that means
 * nothing: *"Creating an empty config purely to satisfy the check. A governance record that
 * governs nothing is worse than its absence, because the gate then reads green."*
 *
 * Every column in `campaign_governance_configs` carries a database default, so the hollow
 * row that threat model describes is the DEFAULT outcome of an empty write, not an exotic
 * one. The first block below is therefore the point of this file: a row of column defaults
 * must be refused.
 *
 * Pure module, no model imports, so this suite runs without a database.
 */
import {
  BAND_KEYS,
  CONFIG_BANDS,
  normalizeRampProfile,
  readThreshold,
  validateGovernanceConfig,
} from '../campaignGovernancePolicy';
import { DECLARED_CONFIGS } from '../../seeds/campaignGovernanceDeclarations';

/** Exactly what the database hands back for a row created by an empty PUT. */
const HOLLOW_ROW = {
  max_unsubscribe_rate: '1.50',
  max_bounce_rate: '5.00',
  max_sms_failure_rate: '10.00',
  min_open_rate: '0.1000',
  min_reply_rate: '0.0100',
  ramp_profile: null,
};

const GOOD_RAMP = {
  phase_sizes: [3, 3, 3],
  advance_threshold: 70,
  hold_threshold: 50,
  evaluation_window_hours: 72,
};

/** A config that passes. Each test below breaks exactly one thing. */
function goodConfig(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    max_unsubscribe_rate: 10,
    max_bounce_rate: 10,
    max_sms_failure_rate: 0.01,
    min_open_rate: 0.25,
    min_reply_rate: 0.1,
    ramp_profile: { ...GOOD_RAMP },
    ...over,
  };
}

describe('the hollow row, which is the whole point', () => {
  it('refuses a row made entirely of column defaults', () => {
    const v = validateGovernanceConfig(HOLLOW_ROW);
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toContain('ramp_profile');
  });

  it('names the absent send shape rather than failing vaguely', () => {
    const v = validateGovernanceConfig(HOLLOW_ROW);
    expect(v.errors.some((e) => /constrain how\s+fast/.test(e))).toBe(true);
  });

  it('still refuses a hollow row when every rate is in band', () => {
    // The rates in a hollow row ARE in band - 1.5, 5 and 10 percent are perfectly
    // sensible numbers. That is exactly why a band check alone cannot catch a hollow
    // row, and why ramp_profile carries the weight.
    for (const key of BAND_KEYS) {
      const n = Number((HOLLOW_ROW as Record<string, unknown>)[key]);
      expect(n).toBeGreaterThan(CONFIG_BANDS[key].min);
      expect(n).toBeLessThanOrEqual(CONFIG_BANDS[key].max);
    }
    expect(validateGovernanceConfig(HOLLOW_ROW).valid).toBe(false);
  });

  it('refuses an absent config with the message the publish gate has always used', () => {
    const v = validateGovernanceConfig(null);
    expect(v.valid).toBe(false);
    expect(v.errors).toEqual(['Campaign governance config must be created before going live']);
  });
});

describe('validateGovernanceConfig bands', () => {
  it('accepts a config whose every field was decided', () => {
    expect(validateGovernanceConfig(goodConfig())).toEqual({ valid: true, errors: [] });
  });

  it.each(BAND_KEYS)('rejects a zero %s, because >= makes zero pause a clean campaign', (key) => {
    const v = validateGovernanceConfig(goodConfig({ [key]: 0 }));
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toContain(key);
  });

  it.each(BAND_KEYS)('rejects a negative %s', (key) => {
    expect(validateGovernanceConfig(goodConfig({ [key]: -1 })).valid).toBe(false);
  });

  it.each(BAND_KEYS)('reports %s as unset when it is null', (key) => {
    const v = validateGovernanceConfig(goodConfig({ [key]: null }));
    expect(v.errors).toContain(`${key} is not set`);
  });

  it('rejects a percentage written into a fraction column', () => {
    // min_open_rate is DECIMAL(5,4) and its default reads as a fraction (0.1); the max_*
    // columns are DECIMAL(5,2) and read as whole percents. Writing 25 where 0.25 belongs
    // is the mistake that unit split invites, and it must not be silently stored.
    const v = validateGovernanceConfig(goodConfig({ min_open_rate: 25 }));
    expect(v.valid).toBe(false);
    expect(v.errors.join(' ')).toContain('fraction');
  });

  it('accepts a rate written as the string Sequelize returns for a decimal', () => {
    expect(validateGovernanceConfig(goodConfig({ max_bounce_rate: '2.00' })).valid).toBe(true);
  });

  it('rejects a rate above 100 percent', () => {
    expect(validateGovernanceConfig(goodConfig({ max_bounce_rate: 101 })).valid).toBe(false);
  });

  it('reports every broken field at once rather than only the first', () => {
    const v = validateGovernanceConfig({ ramp_profile: null });
    expect(v.errors.length).toBe(BAND_KEYS.length + 1);
  });
});

describe('normalizeRampProfile', () => {
  it('accepts a decided profile', () => {
    expect(normalizeRampProfile({ ...GOOD_RAMP })).toEqual(GOOD_RAMP);
  });

  it('accepts -1 as the final phase, the service sentinel for everyone remaining', () => {
    const p = normalizeRampProfile({ ...GOOD_RAMP, phase_sizes: [10, 25, 50, -1] });
    expect(p?.phase_sizes).toEqual([10, 25, 50, -1]);
  });

  it('rejects -1 anywhere but last, which would strand every later phase', () => {
    expect(normalizeRampProfile({ ...GOOD_RAMP, phase_sizes: [-1, 25] })).toBeNull();
  });

  it('rejects a zero phase size, which admits nobody and stalls silently', () => {
    expect(normalizeRampProfile({ ...GOOD_RAMP, phase_sizes: [3, 0, 3] })).toBeNull();
  });

  it('rejects a fractional phase size', () => {
    expect(normalizeRampProfile({ ...GOOD_RAMP, phase_sizes: [3, 2.5] })).toBeNull();
  });

  it('rejects an empty phase list', () => {
    expect(normalizeRampProfile({ ...GOOD_RAMP, phase_sizes: [] })).toBeNull();
  });

  it('rejects a hold threshold at or above the advance threshold', () => {
    // There would be no band left to hold in: the ramp would either advance or pause.
    expect(normalizeRampProfile({ ...GOOD_RAMP, hold_threshold: 70 })).toBeNull();
    expect(normalizeRampProfile({ ...GOOD_RAMP, hold_threshold: 80 })).toBeNull();
  });

  it('rejects a non-positive evaluation window', () => {
    expect(normalizeRampProfile({ ...GOOD_RAMP, evaluation_window_hours: 0 })).toBeNull();
  });

  it('rejects a profile missing any threshold', () => {
    const { advance_threshold, ...rest } = GOOD_RAMP;
    expect(advance_threshold).toBe(70);
    expect(normalizeRampProfile(rest)).toBeNull();
  });

  it('rejects an array, a string and null', () => {
    expect(normalizeRampProfile([3, 3, 3])).toBeNull();
    expect(normalizeRampProfile('[3,3,3]')).toBeNull();
    expect(normalizeRampProfile(null)).toBeNull();
  });
});

describe('readThreshold, which replaced a `||` coalesce', () => {
  it('returns a stored zero rather than substituting the looser default', () => {
    // `Number(0) || 1.5` is 1.5. That is the bug: the tightest value anybody could type
    // was the one value the resolver threw away. Zero is still refused at write time, but
    // it must not be silently widened on read.
    expect(readThreshold(0, 1.5)).toBe(0);
    expect(readThreshold('0.00', 1.5)).toBe(0);
  });

  it('falls back only when the value is genuinely unreadable', () => {
    expect(readThreshold(null, 1.5)).toBe(1.5);
    expect(readThreshold(undefined, 1.5)).toBe(1.5);
    expect(readThreshold('', 1.5)).toBe(1.5);
    expect(readThreshold('not a number', 1.5)).toBe(1.5);
  });

  it('passes a real stored value through', () => {
    expect(readThreshold('2.00', 5)).toBe(2);
  });
});

describe('the declared configs, which are what actually gets written', () => {
  it('declares at least one config', () => {
    expect(DECLARED_CONFIGS.length).toBeGreaterThan(0);
  });

  it.each(DECLARED_CONFIGS.map((c) => [c.key, c] as const))('%s passes its own validator', (_key, c) => {
    expect(validateGovernanceConfig(c.values)).toEqual({ valid: true, errors: [] });
  });

  it.each(DECLARED_CONFIGS.map((c) => [c.key, c] as const))('%s records a derivation for every field it sets', (_key, c) => {
    for (const field of [...BAND_KEYS, 'ramp_profile']) {
      expect(typeof c.rationale[field]).toBe('string');
      expect(c.rationale[field].length).toBeGreaterThan(40);
    }
  });

  it('is not a template: no two configs carry the same numbers', () => {
    // This is C0.12's fourth acceptance criterion - "a second campaign is checked to
    // confirm the config is reusable and not bespoke". Reusable means the same mechanism
    // produced both; not bespoke means the numbers came from each campaign's own facts.
    // Identical numbers across two campaigns of different shape would mean neither.
    const seen = new Map<string, string>();
    for (const c of DECLARED_CONFIGS) {
      const shape = JSON.stringify(c.values);
      const clash = seen.get(shape);
      expect(clash).toBeUndefined();
      seen.set(shape, c.key);
    }
  });

  it('differs from the platform defaults on at least one rate per config', () => {
    const defaults: Record<string, number> = {
      max_unsubscribe_rate: 1.5,
      max_bounce_rate: 5.0,
      max_sms_failure_rate: 10.0,
      min_open_rate: 0.1,
      min_reply_rate: 0.01,
    };
    for (const c of DECLARED_CONFIGS) {
      const moved = BAND_KEYS.filter((k) => Number(c.values[k]) !== defaults[k]);
      expect(moved.length).toBeGreaterThan(0);
    }
  });

  it('names a campaign id and a human-readable campaign name for each', () => {
    for (const c of DECLARED_CONFIGS) {
      expect(c.campaign_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(c.campaign_name.length).toBeGreaterThan(0);
      expect(c.why.length).toBeGreaterThan(40);
    }
  });
});
