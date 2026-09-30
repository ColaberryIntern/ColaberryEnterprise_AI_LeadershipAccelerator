/**
 * The post-check must read the SELECT as rows. The first production boot on
 * 2026-09-16 destructured the [results, metadata] tuple and reported both
 * tables missing while they were present and in use.
 */
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { missingMilestoneLadderTables, MILESTONE_LADDER_TABLES } from '../ensureMilestoneLadderSchema';

const query = sequelize.query as unknown as jest.Mock;
beforeEach(() => jest.clearAllMocks());

describe('missingMilestoneLadderTables', () => {
  it('asks with QueryTypes.SELECT and an IN (:names) list, and reports nothing missing when both rows come back', async () => {
    query.mockResolvedValue([{ table_name: 'student_milestones' }, { table_name: 'student_certifications' }]);
    expect(await missingMilestoneLadderTables()).toEqual([]);
    const [sql, opts] = query.mock.calls[0];
    expect(opts.type).toBe(QueryTypes.SELECT);
    expect(opts.replacements.names).toEqual([...MILESTONE_LADDER_TABLES]);
    expect(sql).toMatch(/IN \(:names\)/);
  });

  it('names exactly the absent table', async () => {
    query.mockResolvedValue([{ table_name: 'student_certifications' }]);
    expect(await missingMilestoneLadderTables()).toEqual(['student_milestones']);
  });

  it('reports everything missing when it cannot ask, never a clean bill of health', async () => {
    query.mockRejectedValue(new Error('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await missingMilestoneLadderTables()).toEqual([...MILESTONE_LADDER_TABLES]);
    warn.mockRestore();
  });
});
