jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

import {
  recordOpenHouseRegistration, countOpenHouseRegistrations, listOpenHouseRegistrations,
} from '../openHouseRegistrationStore';
import { sequelize } from '../../config/database';

const query = sequelize.query as unknown as jest.Mock;
const sqlOf = (call = 0): string => String(query.mock.calls[call][0]);
const bindsOf = (call = 0): Record<string, unknown> => query.mock.calls[call][1].replacements;

describe('recordOpenHouseRegistration', () => {
  beforeEach(() => jest.clearAllMocks());

  it('declines on conflict rather than upserting, so a repeat keeps the first timestamp', async () => {
    query.mockResolvedValue([]);
    await recordOpenHouseRegistration({ eventId: '2004289439668', email: 'a@b.com', source: 'landing_page' });
    const sql = sqlOf();
    expect(sql).toContain('ON CONFLICT (event_id, email_lower) DO NOTHING');
    // An upsert here would rewrite created_at and lose when they actually signed up.
    expect(sql).not.toMatch(/DO UPDATE/i);
  });

  it('reports created:true with the new id when the row was inserted', async () => {
    query.mockResolvedValue([{ id: 'reg-1' }]);
    const out = await recordOpenHouseRegistration({ eventId: 'e1', email: 'a@b.com', source: 'landing_page' });
    expect(out).toEqual({ created: true, registration_id: 'reg-1' });
  });

  it('reports created:false for someone already on the list — a repeat is not an error', async () => {
    query.mockResolvedValue([]);
    const out = await recordOpenHouseRegistration({ eventId: 'e1', email: 'a@b.com', source: 'landing_page' });
    expect(out).toEqual({ created: false, registration_id: null });
  });

  it('normalizes the email so casing and padding cannot create a second row', async () => {
    query.mockResolvedValue([{ id: 'reg-1' }]);
    await recordOpenHouseRegistration({ eventId: 'e1', email: '  MiXeD@Case.COM  ', source: 's' });
    expect(bindsOf().email).toBe('mixed@case.com');
  });

  it('stores a blank name as null rather than an empty string', async () => {
    query.mockResolvedValue([{ id: 'reg-1' }]);
    await recordOpenHouseRegistration({ eventId: 'e1', email: 'a@b.com', name: '   ', source: 's' });
    expect(bindsOf().name).toBeNull();
  });

  it('binds values rather than interpolating them', async () => {
    query.mockResolvedValue([{ id: 'reg-1' }]);
    await recordOpenHouseRegistration({ eventId: "e1'; DROP TABLE leads;--", email: 'a@b.com', source: 's' });
    expect(sqlOf()).not.toContain('DROP TABLE');
    expect(bindsOf().eventId).toBe("e1'; DROP TABLE leads;--");
  });

  it('refuses to write a registration with no email or no event', async () => {
    await expect(recordOpenHouseRegistration({ eventId: 'e1', email: '  ', source: 's' })).rejects.toThrow(/email is required/);
    await expect(recordOpenHouseRegistration({ eventId: '', email: 'a@b.com', source: 's' })).rejects.toThrow(/eventId is required/);
    expect(query).not.toHaveBeenCalled();
  });

  it('defaults an absent source rather than writing null into a NOT NULL column', async () => {
    query.mockResolvedValue([{ id: 'reg-1' }]);
    await recordOpenHouseRegistration({ eventId: 'e1', email: 'a@b.com', source: '' });
    expect(bindsOf().source).toBe('unknown');
  });
});

describe('countOpenHouseRegistrations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('coerces the driver string count to a number', async () => {
    query.mockResolvedValue([{ n: '394' }]);
    await expect(countOpenHouseRegistrations('e1')).resolves.toBe(394);
  });

  it('answers zero rather than NaN when the count comes back empty', async () => {
    query.mockResolvedValue([]);
    await expect(countOpenHouseRegistrations('e1')).resolves.toBe(0);
  });
});

describe('listOpenHouseRegistrations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('caps an absurd limit instead of attempting an unbounded read', async () => {
    query.mockResolvedValue([]);
    await listOpenHouseRegistrations('e1', 10_000_000);
    expect(bindsOf().limit).toBe(5000);
  });

  it('floors a fractional limit and never drops below one', async () => {
    query.mockResolvedValue([]);
    await listOpenHouseRegistrations('e1', 0);
    expect(bindsOf().limit).toBe(1);
    jest.clearAllMocks();
    query.mockResolvedValue([]);
    await listOpenHouseRegistrations('e1', 2.7);
    expect(bindsOf().limit).toBe(2);
  });

  it('returns the newest registrations first', async () => {
    query.mockResolvedValue([]);
    await listOpenHouseRegistrations('e1');
    expect(sqlOf()).toContain('ORDER BY created_at DESC');
  });
});
