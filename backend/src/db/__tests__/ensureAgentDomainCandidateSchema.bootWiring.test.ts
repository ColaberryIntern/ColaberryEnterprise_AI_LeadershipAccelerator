/**
 * The one line that makes the candidate table exist, asserted rather than assumed.
 *
 * ## Why this file exists
 *
 * T001 shipped the table, the model, the stages and 48 tests, all green — and nothing called the
 * ensure. The verifier caught it: the module's own header said *"on the next boot after merge"*
 * while `server.ts` named it nowhere, so `agent_domain_candidates` would never have been created
 * on any environment. Every test passed because every test mocks the database.
 *
 * That is the failure mode `helpers/bootCalls.ts` was written for, and its docblock records the
 * original incident in the same shape: *"commenting out the seed invocation while leaving the
 * line in place passed all 40 tests."* A header can assert a runtime behavior that no line of code
 * provides, and the only thing that notices is a reader querying a table that was never made.
 *
 * ## Why the ORDER is asserted and not just the presence
 *
 * `screen_request_id` and `tool_request_id` are foreign keys into `agent_domain_change_requests`.
 * On a database where that parent does not exist yet, this `CREATE TABLE` fails, the guarded
 * wrapper swallows the error into a warn line, and the table is simply absent with no obvious
 * cause. The sibling detail table carries the same ordering comment for the same reason.
 */

import { activeBootCall, serverSourceText } from './helpers/bootCalls';

const CALL = 'await ensureAgentDomainCandidateSchemaGuarded()';
const PARENT_CALL = 'await ensureAgentDomainChangeRequestSchemaGuarded()';

describe('the candidate schema is wired into boot', () => {
  it('POSITIVE CONTROL: the helper can see real boot calls, so a -1 below would mean something', () => {
    expect(serverSourceText().length).toBeGreaterThan(10_000);
    expect(activeBootCall(PARENT_CALL)).toBeGreaterThan(-1);
  });

  /**
   * MUTATION PROOF. Comment out the call in `server.ts` and this test dies with
   * `Expected: > -1  Received: -1`. A plain `indexOf` would still find the commented line, which
   * is the exact defect `activeBootCall` exists for.
   */
  it('the call is ACTIVE, not merely present in the text', () => {
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
  });

  it('runs BEFORE app.listen, so the table exists before the port opens', () => {
    const callAt = activeBootCall(CALL);
    const listenAt = serverSourceText().indexOf('app.listen(');
    expect(listenAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(listenAt);
  });

  it('runs AFTER the change-request table it holds two foreign keys into', () => {
    const parentAt = activeBootCall(PARENT_CALL);
    const callAt = activeBootCall(CALL);
    expect(parentAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(parentAt);
  });

  it('is the GUARDED variant, which cannot reject, so the bare await is safe', () => {
    // The unguarded `ensureAgentDomainCandidateSchema` does not throw either, but
    // `assertAgentDomainCandidateSchema` does, and only the guarded wrapper runs both and
    // contains the throw. `backend/src` registers no `unhandledRejection` handler, so an
    // uncontained throw here would stop the backend binding its port.
    expect(activeBootCall(CALL)).toBeGreaterThan(-1);
    expect(serverSourceText()).toMatch(
      /import \{ ensureAgentDomainCandidateSchemaGuarded \} from '\.\/db\/ensureAgentDomainCandidateSchema'/,
    );
    expect(activeBootCall('await ensureAgentDomainCandidateSchema()')).toBe(-1);
  });
});
