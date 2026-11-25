import { mapAnsweredBy, mapTwilioCallStatus, twilioStatusToEvents } from '../twilioStatusMap';
import { reduceCallEvents } from '../../contracts/callStateReducer';
import { CanonicalCallEventSchema } from '../../contracts/schemas';

const CALL = '0b1c2d3e-4f50-4617-8899-aabbccddeeff';
const SID = 'CA' + 'a1'.repeat(16);
const AT = '2026-11-24T20:00:00.000Z';
const cb = (CallStatus: string, SequenceNumber: string, extra: Record<string, string> = {}) => ({
  AccountSid: 'AC' + '0'.repeat(32), CallSid: SID, CallStatus, SequenceNumber, To: '+15555550100', From: '+15555550199', Caller: '+15555550199', ...extra,
});

describe('Twilio status map (VS2.1)', () => {
  it.each([
    ['queued', 'queued'], ['initiated', 'queued'], ['ringing', 'ringing'], ['in-progress', 'answered'], ['completed', 'completed'],
    ['busy', 'busy'], ['no-answer', 'no_answer'], ['failed', 'failed'], ['canceled', 'canceled'], ['COMPLETED', 'completed'],
  ])('%s -> %s', (s, want) => expect(mapTwilioCallStatus(s)).toBe(want));

  it('unknown statuses map to null, never a guessed state', () => {
    expect(mapTwilioCallStatus('weird')).toBeNull();
    expect(mapTwilioCallStatus(undefined)).toBeNull();
  });

  it('AnsweredBy: human, any machine_* or fax, else unknown', () => {
    expect(mapAnsweredBy('human')).toBe('human');
    expect(mapAnsweredBy('machine_end_beep')).toBe('machine');
    expect(mapAnsweredBy('fax')).toBe('machine');
    expect(mapAnsweredBy('unknown')).toBe('unknown');
    expect(mapAnsweredBy(undefined)).toBeUndefined();
  });

  it('emits one contract-valid carrier event with no phone number in it', () => {
    const [ev] = twilioStatusToEvents(CALL, cb('in-progress', '2', { AnsweredBy: 'human', Timestamp: 'Mon, 24 Nov 2026 20:00:05 +0000' }), AT);
    expect(CanonicalCallEventSchema.parse(ev)).toBeTruthy();
    expect(ev).toMatchObject({ state: 'answered', source: 'carrier', providerCallId: SID, answeredBy: 'human', occurredAt: '2026-11-24T20:00:05.000Z' });
    expect(JSON.stringify(ev)).not.toMatch(/5555550100|5555550199/);
  });

  it('a redelivered callback has the same event key (deduplicated downstream)', () => {
    expect(twilioStatusToEvents(CALL, cb('ringing', '1'), AT)[0].eventKey).toBe(twilioStatusToEvents(CALL, cb('ringing', '1'), '2026-11-24T21:00:00.000Z')[0].eventKey);
  });

  it('duplicate and out-of-order callbacks reduce to the same final state', () => {
    const seq = [cb('initiated', '0'), cb('ringing', '1'), cb('in-progress', '2', { AnsweredBy: 'human' }), cb('completed', '3', { CallDuration: '42' })]
      .map((p, i) => twilioStatusToEvents(CALL, { ...p, Timestamp: new Date(Date.parse(AT) + i * 1000).toUTCString() }, AT)[0]);
    const inOrder = reduceCallEvents(CALL, seq);
    const shuffled = reduceCallEvents(CALL, [seq[3], seq[1], seq[3], seq[0], seq[2], seq[1]]);
    expect(inOrder.state).toBe('completed');
    expect(shuffled.state).toBe(inOrder.state);
    expect(shuffled.humanAnswered).toBe(inOrder.humanAnswered);
    expect(shuffled.callExisted).toBe(true);
  });

  it('Twilio ErrorCode becomes a stable error class', () => {
    expect(twilioStatusToEvents(CALL, cb('failed', '1', { ErrorCode: '32204' }), AT)[0].errorClass).toBe('TwilioError32204');
  });

  it.each([
    ['no CallSid', { CallStatus: 'ringing' }],
    ['a non-Twilio CallSid', { CallSid: 'XYZ', CallStatus: 'ringing' }],
    ['an unknown status', { CallSid: SID, CallStatus: 'exploded' }],
  ])('returns [] for %s (logged by the caller, never thrown)', (_n, p) => {
    expect(twilioStatusToEvents(CALL, p, AT)).toEqual([]);
  });
});
