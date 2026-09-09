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

  // ── Intent stops informing once someone converts ─────────────────────────

  it('hides intent and temperature for an enrolled person', async () => {
    // Ali, 2026-09-08: "if they are enrolled, hide their current intent. Knowing
    // that an enrolled student is hot, is not informing to us." A temperature
    // answers "how likely are they to convert" — once they have, it is a stale
    // answer to a settled question that invites someone to act on it.
    query.mockReset();
    query.mockResolvedValueOnce([{ ...IDENTITY, stage: 'enrolled_student' }]);
    query.mockResolvedValueOnce([{ leadScore: 88, temperature: 'hot', temperatureUpdatedAt: '2026-01-01', leadId: 5 }]);
    query.mockResolvedValue([]);

    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });

    expect(profile!.acquisition!.temperature).toBeNull();
    expect(profile!.acquisition!.leadScore).toBeNull();
    expect(profile!.acquisition!.temperatureUpdatedAt).toBeNull();
    expect(profile!.intentSuppressedReason).toBeTruthy();
    // The KPI must obey the same rule, or the header contradicts the panel.
    expect(profile!.journey!.intentScore).toBeNull();
  });

  it('keeps intent for someone still in acquisition', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...IDENTITY, stage: 'lead' }]);
    query.mockResolvedValueOnce([{ leadScore: 30, temperature: 'cold', leadId: 938 }]);
    query.mockResolvedValue([]);

    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });

    expect(profile!.acquisition!.temperature).toBe('cold');
    expect(profile!.acquisition!.leadScore).toBe(30);
    expect(profile!.intentSuppressedReason).toBeUndefined();
  });

  it('carries the score denominator the lead page shows', async () => {
    query.mockReset();
    query.mockResolvedValueOnce([{ ...IDENTITY, stage: 'lead' }]);
    query.mockResolvedValueOnce([{ leadScore: 30, leadId: 938 }]);
    query.mockResolvedValue([]);
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    // "30" alone is not readable; the Lead page says "out of 105 possible".
    expect(profile!.acquisition!.leadScoreMax).toBe(105);
  });

  // ── Data & trust: gaps are stated, never left blank ──────────────────────

  it('names the acquisition gap for a person with no lead', async () => {
    // The 86. A blank acquisition panel reads as "nothing happened"; the gap
    // says "this person was never captured as a lead", which is actionable.
    query.mockReset();
    query.mockResolvedValueOnce([{ ...IDENTITY, traced: false }]);
    query.mockResolvedValue([]);

    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });

    const fields = profile!.trust!.gaps.map((g) => g.field);
    expect(fields).toContain('Acquisition history');
    expect(profile!.trust!.tracedToLead).toBe(false);
    expect(profile!.trust!.matchMethod).toBe('none');
  });

  it('says graduation is computable but never set, not that it is impossible', async () => {
    // Corrected 2026-09-08. I had reported that no completion status existed;
    // 'completed' IS a value in enum_enrollments_status and the stage expression
    // reads it. The real gap is that nothing ever sets it — a process gap, not a
    // schema one — and the two call for different fixes.
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    const grad = profile!.trust!.gaps.find((g) => g.field === 'Graduation');
    expect(grad).toBeDefined();
    expect(grad!.reason).toMatch(/never set/i);
    expect(grad!.reason).toMatch(/not "did not graduate"/);
    // Placement is genuinely untracked, and stays a separate, harder gap.
    expect(profile!.trust!.gaps.some((g) => g.field === 'Placement and employment')).toBe(true);
  });

  it('reports source record ids so any figure can be traced back', async () => {
    const profile = await getPersonProfile({
      email: 'someone@example.com',
      sections: sectionsFor('owner'),
      visibleEnrollmentIds: null,
    });
    expect(profile!.trust).toBeDefined();
    expect(Array.isArray(profile!.trust!.leadIds)).toBe(true);
    expect(Array.isArray(profile!.trust!.enrollmentIds)).toBe(true);
  });

  // ── The timeline, which the first version omitted entirely ───────────────

  it('gates timeline domains by section, like the panels', async () => {
    const { domainsForSections } = await import('../personTimelineService');
    // A mentor gets learning history and no sales history.
    expect(domainsForSections(sectionsFor('mentor'))).toEqual(
      expect.arrayContaining(['learning']),
    );
    expect(domainsForSections(sectionsFor('mentor'))).not.toContain('sales');
    expect(domainsForSections(sectionsFor('mentor'))).not.toContain('commerce');

    // A revenue identity gets sales and commerce, not learning.
    const rev = domainsForSections(sectionsFor('revenue'));
    expect(rev).toEqual(expect.arrayContaining(['sales', 'commerce']));
    expect(rev).not.toContain('learning');
  });

  it('gives an identity with no person sections no timeline domains at all', async () => {
    const { domainsForSections } = await import('../personTimelineService');
    expect(domainsForSections(sectionsFor('community_organizer'))).toEqual([]);
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
