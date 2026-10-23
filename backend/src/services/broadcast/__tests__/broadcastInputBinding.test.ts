import {
  resolveLiveInput, DEFAULT_STRATEGY, BINDING_STRATEGIES,
} from '../broadcastInputBinding';

/**
 * Which live input a new occurrence binds to.
 *
 * The assertions that matter most are the refusals. L7.1 shipped creating occurrences with no
 * binding at all, which produced broadcasts that were correctly gated, correctly timed, and
 * unplayable — a failure an audience discovers rather than an admin.
 */

const UID = 'ed843de347601f51d2ae57374a645b8a';

describe('the default strategy', () => {
  it('is shared, and is used when nothing is configured', () => {
    expect(DEFAULT_STRATEGY).toBe('shared');
    const r = resolveLiveInput({ CLOUDFLARE_STREAM_LIVE_INPUT_UID: UID } as NodeJS.ProcessEnv);
    expect(r).toEqual({
      bound: true, provider: 'cloudflare', providerSessionId: UID, strategy: 'shared',
    });
  });

  it('names the alternatives rather than hiding them', () => {
    // The strategy is a product decision. Keeping the other options named makes changing it a
    // configuration change plus one function, not a redesign.
    expect([...BINDING_STRATEGIES]).toEqual(['shared', 'per_occurrence', 'per_series']);
  });
});

describe('refusals — an unplayable occurrence must never be created', () => {
  it('refuses when no input is configured', () => {
    const r = resolveLiveInput({} as NodeJS.ProcessEnv);
    expect(r).toEqual({ bound: false, reason: 'no_input_configured' });
  });

  it('refuses an input that is not a Cloudflare uid', () => {
    const r = resolveLiveInput({ CLOUDFLARE_STREAM_LIVE_INPUT_UID: '../../etc/passwd' } as NodeJS.ProcessEnv);
    expect(r).toEqual({ bound: false, reason: 'malformed_input_uid' });
  });

  it('never echoes the configured value in a refusal', () => {
    // It comes from the environment and an error string becomes a log line.
    const r = resolveLiveInput({ CLOUDFLARE_STREAM_LIVE_INPUT_UID: 'super-secret-looking' } as NodeJS.ProcessEnv);
    expect(JSON.stringify(r)).not.toContain('super-secret-looking');
  });

  it('refuses an unknown strategy instead of guessing', () => {
    const r = resolveLiveInput({
      BROADCAST_INPUT_STRATEGY: 'whatever', CLOUDFLARE_STREAM_LIVE_INPUT_UID: UID,
    } as NodeJS.ProcessEnv);
    expect(r).toMatchObject({ bound: false, reason: 'unknown_strategy', detail: 'whatever' });
  });

  it('refuses a REAL strategy that is not built, rather than falling back to shared', () => {
    // Silently falling back would ignore an operator's explicit choice and bind every class to
    // one input when they asked for isolation.
    for (const s of ['per_occurrence', 'per_series']) {
      const r = resolveLiveInput({
        BROADCAST_INPUT_STRATEGY: s, CLOUDFLARE_STREAM_LIVE_INPUT_UID: UID,
      } as NodeJS.ProcessEnv);
      expect(r).toMatchObject({ bound: false, reason: 'strategy_not_implemented', detail: s });
    }
  });
});

describe('tolerances', () => {
  it('trims surrounding whitespace, which an env file routinely carries', () => {
    const r = resolveLiveInput({ CLOUDFLARE_STREAM_LIVE_INPUT_UID: `  ${UID}  ` } as NodeJS.ProcessEnv);
    expect(r).toMatchObject({ bound: true, providerSessionId: UID });
  });

  it('rejects a uid of the right length but the wrong alphabet', () => {
    const r = resolveLiveInput({ CLOUDFLARE_STREAM_LIVE_INPUT_UID: 'Z'.repeat(32) } as NodeJS.ProcessEnv);
    expect(r).toMatchObject({ bound: false, reason: 'malformed_input_uid' });
  });
});
