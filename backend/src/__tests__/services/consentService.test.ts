import ConsentRecord from '../../models/ConsentRecord';
import { getSetting } from '../../services/settingsService';
import { emitAiEvent } from '../../services/aiEventService';
import {
  evaluateConsent,
  assertConsentForSend,
  normalizeEmail,
  normalizePhone,
  subjectCandidates,
  getConsentMode,
  recordConsent,
  revokeConsent,
} from '../../services/consentService';

jest.mock('../../models/ConsentRecord', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));
jest.mock('../../services/settingsService', () => ({ getSetting: jest.fn() }));
jest.mock('../../services/aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

const findOne = ConsentRecord.findOne as unknown as jest.Mock;
const create = ConsentRecord.create as unknown as jest.Mock;
const mockSetting = getSetting as unknown as jest.Mock;
const mockEmit = emitAiEvent as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findOne.mockResolvedValue(null);
  create.mockResolvedValue({ id: 'row-1' });
  mockSetting.mockResolvedValue('shadow');
});

describe('consent normalization + candidates', () => {
  it('normalizes email + phone, drops junk', () => {
    expect(normalizeEmail('  Ali@Colaberry.COM ')).toBe('ali@colaberry.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizePhone('(972) 555-1234')).toBe('+9725551234');
    expect(normalizePhone('123')).toBeNull();
  });

  it('builds channel-appropriate subject candidates (+ lead fallback)', () => {
    const email = subjectCandidates({ channel: 'email', leadId: 7, email: 'A@b.com', phone: '9725551234' });
    expect(email).toEqual([
      { subject_type: 'email', subject_id: 'a@b.com' },
      { subject_type: 'lead', subject_id: '7' },
    ]);
    const voice = subjectCandidates({ channel: 'voice', leadId: 7, email: 'A@b.com', phone: '9725551234' });
    expect(voice).toEqual([
      { subject_type: 'phone', subject_id: '+9725551234' },
      { subject_type: 'lead', subject_id: '7' },
    ]);
  });
});

describe('evaluateConsent policy (§4)', () => {
  it('voice with NO record → block (TCPA fail-closed verdict)', async () => {
    const d = await evaluateConsent({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(d.verdict).toBe('block');
    expect(d.reason).toBe('no_express_consent');
  });

  it('voice with express_written grant → allow', async () => {
    findOne.mockResolvedValue({ status: 'granted', basis: 'express_written' });
    const d = await evaluateConsent({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(d.verdict).toBe('allow');
    expect(d.basis).toBe('express_written');
  });

  it('voice with only a prior_relationship grant → block (not express)', async () => {
    findOne.mockResolvedValue({ status: 'granted', basis: 'prior_relationship' });
    const d = await evaluateConsent({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(d.verdict).toBe('block');
  });

  it('sms with double_opt_in grant → allow', async () => {
    findOne.mockResolvedValue({ status: 'granted', basis: 'double_opt_in' });
    const d = await evaluateConsent({ channel: 'sms', leadId: 1, phone: '9725551234' });
    expect(d.verdict).toBe('allow');
  });

  it('US/unknown cold B2B email with no record → allow on CAN-SPAM opt-out', async () => {
    const d = await evaluateConsent({ channel: 'email', leadId: 1, email: 'lead@co.com' });
    expect(d.verdict).toBe('allow');
    expect(d.basis).toBe('cold_b2b_opt_out');
    expect(d.reason).toBe('can_spam_opt_out');
  });

  it('EU email with no grant → block (GDPR lawful basis required)', async () => {
    const d = await evaluateConsent({ channel: 'email', leadId: 1, email: 'lead@co.eu', jurisdiction: 'EU' });
    expect(d.verdict).toBe('block');
    expect(d.reason).toBe('eu_no_consent');
  });

  it('granted email → allow regardless of jurisdiction', async () => {
    findOne.mockResolvedValue({ status: 'granted', basis: 'opt_in_form' });
    const d = await evaluateConsent({ channel: 'email', leadId: 1, email: 'lead@co.eu', jurisdiction: 'EU' });
    expect(d.verdict).toBe('allow');
  });

  it('a revoked record blocks every channel', async () => {
    findOne.mockResolvedValue({ status: 'revoked', basis: null });
    const email = await evaluateConsent({ channel: 'email', leadId: 1, email: 'x@y.com' });
    const voice = await evaluateConsent({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(email.verdict).toBe('block');
    expect(email.reason).toBe('revoked');
    expect(voice.verdict).toBe('block');
  });
});

describe('assertConsentForSend gate (mode-aware, shadow-first, fail-open)', () => {
  it('shadow mode: records the would-block verdict but does NOT enforce', async () => {
    mockSetting.mockResolvedValue('shadow');
    const r = await assertConsentForSend({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(r.verdict).toBe('block');
    expect(r.enforced).toBe(false); // shadow never enforces
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const meta = mockEmit.mock.calls[0][0].metadata;
    expect(meta.would_block).toBe(true);
    expect(meta.mode).toBe('shadow');
    expect(mockEmit.mock.calls[0][0].outcome).toBe('success'); // send proceeds in shadow
  });

  it('enforce mode: voice without consent is enforced=true + outcome blocked', async () => {
    mockSetting.mockResolvedValue('enforce');
    const r = await assertConsentForSend({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(r.verdict).toBe('block');
    expect(r.enforced).toBe(true);
    expect(mockEmit.mock.calls[0][0].outcome).toBe('blocked');
  });

  it('off mode: gate disabled, nothing emitted, always allows', async () => {
    mockSetting.mockResolvedValue('off');
    const r = await assertConsentForSend({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(r.enforced).toBe(false);
    expect(r.reason).toBe('gate_off');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('FAILS OPEN: a consent-system error never blocks a live send', async () => {
    mockSetting.mockResolvedValue('enforce');
    findOne.mockRejectedValue(new Error('db down'));
    const r = await assertConsentForSend({ channel: 'voice', leadId: 1, phone: '9725551234' });
    expect(r.enforced).toBe(false);
    expect(r.verdict).toBe('allow');
    expect(r.reason).toBe('consent_check_error');
  });

  it('getConsentMode defaults to shadow for unknown/blank values', async () => {
    mockSetting.mockResolvedValue('garbage');
    expect(await getConsentMode()).toBe('shadow');
    mockSetting.mockResolvedValue('enforce');
    expect(await getConsentMode()).toBe('enforce');
  });
});

describe('consent capture API (Phase 2 — recordConsent / revokeConsent)', () => {
  it('recordConsent normalizes an email subject id and defaults status to granted', async () => {
    await recordConsent({ subjectType: 'email', subjectId: '  Lead@CO.com ', channel: 'email', basis: 'opt_in_form', source: 'web_form' });
    expect(create).toHaveBeenCalledTimes(1);
    const row = create.mock.calls[0][0];
    expect(row.subject_id).toBe('lead@co.com'); // normalized
    expect(row.status).toBe('granted'); // default
    expect(row.basis).toBe('opt_in_form');
  });

  it('recordConsent is swallow-safe — a DB error returns null, never throws', async () => {
    create.mockRejectedValue(new Error('insert failed'));
    const r = await recordConsent({ subjectType: 'lead', subjectId: '5', channel: 'sms', source: 'x' });
    expect(r).toBeNull();
  });

  it('revokeConsent with a channel writes one revoked row', async () => {
    await revokeConsent({ subjectType: 'lead', subjectId: '5', channel: 'sms', source: 'sms_stop_keyword' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].status).toBe('revoked');
    expect(create.mock.calls[0][0].channel).toBe('sms');
  });

  it('revokeConsent without a channel revokes all three channels', async () => {
    await revokeConsent({ subjectType: 'lead', subjectId: '5', source: 'unsubscribe:admin' });
    expect(create).toHaveBeenCalledTimes(3);
    const channels = create.mock.calls.map((c) => c[0].channel).sort();
    expect(channels).toEqual(['email', 'sms', 'voice']);
    expect(create.mock.calls.every((c) => c[0].status === 'revoked')).toBe(true);
  });
});
