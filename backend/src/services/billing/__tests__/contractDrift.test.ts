jest.mock('../../paysimpleService', () => ({ apiRequest: jest.fn() }));
jest.mock('../../publicEventsService', () => ({ connectCcpp: jest.fn() }));

import { apiRequest } from '../../paysimpleService';
import { connectCcpp } from '../../publicEventsService';
import { findContractDrift, renderDrift, type CcppContract, type GatewaySchedule } from '../contractDrift';
import { ACTIVE_CONTRACTS_QUERY, readActiveContracts, readSchedules } from '../contractDriftSource';

const NOW = new Date('2026-11-24T18:00:00Z');
const contract = (o: Partial<CcppContract> = {}): CcppContract => ({
  id: 1, customerId: '10', name: 'A Person', amount: 589.96, totalPayments: 24,
  startDate: new Date('2026-12-01'), endDate: new Date('2028-11-01'), ...o,
});
const schedule = (o: Partial<GatewaySchedule> = {}): GatewaySchedule => ({
  id: 's1', customerId: '10', name: 'A Person', amount: 589.96, status: 'Active',
  frequency: 'SpecificDayofMonth', endDate: new Date('2028-11-15'), ...o,
});
const kinds = (c: CcppContract[], s: GatewaySchedule[]): string[] => findContractDrift(c, s, NOW).rows.map((r) => r.kind);

describe('findContractDrift', () => {
  it('reports nothing when the terms agree', () => {
    expect(findContractDrift([contract()], [schedule()], NOW)).toMatchObject({ rows: [], agreeing: 1 });
  });

  it('flags the $500 x 97 placeholder, and only that exact pair', () => {
    expect(kinds([contract({ amount: 500, totalPayments: 97 })], [schedule()])).toEqual(['placeholder_terms']);
    expect(kinds([contract({ amount: 500, totalPayments: 24 })], [schedule()])).toEqual(['amount_mismatch']);
  });

  it('flags a one cent difference, and a contract with no amount', () => {
    expect(kinds([contract({ amount: 589.97 })], [schedule()])).toEqual(['amount_mismatch']);
    expect(kinds([contract({ amount: null })], [schedule()])).toEqual(['amount_mismatch']);
  });

  it('does not flag floating point noise', () => {
    expect(kinds([contract({ amount: 0.1 + 0.2 })], [schedule({ amount: 0.3 })])).toEqual([]);
  });

  it('allows 31 days between end dates and flags the 32nd', () => {
    expect(kinds([contract()], [schedule({ endDate: new Date('2028-12-02') })])).toEqual([]);
    expect(kinds([contract()], [schedule({ endDate: new Date('2028-12-03') })])).toEqual(['end_date_mismatch']);
  });

  it('flags a schedule with no end date when the contract has one', () => {
    expect(kinds([contract()], [schedule({ endDate: null })])).toEqual(['end_date_mismatch']);
  });

  it('flags two active schedules for one customer, and ignores one that can no longer charge', () => {
    expect(kinds([contract()], [schedule(), schedule({ id: 's2', amount: 149 })])).toEqual(['two_active_schedules']);
    expect(kinds([contract()], [schedule(), schedule({ id: 's2', amount: 149, status: 'Expired' })])).toEqual([]);
  });

  it('does not guess which of several contracts a schedule belongs to', () => {
    expect(kinds([contract(), contract({ id: 2, amount: 100 })], [schedule()])).toEqual(['several_contracts']);
  });

  it('flags an in-term contract nobody is charging, not one past its end', () => {
    expect(kinds([contract()], [])).toEqual(['contract_without_schedule']);
    expect(kinds([contract()], [schedule({ status: 'Suspended' })])).toEqual(['contract_without_schedule']);
    expect(kinds([contract({ endDate: new Date('2024-01-01') })], [])).toEqual([]);
  });

  it('flags a schedule with no contract, but not an app membership price', () => {
    expect(kinds([], [schedule()])).toEqual(['schedule_without_contract']);
    expect(kinds([], [schedule({ amount: 199 })])).toEqual([]);
  });

  it('never matches contracts that have no PaySimple customer to each other', () => {
    expect(kinds([contract({ customerId: null }), contract({ id: 2, customerId: null })], [])).toEqual([]);
  });

  it('handles empty input and gives the same answer twice', () => {
    expect(findContractDrift([], [], NOW).rows).toEqual([]);
    const args = [[contract({ amount: 1 })], [schedule()], NOW] as const;
    expect(findContractDrift(...args)).toEqual(findContractDrift(...args));
  });

  it('renders every row it found', () => {
    const r = findContractDrift([contract({ amount: 1 })], [schedule()], NOW);
    expect(renderDrift(r)).toContain('Amount differs: 1');
    expect(renderDrift(r)).toContain('CCPP $1.00, PaySimple $589.96');
  });
});

describe('contractDriftSource', () => {
  const api = apiRequest as jest.Mock;
  const raw = (id: number) => ({ Id: id, CustomerId: 5, CustomerFirstName: 'A', CustomerLastName: 'B', PaymentAmount: 10, ScheduleStatus: 'Active', EndDate: '0001-01-01T07:00:00Z' });
  const page = (n: number, from = 0) => Array.from({ length: n }, (_, i) => raw(from + i));
  beforeEach(() => jest.resetAllMocks());

  it('reads every page, uses GET only, and treats year 1 as no date', async () => {
    api.mockResolvedValueOnce(page(200)).mockResolvedValueOnce(page(3, 200));
    const rows = await readSchedules();
    expect(rows).toHaveLength(203);
    expect(rows[0].endDate).toBeNull();
    expect(api.mock.calls.every((c) => c[0] === 'GET')).toBe(true);
  });

  it('throws rather than report a partial list', async () => {
    api.mockImplementation(async () => page(200));
    await expect(readSchedules()).rejects.toThrow('partial list');
  });

  it('throws when PaySimple fails part way, or answers in the wrong shape', async () => {
    api.mockResolvedValueOnce(page(200)).mockRejectedValueOnce(new Error('503'));
    await expect(readSchedules()).rejects.toThrow('503');
    api.mockResolvedValueOnce({ nope: true });
    await expect(readSchedules()).rejects.toThrow('unexpected shape');
    api.mockResolvedValueOnce([{ ...raw(1), PaymentAmount: undefined }]);
    await expect(readSchedules()).rejects.toThrow('missing a field');
  });

  it('closes the CCPP connection even when the query fails', async () => {
    const close = jest.fn();
    (connectCcpp as jest.Mock).mockResolvedValue({ close, request: () => ({ query: jest.fn().mockRejectedValue(new Error('down')) }) });
    await expect(readActiveContracts()).rejects.toThrow('down');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reads a zero customer id as no customer', async () => {
    (connectCcpp as jest.Mock).mockResolvedValue({ close: jest.fn(), request: () => ({ query: async () => ({ recordset: [{ SMIC_ID: 1, PS_CustomerID: 0 }] }) }) });
    expect((await readActiveContracts())[0].customerId).toBeNull();
  });

  it('only ever selects', () => {
    expect(ACTIVE_CONTRACTS_QUERY).not.toMatch(/\b(update|insert|delete|merge|exec)\b/i);
  });
});
