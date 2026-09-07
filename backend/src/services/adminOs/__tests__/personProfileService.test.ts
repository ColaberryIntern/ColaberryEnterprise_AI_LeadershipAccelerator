const query = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => query(...args) },
}));

import { MGMT_ROLE_DEFS } from '../../access/mgmtRoles';
import { getPersonProfile } from '../personProfileService';

const sectionsFor = (role: keyof typeof MGMT_ROLE_DEFS) =>
  MGMT_ROLE_DEFS[role].sections as readonly string[];

const IDENTITY = {
  email: 'someone@example.com',
  name: 'Someone',
  stage: 'enrolled_student',
  company: null,
  title: null,
  traced: true,
};

/** First call is always the identity read; later calls are the panels. */
function primeIdentity(row: Record<string, unknown> = IDENTITY) {
  query.mockReset();
  query.mockResolvedValue([]);
  query.mockResolvedValueOnce([row]);
}

/** Every SQL string handed to the database after the identity read. */
const panelSql = () => query.mock.calls.slice(1).map((c) => String(c[0]));

describe('person profile', () => {
  beforeEach(() => primeIdentity());

  // ── Panels are omitted server-side, not hidden in the UI ─────────────────

  it('never queries a panel the caller may not see', async () => {
    // The property that makes this access control rather than a CSS rule: the
    // data is not fetched, so it cannot be in the payload to be hidden.
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('support'),          // 'students' only
      visibleEnrollmentIds: null,
    });

    const sql = panelSql().join(' ');
    expect(sql).not.toContain('payment_status');   // billing
    expect(sql).not.toContain('utm_source');       // acquisition
    expect(sql).not.toContain('visitor_sessions'); // engagement
    expect(profile!.billing).toBeUndefined();
    expect(profile!.acquisition).toBeUndefined();
  });

  it('names what it withheld instead of silently omitting it', async () => {
    // A missing panel and a panel you are not allowed to see look identical
    // otherwise, and only one of them is worth asking about.
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('support'),
      visibleEnrollmentIds: null,
    });
    expect(profile!.withheldPanels).toEqual(
      expect.arrayContaining(['acquisition', 'billing', 'engagement']),
    );
    expect(profile!.withheldPanels).not.toContain('learning');
  });

  it('gives a revenue identity billing but not learning', async () => {
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('revenue'),          // dashboard, revenue, leads
      visibleEnrollmentIds: null,
    });
    expect(profile!.billing).toBeDefined();
    expect(profile!.acquisition).toBeDefined();
    expect(profile!.withheldPanels).toContain('learning');
  });

  it('gives a mentor learning but not billing', async () => {
    // The split the section gate could not express, and the reason the content
    // is filtered here rather than the surface being denied.
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('mentor'),           // dashboard, career_review
      visibleEnrollmentIds: ['enr-1'],
    });
    expect(profile!.learning).toBeDefined();
    expect(profile!.withheldPanels).toContain('billing');
    expect(profile!.withheldPanels).toContain('acquisition');
  });

  // ── The second narrowing, which is the one that could leak ────────────────

  it('restricts a mentor to their own learners', async () => {
    await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('mentor'),
      visibleEnrollmentIds: ['enr-1', 'enr-2'],
    });
    const learningCall = query.mock.calls.find((c) => String(c[0]).includes('enrollment_type'));
    expect(String(learningCall![0])).toContain('AND id IN (:ids)');
    expect((learningCall![1] as { replacements: { ids: string[] } }).replacements.ids)
      .toEqual(['enr-1', 'enr-2']);
  });

  it('shows a mentor with NO grants nothing, and does not query for it', async () => {
    // `[]` means "see nothing" and `null` means "no filter". Collapsing them is
    // the classic way a scoped surface shows everything, so [] must short-circuit
    // rather than produce `IN ()` or an unfiltered read.
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('mentor'),
      visibleEnrollmentIds: [],
    });
    expect(profile!.learning).toEqual([]);
    expect(panelSql().join(' ')).not.toContain('enrollment_type');
  });

  it('applies no per-record filter for an admin', async () => {
    await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    const learningCall = query.mock.calls.find((c) => String(c[0]).includes('enrollment_type'));
    expect(String(learningCall![0])).not.toContain('IN (:ids)');
  });

  // ── Who may be looked up at all ───────────────────────────────────────────

  it('returns null for a person outside the caller stage scope', async () => {
    // Support may open the People surface, but must not reach a lead's profile
    // by typing the address.
    primeIdentity({ ...IDENTITY, stage: 'lead' });
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('support'),
      visibleEnrollmentIds: null,
    });
    expect(profile).toBeNull();
  });

  it('returns null rather than an empty profile, so absence and denial look alike', async () => {
    // An empty-but-present profile confirms the person EXISTS, which is itself a
    // disclosure. "Not found" and "not yours" must be indistinguishable.
    primeIdentity();
    query.mockReset();
    query.mockResolvedValueOnce([]); // no such person
    const profile = await getPersonProfile({
      email: 'nobody@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    expect(profile).toBeNull();
  });

  it('returns null for an identity with no person scope, without querying', async () => {
    query.mockReset();
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('community_organizer'),
      visibleEnrollmentIds: null,
    });
    expect(profile).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an unusable email before touching the database', async () => {
    for (const bad of ['', '   ', 'no-at-sign']) {
      query.mockReset();
      const profile = await getPersonProfile({
        email: bad,
        sections: sectionsFor('owner'),
        visibleEnrollmentIds: null,
      });
      expect(profile).toBeNull();
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('normalises the email the same way the roster and matcher do', async () => {
    // Three surfaces keying people differently would disagree about who is who.
    await getPersonProfile({
      email: '  SOMEONE@Example.COM ',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    const first = query.mock.calls[0][1] as { replacements: { email: string } };
    expect(first.replacements.email).toBe('someone@example.com');
  });

  it('parameterises the email rather than interpolating it', async () => {
    await getPersonProfile({
      email: "x' OR '1'='1@example.com",
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    expect(String(query.mock.calls[0][0])).not.toContain("OR '1'='1");
    expect(String(query.mock.calls[0][0])).toContain(':email');
  });
});
