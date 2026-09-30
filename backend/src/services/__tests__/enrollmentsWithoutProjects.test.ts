import {
  isPaying, isInternal, interventionList, EnrollmentWithoutProject,
} from '../enrollmentsWithoutProjects';

/**
 * The number this produces is one an operator acts on by contacting people, so
 * the cases below are the ones where a plausible implementation quietly inflates
 * it: a pending enrollment counted as paying, an internal seat counted as a
 * customer, a casing difference splitting one rule into two.
 *
 * Production shape it was built against (July 2026, 2026-09-10): 49 active
 * enrollments, 25 with a project, 24 with none — of which only 9 were paying
 * external students. A rule that counted all 24 would overstate the list by 167%.
 */

const row = (over: Partial<EnrollmentWithoutProject> = {}): EnrollmentWithoutProject => ({
  enrollment_id: 'e1',
  student_name: 'Someone',
  student_email: 'someone@example.com',
  cohort_id: 'c1',
  cohort_name: 'Cohort - July 2026',
  payment_status: 'paid',
  enrollment_type: 'standard',
  tier: 'member',
  amount_paid: '199.00',
  enrolled_on: '2026-07-07',
  internal: false,
  ...over,
});

describe('isPaying', () => {
  it('counts only an explicit paid status', () => {
    expect(isPaying({ payment_status: 'paid' })).toBe(true);
  });

  it('does NOT count pending — the largest group without a project', () => {
    // 12 of the 24 were pending. Counting them would double the list an operator
    // is told to chase.
    expect(isPaying({ payment_status: 'pending' })).toBe(false);
  });

  it('treats missing or null as not paying rather than as unknown-therefore-yes', () => {
    expect(isPaying({})).toBe(false);
    expect(isPaying({ payment_status: null })).toBe(false);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isPaying({ payment_status: '  Paid ' })).toBe(true);
  });
});

describe('isInternal', () => {
  it('recognises a colaberry address', () => {
    expect(isInternal('taiwo@colaberry.com')).toBe(true);
    expect(isInternal('  ALI@Colaberry.COM ')).toBe(true);
  });

  it('does not treat a lookalike domain as internal', () => {
    // Both of these are students, and misclassifying one as an internal seat
    // would quietly drop a paying customer off the intervention list.
    //
    // The `@` inside the suffix is what makes this work: matching on
    // 'colaberry.com' alone would treat notcolaberry.com as internal, because it
    // genuinely ends with that string. Keeping the `@` anchors the match to the
    // start of the domain. This test exists to stop someone "simplifying" it away.
    expect(isInternal('someone@colaberry.com.au')).toBe(false);
    expect(isInternal('someone@notcolaberry.com')).toBe(false);
  });

  it('handles null and empty', () => {
    expect(isInternal(null)).toBe(false);
    expect(isInternal('')).toBe(false);
  });
});

describe('interventionList', () => {
  it('keeps only paying external rows', () => {
    const rows = [
      row({ enrollment_id: 'paid-external' }),
      row({ enrollment_id: 'pending', payment_status: 'pending' }),
      row({ enrollment_id: 'internal', internal: true }),
      row({ enrollment_id: 'internal-and-pending', internal: true, payment_status: 'pending' }),
    ];
    expect(interventionList(rows).map((r) => r.enrollment_id)).toEqual(['paid-external']);
  });

  it('reproduces the production ratio: 9 of 24, not 24', () => {
    const rows = [
      ...Array.from({ length: 9 }, (_, i) => row({ enrollment_id: `p${i}` })),
      ...Array.from({ length: 11 }, (_, i) => row({ enrollment_id: `q${i}`, payment_status: 'pending' })),
      ...Array.from({ length: 4 }, (_, i) => row({ enrollment_id: `r${i}`, internal: true })),
    ];
    expect(rows).toHaveLength(24);
    expect(interventionList(rows)).toHaveLength(9);
  });

  it('returns an empty list rather than throwing on no rows', () => {
    expect(interventionList([])).toEqual([]);
  });
});

/**
 * A source-text assertion, because the distinction it guards is invisible at
 * runtime: both variants return rows, and only one of them is right.
 */
describe('the query asks for NO project, not no ACTIVE project', () => {
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'enrollmentsWithoutProjects.ts'), 'utf8'
  );

  it('uses NOT EXISTS against projects', () => {
    expect(source).toMatch(/NOT EXISTS \(SELECT 1 FROM projects p WHERE p\.enrollment_id = e\.id\)/);
  });

  it('never filters on active_project_id alone', () => {
    // A student who built something and then cleared their active pointer has
    // still built something, and does not belong on an intervention list.
    expect(source).not.toMatch(/WHERE[^)]*e\.active_project_id IS NULL/);
  });

  it('excludes departed enrollments using the shared rule, not a local literal', () => {
    expect(source).toContain('DEPARTED_ENROLLMENT_STATUSES');
    expect(source).not.toMatch(/NOT IN \('withdrawn'\)/);
  });
});
