import * as fs from 'fs';
import * as path from 'path';

/**
 * AF4.2 acceptance criterion 4: **"No build is triggered automatically by an approval."**
 *
 * ## Why this is a separate file from the door-3 assertion, which is the mistake it fixes
 *
 * The first version of this plan pointed its only structural test at the pure gate and claimed it
 * proved this criterion. It did not, and an independent audit caught it. Two different propositions
 * were being confused:
 *
 *   - **Door 3** is "nothing auto-approves": no timer or threshold path leads TO `approved`. That
 *     lives in `agentChangeRequest.test.ts`, which reads the pure gate.
 *   - **Criterion 4** is the converse, "approval triggers nothing": nothing is started FROM
 *     `approved`.
 *
 * Asserting the converse against the pure gate was vacuous, because that module is declared to
 * have no I/O at all. A trigger would live where the writes live — the service and the controller —
 * so that is what this file reads, by name.
 *
 * ## Why it is scoped to the approve path and the importer set, not to vocabulary
 *
 * An earlier draft banned eleven trigger-shaped WORDS from two whole files. That is safe against a
 * false pass and dangerous in the other direction: `queue` is this feature's own noun — the thing
 * Ali triages is a queue — and `publish` collides with a `published_at`-style column. The
 * predictable outcome was a false failure on correct code, then a repair that weakened the regex,
 * which turns this gate back into the decoration it exists to prevent.
 *
 * So the matcher requires CALL SHAPE: a trigger verb followed by `(`. That makes the allowlist
 * structural rather than a hand-maintained list of exceptions — a column named `published_at` can
 * never match, because it is not a call.
 *
 * The third assertion is the one that makes this evidence about the system rather than about two
 * files: a later `agentChangeRequestBuildBridge.ts` that subscribed to approvals would leave both
 * of the first two assertions passing.
 */

const SERVICE = path.join(__dirname, '..', 'agentChangeRequestService.ts');
const CONTROLLER = path.join(__dirname, '..', '..', '..', 'controllers', 'agentChangeRequestController.ts');
const ROUTER = path.join(__dirname, '..', '..', '..', 'routes', 'admin', 'agentChangeRequestRoutes.ts');
const BACKEND_SRC = path.join(__dirname, '..', '..', '..');

/** Comments and string literals removed: this is about what the code DOES, not what it says. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

/**
 * A trigger verb in CALL position. The trailing `\(` is the whole trick: it is why a `queue` noun,
 * a `published_at` column or a comment about the approval queue cannot fail this test, with no
 * exception list to maintain.
 */
const TRIGGER_CALL =
  /\b(?:trigger|schedule|enqueue|dispatch|publish|emit|sweep|kickOff|startBuild|runBuild|queueBuild|notifyBuild)[A-Za-z]*\s*\(/i;

/** Module paths that would bring a trigger into reach. */
const TRIGGER_MODULE = /(queue|job|worker|scheduler|cron|bull|agenda|kue|pubsub|broker)/i;

describe('the matcher can actually fail — positive controls first', () => {
  it('detects a build being enqueued', () => {
    // A regex that matches nothing passes a structural test exactly as well as clean code does.
    // Everything below is worthless without this.
    expect(TRIGGER_CALL.test('await enqueueBuild({ id });')).toBe(true);
    expect(TRIGGER_CALL.test('scheduleBuild(row.id)')).toBe(true);
    expect(TRIGGER_CALL.test('await triggerAgentRun(row);')).toBe(true);
    expect(TRIGGER_CALL.test('bus.emit("approved", row)')).toBe(true);
    expect(TRIGGER_CALL.test('dispatch({ type: "BUILD" })')).toBe(true);
  });

  it('does NOT fire on this feature’s own vocabulary', () => {
    // The false-failure direction, which is the one that would have cost attempts and then a
    // weakened regex.
    expect(TRIGGER_CALL.test('const queue = await listAllChangeRequests(sequelize);')).toBe(false);
    expect(TRIGGER_CALL.test('row.published_at')).toBe(false);
    expect(TRIGGER_CALL.test('/** the queue Ali triages */')).toBe(false);
    expect(TRIGGER_CALL.test('interface ChangeRequestQueue { rows: Row[] }')).toBe(false);
  });

  it('detects a trigger module being imported', () => {
    expect(TRIGGER_MODULE.test('../workLedger/approvalRequestTimeoutJob')).toBe(true);
    expect(TRIGGER_MODULE.test('../schedulerService')).toBe(true);
    expect(TRIGGER_MODULE.test('./agentChangeRequest')).toBe(false);
  });
});

describe('the files exist under the names this test reads', () => {
  it('fails loudly if the service or controller is renamed out from under it', () => {
    // Without this, moving the trigger into a renamed file would make the assertions below pass by
    // reading nothing at all.
    for (const f of [SERVICE, CONTROLLER, ROUTER]) {
      expect(fs.existsSync(f)).toBe(true);
    }
  });
});

describe('CRITERION 4 — approving triggers nothing', () => {
  it('the decide path contains no trigger call', () => {
    const code = codeOf(SERVICE);
    const start = code.indexOf('function decideChangeRequest');
    expect(start).toBeGreaterThan(-1);
    // To the next top-level export, which is the end of the function.
    const rest = code.slice(start);
    const end = rest.indexOf('\nexport ');
    const body = end > -1 ? rest.slice(0, end) : rest;
    expect(body).not.toMatch(TRIGGER_CALL);
  });

  it('the service and controller contain no trigger call anywhere', () => {
    for (const f of [SERVICE, CONTROLLER]) {
      expect(codeOf(f)).not.toMatch(TRIGGER_CALL);
    }
  });

  it('neither imports a job, queue, scheduler or worker module', () => {
    // A trigger has to come from somewhere, and imports are the doorway.
    for (const f of [SERVICE, CONTROLLER, ROUTER]) {
      const imports = [...codeOf(f).matchAll(/from\s+''|require\(\s*''/g)];
      // String literals are blanked by codeOf, so read the raw source for paths only.
      const raw = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ');
      const paths = [...raw.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      expect(imports.length).toBeGreaterThanOrEqual(0);
      const offenders = paths.filter((p) => TRIGGER_MODULE.test(p));
      expect(offenders).toEqual([]);
    }
  });
});

describe('nothing outside the change-request module reaches into the service', () => {
  /**
   * This is the assertion that makes criterion 4 a property of the SYSTEM rather than of two
   * files. "These two modules trigger nothing" is not enough on its own: a new
   * `agentChangeRequestBuildBridge.ts` importing the service and acting on approvals would leave
   * every assertion above green.
   */
  const ALLOWED = [
    path.join('services', 'agentDomain', 'agentChangeRequestService.ts'),
    path.join('controllers', 'agentChangeRequestController.ts'),
  ];

  function tsFilesUnder(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) tsFilesUnder(full, acc);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) acc.push(full);
    }
    return acc;
  }

  it('only the controller imports it, plus its own tests', () => {
    const importers = tsFilesUnder(BACKEND_SRC)
      .filter((f) => !f.includes('__tests__'))
      .filter((f) => /from\s+'[^']*agentChangeRequestService'/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(BACKEND_SRC, f));

    // POSITIVE CONTROL: the controller really does import it, so an empty list would mean the
    // scan is broken rather than that the rule holds.
    expect(importers.length).toBeGreaterThan(0);
    for (const imp of importers) {
      expect(ALLOWED.some((a) => imp.endsWith(a))).toBe(true);
    }
  });
});
