/**
 * THE ROSTER. Which routes may a domain builder reach, and are they all reads?
 *
 * `requireAgentManagerOrDomainBuilder` is registered on four routes. Its sibling
 * `requireAgentManagerOrAdmin` is registered on 28 more, and most of those are writes:
 * approving the agent's memory proposals, approving or rejecting manager-inbox items, revoking
 * directives, sending manager messages, PATCHing a behaviour switch, PUTting the role charter.
 * Moving any one of those onto the builder gate would hand a builder a decision that belongs to
 * the accountable manager.
 *
 * This file is the reviewer-forcing function for that, modelled on the `ensure*` boot roster in
 * `src/db/__tests__/ensureAgentDomainProjectSchema.bootWiring.test.ts`: the set is PINNED, so a
 * fifth route fails CI and has to be argued for rather than merged quietly. It is updated, never
 * loosened.
 *
 * The middleware carries its own independent GET-only guard, and
 * `middlewares/__tests__/agentManagerOrDomainBuilder.test.ts` drives it. Two guards, because
 * "we only put it on GETs" is a habit, and habits are not access control.
 */

import * as fs from 'fs';
import * as path from 'path';

const GATE = 'requireAgentManagerOrDomainBuilder';
const ROUTES_DIR = path.join(__dirname, '..');

/** Every `*.ts` route file in `src/routes/admin`, read once. */
function routeFiles(): Array<{ file: string; text: string }> {
  return fs.readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8') }));
}

/** `router.<verb>('<path>', requireAgentManagerOrDomainBuilder(...)` on one line. */
const REGISTRATION = new RegExp(
  String.raw`router\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*${GATE}\(`,
  'g',
);

function registrations(): Array<{ verb: string; route: string; file: string }> {
  const found: Array<{ verb: string; route: string; file: string }> = [];
  for (const { file, text } of routeFiles()) {
    for (const m of text.matchAll(REGISTRATION)) {
      found.push({ verb: m[1], route: m[2], file });
    }
  }
  return found;
}

/** Uses of the gate as a middleware argument, however they are formatted. */
function callSiteCount(): number {
  let n = 0;
  for (const { text } of routeFiles()) {
    // The import line names it too; count only the invocations.
    n += (text.match(new RegExp(String.raw`${GATE}\(`, 'g')) || []).length;
  }
  return n;
}

describe('the builder-readable roster', () => {
  it('POSITIVE CONTROL: the scanner reads real route files and finds the sibling gate too', () => {
    // Without this, every assertion below could be passing over a scanner that reads nothing,
    // or over a directory that moved.
    const files = routeFiles();
    expect(files.length).toBeGreaterThan(20);
    const siblingUses = files.reduce(
      (n, f) => n + (f.text.match(/requireAgentManagerOrAdmin\(/g) || []).length,
      0,
    );
    expect(siblingUses).toBeGreaterThan(20);
  });

  it('is EXACTLY these four routes', () => {
    // Updated, never loosened. A fifth route here is a decision about who may read an agent
    // they do not manage, and it should cost a reviewer's attention.
    //
    //   agents/:id               the Agent Detail page itself, which is the one call the page
    //                            makes on mount; without it the builder sees only an error
    //   agents/:id/charter       the role the agent is being built to fill
    //   agents/:id/explainability why it decides what it decides
    //   agents/:id/goals         what it is aiming at
    //
    // Deliberately NOT included, and each for a reason rather than an oversight:
    //   /email, /conversation, /one-on-ones  a manager's correspondence with their employee
    //   /inbox, /memory-proposals            an approval queue, paired with approve/reject verbs
    //   /directives                          what the manager has instructed; revisit with a case
    //   /report-subscriptions, /report-runs, /report-preview   reporting configuration
    const routes = registrations().map((r) => r.route).sort();
    expect(routes).toEqual([
      '/api/admin/agents/:id',
      '/api/admin/agents/:id/charter',
      '/api/admin/agents/:id/explainability',
      '/api/admin/agents/:id/goals',
    ]);
  });

  it('every one of them is a GET', () => {
    const verbs = registrations().map((r) => `${r.verb} ${r.route}`);
    const notGet = verbs.filter((v) => !v.startsWith('get '));
    expect(notGet).toEqual([]);
  });

  /**
   * THE MEASUREMENT GUARD, and the reason it exists.
   *
   * `REGISTRATION` only matches a single-line registration. Several route files in this folder
   * register their middleware across multiple lines (`agentEmailInboxRoutes.ts` and
   * `managerInboxRoutes.ts` both do). A multi-line use of this gate would therefore be INVISIBLE
   * to the scanner, and the roster above would keep passing while the real set had grown.
   *
   * A silent zero reads exactly like a clean result. Comparing the parsed count against a raw
   * count of invocations is what tells the two apart.
   */
  it('the scanner sees EVERY use of the gate, not just the ones it can parse', () => {
    expect(registrations()).toHaveLength(callSiteCount());
  });

  it('the write verbs on the same routers kept the manager-only gate', () => {
    // The three writes that sit directly beside an opted-in read. If one of these ever shows up
    // on the builder gate, it will fail the GET assertion above -- this names them so the
    // failure says which decision was handed over.
    const goals = fs.readFileSync(path.join(ROUTES_DIR, 'agentGoalRoutes.ts'), 'utf8');
    const charter = fs.readFileSync(path.join(ROUTES_DIR, 'agentRoleCharterRoutes.ts'), 'utf8');
    expect(goals).toContain("router.post('/api/admin/agents/:id/goals', requireAgentManagerOrAdmin()");
    expect(goals).toContain("router.post('/api/admin/agents/:id/goals/:goalId/archive', requireAgentManagerOrAdmin()");
    expect(charter).toContain("router.put('/api/admin/agents/:id/charter', requireAgentManagerOrAdmin()");
  });
});
