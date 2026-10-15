/**
 * T09 — the one line this task exists to add, asserted rather than assumed.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * ## Why this file exists
 *
 * T09's whole deliverable is a single registration in `server.ts`, and it had **zero tests**. A
 * verifier's point was exact: the line could be commented out and nothing would fail. The repo
 * already solved this — `helpers/bootCalls.ts` exists for precisely this question, and its own
 * docblock records the incident that produced it: *"commenting out the seed invocation while
 * leaving the line in place passed all 40 tests."* `ensureExplorerCampaignKeyIndex.test.ts` is a
 * working precedent one directory over, asserting both that the call is there and that it is
 * wrapped. T09 used neither.
 *
 * ## Why the wrapping is asserted and not just the presence
 *
 * `ensureAgentDomainProjectSchema` is the only one of 106 `ensure*` files whose post-condition
 * throws. `start()` is called bare, `app.listen` is its last statement, and `backend/src` registers
 * no `unhandledRejection` handler — so an uncontained throw here stops the backend binding its
 * port. That is the rule `server.ts` states twice within 250 lines of this registration. Removing
 * the `try`/`catch` would be invisible to every other test in the repository.
 */

import { activeBootCall, serverSourceText } from './helpers/bootCalls';

const CALL = 'await ensureAgentDomainProjectSchema()';
const src = serverSourceText();

describe('the boot registration is wired', () => {
  it('POSITIVE CONTROL: the helper can see real boot calls, so a -1 here would mean something', () => {
    // Two calls that are definitely wired. Without this, every assertion below could be passing
    // over a helper that reads nothing.
    expect(serverSourceText().length).toBeGreaterThan(10_000);
    expect(activeBootCall('await ensureProjectLifecycleSchema()')).toBeGreaterThan(-1);
  });

  /**
   * MUTATION PROOF. Comment out the call in `server.ts` and this test dies:
   *
   *   ● the boot registration is wired › the call is ACTIVE, not merely present in the text
   *     Expected: > -1   Received: -1
   *
   * `activeBootCall` is what makes that true — a plain `indexOf` would still find the commented
   * line, which is the exact defect the helper was written for.
   */
  it('the call is ACTIVE, not merely present in the text', () => {
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
  });

  it('runs BEFORE app.listen, so the schema exists before the port opens', () => {
    const callAt = activeBootCall(CALL);
    const listenAt = src.indexOf('app.listen(');
    expect(callAt).toBeGreaterThan(-1);
    expect(listenAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(listenAt);
  });

  it('is ordered against sequelize.sync, and the ACTUAL order is recorded', () => {
    // The first version of this asserted the call precedes `sequelize.sync(`. It does not, and
    // asserting a preference as a fact is how a wrong ordering claim ships. The real order is
    // pinned here so a CHANGE to it fails, which is the thing worth protecting.
    //
    // Why it is safe: `sync({ alter: true })` reconciles Sequelize MODELS, and neither of this
    // schema's two tables has a model -- they are raw DDL with a post-condition, so sync has
    // nothing to say about them in either order.
    const callAt = activeBootCall(CALL);
    const syncAt = src.indexOf('sequelize.sync(');
    expect(callAt).toBeGreaterThan(-1);
    if (syncAt === -1) return; // no sync in this build
    expect(callAt).toBeGreaterThan(syncAt);
  });
});

describe('the boot registration is WRAPPED, because its assert throws', () => {
  /**
   * MUTATION PROOF. Remove the `try`/`catch` around the call and this test dies:
   *
   *   ● the boot registration is WRAPPED › the call site contains a try and a catch
   *     Expected substring: "try {"
   *
   * Verified by applying that edit and re-running; reverted by re-applying the lines.
   */
  it('the call site contains a try and a catch', () => {
    const at = activeBootCall(CALL);
    expect(at).toBeGreaterThan(-1);
    const around = src.slice(Math.max(0, at - 400), at + 400);
    expect(around).toContain('try {');
    expect(around).toContain('catch');
  });

  it('this really is the only ensure* with a throwing post-condition, which is why it needs the guard', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const dir = path.join(__dirname, '..');
    const files = fs.readdirSync(dir).filter((f: string) => f.startsWith('ensure') && f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(90); // the denominator is real
    const throwing = files.filter((f: string) => {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      // A POST-CONDITION that throws, not a statement loop that re-throws: the marker is an
      // assert function raising SchemaInvariantViolation.
      return /SchemaInvariantViolation/.test(s) && /throw new Error\(`SchemaInvariantViolation/.test(s);
    });
    expect(throwing).toEqual(['ensureAgentDomainProjectSchema.ts']);
  });

  it('the catch DERIVES its error class rather than asserting one', () => {
    // It used to log a literal `SchemaInvariantViolation` for any caught error, so a connection
    // failure inside the introspection query would have been labelled as a schema violation it
    // is not. CLAUDE.md requires the class to be tagged before logging, and tagged correctly.
    const at = activeBootCall(CALL);
    const around = src.slice(at, at + 1200);
    expect(around).toMatch(/err instanceof Error \? err\.constructor\.name/);
    expect(around).not.toMatch(/error_class=SchemaInvariantViolation/);
  });

  it('the catch emits structured JSON with a timestamp, not a prose string', () => {
    const at = activeBootCall(CALL);
    const around = src.slice(at, at + 1200);
    expect(around).toMatch(/JSON\.stringify\(\{/);
    expect(around).toMatch(/timestamp:/);
    expect(around).toMatch(/outcome: 'failure'/);
  });

  it('and it CONTINUES: the catch does not rethrow or exit', () => {
    // A guard that swallows and then rethrows is not a guard. A backend that will not boot is
    // worse than one that boots carrying a named schema problem.
    const at = activeBootCall(CALL);
    const around = src.slice(at, at + 1200);
    const catchBody = around.slice(around.indexOf('catch'));
    expect(catchBody.slice(0, 900)).not.toMatch(/\bthrow\b|process\.exit/);
  });
});
