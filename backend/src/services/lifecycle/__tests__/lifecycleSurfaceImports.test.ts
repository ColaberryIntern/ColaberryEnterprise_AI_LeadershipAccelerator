/**
 * What the lifecycle surface imports — and precisely what that does and does not prove.
 *
 * Split out of `lifecycleJourneys.integration.test.ts` when that file reached 566 lines against
 * CLAUDE.md's 500-line hard ceiling. The seam is real: this needs no database and the journeys
 * cannot run without one, so they also fail for different reasons and should not share a file.
 * This phase already split `lifecycleEvidence.assessment.test.ts` at 504 for the same rule.
 */
import fs from 'fs';
import path from 'path';

/**
 * NO LIFECYCLE MODULE IMPORTS A SENDER DIRECTLY.
 *
 * The packet asks for "a test asserting the mail transport is the test-mode one". This asserts
 * something different: no module of the lifecycle surface has a sender, a biller or a Basecamp
 * client among its OWN imports.
 *
 * ── THE LIMIT, MEASURED RATHER THAN ASSUMED ──────────────────────────────────
 * This is a ONE-HOP claim and an earlier version of it overclaimed. A verifier ran the transitive
 * closure from this sweep's own seed set — 614 files reachable — and found a sender reachable at
 * DEPTH SIX:
 *
 *   projectLifecycleRoutes.ts -> authMiddleware -> authFailureLog -> aiEventService
 *     -> alertService -> alertDeliveryService -> emailService
 *
 * So "no external business action is POSSIBLE" was false, and this header used to say it. What is
 * true is that nothing on this surface reaches for a sender itself, and that the path above runs
 * only when auth FAILS and belongs to shared middleware every admin route in the repository uses.
 * A transitive sweep would flag every Express route in the codebase and so would say nothing
 * about this phase.
 *
 * It needs no database, so it runs even when the journeys skip.
 */
describe('no lifecycle module imports a sender, biller or Basecamp client DIRECTLY', () => {
  /**
   * The lifecycle surface, named EXPLICITLY rather than matched on a path.
   *
   * A path filter is unsafe here: this worktree is `acc-lifecycle-wt`, so EVERY file in the
   * repository has "lifecycle" in its absolute path. A first version of this sweep used
   * `/lifecycle/i.test(fullPath)` and flagged `opsRoutes.ts`, `personProfileRoutes.ts` and
   * `missedOpportunitiesRoutes.ts` — three unrelated admin routes that legitimately send mail.
   * It is the same root cause as the jest selection trap this phase already records, where a
   * positional pattern matched ~1,740 suites for the same reason.
   */
  const SERVICE_DIR = path.join(__dirname, '..');
  const EXTRA_FILES = [
    path.join(__dirname, '..', '..', '..', 'routes', 'admin', 'projectLifecycleRoutes.ts'),
    path.join(__dirname, '..', '..', '..', 'routes', 'admin', 'projectLifecycleReviewRoutes.ts'),
    path.join(__dirname, '..', '..', '..', 'routes', 'projectLifecycleRouteSupport.ts'),
    path.join(__dirname, '..', '..', '..', 'schemas', 'projectLifecycleSchema.ts'),
    path.join(__dirname, '..', '..', '..', 'schemas', 'projectLifecycleReviewSchema.ts'),
  ];

  /** Modules whose presence would mean this surface can act on the outside world. */
  const FORBIDDEN = /(emailService|gmailService|devEmailGuard|mandrill|basecamp|paysimple|nodemailer|twilio|slack|stripe)/i;

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '__tests__') walk(full, out);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) {
        out.push(full);
      }
    }
    return out;
  };

  /** Import SPECIFIERS only. A sender named in a comment is not a dependency. */
  const importSpecifiers = (text: string): string[] => {
    const code = text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    return [
      ...[...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]),
      ...[...code.matchAll(/import\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
      ...[...code.matchAll(/require\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
    ];
  };

  const files = [...walk(SERVICE_DIR), ...EXTRA_FILES];

  it('found the lifecycle modules to inspect, and every named file really exists', () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith('lifecycleStatus.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('linkedViews.ts'))).toBe(true);
    // An EXTRA_FILES entry that no longer exists would silently drop out of the sweep, so each
    // one is asserted present rather than read with a shrug.
    const missing = EXTRA_FILES.filter((f) => !fs.existsSync(f));
    expect(missing).toEqual([]);
  });

  it('has no sender, biller or Basecamp client among its OWN imports', () => {
    const offenders = files.flatMap((f) => importSpecifiers(fs.readFileSync(f, 'utf8'))
      .filter((spec) => FORBIDDEN.test(spec))
      .map((spec) => `${path.basename(f)} -> ${spec}`));
    // Named, not counted: which module reached for a sender is the whole point.
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: the predicate does flag a real offender', () => {
    // Without this, a regex that matched nothing would make the sweep above pass by inspecting
    // everything and recognising none of it.
    const synthetic = "import { sendMail } from '../../services/emailService';\n"
      + "const bc = await import('../basecampClient');";
    const flagged = importSpecifiers(synthetic).filter((s) => FORBIDDEN.test(s));
    expect(flagged.sort()).toEqual(['../../services/emailService', '../basecampClient']);
  });

  it('is not satisfied by PROSE: a sender named in a comment is not an import', () => {
    // `sbpAdapter.ts` legitimately mentions PaySimple in a comment, as an example of a
    // constraint requirement. A substring sweep would have called that a billing integration.
    const prose = '// CONSTRAINT ("must use PaySimple for payments") is context for the stories\n'
      + "import { emptyRefs } from './manifestRefs';";
    expect(importSpecifiers(prose).filter((s) => FORBIDDEN.test(s))).toEqual([]);
    expect(prose).toContain('PaySimple');
  });
});
