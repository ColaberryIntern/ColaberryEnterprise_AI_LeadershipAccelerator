import {
  voiceCallTypeForAction,
  voiceDialSpacingSeconds,
  spaceDialTime,
  voicePauseMs,
  dialFailureRecord,
  applyVoiceDialSpacing,
  MAX_VOICE_DIAL_SPACING_SECONDS,
  MAX_DIAL_ERROR_BODY_CHARS,
} from '../voiceDialPolicy';

/**
 * OH1m (T7): countdown calls go to our own Open House agent, 75 s apart, and a refused dial
 * keeps Synthflow's status and body. No phone, no database: every external call is injected.
 */
describe('voiceCallTypeForAction', () => {
  it('a countdown call is open_house, whatever voice_agent_type says', () => {
    expect(voiceCallTypeForAction({ metadata: { event_countdown: true }, voice_agent_type: 'welcome' })).toBe('open_house');
  });
  it('other calls keep welcome/interest routing', () => {
    expect(voiceCallTypeForAction({ metadata: {}, voice_agent_type: 'welcome' })).toBe('welcome');
    expect(voiceCallTypeForAction({ metadata: null, voice_agent_type: 'interest' })).toBe('interest');
    expect(voiceCallTypeForAction({ voice_agent_type: null })).toBe('interest');
  });
});

describe('voiceDialSpacingSeconds', () => {
  it('reads the campaign setting', () => {
    expect(voiceDialSpacingSeconds({ voice_dial_spacing_seconds: 75 })).toBe(75);
    expect(voiceDialSpacingSeconds({ voice_dial_spacing_seconds: '75' })).toBe(75);
  });
  it('is 0 when unset, invalid, zero or negative', () => {
    expect(voiceDialSpacingSeconds({})).toBe(0);
    expect(voiceDialSpacingSeconds(null)).toBe(0);
    expect(voiceDialSpacingSeconds({ voice_dial_spacing_seconds: 'abc' })).toBe(0);
    expect(voiceDialSpacingSeconds({ voice_dial_spacing_seconds: 0 })).toBe(0);
    expect(voiceDialSpacingSeconds({ voice_dial_spacing_seconds: -5 })).toBe(0);
  });
  it('caps a runaway value', () => {
    expect(voiceDialSpacingSeconds({ voice_dial_spacing_seconds: 99999 })).toBe(MAX_VOICE_DIAL_SPACING_SECONDS);
  });
});

describe('spaceDialTime', () => {
  const t0 = new Date('2026-11-19T16:00:00Z');
  const plus = (s: number) => new Date(t0.getTime() + s * 1000);

  it('keeps the time when nothing is near it', () => {
    expect(spaceDialTime(t0, [plus(-200), plus(300)], 75)).toEqual(t0);
  });
  it('three calls due in the same second land 75 s apart', () => {
    const taken: Date[] = [];
    for (let i = 0; i < 3; i++) taken.push(spaceDialTime(t0, taken, 75));
    expect(taken).toEqual([t0, plus(75), plus(150)]);
  });
  it('a slot exactly at the boundary is not pushed', () => {
    expect(spaceDialTime(t0, [plus(-75)], 75)).toEqual(t0);
  });
  it('skips over a run of taken slots, unsorted input', () => {
    expect(spaceDialTime(t0, [plus(140), plus(0), plus(70)], 75)).toEqual(plus(215));
  });
  it('spacing 0 changes nothing', () => {
    expect(spaceDialTime(t0, [t0], 0)).toEqual(t0);
  });
});

describe('voicePauseMs', () => {
  const settings = { voice_dial_spacing_seconds: 75 };
  const dialed = { status: 'sent', metadata: { synthflow_response: { call_id: 'c1' } } };

  it('pauses the rest of the spacing after a real call', () => {
    expect(voicePauseMs('voice', settings, dialed, 5000)).toBe(70_000);
  });
  it('never pauses for email or sms', () => {
    expect(voicePauseMs('email', settings, dialed, 0)).toBe(0);
    expect(voicePauseMs('sms', settings, dialed, 0)).toBe(0);
  });
  it('no pause after a skipped, cancelled or failed call, or with no setting', () => {
    expect(voicePauseMs('voice', settings, { status: 'sent', metadata: { synthflow_response: { skipped: true } } }, 0)).toBe(0);
    expect(voicePauseMs('voice', settings, { status: 'cancelled', metadata: {} }, 0)).toBe(0);
    expect(voicePauseMs('voice', settings, { status: 'pending', metadata: {} }, 0)).toBe(0);
    expect(voicePauseMs('voice', {}, dialed, 0)).toBe(0);
  });
  it('does not go negative when the scheduler already waited longer', () => {
    expect(voicePauseMs('voice', settings, dialed, 120_000)).toBe(0);
  });
});

describe('dialFailureRecord', () => {
  const now = new Date('2026-11-19T16:00:00Z');
  it('keeps status and raw body', () => {
    const rec = dialFailureRecord({ error: 'Synthflow HTTP 502: <html>bad gateway</html>', status: 502, rawBody: '<html>bad gateway</html>' }, now);
    expect(rec).toEqual({ status: 502, body: '<html>bad gateway</html>', error: 'Synthflow HTTP 502: <html>bad gateway</html>', at: now.toISOString() });
  });
  it('a network failure has no status or body, only the error', () => {
    expect(dialFailureRecord({ error: 'aborted' }, now)).toEqual({ status: null, body: null, error: 'aborted', at: now.toISOString() });
  });
  it('caps a huge body', () => {
    const rec = dialFailureRecord({ status: 500, rawBody: 'x'.repeat(10_000) }, now);
    expect(rec.body!.length).toBe(MAX_DIAL_ERROR_BODY_CHARS);
    expect(rec.error).toBe('Voice call failed');
  });
});

describe('applyVoiceDialSpacing', () => {
  const t0 = new Date('2026-11-19T16:00:00Z');
  const deps = (settings: Record<string, any> | null, taken: Date[]) => ({
    getCampaignSettings: jest.fn().mockResolvedValue(settings),
    findTakenDialTimes: jest.fn().mockResolvedValue(taken),
  });

  it('pushes a new call past the campaign\'s other pending call', async () => {
    const d = deps({ voice_dial_spacing_seconds: 75 }, [t0]);
    const got = await applyVoiceDialSpacing('camp-1', t0, d);
    expect(got).toEqual(new Date(t0.getTime() + 75_000));
    const [cid, from] = d.findTakenDialTimes.mock.calls[0];
    expect(cid).toBe('camp-1');
    expect(from).toEqual(new Date(t0.getTime() - 75_000));
  });
  it('no setting: no lookup, original time', async () => {
    const d = deps({}, [t0]);
    expect(await applyVoiceDialSpacing('camp-1', t0, d)).toEqual(t0);
    expect(d.findTakenDialTimes).not.toHaveBeenCalled();
  });
  it('no campaign: original time', async () => {
    const d = deps({ voice_dial_spacing_seconds: 75 }, [t0]);
    expect(await applyVoiceDialSpacing(null, t0, d)).toEqual(t0);
    expect(d.getCampaignSettings).not.toHaveBeenCalled();
  });
  it('fails open to the original time when the lookup throws', async () => {
    const d = {
      getCampaignSettings: jest.fn().mockResolvedValue({ voice_dial_spacing_seconds: 75 }),
      findTakenDialTimes: jest.fn().mockRejectedValue(new Error('db down')),
    };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await applyVoiceDialSpacing('camp-1', t0, d)).toEqual(t0);
  });
});
