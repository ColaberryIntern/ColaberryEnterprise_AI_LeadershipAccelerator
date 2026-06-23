/**
 * rule_id persistence guard tests.
 *
 * Regression coverage for the production bug where classification crashed with
 * `invalid input syntax for type uuid: "cora_0c"` — the rule_id UUID column
 * rejected the hard rule's semantic string id, so support@ mail never reached
 * Cora. toPersistableRuleId must drop non-UUID ids to null and pass UUIDs through.
 */
import { isUuid, toPersistableRuleId } from '../ruleIdPersistence';

const UUID = '7cb34079-4a2a-487c-80fb-bc6fce105a0d'; // a real stuck-email id from prod logs

describe('isUuid', () => {
  it('accepts canonical UUIDs (lower and upper case)', () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid(UUID.toUpperCase())).toBe(true);
  });

  it('rejects the cora_0c rule name and other non-UUID strings', () => {
    expect(isUuid('cora_0c')).toBe(false);
    expect(isUuid('vip_sender')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('rejects null, undefined, and non-strings', () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123 as unknown)).toBe(false);
  });

  it('boundary: rejects a malformed/partial UUID', () => {
    expect(isUuid('7cb34079-4a2a-487c-80fb')).toBe(false); // too short
    expect(isUuid(UUID + 'x')).toBe(false); // trailing char
    expect(isUuid('zzzzzzzz-4a2a-487c-80fb-bc6fce105a0d')).toBe(false); // non-hex
  });
});

describe('toPersistableRuleId', () => {
  it('passes a real UUID through unchanged (DB-driven rules)', () => {
    expect(toPersistableRuleId(UUID)).toBe(UUID);
  });

  it('drops cora_0c (and any string rule name) to null — the bug fix', () => {
    expect(toPersistableRuleId('cora_0c')).toBeNull();
    expect(toPersistableRuleId('vip_sender')).toBeNull();
  });

  it('maps null/undefined to null', () => {
    expect(toPersistableRuleId(null)).toBeNull();
    expect(toPersistableRuleId(undefined)).toBeNull();
  });

  it('idempotent: applying twice yields the same result', () => {
    expect(toPersistableRuleId(toPersistableRuleId('cora_0c'))).toBeNull();
    expect(toPersistableRuleId(toPersistableRuleId(UUID))).toBe(UUID);
  });
});
