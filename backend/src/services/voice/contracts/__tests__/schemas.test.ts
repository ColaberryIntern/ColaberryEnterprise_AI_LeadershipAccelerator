import {
  AuthorizedDispatchSchema, CanonicalCallEventSchema, ContractViolation, DispatchResultSchema,
  parseContract, VoiceRequestSchema,
} from '../schemas';

const CALL = '11111111-1111-4111-8111-111111111111';
const request = {
  contractVersion: 1, tenantId: 'colaberry', brandSlug: 'colaberry', path: 'agent-tool', callType: 'callback',
  profileId: 'cory-outbound', recipientRef: 'lead:4821', idempotencyKey: 'callback:lead:4821:2026-11-24',
  purpose: 'callback requested', context: { leadName: 'Test' }, testMode: true,
};

describe('voice contracts', () => {
  it('accepts a valid VoiceRequest (happy path)', () => {
    expect(parseContract(VoiceRequestSchema, 'VoiceRequest', request)).toMatchObject({ path: 'agent-tool' });
  });

  it('rejects a raw phone number as recipientRef with a ContractViolation (failure path)', () => {
    for (const bad of ['+15555550123', '(555) 555-0123', '555.555.0123']) {
      expect(() => parseContract(VoiceRequestSchema, 'VoiceRequest', { ...request, recipientRef: bad })).toThrow(ContractViolation);
    }
  });

  it('rejects unknown fields (strict) and a wrong contract version', () => {
    expect(() => parseContract(VoiceRequestSchema, 'VoiceRequest', { ...request, prompt: 'say anything' })).toThrow(ContractViolation);
    expect(() => parseContract(VoiceRequestSchema, 'VoiceRequest', { ...request, contractVersion: 2 })).toThrow(ContractViolation);
  });

  it('ContractViolation carries a stable error class and the failing path (boundary)', () => {
    try {
      parseContract(VoiceRequestSchema, 'VoiceRequest', { ...request, idempotencyKey: 'short' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ContractViolation);
      expect((e as ContractViolation).errorClass).toBe('ContractViolation');
      expect((e as ContractViolation).issues.join(' ')).toMatch(/idempotencyKey/);
    }
  });

  it('AuthorizedDispatch requires E.164 and a bounded duration', () => {
    const base = { contractVersion: 1, callId: CALL, reservationId: CALL, engine: 'conversation_relay', routeId: 'r1', profileVersionId: 'v1',
      destinationE164: '+15555550123', fromNumberRef: 'num:idle-1', maxDurationSeconds: 180, testMode: true, authorizedAt: '2026-11-24T15:00:00.000Z' };
    expect(AuthorizedDispatchSchema.safeParse(base).success).toBe(true);
    expect(AuthorizedDispatchSchema.safeParse({ ...base, destinationE164: '5555550123' }).success).toBe(false);
    expect(AuthorizedDispatchSchema.safeParse({ ...base, maxDurationSeconds: 7200 }).success).toBe(false);
  });

  it('DispatchResult is a discriminated union and "unknown" is first-class', () => {
    expect(DispatchResultSchema.safeParse({ outcome: 'unknown', callId: CALL, errorClass: 'TimeoutError', detail: 'no response in 10s' }).success).toBe(true);
    expect(DispatchResultSchema.safeParse({ outcome: 'skipped', callId: CALL }).success).toBe(false);
  });

  it('CanonicalCallEvent validates source and state enums', () => {
    const e = { contractVersion: 1, eventKey: 'twilio:CAxxxx:ringing', callId: CALL, source: 'carrier', state: 'ringing', occurredAt: '2026-11-24T15:00:00.000Z' };
    expect(CanonicalCallEventSchema.safeParse(e).success).toBe(true);
    expect(CanonicalCallEventSchema.safeParse({ ...e, state: 'connected' }).success).toBe(false);
    expect(CanonicalCallEventSchema.safeParse({ ...e, source: 'browser' }).success).toBe(false);
  });

  it('parsing the same input twice yields equal results (idempotent)', () => {
    expect(parseContract(VoiceRequestSchema, 'VoiceRequest', request)).toEqual(parseContract(VoiceRequestSchema, 'VoiceRequest', request));
  });
});
