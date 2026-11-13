/**
 * The headline approval writes the REVIEWED text to both the frozen headline (live on Hire now)
 * and the profile title (so the next portfolio approval keeps it), inside one transaction, and
 * only while the draft is still what the admin read. A reject touches only the draft.
 */
jest.mock('../../../config/database', () => {
  const query = jest.fn();
  return { sequelize: { query, transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn('TX')) } };
});

import { sequelize } from '../../../config/database';
import { decideHeadline, listHeadlineDrafts, toHeadlineDraft } from '../hireHeadlineReview';

const q = sequelize.query as unknown as jest.Mock;
const EID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  q.mockReset();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('listHeadlineDrafts', () => {
  it('shows only drafts that differ from the live headline, oldest first', async () => {
    q.mockResolvedValueOnce([[{ enrollment_id: EID, full_name: 'Ann Lee', title: 'Analyst', slug: 'ann-lee', approved_title: 'Data Analyst', headline_draft: ' AI Systems Architect ', updated_at: '2026-11-13T10:00:00Z' }]]);
    const out = await listHeadlineDrafts();
    const sql = q.mock.calls[0][0] as string;
    expect(sql).toMatch(/IS DISTINCT FROM COALESCE\(p\.approved_identity->>'title', e\.title\)/);
    expect(sql).toMatch(/ORDER BY i\.updated_at ASC/);
    expect(out).toEqual([{ enrollmentId: EID, name: 'Ann Lee', slug: 'ann-lee', live: 'Data Analyst', draft: 'AI Systems Architect', updatedAt: '2026-11-13T10:00:00.000Z' }]);
  });

  it('falls back to the profile title as "live" when the page was never approved', () => {
    expect(toHeadlineDraft({ enrollment_id: EID, full_name: 'A', title: 'Analyst', slug: null, approved_title: null, headline_draft: 'X', updated_at: '2026-11-13T10:00:00Z' }).live).toBe('Analyst');
  });
});

describe('decideHeadline', () => {
  it('approve: clears the draft only if unchanged, then writes the profile title and the frozen headline, all in one transaction', async () => {
    q.mockResolvedValueOnce([[{ enrollment_id: EID }]]).mockResolvedValue([[]]);
    await decideHeadline(EID, 'approve', ' AI Systems Architect ', 'ali@colaberry.com');
    expect(q).toHaveBeenCalledTimes(3);
    expect(q.mock.calls[0][0]).toMatch(/SET headline_draft = NULL[\s\S]*WHERE enrollment_id = \$1 AND btrim\(headline_draft\) = \$2/);
    expect(q.mock.calls[1][0]).toMatch(/UPDATE enrollments SET title = \$2 WHERE id = \$1/);
    expect(q.mock.calls[2][0]).toMatch(/jsonb_set\(approved_identity, '\{title\}'/);
    for (const [, opts] of q.mock.calls) {
      expect(opts.bind).toEqual([EID, 'AI Systems Architect']);
      expect(opts.transaction).toBe('TX');
    }
  });

  it('reject: clears the draft and leaves the live headline alone', async () => {
    q.mockResolvedValueOnce([[{ enrollment_id: EID }]]);
    await decideHeadline(EID, 'reject', 'Something', 'ali@colaberry.com');
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('a draft that changed since it was read (or was already decided) is a 409 and writes nothing else', async () => {
    q.mockResolvedValueOnce([[]]);
    await expect(decideHeadline(EID, 'approve', 'Old text', 'ali@colaberry.com')).rejects.toMatchObject({ status: 409, error_class: 'StaleDraft' });
    expect(q).toHaveBeenCalledTimes(1);
  });
});
