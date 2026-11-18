const queryMock = jest.fn();
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: any[]) => queryMock(...a) } }));

import { listRequirementCategories, listPendingCategories, proposeCategory, activateCategory } from '../govRequirementCategories';

beforeEach(() => jest.clearAllMocks());

describe('govRequirementCategories', () => {
  it('lists built-in groups plus activated tenant categories (built-in slugs never shadowed)', async () => {
    queryMock.mockResolvedValueOnce([
      { slug: 'cyber_attestation', label: 'Cybersecurity attestation', kind: 'fact', subject: 'security', status: 'active', source: 'admin', confidence: null, example_ask: null },
      { slug: 'registrations', label: 'dupe should be dropped', kind: 'fact', subject: null, status: 'active', source: 'ai', confidence: null, example_ask: null },
    ]);
    const cats = await listRequirementCategories('t1');
    const slugs = cats.map((c) => c.slug);
    expect(slugs).toContain('past_performance'); // built-in present
    expect(slugs).toContain('cyber_attestation'); // tenant active added
    // the built-in 'registrations' appears exactly once (tenant dupe dropped)
    expect(slugs.filter((s) => s === 'registrations')).toHaveLength(1);
    expect(cats.find((c) => c.slug === 'registrations')!.label).toMatch(/Registrations/);
  });

  it('pending excludes built-in slugs', async () => {
    queryMock.mockResolvedValueOnce([
      { slug: 'cyber_attestation', label: 'Cybersecurity attestation', kind: 'fact', subject: 'security', status: 'pending', source: 'ai', confidence: 0.7, example_ask: 'provide your CMMC level' },
    ]);
    const pend = await listPendingCategories('t1');
    expect(pend).toHaveLength(1);
    expect(pend[0].slug).toBe('cyber_attestation');
    expect(pend[0].confidence).toBe(0.7);
  });

  it('refuses to propose a built-in slug and does not hit the DB', async () => {
    const r = await proposeCategory('t1', { slug: 'pricing', label: 'Pricing dupe' });
    expect(r.created).toBe(false);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('proposes a new AI category as pending, idempotently', async () => {
    queryMock.mockResolvedValueOnce([[], 1]); // inserted
    const r1 = await proposeCategory('t1', { slug: 'Cyber-Attestation', label: 'Cybersecurity attestation', kind: 'fact', subject: 'security', confidence: 0.8 });
    expect(r1.created).toBe(true);
    const sql = String(queryMock.mock.calls[0][0]);
    expect(sql).toMatch(/ON CONFLICT \(tenant_id, slug\) DO NOTHING/);
    const binds = queryMock.mock.calls[0][1].bind;
    expect(binds[1]).toBe('cyber_attestation'); // slug cleaned
    expect(binds[5]).toBe('pending'); // ai source -> pending

    queryMock.mockResolvedValueOnce([[], 0]); // conflict, nothing inserted
    const r2 = await proposeCategory('t1', { slug: 'cyber_attestation', label: 'again' });
    expect(r2.created).toBe(false);
  });

  it('admin-added category is created active', async () => {
    queryMock.mockResolvedValueOnce([[], 1]);
    await proposeCategory('t1', { slug: 'my_group', label: 'My Group', source: 'admin' });
    expect(queryMock.mock.calls[0][1].bind[5]).toBe('active');
  });

  it('activateCategory issues a scoped update', async () => {
    queryMock.mockResolvedValueOnce([[], 1]);
    const r = await activateCategory('t1', 'cyber_attestation');
    expect(r.ok).toBe(true);
    expect(String(queryMock.mock.calls[0][0])).toMatch(/UPDATE gov_requirement_categories SET status = 'active'/);
  });
});
