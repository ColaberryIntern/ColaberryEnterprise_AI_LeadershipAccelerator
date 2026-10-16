/**
 * B2 — the DRI decided on 2026-10-14 **not** to backfill legacy projects. This is the control that
 * makes that decision safe, and it did not exist.
 *
 * ## What the decision rests on
 *
 * Four `delivery_projects` (two of them `government_public_sector`) and 62 `projects` predate their
 * registration hooks and hold no lifecycle row. They are legacy and out of scope — not bypasses.
 * The only thing keeping them out of the bypass reports is the DEFAULT `since` on the two
 * detectors. Move that default to the epoch and all 66 rows are suddenly reported as LC-01
 * violations, and the `/health/full` check built in B4 starts warning about work nobody did wrong.
 *
 * ## What was already tested, and what was not
 *
 * `lifecycleRegistration.integration.test.ts` asserts `LIVE_SINCE instanceof Date` — a TYPE check.
 * Nothing asserted the cutoff's VALUE, and nothing asserted it is actually applied as a lower
 * bound. A constant that is a Date but points at 1970 would have passed.
 *
 * ## Why this is a unit test and not an integration one
 *
 * The property is "which date gets bound into the query", which is answerable by inspecting the
 * call. Creating real rows either side of a 2026 boundary in a real database would test the same
 * thing far more slowly, and the dates are the part that can silently change.
 */

const query = jest.fn(async () => [] as unknown[]);
jest.mock('../../../config/database', () => ({
  __esModule: true,
  sequelize: { query: (...a: unknown[]) => query(...(a as [])) },
}));

// eslint-disable-next-line import/first
import {
  unregisteredDeliveryProjectsSince,
  unregisteredStudentProjectsSince,
  LIFECYCLE_REGISTRATION_LIVE_SINCE,
  STUDENT_REGISTRATION_LIVE_SINCE,
} from '../projectLifecycleRegistration';

/** The SQL and the bound values from the most recent call. */
function lastCall() {
  const [sql, opts] = query.mock.calls[query.mock.calls.length - 1] as [string, { bind: unknown[] }];
  return { sql, bind: opts.bind };
}

beforeEach(() => query.mockClear());

describe('the cutoff dates are PINNED, because moving them re-classifies real rows', () => {
  // Pinned to literals, not derived from the constants themselves — a test that compares a
  // constant to itself cannot fail, which is the shape of control this programme keeps finding.

  it('the delivery hook went live 2026-10-09, and that is what the constant says', () => {
    expect(LIFECYCLE_REGISTRATION_LIVE_SINCE.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('the student hook went live 2026-10-12, three days later — they are NOT the same date', () => {
    expect(STUDENT_REGISTRATION_LIVE_SINCE.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    // Stated as its own assertion because a single shared date would make one of the two detectors
    // wrong: it would either miss delivery bypasses or report every pre-T1b student project as one.
    expect(STUDENT_REGISTRATION_LIVE_SINCE.getTime())
      .toBeGreaterThan(LIFECYCLE_REGISTRATION_LIVE_SINCE.getTime());
  });
});

describe('the detectors APPLY their cutoff, so legacy rows stay out of the bypass report', () => {
  it('the delivery detector defaults to the delivery cutoff and binds it', async () => {
    await unregisteredDeliveryProjectsSince();
    const { sql, bind } = lastCall();

    expect(bind[0]).toEqual(LIFECYCLE_REGISTRATION_LIVE_SINCE);
    // The bind must be used as a LOWER bound. Binding the date and then not filtering on it would
    // return every unregistered row regardless of age.
    expect(sql).toContain('created_at >= $1');
    expect(sql).toContain('delivery_projects');
  });

  it('the student detector defaults to the student cutoff and binds it', async () => {
    await unregisteredStudentProjectsSince();
    const { sql, bind } = lastCall();

    expect(bind[0]).toEqual(STUDENT_REGISTRATION_LIVE_SINCE);
    expect(sql).toContain('created_at >= $1');
    expect(sql).toContain('FROM projects');
  });

  it('an explicit date OVERRIDES the default, so the default is a default and not a hardcode', async () => {
    // Without this, a function that ignored its argument and always used the constant would pass
    // every assertion above.
    const explicit = new Date('2020-01-01T00:00:00.000Z');
    await unregisteredDeliveryProjectsSince(explicit);
    expect(lastCall().bind[0]).toEqual(explicit);

    await unregisteredStudentProjectsSince(explicit);
    expect(lastCall().bind[0]).toEqual(explicit);
  });

  it('BOTH detectors only report rows with NO lifecycle row — the join is an anti-join', async () => {
    // The other half of the question. A detector that found rows by age alone would report every
    // project created since the cutoff, registered or not.
    await unregisteredDeliveryProjectsSince();
    expect(lastCall().sql).toContain('pls.id IS NULL');

    await unregisteredStudentProjectsSince();
    expect(lastCall().sql).toContain('pls.id IS NULL');
  });
});
