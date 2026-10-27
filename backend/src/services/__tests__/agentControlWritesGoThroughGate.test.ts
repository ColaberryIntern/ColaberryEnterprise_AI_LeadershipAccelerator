import fs from 'fs';
import path from 'path';

/**
 * The root cause behind findings 32, 33 and 58 was never a missing check. It was several
 * hand-written copies of the same write that did not agree with each other, so each fix closed
 * one copy and left the rest. `completeRunPreservingControls` exists to be the single copy, and
 * its own unit tests cover what it does once it is called.
 *
 * What nothing covered is whether the wrappers actually call it. Finding 58 lived in exactly
 * that gap: the success path was routed through the gate and the failure path next to it was
 * not, so a pause set mid-run survived a clean finish and was erased by a crash. The agent then
 * ran again on the next tick, because 'error' is not 'paused'.
 *
 * So this pins the call sites rather than the helper. A run-completion status write that does
 * not go through the gate fails here, including in a wrapper that does not exist yet.
 */

const SERVICES = path.join(__dirname, '..');

// Every wrapper that starts an agent run, i.e. every caller of agentControlDecision.
const WRAPPERS = ['aiOrchestrator.ts', 'cronInstrumentation.ts', 'agentRunTracker.ts'];

// Statuses that mean "this run is over". Writing one unconditionally is what erases a pause.
const COMPLETION_STATUSES = ['idle', 'error'];

function read(file: string): string {
  return fs.readFileSync(path.join(SERVICES, file), 'utf8');
}

/**
 * Returns the full text of every `agent.update(...)` call in the source, matched by balancing
 * parentheses rather than by line, because these calls span many lines.
 *
 * Deliberately case-sensitive: the static `AiAgent.update(...)` that the gate itself uses is a
 * different call with a WHERE clause, and must not be caught here.
 */
function instanceUpdateCalls(src: string): string[] {
  const needle = 'agent.update(';
  const calls: string[] = [];
  let i = src.indexOf(needle);

  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < src.length; j += 1) {
      if (src[j] === '(') depth += 1;
      else if (src[j] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    calls.push(src.slice(i, j + 1));
    i = src.indexOf(needle, j);
  }

  return calls;
}

describe('agent run-completion writes go through the control gate', () => {
  it.each(WRAPPERS)('%s never writes a completion status with a bare instance update', (file) => {
    const offenders = instanceUpdateCalls(read(file)).filter((call) =>
      COMPLETION_STATUSES.some((status) => call.includes(`status: '${status}'`)),
    );

    expect(offenders).toEqual([]);
  });

  it('still allows the run-start claim, which is what makes the conditional write possible', () => {
    // The gate writes only when the row is still `running`, so something has to set that. This
    // assertion is here so the rule above reads as "route completions through the gate" rather
    // than "never touch status", which would be a different and wrong rule.
    const claims = instanceUpdateCalls(read('aiOrchestrator.ts')).filter((call) =>
      call.includes("status: 'running'"),
    );

    expect(claims.length).toBeGreaterThan(0);
  });

  it('routes both the success and the failure path of runAgent through the gate', () => {
    const src = read('aiOrchestrator.ts');
    const callSites = src.split('completeRunPreservingControls(').length - 1;

    // Three in runHealthScans and runAgent's success path, plus runAgent's catch block. The
    // catch was the one missing, and a count is enough to notice it going away again.
    expect(callSites).toBeGreaterThanOrEqual(4);
  });

  it('leaves a wrapper that writes no status alone', () => {
    // agentRunTracker records counts, timings and last_error but never a status, so it cannot
    // erase a pause and needs no gate. Pinned so that a later change adding a status write to
    // it has to come past the first assertion in this file.
    const src = read('agentRunTracker.ts');

    COMPLETION_STATUSES.forEach((status) => {
      expect(src).not.toContain(`status: '${status}'`);
    });
  });
});
