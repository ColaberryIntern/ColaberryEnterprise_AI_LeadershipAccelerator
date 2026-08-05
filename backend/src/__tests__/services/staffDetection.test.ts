/**
 * IS_STAFF_SQL is raw SQL text evaluated by Postgres, not a JS function — so
 * it can't be unit-tested behaviorally without a real database. This test
 * guards its two required clauses structurally (a regression here means the
 * boundary rule was accidentally weakened/removed); the actual plus-alias
 * boundary case (ali+9@colaberry.com is NOT staff, vivek@colaberry.com IS)
 * is verified against real production data as part of the deploy checklist,
 * not here.
 */

import { IS_STAFF_SQL } from '../../services/staffDetection';

describe('IS_STAFF_SQL', () => {
  it('qualifies via a real mgmt_role', () => {
    expect(IS_STAFF_SQL).toContain('cm.mgmt_role IS NOT NULL');
  });

  it('qualifies via a plain @colaberry.com address', () => {
    expect(IS_STAFF_SQL).toContain("e.email ILIKE '%@colaberry.com'");
  });

  it('explicitly excludes plus-alias @colaberry.com addresses (Ali\'s test personas) from the email signal', () => {
    expect(IS_STAFF_SQL).toContain("e.email NOT LIKE '%+%@colaberry.com'");
  });

  it('requires the query to alias enrollments as e and join community_members as cm (documented contract)', () => {
    expect(IS_STAFF_SQL).toMatch(/\bcm\./);
    expect(IS_STAFF_SQL).toMatch(/\be\.email\b/);
  });
});
