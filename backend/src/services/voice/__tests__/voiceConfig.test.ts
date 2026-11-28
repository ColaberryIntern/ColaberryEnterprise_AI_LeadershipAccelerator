import { loadVoiceConfig, redactedVoiceConfig, logVoiceConfigAtBoot, TEST_LIMITS, engineAModel, engineAKeyName } from '../voiceConfig';

const FICTION = '+15555550100';

describe('voiceConfig: validated, never throws, fails SAFE', () => {
  it('with every VOICE_* unset it is exactly today: all switches off, legacy engine, valid', () => {
    const c = loadVoiceConfig({});
    expect(c).toMatchObject({ valid: true, VOICE_STUDIO_ENABLED: false, VOICE_GATEWAY_LEGACY_ENABLED: false, VOICE_TEST_ENABLED: false, VOICE_ENGINE_DEFAULT: 'synthflow_legacy' });
    expect(c.VOICE_TEST_MAX_ATTEMPTS).toBe(3);
  });

  it('ignores unrelated env vars and empty strings', () => {
    expect(loadVoiceConfig({ DATABASE_URL: 'x', VOICE_TEST_ALLOWED_NUMBER: '' }).valid).toBe(true);
  });

  it('a valid test setup parses', () => {
    const c = loadVoiceConfig({ VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: FICTION });
    expect(c.valid).toBe(true);
    expect(c.VOICE_TEST_ENABLED).toBe(true);
  });

  it.each([
    [{ VOICE_TEST_ENABLED: 'true' }, /VOICE_TEST_ALLOWED_NUMBER: required/],
    [{ VOICE_TEST_ALLOWED_NUMBER: '5555550100' }, /E\.164/],
    [{ VOICE_TEST_MAX_ATTEMPTS: '4' }, /VOICE_TEST_MAX_ATTEMPTS/],
    [{ VOICE_TEST_MAX_DURATION_SECONDS: '600' }, /VOICE_TEST_MAX_DURATION_SECONDS/],
    [{ VOICE_TEST_BUDGET_USD: '50' }, /VOICE_TEST_BUDGET_USD/],
    [{ VOICE_STUDIO_ENABLED: 'yes' }, /VOICE_STUDIO_ENABLED/],
    [{ VOICE_STUDIO_ENABLED: 'true', VOICE_ENGINE_DEFAULT: 'conversation_relay' }, /VOICE_WS_BASE_URL/],
    [{ VOICE_WS_BASE_URL: 'ws://insecure.example' }, /wss/],
  ])('invalid %j: falls back to all-off with the issue named (never throws)', (env, issue) => {
    const c = loadVoiceConfig(env as Record<string, string>);
    expect(c.valid).toBe(false);
    expect(c.issues.join(' ')).toMatch(issue);
    expect(c.VOICE_STUDIO_ENABLED || c.VOICE_GATEWAY_LEGACY_ENABLED || c.VOICE_TEST_ENABLED).toBe(false);
  });

  it('live-test ceilings cannot be raised above the directive (3 attempts, 180 s, 5 USD)', () => {
    expect(TEST_LIMITS).toEqual({ maxAttempts: 3, maxDurationSeconds: 180, budgetUsd: 5 });
    expect(loadVoiceConfig({ VOICE_TEST_MAX_ATTEMPTS: '2' }).VOICE_TEST_MAX_ATTEMPTS).toBe(2);
  });

  it('the redacted view never contains the test number or a key', () => {
    const c = loadVoiceConfig({ VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: FICTION, VOICE_DESTINATION_HASH_KEY: 'a-very-secret-key-value' });
    const s = JSON.stringify(redactedVoiceConfig(c));
    expect(s).not.toContain('5555550100');
    expect(s).not.toContain('a-very-secret-key-value');
    expect(redactedVoiceConfig(c).testAllowedNumber).toBe('set');
  });

  it('boot logging never throws, logs a warning for an invalid config, and never prints the number', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const c = logVoiceConfigAtBoot({ VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: 'bad' });
    expect(c.valid).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('VoiceConfigInvalid');
    warn.mockRestore();
  });

  it('is deterministic for the same env (idempotent)', () => {
    expect(loadVoiceConfig({ VOICE_TEST_MAX_ATTEMPTS: '2' })).toEqual(loadVoiceConfig({ VOICE_TEST_MAX_ATTEMPTS: '2' }));
  });
});

describe('Engine A provider (owner decision 2026-11-28: OpenAI)', () => {
  it('defaults to OpenAI with the repository chat model, and its key', () => {
    const c = loadVoiceConfig({});
    expect([c.VOICE_ENGINE_A_PROVIDER, engineAModel(c), engineAKeyName(c.VOICE_ENGINE_A_PROVIDER)]).toEqual(['openai', 'gpt-4o', 'OPENAI_API_KEY']);
  });
  it('Claude stays available as a setting', () => {
    const c = loadVoiceConfig({ VOICE_ENGINE_A_PROVIDER: 'anthropic' });
    expect([engineAModel(c), engineAKeyName('anthropic')]).toEqual(['claude-opus-5-5', 'ANTHROPIC_API_KEY']);
    expect(engineAModel(loadVoiceConfig({ VOICE_ENGINE_A_MODEL: 'gpt-4o-mini' }))).toBe('gpt-4o-mini');
  });
  it.each([[{ VOICE_ENGINE_A_MODEL: 'claude-opus-5-5' }], [{ VOICE_ENGINE_A_PROVIDER: 'anthropic', VOICE_ENGINE_A_MODEL: 'gpt-4o' }], [{ VOICE_ENGINE_A_PROVIDER: 'gemini' }], [{ VOICE_ENGINE_A_MODEL: 'gpt 4o' }]])('a model that is not the provider\'s is an issue: %j', (env) => {
    expect(loadVoiceConfig(env).issues.length).toBeGreaterThan(0);
  });
});
