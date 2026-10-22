/**
 * testModeAlarm — one alarm per activation, and never through the channel it reports on.
 *
 * Two real incidents sit behind these tests. On 2026-10-16 test mode ran 29 hours and
 * redirected 579 emails with nothing announcing it, because the alerts that would have
 * said so were redirected into the same mailbox. And this repo has previously shipped a
 * level-triggered threshold that notified forever, so an alarm that fires per email
 * would be a regression into a known failure, not a safety improvement.
 */
import {
  shouldAlarm, alarmMarker, buildAlarmMessage, maybeRaiseTestModeAlarm,
  ALARM_SETTING_KEY, AlarmDeps, AlarmMessage,
} from '../testModeAlarm';

const ENABLED_AT = '2026-10-16T11:58:00.000Z';
const MARKER = '2026-10-16T11:58:00.000Z';

describe('alarmMarker', () => {
  it('normalizes a Date and a string to the same key', () => {
    expect(alarmMarker(new Date(ENABLED_AT))).toBe(MARKER);
    expect(alarmMarker(ENABLED_AT)).toBe(MARKER);
  });

  it('returns null for anything unusable (boundary)', () => {
    for (const bad of [null, undefined, '', 'whenever', NaN as unknown as string]) {
      expect(alarmMarker(bad as string | null)).toBeNull();
    }
  });
});

describe('shouldAlarm', () => {
  it('alarms the first time an activation is seen (happy path)', () => {
    expect(shouldAlarm(ENABLED_AT, null)).toBe(true);
  });

  it('does NOT alarm again for the same activation (the level-trigger trap)', () => {
    // This is the whole point. 579 emails went out during the real incident; a
    // level-triggered alarm would have sent 579 warnings.
    expect(shouldAlarm(ENABLED_AT, MARKER)).toBe(false);
  });

  it('alarms again when the flag is switched off and back on', () => {
    // A new activation moves the settings timestamp, so it is a new key.
    expect(shouldAlarm('2026-10-20T09:00:00.000Z', MARKER)).toBe(true);
  });

  it('does NOT alarm without a usable timestamp, because there is no dedup key', () => {
    // Firing here would alarm on every email forever: a filtered alarm, not a loud one.
    for (const bad of [null, undefined, 'nonsense']) {
      expect(shouldAlarm(bad as string | null, null)).toBe(false);
    }
  });
});

describe('buildAlarmMessage', () => {
  const msg = buildAlarmMessage({
    enabledAt: ENABLED_AT, sink: 'ali@colaberry.com', maxAgeHours: 4, enabledBy: null,
  });

  it('leads with the consequence, not the flag name', () => {
    // The reader is being interrupted and may not know what test mode does.
    expect(msg.text.split('\n')[0]).toMatch(/not going to the people it is addressed to/i);
  });

  it('names where the mail is actually going, and that sends still look successful', () => {
    expect(msg.text).toContain('ali@colaberry.com');
    expect(msg.text).toMatch(/reports every send as delivered/i);
  });

  it('says it expires by itself, so nobody assumes mail is lost until someone acts', () => {
    expect(msg.text).toContain('4 hours');
  });

  it('is honest when no actor was recorded, rather than implying one', () => {
    // The live row carried updated_by = null, so this is the normal case.
    expect(msg.text).toContain('nobody recorded');
    const named = buildAlarmMessage({
      enabledAt: ENABLED_AT, sink: 'x@y.com', maxAgeHours: 4, enabledBy: 'ali@colaberry.com',
    });
    expect(named.text).toContain('ali@colaberry.com');
  });

  it('carries the same facts in both html and text', () => {
    expect(msg.html).toContain('ali@colaberry.com');
    expect(msg.subject).toMatch(/test mode is on/i);
  });
});

describe('maybeRaiseTestModeAlarm', () => {
  const deps = (over: Partial<AlarmDeps> = {}) => {
    const sent: AlarmMessage[] = [];
    const recorded: string[] = [];
    const d: AlarmDeps = {
      getLastAlarmedFor: jest.fn(async () => null),
      recordAlarmed: jest.fn(async (m: string) => { recorded.push(m); }),
      send: jest.fn(async (m: AlarmMessage) => { sent.push(m); }),
      ...over,
    };
    return { d, sent, recorded };
  };

  it('sends exactly one alarm for a fresh activation (happy path)', async () => {
    const { d, sent, recorded } = deps();
    await expect(maybeRaiseTestModeAlarm(ENABLED_AT, 'sink@x.com', 4, d)).resolves.toBe(true);
    expect(sent).toHaveLength(1);
    expect(recorded).toEqual([MARKER]);
  });

  it('is idempotent: a second call for the same activation sends nothing', async () => {
    const { d, sent } = deps({ getLastAlarmedFor: jest.fn(async () => MARKER) });
    await expect(maybeRaiseTestModeAlarm(ENABLED_AT, 'sink@x.com', 4, d)).resolves.toBe(false);
    expect(sent).toHaveLength(0);
    expect(d.recordAlarmed).not.toHaveBeenCalled();
  });

  it('records the marker BEFORE sending, so a failed send cannot become a flood', async () => {
    const order: string[] = [];
    const { d } = deps({
      recordAlarmed: jest.fn(async () => { order.push('record'); }),
      send: jest.fn(async () => { order.push('send'); throw new Error('smtp down'); }),
    });
    await expect(maybeRaiseTestModeAlarm(ENABLED_AT, 'sink@x.com', 4, d)).resolves.toBe(false);
    expect(order).toEqual(['record', 'send']);
  });

  it('never throws, because it runs on the outbound email path (failure path)', async () => {
    const { d } = deps({ getLastAlarmedFor: jest.fn(async () => { throw new Error('db gone'); }) });
    await expect(maybeRaiseTestModeAlarm(ENABLED_AT, 'sink@x.com', 4, d)).resolves.toBe(false);
  });

  it('does nothing at all without a usable timestamp (boundary)', async () => {
    const { d, sent } = deps();
    await expect(maybeRaiseTestModeAlarm(null, 'sink@x.com', 4, d)).resolves.toBe(false);
    expect(sent).toHaveLength(0);
    expect(d.getLastAlarmedFor).not.toHaveBeenCalled();
  });

  it('keeps its marker under a stable settings key', () => {
    // Renaming this silently re-arms the alarm for an activation already reported.
    expect(ALARM_SETTING_KEY).toBe('test_mode_alarm_sent_for');
  });
});
