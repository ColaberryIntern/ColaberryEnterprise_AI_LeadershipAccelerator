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
 * So this pins the call sites rather than the helper.
 *
 * THIS SWEEPS THE TREE RATHER THAN A LIST OF FILES, AND THAT IS THE WHOLE POINT. The first
 * version read three named wrappers, which meant a wrapper in a fourth file passed without a
 * check while the comment claimed otherwise. Quincy Ninying caught that reviewing PR 3439
 * before it merged, and `aiOrchestrator-Ali-AI.ts` was already exactly that case sitting in
 * main: four bare completion writes and no gate call at all, silently green.
 *
 * The list below is therefore the EXEMPTIONS, not the files to check. A new file is caught by
 * default, which is the property the old version only claimed to have.
 */

const BACKEND_SRC = path.join(__dirname, '../..');

// Statuses that mean "this run is over". Writing one unconditionally is what erases a pause.
const COMPLETION_STATUSES = ['idle', 'error'];

/**
 * A RUN WRAPPER is a file that claims a run by writing `status: 'running'` onto an agent row.
 * That claim is the thing that makes it responsible for releasing the row correctly, and it is
 * what separates a wrapper from the control surfaces below.
 *
 * Writing a completion status is NOT by itself a defect. Three files do it deliberately and
 * must keep doing it, which is why the rule is scoped to wrappers rather than to the whole
 * tree. Naming them here so a later reader does not "fix" them into the gate:
 *
 *   services/aiOpsService.ts            the operator control surface. Its pause case is what
 *                                       WRITES 'paused' and its resume case writes 'idle'. It
 *                                       is the authority the gate defers to, not a caller of it.
 *   intelligence/agents/agentFactory.ts activation. Sets enabled + 'idle' when a pending agent
 *                                       is approved. A lifecycle transition, not a run ending.
 *   services/agentResourceMonitor.ts    stops a degraded agent with 'error' and a reason. A
 *                                       monitor deliberately halting something, not a run
 *                                       reporting its own outcome.
 *
 * None of the three claims a run, so none of them is caught, and that falls out of the rule
 * rather than being waived by hand.
 */

/**
 * Wrappers allowed to break the rule, each with the reason it is safe today. Adding an entry is
 * a deliberate, reviewable act; forgetting to add one fails the build.
 */
const EXEMPT: Record<string, string> = {
  'services/aiOrchestrator-Ali-AI.ts':
    'Dead duplicate of aiOrchestrator.ts. The repo already records it as such in ' +
    'agentRegistryAuditClassification.ts:120 - "never a route or live application code path" - and ' +
    'nothing imports it. It claims runs and carries four bare completion writes and never calls the ' +
    'gate at all, so it is not a live defect while it stays dead, but consolidating or reviving it ' +
    'means routing it through completeRunPreservingControls FIRST. Listed by name so that landmine ' +
    'is visible here rather than hidden behind a short list of files this test happened to read.',
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      sourceFiles(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function rel(full: string): string {
  return path.relative(BACKEND_SRC, full).split(path.sep).join('/');
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

function completionWrites(src: string): string[] {
  return instanceUpdateCalls(src).filter((call) =>
    COMPLETION_STATUSES.some((status) => call.includes(`status: '${status}'`)),
  );
}

function runClaims(src: string): string[] {
  return instanceUpdateCalls(src).filter((call) => call.includes("status: 'running'"));
}

const ALL_SOURCES = sourceFiles(BACKEND_SRC).map((full) => ({
  file: rel(full),
  src: fs.readFileSync(full, 'utf8'),
}));

function read(file: string): string {
  return fs.readFileSync(path.join(BACKEND_SRC, 'services', file), 'utf8');
}

// Discovered, never enumerated: any file anywhere under backend/src that claims an agent run.
const RUN_WRAPPERS = ALL_SOURCES.filter(({ src }) => runClaims(src).length > 0).filter(
  ({ file }) => !(file in EXEMPT),
);

describe('agent run-completion writes go through the control gate', () => {
  it('no run wrapper completes its run with a bare instance update', () => {
    const offenders = RUN_WRAPPERS.filter(({ src }) => completionWrites(src).length > 0).map(
      ({ file }) => file,
    );

    // Named rather than counted, so the failure tells you which file to fix and the diff shows
    // a new wrapper arriving instead of a number going up.
    expect(offenders).toEqual([]);
  });

  it('every run wrapper consults the gate before running', () => {
    // A wrapper that starts a run without asking agentControlDecision ignores a pause outright,
    // which is a bigger hole than erasing one on the way out.
    const unguarded = RUN_WRAPPERS.filter(({ src }) => !src.includes('agentControlDecision')).map(
      ({ file }) => file,
    );

    expect(unguarded).toEqual([]);
  });

  it('finds the wrappers by sweeping, not from a list, and finds the known ones', () => {
    // The old version of this file read three hard-coded names. If this discovery ever returns
    // a short or empty set, both rules above go vacuously green, which is the exact failure
    // mode this file exists to make impossible.
    const found = RUN_WRAPPERS.map(({ file }) => file);

    expect(found).toContain('services/aiOrchestrator.ts');
    expect(found).toContain('services/cronInstrumentation.ts');
    expect(found.length).toBeGreaterThanOrEqual(2);
  });

  it('sweeps a believable number of files, so a broken walk cannot pass as a clean tree', () => {
    // Without this, a bug in sourceFiles that returned [] would make both assertions above
    // vacuously true: the all-green that this whole file exists to stop being possible.
    expect(ALL_SOURCES.length).toBeGreaterThan(200);
    expect(ALL_SOURCES.some(({ file }) => file === 'services/aiOrchestrator.ts')).toBe(true);
  });

  it('still allows the run-start claim, which is what makes the conditional write possible', () => {
    // The gate writes only when the row is still `running`, so something has to set that. This
    // assertion is here so the rule above reads as "route completions through the gate" rather
    // than "never touch status", which would be a different and wrong rule.
    expect(runClaims(read('aiOrchestrator.ts')).length).toBeGreaterThan(0);
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

  it('records a reason for every exemption', () => {
    // An exemption with no reason is how the old enumerated list would come back.
    Object.entries(EXEMPT).forEach(([file, reason]) => {
      expect(reason.length).toBeGreaterThan(80);
      expect(fs.existsSync(path.join(BACKEND_SRC, file))).toBe(true);
    });
  });
});
