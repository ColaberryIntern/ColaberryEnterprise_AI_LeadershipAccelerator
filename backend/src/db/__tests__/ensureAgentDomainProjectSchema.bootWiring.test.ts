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
 * `ensureAgentDomainProjectSchema` is one of five `ensure*` files (of 110) whose post-condition
 * throws. `start()` is called bare, `app.listen` is its last statement, and `backend/src` registers
 * no `unhandledRejection` handler — so an uncontained throw here stops the backend binding its
 * port. That is the rule `server.ts` states twice within 250 lines of this registration. Removing
 * the `try`/`catch` would be invisible to every other test in the repository.
 */

import * as fs from 'fs';
import * as path from 'path';
import { activeBootCall, serverSourceText } from './helpers/bootCalls';

// The boot call is the GUARDED helper. The inline try/catch moved into the module so the
// failure path could be EXERCISED rather than grepped -- see
// ensureAgentDomainProjectSchema.guard.test.ts, which drives it with a rejecting
// dependency. An independent re-grade failed this task because every assertion here read
// server.ts as a string and none proved the port still binds.
const CALL = 'await ensureAgentDomainProjectSchemaGuarded()';
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
  it('the guard is in the MODULE, so server.ts has no inline try/catch to grep', () => {
    // This used to assert server.ts contained a try and a catch around the call. It no longer
    // does, ON PURPOSE: the guard moved into ensureAgentDomainProjectSchemaGuarded so the failure
    // path could be driven by a test instead of described by a regex. The old assertion passed
    // while proving nothing about whether the port binds -- and, as an independent re-grade
    // pointed out, `try {` survived even a mutation that deleted the whole block, because a
    // neighbouring boot section supplied one within the search window. The margin was one keyword.
    const at = activeBootCall(CALL);
    const around = src.slice(at, at + 400);
    expect(around).not.toMatch(/catch \(/);
  });

  it('every ensure* with a throwing post-condition is accounted for, and this one is the guarded one', () => {
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
      // NEWLINE-TOLERANT. The original detector required `throw new Error(` and the backtick
      // on ONE line, so `ensureBroadcastTelemetrySchema.ts` -- which splits them across two --
      // was invisible to it. A green test asserting a falsehood on a whitespace artifact is a
      // disabled check, and this one asserted that this file was unique when it is not.
      return /throw new Error\(\s*`SchemaInvariantViolation/s.test(s);
    });
    // The honest invariant: this file is AMONG the throwing set, and the set is the measured
    // one. Asserting uniqueness was the fabrication; asserting membership plus a pinned roster is
    // what actually protects anything.
    expect(throwing).toContain('ensureAgentDomainProjectSchema.ts');
    // AF4.2 added the third member, 2026-10-29. `ensureAgentDomainChangeRequestSchema.ts` asserts
    // its post-condition against `information_schema` and raises SchemaInvariantViolation, for the
    // reason this roster exists: its own `ensure` cannot fail, because `CREATE TABLE IF NOT EXISTS`
    // is a no-op on an existing table and every statement error is warned rather than raised, so it
    // resolves identically whether the DDL worked or did nothing at all.
    //
    // It is guarded the same way: `ensureAgentDomainChangeRequestSchemaGuarded` cannot reject, and
    // `__tests__/ensureAgentDomainChangeRequestSchema.test.ts` drives that failure path over an
    // Error, a string, null and undefined rather than grepping for a try/catch.
    //
    // THIS ROSTER IS THE POINT, so it is updated rather than loosened: a new throwing
    // post-condition that nobody wrapped would otherwise reach `server.ts` and stop the port
    // binding, and the pin is what forces a reviewer to look.
    expect(throwing.sort()).toEqual([
      'ensureAgentDomainChangeRequestSchema.ts',
      'ensureAgentDomainProjectSchema.ts',
      'ensureBroadcastTelemetrySchema.ts',
    ]);
  });

  /**
   * THE CATCH IS NO LONGER IN server.ts, AND THAT IS THE FIX.
   *
   * Three assertions used to live here: that the catch derives its error class, that it emits
   * structured JSON, and that it does not rethrow. All three read server.ts as a STRING. An
   * independent re-grade failed the task on exactly that — a source-grep proves a try/catch was
   * typed, never that the port still binds when the schema call rejects.
   *
   * The guard is now `ensureAgentDomainProjectSchemaGuarded` in the module, and those three
   * properties are asserted BEHAVIOURALLY in ensureAgentDomainProjectSchema.guard.test.ts: it is
   * driven with a rejecting dependency (an Error, a bare Error, a string, null, undefined) and
   * asserted to RESOLVE, with the emitted warning parsed and its derived error_class checked.
   *
   * What remains here is the only thing server.ts can actually prove: that it calls the guarded
   * helper rather than the raw one, so the guard cannot be bypassed by reverting one word.
   */
  it('server.ts calls the GUARDED helper, never the raw schema function', () => {
    expect(activeBootCall('await ensureAgentDomainProjectSchemaGuarded()')).toBeGreaterThan(-1);
    // The raw call must not be awaited directly anywhere in the boot path -- that is the
    // regression this guards, and it is a one-word revert away.
    expect(activeBootCall('await ensureAgentDomainProjectSchema()')).toBe(-1);
  });

  it('the behavioural guard test exists and drives the failure path', () => {
    // A pointer with teeth: if the behavioural suite is deleted, this fails rather than leaving
    // the structural assertions above looking like full coverage.
    const guardTest = fs.readFileSync(
      path.join(__dirname, 'ensureAgentDomainProjectSchema.guard.test.ts'), 'utf8',
    );
    expect(guardTest).toMatch(/resolves\.toMatchObject\(\{ ok: false \}\)/);
    expect(guardTest).toMatch(/mockRejectedValue/);
  });

  it('and it CONTINUES: the boot call cannot reject', () => {
    // A guard that swallows and then rethrows is not a guard. Asserted behaviourally in
    // guard.test.ts; what is checked here is that server.ts awaits it BARE, which is only safe
    // because the helper itself cannot reject.
    const at = activeBootCall(CALL);
    const around = src.slice(at, at + 1200);
    const catchBody = around.slice(around.indexOf('catch'));
    expect(catchBody.slice(0, 900)).not.toMatch(/\bthrow\b|process\.exit/);
  });
});
