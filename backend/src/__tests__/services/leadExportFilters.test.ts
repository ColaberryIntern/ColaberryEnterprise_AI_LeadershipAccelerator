/**
 * The Leads CSV export honouring the filters on screen.
 *
 * Kes, 2026-08-25: "the Export CSV option exports all data regardless of the
 * applied filters." Both halves were broken - the page sent no query params and
 * `generateLeadCsv()` took no arguments and built no `where` - so the download
 * was always the entire table (~24k rows) no matter what the operator had
 * selected.
 *
 * These tests pin the two properties that make that impossible to regress:
 * the table and the export derive their `where` from one shared builder, and
 * the export is bounded and reports when it has been cut short.
 */
import { Op } from 'sequelize';

const mockFindAll = jest.fn();

jest.mock('../../models/Lead', () => ({
  __esModule: true,
  default: { findAll: (...args: unknown[]) => mockFindAll(...args) },
}));
jest.mock('../../models/AdminUser', () => ({ __esModule: true, default: {} }));
jest.mock('../../models', () => ({ CampaignLead: {}, Activity: {} }));
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn(), literal: (s: string) => s },
}));

import {
  buildLeadWhere,
  generateLeadCsv,
  LEAD_EXPORT_MAX_ROWS,
  LEAD_CSV_FIELDS,
} from '../../services/leadService';

/** A lead row shaped like the Sequelize instance the mapper reads. */
function leadRow(i: number) {
  return {
    id: i,
    name: `Lead ${i}`,
    email: `lead${i}@example.com`,
    status: 'new',
    source: 'open_house',
    created_at: new Date('2026-08-25T00:00:00Z'),
    updated_at: new Date('2026-08-25T00:00:00Z'),
  };
}

beforeEach(() => {
  mockFindAll.mockReset();
  mockFindAll.mockResolvedValue([]);
});

describe('buildLeadWhere', () => {
  it('returns an empty where when nothing is filtered', () => {
    expect(buildLeadWhere({})).toEqual({});
  });

  it('applies status, score range and date range', () => {
    const where = buildLeadWhere({
      status: 'qualified',
      scoreMin: 40,
      scoreMax: 90,
      dateFrom: '2026-08-01',
      dateTo: '2026-08-25',
    });

    expect(where.status).toBe('qualified');
    expect(where.lead_score[Op.gte]).toBe(40);
    expect(where.lead_score[Op.lte]).toBe(90);
    expect(where.created_at[Op.gte]).toEqual(new Date('2026-08-01'));
    // dateTo is inclusive of the whole day, not midnight.
    expect(where.created_at[Op.lte]).toEqual(new Date('2026-08-25T23:59:59.999Z'));
  });

  it('expands a website group key into the raw source values it covers', () => {
    const where = buildLeadWhere({ website: 'open_house' });
    expect(where.source[Op.in]).toEqual(expect.arrayContaining(['open_house']));
  });

  it('matches nothing when every website key is unrecognised', () => {
    // The safe direction for a bad query string: an unknown key must not widen
    // the result set to the whole table.
    const where = buildLeadWhere({ website: 'not_a_real_website' });
    expect(where.id).toEqual({ [Op.is]: null });
  });

  it('reads temperature as a declared field, not through `as any`', () => {
    expect(buildLeadWhere({ temperature: 'hot' }).lead_temperature).toBe('hot');
  });

  it('searches name, email and company together', () => {
    const where = buildLeadWhere({ search: 'acme' });
    expect(where[Op.or]).toEqual([
      { name: { [Op.iLike]: '%acme%' } },
      { email: { [Op.iLike]: '%acme%' } },
      { company: { [Op.iLike]: '%acme%' } },
    ]);
  });
});

describe('generateLeadCsv', () => {
  it('passes the filtered where to the query instead of selecting everything', async () => {
    await generateLeadCsv({ status: 'qualified', website: 'open_house' });

    expect(mockFindAll).toHaveBeenCalledTimes(1);
    const opts = mockFindAll.mock.calls[0][0];
    expect(opts.where).toEqual(buildLeadWhere({ status: 'qualified', website: 'open_house' }));
  });

  it('builds the same where the table would use for the same filters', async () => {
    // The regression itself: list and export must not diverge.
    const filters = { status: 'new' as const, temperature: 'hot', search: 'acme' };
    await generateLeadCsv(filters);
    expect(mockFindAll.mock.calls[0][0].where).toEqual(buildLeadWhere(filters));
  });

  it('returns a header-only CSV when no lead matches', async () => {
    // json2csv throws on an empty array unless the fields are pinned. Once the
    // export started filtering, "nothing matched" became an ordinary outcome,
    // so this must not be a 500.
    mockFindAll.mockResolvedValue([]);

    const { csv, rowCount, truncated } = await generateLeadCsv({ status: 'lost' });

    expect(rowCount).toBe(0);
    expect(truncated).toBe(false);
    expect(csv.split('\n')).toHaveLength(1);
    for (const field of LEAD_CSV_FIELDS) {
      expect(csv).toContain(`"${field}"`);
    }
  });

  it('bounds the query rather than reading the whole table', async () => {
    await generateLeadCsv({});
    expect(mockFindAll.mock.calls[0][0].limit).toBe(LEAD_EXPORT_MAX_ROWS + 1);
  });

  it('reports truncation instead of silently trimming', async () => {
    // One row over the cap is what makes "there was more" detectable.
    mockFindAll.mockResolvedValue(
      Array.from({ length: LEAD_EXPORT_MAX_ROWS + 1 }, (_, i) => leadRow(i))
    );

    const { rowCount, truncated } = await generateLeadCsv({});

    expect(truncated).toBe(true);
    expect(rowCount).toBe(LEAD_EXPORT_MAX_ROWS);
  });

  it('does not flag truncation when the result lands exactly on the cap', async () => {
    mockFindAll.mockResolvedValue(
      Array.from({ length: LEAD_EXPORT_MAX_ROWS }, (_, i) => leadRow(i))
    );

    const { rowCount, truncated } = await generateLeadCsv({});

    expect(truncated).toBe(false);
    expect(rowCount).toBe(LEAD_EXPORT_MAX_ROWS);
  });
});
