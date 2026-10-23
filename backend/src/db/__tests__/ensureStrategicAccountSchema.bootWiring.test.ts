import { activeBootCall, serverSourceText } from './helpers/bootCalls';

/**
 * C8.3's DDL is worthless if it never runs, and the registration is one line.
 *
 * `helpers/bootCalls` exists for exactly this: its docblock records an incident where
 * "commenting out the seed invocation while leaving the line in place passed all 40
 * tests." `activeBootCall` ignores commented lines, which a plain indexOf would not.
 *
 * The ordering assertion is the one that matters here. The Organization and Lead models
 * now DECLARE the new columns, so Sequelize puts them in every SELECT against those
 * tables. If the port opens before the ensure runs, the first request touching an
 * organization 500s with `column "attributes" does not exist` — the precise failure
 * schemaReconcile.ts was written after it took down the Classroom twice.
 */
const CALL = 'await ensureStrategicAccountSchema()';

describe('the C8.3 schema ensure is wired into boot', () => {
  it('POSITIVE CONTROL: the helper can see real boot calls', () => {
    // Without this, every assertion below could be passing over a helper reading nothing.
    expect(serverSourceText().length).toBeGreaterThan(10_000);
    expect(activeBootCall('await ensureApolloCreditGuardSchema()')).toBeGreaterThan(-1);
  });

  it('the call is ACTIVE, not merely present in the text', () => {
    // MUTATION PROOF: comment the call out in server.ts and this returns -1.
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
  });

  it('runs BEFORE app.listen, so the columns exist before the port opens', () => {
    const callAt = activeBootCall(CALL);
    const listenAt = serverSourceText().indexOf('app.listen(');
    expect(callAt).toBeGreaterThan(-1);
    expect(listenAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(listenAt);
  });

  it('is wrapped, so a schema failure cannot stop the port binding', () => {
    // start() is called bare with app.listen() as its last statement and backend/src
    // registers no unhandledRejection handler, so an uncontained throw here is an outage.
    const src = serverSourceText();
    const at = activeBootCall(CALL);
    const around = src.slice(Math.max(0, at - 200), at + 300);
    expect(around).toMatch(/try \{/);
    expect(around).toMatch(/catch \(/);
  });

  it('the catch does not rethrow or exit', () => {
    const src = serverSourceText();
    const at = activeBootCall(CALL);
    const after = src.slice(at, at + 400);
    const catchBody = after.slice(after.indexOf('catch'));
    expect(catchBody.slice(0, 200)).not.toMatch(/\bthrow\b|process\.exit/);
  });
});
