import { describeCallOutcome } from '../describeCallOutcome';

/**
 * The words after "have an AI call me". The one rule worth a suite: a call is
 * announced only when the server said `placed: true`. Every refusal says so.
 */
describe('describeCallOutcome', () => {
  it('announces a call only when one was placed, and says the number and the count', () => {
    const n = describeCallOutcome({ placed: true, requestId: 'r', angles: ['THE MEASURE', 'THE OPERATOR'], callId: 'c' }, '+1 214 555 0143');
    expect(n.tone).toBe('ok');
    expect(n.text).toContain('will call +1 214 555 0143');
    expect(n.text).toContain('2 open questions');
    expect(n.text).toContain('you can correct any of it afterwards');
  });

  it('singular for one question', () => {
    const n = describeCallOutcome({ placed: true, requestId: 'r', angles: ['THE MEASURE'], callId: null }, '2145550143');
    expect(n.text).toContain('the one open question');
  });

  it.each([
    'no_agent_configured', 'dial_skipped', 'dial_failed', 'no_intake_yet', 'no_phone', 'no_consent',
  ] as const)('%s: says no call was placed and what happens to the number', (reason) => {
    const n = describeCallOutcome({ placed: false, reason, requestId: 'r' }, '2145550143');
    expect(n.tone).toBe('warn');
    expect(n.text).toContain('could not place the call');
    expect(n.text).toContain('nothing else happens with your number');
    expect(n.text).not.toMatch(/will call/);
  });

  it('nothing_to_ask is not a failure', () => {
    const n = describeCallOutcome({ placed: false, reason: 'nothing_to_ask', requestId: 'r' }, '2145550143');
    expect(n.tone).toBe('ok');
    expect(n.text).toContain('nothing to call about');
    expect(n.text).toContain('will not be called');
  });

  it('cooling_down explains the wait without promising a later call', () => {
    const n = describeCallOutcome({ placed: false, reason: 'cooling_down', requestId: 'r' }, '2145550143');
    expect(n.text).toContain('will not call again right now');
    expect(n.text).not.toMatch(/will call/);
  });

  it('consent_not_recorded says the number was not kept', () => {
    const n = describeCallOutcome({ placed: false, reason: 'consent_not_recorded', requestId: null }, '2145550143');
    expect(n.text).toContain('your number was not kept');
  });

  it('unreachable is a transport failure, said as one', () => {
    const n = describeCallOutcome({ placed: false, reason: 'unreachable' }, '2145550143');
    expect(n.text).toContain('could not reach the server');
  });
});
