/**
 * C122 — "Have someone call me": a callback_requests row the admissions team sees, idempotent per enrollment and
 * Central day, with the missing and invalid phone paths, and an honest failure.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: {
    query: (...a: unknown[]) => mockQuery(...a),
    transaction: async (fn: (t: unknown) => unknown) => fn({ id: 'tx' }),
  },
}));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/Lead', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/Visitor', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../../models/CallbackRequest', () => ({ __esModule: true, default: { findAll: jest.fn(), create: jest.fn() } }));

import Enrollment from '../../../models/Enrollment';
import Lead from '../../../models/Lead';
import Visitor from '../../../models/Visitor';
import CallbackRequest from '../../../models/CallbackRequest';
import { requestPortalCallback, normalizePhone, centralDay } from '../mayaCallbackService';
import { callbackResultText } from '../mayaPortalTools';

const ENR = 'enr-1';
const NOW = new Date('2026-11-06T15:00:00Z'); // 9:00 AM Central
const findByPk = (Enrollment as any).findByPk as jest.Mock;
const findOrCreate = (Visitor as any).findOrCreate as jest.Mock;
const findAll = (CallbackRequest as any).findAll as jest.Mock;
const create = (CallbackRequest as any).create as jest.Mock;
const leadFindOne = (Lead as any).findOne as jest.Mock;
let visitor: { id: string; metadata: Record<string, unknown> | null; update: jest.Mock };
let rows: Array<{ id: string; request_timestamp: Date }>;

beforeEach(() => {
  jest.clearAllMocks();
  rows = [];
  visitor = { id: 'vis-1', metadata: null, update: jest.fn(async function (this: void, v: { metadata: Record<string, unknown> }) { visitor.metadata = v.metadata; }) };
  findByPk.mockResolvedValue({ id: ENR, full_name: 'Pat Lee', email: 'Pat@Example.com', phone: '(214) 555-0100' });
  findOrCreate.mockImplementation(async () => [visitor, true]);
  findAll.mockImplementation(async () => rows.slice());
  create.mockImplementation(async (v: Record<string, unknown>) => { const r = { id: `cb-${rows.length + 1}`, request_timestamp: v.request_timestamp as Date }; rows.push(r); return r; });
  leadFindOne.mockResolvedValue({ id: 42 });
  mockQuery.mockResolvedValue([]);
});

describe('normalizePhone', () => {
  it.each([
    ['(214) 555-0100', '+12145550100'],
    ['214.555.0100', '+12145550100'],
    ['1 214 555 0100', '+12145550100'],
    ['+44 20 7946 0958', '+442079460958'],
    ['555-0100', null],
    ['call me maybe', null],
    ['', null],
    ['2145550100; DROP TABLE', null],
    ['12345678901234567', null],
  ])('%s -> %s', (raw, want) => {
    expect(normalizePhone(raw)).toBe(want);
  });
  it('non-strings are not phones', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(2145550100)).toBeNull();
  });
});

describe('requestPortalCallback', () => {
  it('inserts one pending row for the learner, with the phone on file, their lead, and an advisory lock on enrollment+day', async () => {
    const r = await requestPortalCallback({ enrollmentId: ENR }, NOW);
    expect(r).toEqual({ status: 'requested', callbackId: 'cb-1', phoneLast4: '0100' });
    expect(mockQuery.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(mockQuery.mock.calls[0][1].replacements.key).toBe(`maya_portal_callback:${ENR}:2026-11-06`);
    expect(findOrCreate.mock.calls[0][0].where).toEqual({ fingerprint: `portal-enrollment:${ENR}` });
    expect(leadFindOne.mock.calls[0][0].where).toEqual({ email: 'pat@example.com' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ visitor_id: 'vis-1', lead_id: 42, callback_status: 'pending' });
    expect(create.mock.calls[0][0].agent_notes).toContain('+12145550100');
    expect(visitor.metadata).toMatchObject({ source: 'portal_maya_dm', enrollment_id: ENR, callback_phone: '+12145550100' });
  });

  it('idempotent: a second request the same Central day returns the first row and inserts nothing', async () => {
    await requestPortalCallback({ enrollmentId: ENR }, NOW);
    const again = await requestPortalCallback({ enrollmentId: ENR }, new Date(NOW.getTime() + 3600_000));
    expect(again).toEqual({ status: 'already_requested', callbackId: 'cb-1', phoneLast4: '0100' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('the next Central day is a new request', async () => {
    await requestPortalCallback({ enrollmentId: ENR }, NOW);
    const tomorrow = await requestPortalCallback({ enrollmentId: ENR }, new Date('2026-11-07T15:00:00Z'));
    expect(tomorrow.status).toBe('requested');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('no phone on file and none given: needs_phone, nothing written', async () => {
    findByPk.mockResolvedValue({ id: ENR, full_name: 'Pat Lee', email: 'p@e.com', phone: null });
    await expect(requestPortalCallback({ enrollmentId: ENR }, NOW)).resolves.toEqual({ status: 'needs_phone' });
    expect(create).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('the phone the learner typed is used, validated', async () => {
    findByPk.mockResolvedValue({ id: ENR, full_name: 'Pat Lee', email: 'p@e.com', phone: null });
    const r = await requestPortalCallback({ enrollmentId: ENR, phone: '469-555-0199', preferredTime: 'after 3pm' }, NOW);
    expect(r).toMatchObject({ status: 'requested', phoneLast4: '0199' });
    expect(create.mock.calls[0][0].agent_notes).toContain('Preferred time: after 3pm');
  });

  it('a typed value that is not a phone: invalid_phone, nothing written', async () => {
    await expect(requestPortalCallback({ enrollmentId: ENR, phone: 'tomorrow' }, NOW)).resolves.toEqual({ status: 'invalid_phone' });
    expect(create).not.toHaveBeenCalled();
  });

  it('no such enrollment: not_found', async () => {
    findByPk.mockResolvedValue(null);
    await expect(requestPortalCallback({ enrollmentId: 'nope' }, NOW)).resolves.toEqual({ status: 'not_found' });
  });

  it('no matching lead: the row still lands with lead_id null', async () => {
    leadFindOne.mockResolvedValue(null);
    await requestPortalCallback({ enrollmentId: ENR }, NOW);
    expect(create.mock.calls[0][0].lead_id).toBeNull();
  });

  it('a database failure is an answer (failed + error class), logged, never thrown', async () => {
    create.mockRejectedValue(Object.assign(new Error('relation does not exist'), { name: 'SequelizeDatabaseError' }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(requestPortalCallback({ enrollmentId: ENR }, NOW)).resolves.toEqual({ status: 'failed', errorClass: 'SequelizeDatabaseError' });
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'portal_callback_failed', error_class: 'SequelizeDatabaseError' });
    warn.mockRestore();
  });
});

describe('what Maya is told (she can only confirm what happened)', () => {
  it('recorded only on requested / already_requested', () => {
    expect(JSON.parse(callbackResultText({ status: 'requested', callbackId: 'x', phoneLast4: '0100' })).recorded).toBe(true);
    expect(JSON.parse(callbackResultText({ status: 'already_requested', callbackId: 'x', phoneLast4: null })).recorded).toBe(true);
    for (const s of ['needs_phone', 'invalid_phone', 'not_found'] as const) expect(JSON.parse(callbackResultText({ status: s })).recorded).toBe(false);
    expect(JSON.parse(callbackResultText({ status: 'failed', errorClass: 'X' })).recorded).toBe(false);
  });
  it('centralDay uses Central, not UTC (11:30 PM Central is still the same day)', () => {
    expect(centralDay(new Date('2026-11-07T05:30:00Z'))).toBe('2026-11-06');
  });
});
