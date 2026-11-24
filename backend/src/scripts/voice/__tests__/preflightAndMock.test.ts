import { buildPreflight } from '../preflight';
import { runAllMockScenarios } from '../testMock';

describe('voice:preflight', () => {
  const ready = { VOICE_TEST_ENABLED: 'true', VOICE_TEST_ALLOWED_NUMBER: '+15555550100', TWILIO_ACCOUNT_SID: 'AC_x', TWILIO_API_KEY_SID: 'SK_x', TWILIO_API_KEY_SECRET: 's' };

  it('READY when the test switch, destination and Twilio credentials are present; never dials', () => {
    const r = buildPreflight(ready, 'test');
    expect(r.verdict).toBe('READY');
    expect(r.dialsPlaced).toBe(0);
    expect(r.worstCaseUsd).toBeLessThanOrEqual(5);
  });

  it('NOT READY names every blocker in test mode', () => {
    const r = buildPreflight({}, 'test');
    expect(r.verdict).toBe('NOT READY');
    expect(r.blockers).toEqual(expect.arrayContaining(['VOICE_TEST_ENABLED is not true', 'VOICE_TEST_ALLOWED_NUMBER is not set', 'Twilio credentials missing']));
  });

  it('Engine B without an OpenAI key is a blocker', () => {
    const r = buildPreflight({ ...ready, VOICE_ENGINE_DEFAULT: 'openai_realtime' }, 'test');
    expect(r.blockers).toContain('OPENAI_API_KEY missing for Engine B');
  });

  it('the report never contains the test number or any credential value', () => {
    const s = JSON.stringify(buildPreflight(ready, 'test'));
    expect(s).not.toContain('5555550100');
    expect(s).not.toContain('AC_x');
    expect(s).not.toContain('SK_x');
  });

  it('check mode (no --mode test) reports without demanding test settings', () => {
    expect(buildPreflight({}, 'check').verdict).toBe('READY');
  });
});

describe('voice:test:mock', () => {
  it('every scenario behaves as expected through the real gateway, with zero network attempts', async () => {
    const results = await runAllMockScenarios();
    expect(results.map((r) => [r.scenario, r.ok, r.reservationStatus])).toEqual([
      ['accepted', true, 'accepted'], ['refused', true, 'released'], ['unknown', true, 'ambiguous'], ['hang', true, 'ambiguous'],
    ]);
    for (const r of results) { expect(r.networkAttempts).toBe(0); expect(r.realCalls).toBe(0); }
  });

  it('restores the real fetch after the run', async () => {
    const before = globalThis.fetch;
    await runAllMockScenarios();
    expect(globalThis.fetch).toBe(before);
  });
});
