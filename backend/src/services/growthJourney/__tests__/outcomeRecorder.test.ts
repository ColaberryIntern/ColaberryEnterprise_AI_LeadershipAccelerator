import * as fs from 'fs';
import * as path from 'path';

const create = jest.fn();
const findOne = jest.fn();

jest.mock('../../../models', () => ({
  GrowthJourneyOutcome: {
    create: (...a: unknown[]) => create(...a),
    findOne: (...a: unknown[]) => findOne(...a),
  },
}));

import {
  OutcomeMetadataRejectedError,
  findAddressLikeValue,
  recordOutcome,
  type RecordOutcomeInput,
} from '../outcomes/outcomeRecorder';

/**
 * T401: the one outcome recorder.
 *
 * One `create`; a unique violation on `(source, source_ref)` is answered by
 * reading the existing row back (`replayed: true`); no update path exists —
 * asserted on the source as well as on the mock, because the append-only
 * guard in redactionAndFlags.test.ts is the cheap half of that proof and this
 * is the behavioural half.
 */

const uniqueViolation = () => Object.assign(new Error('duplicate key'), { name: 'SequelizeUniqueConstraintError' });
const pgUniqueViolation = () => Object.assign(new Error('duplicate key'), { parent: { code: '23505' } });

const input = (over: Partial<RecordOutcomeInput> = {}): RecordOutcomeInput => ({
  tenant_id: 'tenant-1',
  brand_id: 'brand-1',
  subject_ref: 'lead:42',
  lead_id: 42,
  outcome_type: 'meeting_booked',
  source: 'strategy_calls',
  source_ref: 'sc-7',
  occurred_at: new Date('2026-09-16T10:00:00Z'),
  ...over,
});

beforeEach(() => {
  create.mockReset();
  findOne.mockReset();
});

describe('recordOutcome — the first write', () => {
  it('creates exactly one row with every field mapped and the optional ones NULL', async () => {
    create.mockResolvedValue({ id: 'o-1' });
    const result = await recordOutcome(input());
    expect(result).toEqual({ row: { id: 'o-1' }, replayed: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toEqual({
      tenant_id: 'tenant-1',
      brand_id: 'brand-1',
      subject_ref: 'lead:42',
      lead_id: 42,
      handoff_id: null,
      decision_id: null,
      outcome_type: 'meeting_booked',
      source: 'strategy_calls',
      source_ref: 'sc-7',
      occurred_at: new Date('2026-09-16T10:00:00Z'),
      value: null,
      metadata: null,
    });
    expect(findOne).not.toHaveBeenCalled();
  });

  it('carries the handoff, decision, value and metadata when given', async () => {
    create.mockResolvedValue({ id: 'o-2' });
    await recordOutcome(input({ handoff_id: 'h-1', decision_id: 'd-1', value: 1500, metadata: { stage: 'proposal_sent', ticket_count: 2 } }));
    expect(create.mock.calls[0][0]).toMatchObject({
      handoff_id: 'h-1',
      decision_id: 'd-1',
      value: 1500,
      metadata: { stage: 'proposal_sent', ticket_count: 2 },
    });
  });
});

describe('recordOutcome — the replay', () => {
  it('twice with one source_ref: one create, the second call lands on the existing row as replayed', async () => {
    create.mockResolvedValueOnce({ id: 'o-1' }).mockRejectedValueOnce(uniqueViolation());
    findOne.mockResolvedValue({ id: 'o-1' });

    const first = await recordOutcome(input());
    const second = await recordOutcome(input());

    expect(first).toEqual({ row: { id: 'o-1' }, replayed: false });
    expect(second).toEqual({ row: { id: 'o-1' }, replayed: true });
    expect(create).toHaveBeenCalledTimes(2);
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0]).toEqual({ where: { source: 'strategy_calls', source_ref: 'sc-7' } });
  });

  it("recognises pg's raw 23505 as well as Sequelize's wrapped error", async () => {
    create.mockRejectedValue(pgUniqueViolation());
    findOne.mockResolvedValue({ id: 'o-1' });
    expect(await recordOutcome(input())).toEqual({ row: { id: 'o-1' }, replayed: true });
  });

  it('rethrows any other error untouched', async () => {
    const boom = Object.assign(new Error('connection reset'), { name: 'SequelizeConnectionError' });
    create.mockRejectedValue(boom);
    await expect(recordOutcome(input())).rejects.toBe(boom);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rethrows the unique violation if the row it names cannot be read back', async () => {
    // A violation with no row behind it is not a replay; pretending it was would
    // hand the caller a `replayed: true` for an outcome that does not exist.
    const err = uniqueViolation();
    create.mockRejectedValue(err);
    findOne.mockResolvedValue(null);
    await expect(recordOutcome(input())).rejects.toBe(err);
  });
});

describe('recordOutcome — no address in the metadata', () => {
  it('refuses a metadata whose string value carries an @, before any create', async () => {
    await expect(
      recordOutcome(input({ metadata: { note: 'call back someone@example.com' } })),
    ).rejects.toBeInstanceOf(OutcomeMetadataRejectedError);
    expect(create).not.toHaveBeenCalled();
  });

  it('names the path of the offending value, nested or in an array, and tags the error class', async () => {
    const err = await recordOutcome(input({ metadata: { contacts: [{ ok: 1 }, { handle: 'x@y' }] } })).catch((e) => e);
    expect(err).toBeInstanceOf(OutcomeMetadataRejectedError);
    expect(err.path).toBe('metadata.contacts[1].handle');
    expect(err.error_class).toBe('ContractViolation');
  });

  it('findAddressLikeValue: ids, counts, stage names, timestamps and nulls pass; only a string with @ fails', () => {
    expect(findAddressLikeValue({ stage: 'enrolled', count: 3, at: '2026-09-16T10:00:00Z', ids: ['a', 'b'], none: null })).toBeNull();
    expect(findAddressLikeValue(null)).toBeNull();
    expect(findAddressLikeValue('plain')).toBeNull();
    expect(findAddressLikeValue('a@b', 'metadata')).toBe('metadata');
    expect(findAddressLikeValue({ a: { b: ['c', 'd@e'] } }, 'metadata')).toBe('metadata.a.b[1]');
  });
});

describe('the recorder has no update path', () => {
  it('the source never calls .update( or .destroy( and never imports the mutable handoff model', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'outcomes', 'outcomeRecorder.ts'), 'utf8');
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.destroy\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/GrowthJourneyHandoff\b/);
    // Non-vacuity: it really is the file that names the model and creates rows.
    expect(src).toMatch(/GrowthJourneyOutcome\.create\(/);
    expect(src).toMatch(/GrowthJourneyOutcome\.findOne\(/);
  });
});
