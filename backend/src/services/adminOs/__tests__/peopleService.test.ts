const query = jest.fn();

jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => query(...args) },
}));

import { MGMT_ROLE_DEFS } from '../../access/mgmtRoles';
import { getPeopleRoster } from '../peopleService';

const sectionsFor = (role: keyof typeof MGMT_ROLE_DEFS) =>
  MGMT_ROLE_DEFS[role].sections as readonly string[];

/** The SQL and replacements handed to the row query (the first of the two calls). */
const rowCall = () => ({
  sql: query.mock.calls[0][0] as string,
  opts: query.mock.calls[0][1] as { replacements: Record<string, unknown> },
});

describe('people roster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: '0' }]);
  });

  // ── The security boundary ─────────────────────────────────────────────────

  it('applies the lifecycle scope INSIDE the query, not after it', () => {
    // Filtering after the select would still ship the rows over the wire;
    // filtering in the UI would ship them to the browser. Neither is access
    // control, so the scope has to be in the statement.
    return getPeopleRoster({ sections: sectionsFor('support') }).then(() => {
      const { sql, opts } = rowCall();
      // IN, not `= ANY`. Sequelize expands an array replacement into a bare
      // comma list, so `= ANY(:stages)` renders as `= ANY('a','b')` and is a
      // syntax error. That shipped to production because these tests mock
      // sequelize.query and never execute the statement.
      expect(sql).toContain('IN (:stages)');
      expect(sql).not.toContain('= ANY(:stages)');
      expect(opts.replacements.stages).toEqual(
        expect.arrayContaining(['enrolled_student', 'active_learner', 'graduate']),
      );
    });
  });

  it('never lets a support identity ask for leads', async () => {
    // Support holds only 'students'. The roster must not carry acquisition rows
    // just because the section gate let them open the page.
    await getPeopleRoster({ sections: sectionsFor('support') });
    const stages = rowCall().opts.replacements.stages as string[];
    expect(stages).not.toContain('lead');
    expect(stages).not.toContain('applicant');
    expect(stages).not.toContain('anonymous_visitor');
  });

  it('returns nothing at all for an identity with no person scope', async () => {
    // Community organizer holds only 'dashboard'. Deny by default, and without
    // running a query — an empty stage list interpolated into an IN would become
    // "match everything" rather than "match nothing".
    const roster = await getPeopleRoster({ sections: sectionsFor('community_organizer') });
    expect(roster.rows).toEqual([]);
    expect(roster.total).toBe(0);
    expect(roster.visibleStages).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('parameterises every caller-controlled value', async () => {
    // The scope list is the access control, so it must never be interpolated.
    await getPeopleRoster({
      sections: sectionsFor('owner'),
      search: "x' OR '1'='1",
      stage: 'lead',
    });
    const { sql, opts } = rowCall();
    expect(sql).not.toContain("OR '1'='1");
    expect(opts.replacements.search).toBe("%x' OR '1'='1%");
    expect(opts.replacements.stage).toBe('lead');
  });

  it('gives the owner every stage', async () => {
    await getPeopleRoster({ sections: sectionsFor('owner') });
    const stages = rowCall().opts.replacements.stages as string[];
    expect(stages).toContain('lead');
    expect(stages).toContain('enrolled_student');
    expect(stages).toContain('returning_customer');
  });

  // ── Counting ──────────────────────────────────────────────────────────────

  it('counts with the same filters as the page it returns', async () => {
    // A header that disagrees with its own list is the reconciliation failure
    // the drill-down contract exists to prevent.
    await getPeopleRoster({ sections: sectionsFor('owner'), search: 'ali', stage: 'lead' });
    const rowsSql = query.mock.calls[0][0] as string;
    const countSql = query.mock.calls[1][0] as string;
    const rowsWhere = rowsSql.slice(rowsSql.indexOf('WHERE'));
    const countWhere = countSql.slice(countSql.indexOf('WHERE'));
    expect(countWhere).toBe(rowsWhere.slice(0, countWhere.length));
    expect(query.mock.calls[0][1].replacements).toEqual(query.mock.calls[1][1].replacements);
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  it('filters to the untraced when the coverage drill-down asks for it', async () => {
    // The 86 students with no acquisition record.
    await getPeopleRoster({ sections: sectionsFor('owner'), untracedOnly: true });
    expect(rowCall().sql).toContain('e.email IS NOT NULL AND l.email IS NULL');
  });

  it('does not add the untraced filter unless it was asked for', async () => {
    await getPeopleRoster({ sections: sectionsFor('owner') });
    expect(rowCall().sql).not.toContain('e.email IS NOT NULL AND l.email IS NULL');
  });

  it('caps the page size however large a caller asks for', async () => {
    await getPeopleRoster({ sections: sectionsFor('owner'), limit: 100000 });
    expect(rowCall().opts.replacements.limit).toBe(200);
  });

  it('refuses a negative offset rather than passing it to SQL', async () => {
    await getPeopleRoster({ sections: sectionsFor('owner'), offset: -5 });
    expect(rowCall().opts.replacements.offset).toBe(0);
  });

  // ── Stages it must not invent ─────────────────────────────────────────────

  it('never assigns a stage it has no evidence for', async () => {
    // enrollments.status holds only 'active' and 'withdrawn' — there is NO
    // completion status, so 'graduate' cannot be computed. Nor can
    // 'active_learner' (attendance unreliable) or 'returning_customer' (no
    // payment source). They may be VISIBLE to a role, but this query must never
    // label anyone with them.
    await getPeopleRoster({ sections: sectionsFor('owner') });
    const { sql } = rowCall();
    expect(sql).toContain("'enrolled_student'");
    expect(sql).toContain("'applicant'");
    expect(sql).toContain("'lead'");
    // 'lapsed' is assigned, and 'graduate' is NOT. Complete is never in a
    // subscription business; someone who stops has lapsed. Before this, a
    // withdrawn enrolment read as enrolled_student and inflated the active count
    // by 62 people.
    expect(sql).toContain("THEN 'lapsed'");
    expect(sql).toContain("e.status = 'withdrawn'");
    expect(sql).not.toContain("THEN 'graduate'");
    expect(sql).not.toContain("THEN 'active_learner'");
    expect(sql).not.toContain("THEN 'returning_customer'");
    expect(sql).not.toContain("THEN 'identified_visitor'");
  });

  it('groups people on the same normalised email the matcher uses', async () => {
    // A roster that grouped differently from identityResolution would disagree
    // with the profile about who is who.
    await getPeopleRoster({ sections: sectionsFor('owner') });
    expect(rowCall().sql).toContain('lower(btrim(');
  });

  it('reports per person whether they can be traced to acquisition', async () => {
    // "We don't know where this student came from" is a fact about that student,
    // and belongs on their row rather than only in an aggregate.
    await getPeopleRoster({ sections: sectionsFor('owner') });
    expect(rowCall().sql).toContain('"tracedToLead"');
  });
});
