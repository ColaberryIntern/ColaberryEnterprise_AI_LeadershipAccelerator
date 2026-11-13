/**
 * The `page_events` visitor index is BOOT-WIRED — asserted, not assumed.
 *
 * ## Why this file exists separately from the roster
 *
 * Adding `ensurePageEventVisitorIndex.ts` to the pinned roster in
 * `ensureAgentDomainProjectSchema.bootWiring.test.ts` proves the module is ACCOUNTED FOR: that a
 * human looked at a new throwing post-condition and wrote down why it is safe. It does not prove
 * the call is in `server.ts`. That roster reads the `db/` directory, never the boot path, so the
 * `await` could be deleted and the roster would stay green.
 *
 * That gap is the exact defect `helpers/bootCalls.ts` was written for, and its own docblock
 * records the incident: *"commenting out the seed invocation while leaving the line in place
 * passed all 40 tests."* A module whose entire deliverable is one registration needs a test that
 * dies when the registration goes away, or the deliverable is untested.
 *
 * ## Why a missing index would be quiet
 *
 * It fails SOFT, which is worse than failing loudly for the purpose of noticing. Drop this call
 * and nothing breaks: every query still returns correct rows, every test still passes, and the
 * only symptom is that reads keyed on `visitor_id` go back to sequentially scanning the largest
 * table in the schema. That is a regression nobody is paged for and that no assertion elsewhere
 * can see — so it gets one here.
 */

import { activeBootCall, serverSourceText } from './helpers/bootCalls';

const CALL = 'await ensurePageEventVisitorIndexGuarded()';
const src = serverSourceText();

describe('the page_events visitor index is wired into boot', () => {
  it('POSITIVE CONTROL: the helper can see real boot calls, so a -1 below would mean something', () => {
    // Without this, every assertion in this file could be passing over a helper that reads
    // nothing at all, and a green suite would prove only that the file loaded.
    expect(src.length).toBeGreaterThan(10_000);
    expect(activeBootCall('await ensureAgentToolGrantSchemaGuarded()')).toBeGreaterThan(-1);
  });

  /**
   * MUTATION PROOF. Comment out the call in `server.ts` and this dies:
   *
   *   ● the call is ACTIVE, not merely present in the text
   *     Expected: > -1   Received: -1
   *
   * `activeBootCall` is what makes that true. A plain `indexOf` would still find the commented
   * line, which is the defect the helper exists for.
   */
  it('the call is ACTIVE, not merely present in the text', () => {
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
  });

  it('calls the GUARDED helper, never the raw function', () => {
    // The raw `ensurePageEventVisitorIndex()` throws nothing itself, but `assert` does, and the
    // guarded wrapper is the only thing that contains it. `start()` is awaited bare with
    // `app.listen` as its last statement and no `unhandledRejection` handler, so an uncontained
    // throw here means the backend never binds its port. That is one word away at all times.
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
    expect(activeBootCall('await ensurePageEventVisitorIndex()')).toBe(-1);
    expect(activeBootCall('await assertPageEventVisitorIndex()')).toBe(-1);
  });

  it('runs BEFORE app.listen, so the index exists before the port takes traffic', () => {
    const callAt = activeBootCall(CALL);
    const listenAt = src.indexOf('app.listen(');
    expect(callAt).toBeGreaterThan(-1);
    expect(listenAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(listenAt);
  });

  /**
   * The ACTUAL order against `sequelize.sync`, recorded rather than preferred.
   *
   * Why it is safe either way: `sync({ alter: true })` reconciles Sequelize MODELS. `PageEvent`
   * is a model, and `sync` has no opinion about a raw index this file created — it neither adds
   * nor drops it. The order is pinned so a CHANGE to it has to be deliberate, which is the thing
   * worth protecting; asserting a preference as a fact is how a wrong ordering claim ships.
   */
  it('is ordered against sequelize.sync, and the ACTUAL order is recorded', () => {
    const callAt = activeBootCall(CALL);
    const syncAt = src.indexOf('sequelize.sync(');
    expect(callAt).toBeGreaterThan(-1);
    if (syncAt === -1) return; // no sync in this build
    expect(callAt).toBeGreaterThan(syncAt);
  });

  it('is awaited BARE, which is only safe because the guard cannot reject', () => {
    // A guard that swallows and then rethrows is not a guard. The resolve-on-failure property is
    // asserted behaviourally in ensurePageEventVisitorIndex.test.ts, which drives it with a
    // rejecting driver; what is checked here is that server.ts adds no inline try/catch of its
    // own, because that would be the signal somebody stopped trusting the guard.
    const at = activeBootCall(CALL);
    expect(src.slice(at, at + 200)).not.toMatch(/catch \(/);
  });
});
