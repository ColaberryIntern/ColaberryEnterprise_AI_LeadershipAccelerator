import fs from 'fs';
import path from 'path';

/**
 * T7(a) - NOTHING THE QUEUE CAN REACH IS ABLE TO APPROVE A MESSAGE ON ITS OWN.
 *
 * -- WHY A SOURCE SCAN AND NOT A UNIT TEST --
 *
 * `mayaOutboundQueue.test.ts` proves the service refuses a timer identity. That is a claim
 * about the code as written. This file answers a different question: can anything the queue
 * imports, at any depth, reach the machinery that already does the forbidden thing elsewhere in
 * this repository?
 *
 * The machinery is real and it is one import away. `services/workLedger/approvalRequestTimeout
 * Job.ts` selects every expired pending row and calls `approveApprovalRequest(row.id,
 * 'system:auto_approve_timeout')`, scheduled every fifteen minutes with no flag guard.
 * `services/reese/reeseOutreachHolds.ts` records the cost: 851 replayed DMs to 52 students
 * between 7 Oct and 12 Nov 2026, one student 37 times.
 *
 * A unit test cannot see a future edit that adds `import { approveApprovalRequest }` to a
 * module three hops down the graph. This can.
 *
 * -- COMMENTS ARE STRIPPED, AND THAT IS LOAD-BEARING --
 *
 * The modules under test DISCUSS the auto-approving sweep at length, by name, on purpose: that
 * is how the next reader learns why this queue exists. Without stripping, this scan would fail
 * on its own documentation - and `db/__tests__/bootSchemaCreatable.test.ts` records the mirror
 * failure, where prose describing a table's ABSENCE was read as creating it. The CONTROL below
 * asserts the forbidden names really are present in the raw text, so the stripping cannot
 * quietly become a no-op and leave every assertion passing for the wrong reason.
 */

const SRC = path.join(__dirname, '..', '..', '..');

/** The two modules the approve path actually runs through. */
const ROOTS = [
  path.join(SRC, 'services', 'maya', 'mayaOutboundQueue.ts'),
  path.join(SRC, 'services', 'maya', 'mayaOutboundExpiry.ts'),
  path.join(SRC, 'services', 'maya', 'mayaOutboundDelivery.ts'),
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Relative import specifiers in a file, as written. */
function importsOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  let m = re.exec(source);
  while (m) { out.push(m[1]); m = re.exec(source); }
  return out;
}

function resolve(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every module reachable from the roots, following relative imports inside `backend/src`. */
function transitiveGraph(): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [...ROOTS];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    seen.set(file, source);
    for (const spec of importsOf(source)) {
      const target = resolve(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

const GRAPH = transitiveGraph();
const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

/**
 * The symbols that, if reachable, would mean something other than a person can decide a Maya
 * message. Each is the real exported name, not a paraphrase.
 */
const FORBIDDEN = [
  'approveApprovalRequest',
  'sweepExpiredApprovalRequests',
  'system:auto_approve_timeout',
  'REPLAYABLE_ACTIONS',
];

describe('T7(a) the instrument is sound before it is trusted', () => {
  it('reaches a real graph, not an empty one', () => {
    // Without this, every "nothing in the graph does X" assertion below would pass vacuously
    // against a resolver that silently found no files.
    expect(GRAPH.size).toBeGreaterThan(5);
    for (const root of ROOTS) expect(GRAPH.has(root)).toBe(true);
  });

  it('CONTROL - the forbidden names ARE in the raw text, so stripping is load-bearing', () => {
    const raw = [...GRAPH.values()].join('\n');
    expect(raw).toContain('approveApprovalRequest');
    expect(raw).toContain('system:auto_approve_timeout');
  });

  it('CONTROL - a planted import would be caught', () => {
    // Proves the matcher fires, rather than only that it has never fired.
    const planted = stripComments("import { approveApprovalRequest } from '../workLedger/x';");
    expect(planted).toContain('approveApprovalRequest');
  });
});

describe('T7(a) nothing the queue can reach is able to approve a message', () => {
  it.each(FORBIDDEN.map((s) => [s]))('no module in the graph references %s in code', (symbol) => {
    const offenders = [...GRAPH.entries()]
      .filter(([, source]) => stripComments(source).includes(symbol))
      .map(([file]) => rel(file));
    expect(offenders).toEqual([]);
  });

  /**
   * The one timer the graph legitimately contains, and why it is named rather than excluded by
   * a looser rule.
   *
   * The first draft of the assertion below was "no module in the graph schedules anything" and
   * it failed on `services/launchSafety.ts`. That is not a near miss: the timer there is War
   * Room mode, a manually activated 2-minute loop that runs Cory's strategic cycle, and
   * `launchSafety` is in this graph because it owns the KILL SWITCH - the thing that turns Maya
   * off. Excluding it by relaxing the rule to "no NEW timers" would have been a weaker test
   * that happened to pass. Naming it keeps the rule absolute and makes the next timer, whatever
   * it is for, fail until somebody writes down why it is safe.
   */
  const ALLOWED_TIMER_MODULES = ['services/launchSafety.ts'];

  it('no timer in the graph can write to this queue', () => {
    // The auto-approving sweep is dangerous because it is a TIMER THAT WRITES TO THE APPROVAL
    // TABLE. Either half alone is ordinary; the combination is the defect. So the assertion is
    // about the combination, which is both sharper than "no timers" and impossible to satisfy
    // by moving the write into a helper.
    const offenders = [...GRAPH.entries()]
      .filter(([, source]) => {
        const code = stripComments(source);
        const hasTimer = /cron\.schedule|setInterval\(/.test(code);
        const touchesQueue = /MayaOutboundApproval|maya_outbound_approvals/.test(code);
        return hasTimer && touchesQueue;
      })
      .map(([file]) => rel(file));
    expect(offenders).toEqual([]);
  });

  it('and the only module in the graph with a timer at all is the kill switch', () => {
    const timers = [...GRAPH.entries()]
      .filter(([, source]) => /cron\.schedule|setInterval\(/.test(stripComments(source)))
      .map(([file]) => rel(file));
    // A new entry here is not automatically wrong, but it has to be looked at and written down
    // before this test goes green again.
    expect(timers.sort()).toEqual(ALLOWED_TIMER_MODULES);
  });

  it('the expiry sweep writes no status but expired', () => {
    const source = stripComments(fs.readFileSync(ROOTS[1], 'utf8'));
    const statuses = [...source.matchAll(/status:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...new Set(statuses)]).toEqual(['expired', 'pending_approval']);
    // And it never names a decider, so it cannot attribute a decision to anybody.
    expect(source).not.toContain('decided_by');
  });

  it('the expiry sweep is not boot-wired to any scheduler', () => {
    // Deliberate for this run: the queue ships with no timer attached at all, so the first
    // messages it holds cannot be aged out by something nobody has reviewed yet.
    const scheduler = fs.readFileSync(path.join(SRC, 'services', 'schedulerService.ts'), 'utf8');
    expect(stripComments(scheduler)).not.toContain('sweepExpiredMayaOutbound');
  });
});
