/**
 * B4 — the LC-01 bypass detectors finally have a production caller, and this proves it.
 *
 * ## The defect this closes
 *
 * `unregisteredDeliveryProjectsSince` and `unregisteredStudentProjectsSince` existed, were tested,
 * and were called from TESTS ONLY. A detector with no production caller cannot detect anything. It
 * is a control that proves it works and then never runs — the exact shape of a defect this
 * programme already shipped once and a verifier found.
 *
 * ## Two kinds of test here, and why both are needed
 *
 * **Behaviour** is tested by calling `checkLifecycleRegistration` directly — fast, and it can
 * exercise cases the real system cannot be made to produce on demand.
 *
 * **Reachability** is tested ONCE through the real `runFullSystemHealthCheck`, because "is it
 * wired" is the property that was missing, and no direct call can establish it. That test is slow
 * — it runs the other nine checks, which touch the database and the network — so there is exactly
 * one of it. Deleting the line that registers the check makes it fail.
 */

const DELIVERY_ID = 'dddddddd-1111-4111-8111-111111111111';
const STUDENT_ID = 'ssssssss-2222-4222-8222-222222222222';

type Check = { name: string; severity: string; detail: string; metric?: number };

// MOCKED ONCE, AT MODULE SCOPE, AND IMPORTED ONCE. The first version of this file called
// `jest.resetModules()` and re-imported `systemHealthService` per test, which re-walks that
// module's entire dependency graph every time: six tests took 370 SECONDS, against an 8-minute
// budget for the whole backend suite. Varying the mock's implementation instead of reloading the
// module under test is the same coverage at a fraction of the cost.
const unregisteredDeliveryProjectsSince = jest.fn(async (): Promise<Array<{ id: string }>> => []);
const unregisteredStudentProjectsSince = jest.fn(async (): Promise<Array<{ id: string }>> => []);
jest.mock('../lifecycle/projectLifecycleRegistration', () => ({
  __esModule: true,
  unregisteredDeliveryProjectsSince: (...a: unknown[]) => unregisteredDeliveryProjectsSince(...(a as [])),
  unregisteredStudentProjectsSince: (...a: unknown[]) => unregisteredStudentProjectsSince(...(a as [])),
}));

// eslint-disable-next-line import/first
import { checkLifecycleRegistration, runFullSystemHealthCheck } from '../systemHealthService';

/** Point the two detectors at whatever a case needs, then run the check. */
async function runCheck(opts: {
  delivery?: Array<{ id: string }>;
  student?: Array<{ id: string }>;
  throws?: boolean;
}) {
  unregisteredDeliveryProjectsSince.mockReset();
  unregisteredStudentProjectsSince.mockReset();
  const impl = (rows: Array<{ id: string }>) => async () => {
    if (opts.throws) throw new Error('database unreachable');
    return rows;
  };
  unregisteredDeliveryProjectsSince.mockImplementation(impl(opts.delivery ?? []));
  unregisteredStudentProjectsSince.mockImplementation(impl(opts.student ?? []));

  const checks: Check[] = [];
  await checkLifecycleRegistration(checks as never);
  return {
    check: checks.find((c) => c.name === 'lifecycle_registration'),
    unregisteredDeliveryProjectsSince,
    unregisteredStudentProjectsSince,
  };
}
describe('the LC-01 bypass check behaves', () => {
  it('calls BOTH detectors — neither side is silently skipped', async () => {
    const { unregisteredDeliveryProjectsSince, unregisteredStudentProjectsSince } = await runCheck({});
    expect(unregisteredDeliveryProjectsSince).toHaveBeenCalledTimes(1);
    expect(unregisteredStudentProjectsSince).toHaveBeenCalledTimes(1);
  });

  it('reports OK with a zero metric when nothing has bypassed', async () => {
    const { check } = await runCheck({ delivery: [], student: [] });
    expect(check?.severity).toBe('ok');
    expect(check?.metric).toBe(0);
  });

  it('REPORTS A BYPASS, and names the ids rather than only counting', async () => {
    // The assertion that stops this being a check which can only ever say "fine". A bare count
    // sends an operator to write a query; the ids send them to the row.
    const { check } = await runCheck({
      delivery: [{ id: DELIVERY_ID }],
      student: [{ id: STUDENT_ID }],
    });

    expect(check?.severity).toBe('warning');
    expect(check?.metric).toBe(2);
    expect(check?.detail).toContain(DELIVERY_ID);
    expect(check?.detail).toContain(STUDENT_ID);
    // It must say WHICH side: the two have different causes and different fixes.
    expect(check?.detail).toContain('1 delivery');
    expect(check?.detail).toContain('1 student');
  });

  it('NEVER escalates to critical — that would 503 the health endpoint over a governance gap', async () => {
    // `critical` makes /health/full answer 503, which pages people and trips uptime monitors. An
    // unregistered project is serious and is not an outage; using the outage lever for it trains
    // people to ignore the endpoint.
    const { check } = await runCheck({
      delivery: [{ id: DELIVERY_ID }, { id: DELIVERY_ID }, { id: DELIVERY_ID }],
      student: [{ id: STUDENT_ID }, { id: STUDENT_ID }],
    });
    expect(check?.metric).toBe(5);
    expect(check?.severity).toBe('warning');
    expect(check?.severity).not.toBe('critical');
  });

  it('a check that CANNOT RUN does not read as a pass', async () => {
    // The rule the whole system is built on, applied to the check itself. If the detector throws,
    // reporting `ok` would be absence presented as evidence of absence.
    const { check } = await runCheck({ throws: true });

    expect(check).toBeDefined();
    expect(check?.severity).not.toBe('ok');
    expect(check?.detail).toContain('NOT a pass');
    expect(check?.detail).toContain('did not run');
  });
});

describe('REACHABILITY: the check actually runs inside the health report', () => {
  // Deliberately ONE test. It runs the real orchestrator, so the other nine checks execute and
  // touch the database and the network — slow, and tolerated once, because this is the only thing
  // that can prove the check is wired rather than merely written. A source sweep could establish
  // that the call appears in the file; only running it establishes that it happens.
  jest.setTimeout(120_000);

  it('appears in a real runFullSystemHealthCheck report, and its detectors are called', async () => {
    unregisteredDeliveryProjectsSince.mockReset().mockResolvedValue([]);
    unregisteredStudentProjectsSince.mockReset().mockResolvedValue([]);

    const report = await runFullSystemHealthCheck();

    expect(report.checks.map((c: Check) => c.name)).toContain('lifecycle_registration');
    expect(unregisteredDeliveryProjectsSince).toHaveBeenCalled();
    expect(unregisteredStudentProjectsSince).toHaveBeenCalled();
  });
});
