const m = { query: jest.fn() };

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => m.query(...a) },
}));

import {
  normalizeCanonicalUrl,
  filenameFromUrl,
  checkC03Naming,
  listAccountArtifacts,
  linkArtifactToAccount,
  unlinkArtifactFromAccount,
  ArtifactLinkRejected,
} from '../accountArtifactLinkService';

/**
 * C8.5 acceptance: "Links only, no duplication" and "Follows the C0.3 canonical standard."
 *
 * The schema test proves the table cannot HOLD an artifact. This proves the service never
 * FETCHES one, never creates a duplicate link, and refuses a URL whose filename breaks
 * the C0.3 naming rule - the rule I broke myself on 23 October by filing a current
 * artifact as `..._REV2_2026-10-23.pdf`.
 */
const VAULT = 'https://app.basecamp.com/3945211/buckets/7463955/uploads/123';
const GOOD = `${VAULT}/COMMERCIALIZATION_FUNNEL_STAGE_DEFINITIONS.pdf`;

function mockDb(opts: { existing?: Array<{ id: string }>; rows?: Array<Record<string, unknown>> } = {}) {
  m.query.mockImplementation((sql: string) => {
    if (/^\s*SELECT id FROM account_artifact_links/.test(sql)) {
      return Promise.resolve(opts.existing ?? []);
    }
    if (/FROM account_artifact_links/.test(sql) && /ORDER BY/.test(sql)) {
      return Promise.resolve(opts.rows ?? []);
    }
    if (/INSERT INTO/.test(sql)) return Promise.resolve([{ id: 'link-new' }]);
    if (/DELETE FROM/.test(sql)) return Promise.resolve([{ id: 'link-1' }]);
    return Promise.resolve([]);
  });
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'link-1', organization_id: 'org-1', artifact_kind: 'proposal', title: 'A proposal',
  canonical_url: GOOD, source_type: 'basecamp_vault', source_id: null,
  linked_by_identity_id: 'ali@colaberry.com', notes: null,
  created_at: new Date('2026-10-23T12:00:00Z'), ...over,
});

beforeEach(() => m.query.mockReset());

describe('the service never fetches the artifact', () => {
  it('exposes no network call of any kind', () => {
    // "Links only" means the app must not become a second way to READ the document
    // either - a proxy or a cache is a copy with extra steps.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'accountArtifactLinkService.ts'), 'utf8',
    );
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/axios|got\(|node-fetch|https?\.get/);
  });
});

describe('normalizeCanonicalUrl is narrow on purpose', () => {
  it('folds a trailing slash and whitespace, so those cannot defeat the unique index', () => {
    expect(normalizeCanonicalUrl(`  ${GOOD}/  `)).toBe(GOOD);
  });

  it('PRESERVES a query string, because stripping one could merge two documents', () => {
    expect(normalizeCanonicalUrl(`${GOOD}?v=2`)).toBe(`${GOOD}?v=2`);
  });
});

describe('filenameFromUrl', () => {
  it('reads the filename past a query or fragment', () => {
    expect(filenameFromUrl(`${GOOD}?download=1#page=2`))
      .toBe('COMMERCIALIZATION_FUNNEL_STAGE_DEFINITIONS.pdf');
  });

  it('decodes an escaped name', () => {
    expect(filenameFromUrl('https://x.test/A%20B.pdf')).toBe('A B.pdf');
  });
});

describe('checkC03Naming enforces the rule I broke', () => {
  it('accepts a stable UPPER_SNAKE_CASE name', () => {
    expect(checkC03Naming(GOOD).ok).toBe(true);
  });

  it('REFUSES the exact filename I shipped on 23 October', () => {
    const v = checkC03Naming(
      `${VAULT}/COMMERCIALIZATION_FUNNEL_STAGES_ONE_PAGE_REV2_2026-10-23.pdf`,
    );
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/date/i);
  });

  it('refuses a version marker even without a date', () => {
    expect(checkC03Naming(`${VAULT}/ACCOUNT_BRIEF_V2.pdf`).ok).toBe(false);
    expect(checkC03Naming(`${VAULT}/ACCOUNT_BRIEF_REV3.pdf`).ok).toBe(false);
  });

  it('refuses a status word, which C0.3 names alongside dates and versions', () => {
    for (const n of ['PROPOSAL_FINAL.pdf', 'PROPOSAL_DRAFT.pdf', 'PROPOSAL_COPY.pdf']) {
      expect(checkC03Naming(`${VAULT}/${n}`).ok).toBe(false);
    }
  });

  it('refuses a bare date format too', () => {
    expect(checkC03Naming(`${VAULT}/DECK_20261023.pdf`).ok).toBe(false);
  });

  it('does not trip on a legitimate name containing a digit', () => {
    // C2.3, SOC2 and the like are real artifact names; the rule is about version and
    // date MARKERS, and a rule that refused every digit would be unusable.
    expect(checkC03Naming(`${VAULT}/C23_PRICING_MODEL.pdf`).ok).toBe(true);
    expect(checkC03Naming(`${VAULT}/SOC2_READINESS.pdf`).ok).toBe(true);
  });

  it('refuses a URL with no filename rather than passing it', () => {
    expect(checkC03Naming('https://app.basecamp.com').ok).toBe(false);
  });
});

