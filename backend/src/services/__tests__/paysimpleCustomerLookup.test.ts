import { findCustomerByEmail, findOrCreateCustomer } from '../paysimpleService';

/**
 * Regression guard for the shared-customer-id contamination bug.
 *
 * Production behaviour (verified read-only against the live PaySimple account
 * on 2026-08-18): `GET /v4/customer?email=<anything>` IGNORES the email filter
 * and returns the first page of the entire merchant account, ordered by Id.
 * Every email therefore yields the same `results[0]` — customer 7095991
 * ("Victor Oragwu", a 2016 bootcamp customer, the oldest record in the account).
 *
 * The original implementation returned `results[0]` unconditionally, so
 * findOrCreateCustomer() never created anybody and handed back Victor Oragwu's
 * id for every enrollee. That id was then written onto subscription rows,
 * mapping four different people's subscriptions onto one stranger's PaySimple
 * customer record. Harmless while nothing auto-charges; a mis-billing the
 * moment recurring schedules are switched on.
 *
 * These tests reproduce that exact upstream shape. They fail against the
 * pre-guard implementation and pass against the current one.
 */

jest.mock('../../config/env', () => ({
  env: { paysimpleApiUser: 'u', paysimpleApiKey: 'k', paysimpleEnv: 'live', paymentMode: 'live' },
}));

/** The real shape: a full unfiltered page, requested email nowhere in it. */
const UNFILTERED_PAGE = [
  { Id: 7095991, FirstName: 'Victor', LastName: 'Oragwu', Email: 'voragwu@gmail.com', Company: '' },
  { Id: 7096081, FirstName: 'Jeremy', LastName: 'Ayugi', Email: 'jr.ayugi@gmail.com', Company: '' },
  { Id: 7096103, FirstName: 'Janice', LastName: 'Adizas', Email: 'jcadizas02@gmail.com', Company: '' },
];

describe('findCustomerByEmail — unfiltered-search contamination guard', () => {
  let fetchMock: jest.Mock;

  const mockOnce = (payload: unknown) => {
    fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => payload }) as any);
  };

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it('returns null when the requested email is absent from the result set', async () => {
    mockOnce(UNFILTERED_PAGE);
    // Pre-guard this returned Victor Oragwu (7095991) for a stranger's email.
    await expect(findCustomerByEmail('shefatrahman03@gmail.com')).resolves.toBeNull();
  });

  it('never returns a customer whose email differs from the one requested', async () => {
    mockOnce(UNFILTERED_PAGE);
    const found = await findCustomerByEmail('nzeribeikenna@gmail.com');
    expect(found?.Id).not.toBe(7095991);
    expect(found).toBeNull();
  });

  it('picks the genuine match even when it is not at index 0', async () => {
    const quincy = { Id: 9163455, FirstName: 'Quincy', LastName: 'Ninying', Email: 'qninying@gmail.com', Company: 'Corizon Health' };
    mockOnce([...UNFILTERED_PAGE, quincy]);
    const found = await findCustomerByEmail('qninying@gmail.com');
    expect(found?.Id).toBe(9163455);
  });

  it('matches case-insensitively and tolerates surrounding whitespace', async () => {
    mockOnce([{ Id: 5150, FirstName: 'Case', LastName: 'Test', Email: '  MiXeD@Example.COM ', Company: '' }]);
    const found = await findCustomerByEmail('mixed@example.com');
    expect(found?.Id).toBe(5150);
  });

  it('returns null on an empty result set rather than throwing', async () => {
    mockOnce([]);
    await expect(findCustomerByEmail('nobody@example.com')).resolves.toBeNull();
  });

  it('tolerates records with a missing Email field', async () => {
    mockOnce([{ Id: 1, FirstName: 'No', LastName: 'Email', Company: '' }]);
    await expect(findCustomerByEmail('someone@example.com')).resolves.toBeNull();
  });
});

describe('findOrCreateCustomer — must create rather than reuse a stranger', () => {
  let calls: Array<{ url: string; method: string; body?: any }>;

  beforeEach(() => {
    calls = [];
    (global as any).fetch = jest.fn(async (url: string, opts: any) => {
      calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : undefined });
      if (opts.method === 'GET') return { ok: true, json: async () => UNFILTERED_PAGE } as any;
      return {
        ok: true,
        json: async () => ({ Response: { Id: 43540425, FirstName: 'Shefat', LastName: 'Rahman', Email: 'shefatrahman03@gmail.com', Company: 'Colaberry' } }),
      } as any;
    });
  });

  it('creates a new customer when the search returns only unrelated people', async () => {
    const customer = await findOrCreateCustomer({
      fullName: 'Shefat Rahman',
      email: 'shefatrahman03@gmail.com',
      company: 'Colaberry',
    });

    // The whole point: we must NOT hand back the shared contaminated id.
    expect(customer.Id).not.toBe(7095991);
    expect(customer.Id).toBe(43540425);
    expect(customer.Email).toBe('shefatrahman03@gmail.com');

    const posted = calls.filter((c) => c.method === 'POST');
    expect(posted).toHaveLength(1);
    expect(posted[0].url).toBe('https://api.paysimple.com/v4/customer');
    expect(posted[0].body.Email).toBe('shefatrahman03@gmail.com');
  });
});
