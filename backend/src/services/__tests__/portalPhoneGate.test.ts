/**
 * PH1 - the portal's blocking "Add your phone" step (Ali, 2026-11-19).
 *
 * What these pin:
 *   1. The gate SHOWS for a learner with no usable phone anywhere on file, and NOT for one who has
 *      a number on the enrollment OR on the linked lead (phone storage is split across the two).
 *   2. Staff and an admin's read-only "View as" session are never required to add one.
 *   3. Saving writes the enrollment, fills the lead only when it has none, and records consent
 *      ONLY from a tick: a number with no tick writes no consent record at all.
 *
 * `recordConsent` is mocked and everything above it is real, so "no consent record" is read off
 * the ledger write itself rather than inferred from a helper call.
 */

const enrollmentFindByPk = jest.fn();
const leadFindByPk = jest.fn();
const leadFindOne = jest.fn();
const isStaffEnrollment = jest.fn();
const recordConsentMock = jest.fn();

jest.mock('../../models', () => ({
  Enrollment: { findByPk: (...a: unknown[]) => enrollmentFindByPk(...a) },
}));
jest.mock('../../models/Lead', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: unknown[]) => leadFindByPk(...a),
    findOne: (...a: unknown[]) => leadFindOne(...a),
  },
}));
jest.mock('../access/staffAccess', () => ({
  isStaffEnrollment: (...a: unknown[]) => isStaffEnrollment(...a),
}));
jest.mock('../consentService', () => {
  const actual = jest.requireActual('../consentService');
  return { ...actual, recordConsent: (...a: unknown[]) => recordConsentMock(...a) };
});

import { getPhoneGateStatus, savePortalPhone, enrollmentHasPhone } from '../portalPhoneGate';

const GOOD = '(214) 555-0100';

function enrollment(fields: Record<string, unknown>) {
  const row: Record<string, unknown> = { id: 'e1', email: 'maya@example.com', lead_id: null, phone: null, ...fields };
  row.update = jest.fn(async (patch: Record<string, unknown>) => Object.assign(row, patch));
  return row;
}

function lead(fields: Record<string, unknown>) {
  const row: Record<string, unknown> = { id: 7, phone: null, ...fields };
  row.update = jest.fn(async (patch: Record<string, unknown>) => Object.assign(row, patch));
  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  isStaffEnrollment.mockResolvedValue(false);
  leadFindByPk.mockResolvedValue(null);
  leadFindOne.mockResolvedValue(null);
  recordConsentMock.mockResolvedValue({ id: 'c1' });
});

describe('who sees the gate', () => {
  it('SHOWS for a learner with no phone on the enrollment and no linked lead phone', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({}));
    await expect(getPhoneGateStatus('e1')).resolves.toEqual({ has_phone: false, required: true });
  });

  it('does NOT show when the enrollment has a phone', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({ phone: GOOD }));
    await expect(getPhoneGateStatus('e1')).resolves.toEqual({ has_phone: true, required: false });
  });

  it('does NOT show when only the linked lead has the phone (the portal signup wrote leads.phone only)', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({ lead_id: 7 }));
    leadFindByPk.mockResolvedValue(lead({ phone: GOOD }));
    await expect(getPhoneGateStatus('e1')).resolves.toEqual({ has_phone: true, required: false });
  });

  it('falls back to the lead with the same email when the enrollment has no lead_id', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({}));
    leadFindOne.mockResolvedValue(lead({ phone: GOOD }));
    await expect(enrollmentHasPhone('e1')).resolves.toBe(true);
  });

  it('treats a number under 10 digits as no phone, matching the signup rule', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({ phone: '555-0100' }));
    await expect(getPhoneGateStatus('e1')).resolves.toEqual({ has_phone: false, required: true });
  });

  it('never requires it of staff', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({}));
    isStaffEnrollment.mockResolvedValue(true);
    await expect(getPhoneGateStatus('e1')).resolves.toEqual({ has_phone: false, required: false });
  });

  it('never requires it of a read-only "View as" session', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({}));
    await expect(getPhoneGateStatus('e1', { readOnly: true })).resolves.toEqual({ has_phone: false, required: false });
    expect(isStaffEnrollment).not.toHaveBeenCalled();
  });
});

describe('saving the number', () => {
  it('refuses a missing or short number without writing anything', async () => {
    for (const phone of [undefined, '', '555-0100']) {
      const r = await savePortalPhone('e1', { phone });
      expect(r.ok).toBe(false);
    }
    expect(enrollmentFindByPk).not.toHaveBeenCalled();
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it('writes the enrollment, fills an empty lead phone, and writes NO consent without a tick', async () => {
    const e = enrollment({ lead_id: 7 });
    const l = lead({});
    enrollmentFindByPk.mockResolvedValue(e);
    leadFindByPk.mockResolvedValue(l);

    const r = await savePortalPhone('e1', { phone: GOOD });

    expect(r).toEqual({ ok: true, consent_records_written: 0 });
    expect(e.update).toHaveBeenCalledWith({ phone: GOOD });
    expect(l.update).toHaveBeenCalledWith({ phone: GOOD });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });

  it('does not overwrite a number the lead already carries', async () => {
    const l = lead({ phone: '(512) 555-0199' });
    enrollmentFindByPk.mockResolvedValue(enrollment({ lead_id: 7 }));
    leadFindByPk.mockResolvedValue(l);

    await savePortalPhone('e1', { phone: GOOD });
    expect(l.update).not.toHaveBeenCalled();
  });

  it('records voice and sms consent only when the box is ticked', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({}));
    const r = await savePortalPhone('e1', { phone: GOOD, phone_consent: true });
    expect(r).toEqual({ ok: true, consent_records_written: 2 });
    const channels = recordConsentMock.mock.calls.map((c) => c[0].channel).sort();
    expect(channels).toEqual(['sms', 'voice']);
  });

  it('an explicit false is the same as no tick: nothing recorded', async () => {
    enrollmentFindByPk.mockResolvedValue(enrollment({}));
    const r = await savePortalPhone('e1', { phone: GOOD, phone_consent: false });
    expect(r).toEqual({ ok: true, consent_records_written: 0 });
    expect(recordConsentMock).not.toHaveBeenCalled();
  });
});