describe('linkArtifactToAccount', () => {
  const base = {
    organizationId: 'org-1', artifactKind: 'proposal',
    title: 'Acme pilot proposal', canonicalUrl: GOOD,
  };

  it('creates a link and reports created', async () => {
    mockDb({ rows: [row({ id: 'link-new' })] });
    const r = await linkArtifactToAccount(base);
    expect(r.created).toBe(true);
    expect(r.link.canonicalUrl).toBe(GOOD);
  });

  it('IS IDEMPOTENT: a second identical link returns the first, and inserts nothing', async () => {
    // This is the ticket's metric as behaviour: "nobody re-sends a document an account
    // already has" requires the duplicate to be impossible, not discouraged.
    mockDb({ existing: [{ id: 'link-1' }], rows: [row()] });
    const r = await linkArtifactToAccount(base);
    expect(r.created).toBe(false);
    expect(r.link.id).toBe('link-1');
    expect(m.query.mock.calls.filter(([s]) => /INSERT INTO/.test(String(s)))).toHaveLength(0);
  });

  it('treats a trailing slash as the same document', async () => {
    mockDb({ existing: [{ id: 'link-1' }], rows: [row()] });
    const r = await linkArtifactToAccount({ ...base, canonicalUrl: `${GOOD}/` });
    expect(r.created).toBe(false);
  });

  it('REFUSES a C0.3-violating filename, and writes nothing', async () => {
    mockDb();
    await expect(linkArtifactToAccount({
      ...base, canonicalUrl: `${VAULT}/DECK_REV2_2026-10-23.pdf`,
    })).rejects.toBeInstanceOf(ArtifactLinkRejected);
    expect(m.query.mock.calls.filter(([s]) => /INSERT INTO/.test(String(s)))).toHaveLength(0);
  });

  it('refuses an unknown artifact kind', async () => {
    mockDb();
    await expect(linkArtifactToAccount({ ...base, artifactKind: 'invoice' }))
      .rejects.toThrow(/Unknown artifact kind/);
  });

  it('refuses a non-http URL, so a file:// path cannot masquerade as canonical', async () => {
    mockDb();
    await expect(linkArtifactToAccount({ ...base, canonicalUrl: 'file:///C:/deck.pdf' }))
      .rejects.toThrow(/http or https/);
  });

  it('refuses an empty title and an empty URL', async () => {
    mockDb();
    await expect(linkArtifactToAccount({ ...base, title: '   ' })).rejects.toThrow(/title/i);
    await expect(linkArtifactToAccount({ ...base, canonicalUrl: '' })).rejects.toThrow(/URL/i);
  });
});

describe('listAccountArtifacts', () => {
  it('returns links with a C0.3 verdict attached to each', async () => {
    mockDb({ rows: [row(), row({ id: 'link-2', canonical_url: `${VAULT}/DECK_V2.pdf` })] });
    const links = await listAccountArtifacts('org-1');
    expect(links).toHaveLength(2);
    expect(links[0].naming.ok).toBe(true);
    expect(links[1].naming.ok).toBe(false);
  });

  it('still returns a non-compliant link rather than hiding it', async () => {
    // The rule governs what we CREATE. Refusing to display a link that already exists
    // would hide the evidence instead of fixing it.
    mockDb({ rows: [row({ canonical_url: `${VAULT}/DECK_REV2_2026-10-23.pdf` })] });
    const links = await listAccountArtifacts('org-1');
    expect(links).toHaveLength(1);
    expect(links[0].naming.ok).toBe(false);
  });
});

describe('unlinkArtifactFromAccount', () => {
  it('removes the pointer and reports it', async () => {
    mockDb();
    expect(await unlinkArtifactFromAccount('org-1', 'link-1')).toEqual({ removed: true });
  });

  it('scopes the delete to the account, so an id alone cannot remove another account\u2019s link', async () => {
    mockDb();
    await unlinkArtifactFromAccount('org-1', 'link-1');
    const del = m.query.mock.calls.find(([s]) => /DELETE FROM/.test(String(s)));
    expect(String(del?.[0])).toMatch(/organization_id = :organizationId/);
  });
});
