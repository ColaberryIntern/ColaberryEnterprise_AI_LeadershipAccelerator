import fs from 'fs';
import path from 'path';

/**
 * LC-01's completeness claim, DERIVED from the source rather than maintained by hand.
 *
 * ## Why this test exists in this shape
 *
 * The discovery record for this programme named three "natural chokepoints" and said that routing
 * registration through them "covers every row". That sentence was inherited into a plan and built
 * on before anybody re-derived it. It is false: measured at `509335f5` the three cover 6 of the 7
 * creation sites read as categories, and 5 of 7 as actually enumerated. The site it missed,
 * `services/factory/govDeliveryProject.ts`, landed three days after the inventory was taken and is
 * live in production — so a project has been created with no lifecycle, in production, every time
 * a government pursuit was approved since 2026-10-04.
 *
 * The lesson is not "the list was wrong". It is that a hand-written list of creation sites is
 * wrong within a week, so LC-01's acceptance cannot be a list. This test DERIVES the set from the
 * source on every run and fails when a site appears that is not accounted for.
 *
 * ## Why it reads files instead of running grep
 *
 * Two instruments have already under-reported on this tree while looking like they worked:
 *
 *   - plain `grep -r` SKIPS three `.ts` files as binary, because they contain deliberate,
 *     load-bearing NUL bytes — including `services/factory/factoryApproval.ts`, the most important
 *     approval file in the build. A sweep that silently omits it reports completeness it does not
 *     have.
 *   - the ripgrep-backed search tooling times out on this worktree and returned 4 of the 7 sites
 *     with no error at all.
 *
 * `fs.readFileSync` has neither failure mode. It reads NUL bytes as content and cannot time out
 * partway with a success status. That is the whole reason this test does its own walking, and it
 * mirrors `services/sbp/__tests__/skillRunbookCoverage.test.ts`, which reads files for the same
 * class of reason.
 *
 * ## Why the expectations are LISTS and not counts
 *
 * An earlier sweep in this programme asserted a count of 7 for `Project.create(` alone. The real
 * figure was 1: the unbounded pattern was also matching `DeliveryProject.create(` and
 * `OpsBcProject.create(` — a different model on a different table — as substrings. A count hides
 * which sites it counted, so every assertion below compares sorted sets of `file:line mechanism`
 * strings. When one fails, the diff names the site.
 */

const SRC = path.join(__dirname, '..', '..', '..');
const MODELS = path.join(SRC, 'models');

/** Normalised so no line-oriented regex can be defeated by `\r`. */
function readNormalised(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Blank out comments so a sweep reads CODE and not prose.
 *
 * This is not hypothetical tidiness. The first run of the sweep below reported two sites that do
 * not exist: `projectLifecycleRegistration.ts:78` and `:81`, which are sentences in that file's
 * own header explaining the mechanisms it covers. A completeness test that counts its own
 * documentation is measuring the wrong thing, and this programme has already lost a grading to the
 * mirror image of it — a cross-tenant sweep that was SATISFIED by a comment, whose fix then
 * silently no-opped because the files were CRLF and `.` does not match `\r`. Hence `readNormalised`
 * above, and hence the positive control below rather than trust.
 *
 * Comments are replaced with equal-length whitespace rather than removed, so byte offsets and
 * therefore line numbers are unchanged. The `[^:]` guard keeps `https://` out of the line-comment
 * rule.
 *
 * OVER-stripping is the dangerous direction for a completeness claim, because it hides a real
 * creation site. Two things make that safe here: the positive control proves the stripper's
 * behaviour in both directions, and the enumeration expectation is an explicit LIST of all seven
 * sites — so if stripping ever removed a real one, that test fails by name rather than passing
 * with a smaller set.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, before: string, comment: string) =>
      before + comment.replace(/./g, ' '));
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) return [];
    return [full];
  });
}

const SOURCE_FILES = walk(SRC);

/** `src`-relative, forward-slashed, so expectations read the same on Windows and CI. */
function rel(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/');
}

/**
 * Read and strip each file ONCE.
 *
 * The first version re-walked and re-read all 3,747 sources for every sweep, and the suite took
 * 105 seconds — on a test that runs under `Backend unit tests`, which is a required check on
 * `main`. Five sweeps over the same immutable bytes is four sweeps too many. Caching is also the
 * only way the sweeps are guaranteed to agree with each other: they now read identical input by
 * construction rather than by assuming nothing changed between passes.
 */
const STRIPPED: ReadonlyArray<readonly [string, string]> = SOURCE_FILES.flatMap((file) => {
  const raw = readNormalised(file);
  // CHEAP PRE-FILTER, and it is sound rather than a heuristic: `stripComments` only ever REMOVES
  // text, so a file whose raw bytes contain none of these substrings cannot contain a match after
  // stripping either. Skipping those avoids running the block-comment regex over ~3,700 files, and
  // every pattern in this suite is a superset of one of these literals. If a new pattern is added
  // below that is NOT, its literal must be added here too — otherwise the sweep silently stops
  // seeing files, which is precisely the under-reporting failure this suite was written to avoid.
  // Lowercased, and single words with no embedded whitespace. The first draft of this filter used
  // `'INSERT INTO'`, which is UNSOUND two ways: the raw-INSERT pattern below is case-insensitive
  // and matches `\s+`, so `Insert Into` and `INSERT  INTO` would both have been filtered out and
  // never swept. Each token here is a strict substring of every string its pattern can match.
  const candidates = ['project.', 'insert', 'hooks:'];
  const haystack = raw.toLowerCase();
  if (!candidates.some((c) => haystack.includes(c))) return [];
  return [[rel(file), stripComments(raw)] as const];
});

/**
 * Every match of `pattern`, as `src/relative/path.ts:LINE <matched text>`.
 *
 * Line numbers come from counting newlines in the prefix, so they are 1-indexed and match what an
 * editor shows.
 */
function sweep(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const [relPath, text] of STRIPPED) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let m: RegExpExecArray | null = re.exec(text);
    while (m !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      out.push(`${relPath}:${line} ${m[0].trim()}`);
      m = re.exec(text);
    }
  }
  return out.sort();
}

/**
 * The enumeration predicate, stated once.
 *
 * Word-boundaried on the left so `Project` cannot match the tail of `DeliveryProject` or
 * `OpsBcProject`; the optional `Delivery` group is what distinguishes the two identity models.
 * Covers all four Sequelize creation mechanisms, because restricting it to `.create(` is how the
 * `findOrCreate` site at `businessProcessSeedService.ts` escaped every earlier sweep.
 */
const CREATION = /(?:^|[^A-Za-z0-9_])(Delivery)?Project\.(?:create|findOrCreate|upsert|bulkCreate)\(/;

describe('LC-01 — the set of project-creation sites is derived, not listed', () => {
  it('finds a non-trivial source tree, so a wrong path cannot pass by scanning nothing', () => {
    // The failure this guards: `SRC` resolving somewhere empty makes every sweep below return []
    // and every "no unexpected sites" assertion pass vacuously. skillRunbookCoverage guards its
    // own sweep the same way, for the same reason.
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    expect(SOURCE_FILES.map(rel)).toContain('models/DeliveryProject.ts');
    expect(SOURCE_FILES.map(rel)).toContain('services/factory/govDeliveryProject.ts');
  });

  it('reads the NUL-byte files that plain grep skips as binary', () => {
    // TWO `.ts` files in this repository still carry deliberate NUL bytes, and ONE of them is
    // inside this walker's scope: `factoryIds.ts`. (The other is
    // `routes/__tests__/trackedLinkRedirectRoutes.test.ts`, which the walker excludes along with
    // every other `__tests__` directory.)
    //
    // `factoryApproval.ts` USED TO BE THE THIRD and is deliberately no longer: P7-T3 converted
    // its separator from a literal NUL to the escape, because the literal byte made the file
    // binary to git and a security fix to it could not be reviewed as a diff. Its digests are
    // unchanged and pinned by golden vectors in that module's own suite. It is still asserted
    // below for COVERAGE -- the approval surface must stay in the sweep -- just not as a
    // NUL-hazard subject, because it no longer is one.
    //
    // `grep -r` without `-a` omits NUL-bearing files silently, so a sweep built on it would
    // report a clean result it never actually checked. If the hazard assertion fails, the sweep
    // has stopped covering those files and no other test will say so.
    const nulBearing = [
      'services/factory/factoryIds.ts',
    ];
    // Covered by the sweep, but no longer NUL-bearing. Kept separate so the two properties are
    // not conflated: one is about reach, the other about the binary-file hazard.
    const coveredNotNul = ['services/factory/factoryApproval.ts'];
    for (const target of coveredNotNul) {
      expect(SOURCE_FILES.map(rel)).toContain(target);
      // And it really is plain text now, so this file cannot silently drift back.
      expect(fs.readFileSync(path.join(SRC, target)).includes(0)).toBe(false);
    }
    for (const target of nulBearing) {
      const full = path.join(SRC, target);
      expect(fs.existsSync(full)).toBe(true);
      expect(SOURCE_FILES.map(rel)).toContain(target);
      // Proves the NUL is really there, so this guard is testing the hazard and not a memory of it.
      expect(fs.readFileSync(full).includes(0)).toBe(true);
    }
  });

  it('strips prose but keeps code — the control that makes every sweep below trustworthy', () => {
    // Both directions, because a stripper that removes everything would make every tripwire pass
    // and a stripper that removes nothing is what produced the two phantom sites in the first run.
    const sample = [
      'const a = DeliveryProject.create({ x: 1 });',       // code: must survive
      '// a comment naming DeliveryProject.create( here',  // prose: must not
      '/* a block naming hooks: false here */',            // prose: must not
      "const url = 'https://example.com/a//b';",           // not a comment: must survive intact
    ].join('\n');
    const stripped = stripComments(sample);

    expect(stripped).toMatch(/const a = DeliveryProject\.create\(/);
    expect(stripped.split('\n')[1]).not.toMatch(/DeliveryProject/);
    expect(stripped.split('\n')[2]).not.toMatch(/hooks:/);

    // A MEASURED LIMITATION, pinned here rather than claimed away. The `[^:]` guard stops `://`
    // being read as a comment, so the scheme survives — but a LATER `//` inside the same string
    // literal is still blanked, because this stripper is not string-aware. The control found that;
    // the first draft of this test asserted the whole URL survived, which was simply false.
    //
    // Left as-is deliberately. A string-aware stripper is more code than the thing it protects and
    // would need its own tests to be trustworthy, and this error is in the SAFE direction twice
    // over: it can only ever remove text, and if it ever removed a real creation site the explicit
    // seven-item list below fails by name rather than quietly passing with a shorter set. That list
    // is the actual guarantee; this stripper is only an optimisation of what it reads.
    expect(stripped).toContain("'https://example.com/a");
    expect(stripped).not.toContain('//b');
    // Line structure preserved, so the line numbers every assertion reports stay correct.
    expect(stripped.split('\n')).toHaveLength(4);
    expect(stripped.split('\n').map((l) => l.length)).toEqual(
      sample.split('\n').map((l) => l.length),
    );
  });

  it('enumerates exactly the known creation sites, as a list', () => {
    // Derived at 509335f5 by the identical logic, not transcribed. Any addition or removal fails
    // here BY NAME, which is the whole point: the next `govDeliveryProject.ts` cannot arrive
    // unnoticed the way that one did.
    expect(sweep(CREATION)).toEqual([
      'scripts/seedDevClientReviewer.ts:183 DeliveryProject.create(',
      'scripts/seedFactoryDemoContract.ts:31 DeliveryProject.create(',
      'scripts/seedOrdinaryProjectDemo.ts:27 DeliveryProject.create(',
      // The Agent Factory provisioner (CC-20261006-a4k7). An EIGHTH creation site, declared here
      // because this list is the mechanism for declaring one. It first wrote `projects` with raw
      // SQL and a hand-written `project_lifecycle_states` row -- firing neither hook and building
      // the parallel path this whole module exists to eliminate -- and the raw-insert tripwire
      // above is what caught it. It now goes through the model inside its own transaction and
      // passes `lifecycleEntryPoint: 'agent_domain_factory_provisioner'`.
      // Moved 209 -> 213 by T14, which added a tenant predicate and a `resolveTenantId` call
      // above this one. Same call site, same mechanism, four lines lower. Re-pinned rather than
      // loosened: the line number is what makes a failure name the site, which is this file's
      // whole design.
      'services/agentDomain/agentDomainProvisioner.ts:213 Project.findOrCreate(',
      'services/businessProcessSeedService.ts:135 Project.findOrCreate(',
      'services/delivery/leadConversion.ts:175 DeliveryProject.create(',
      // Moved 134 -> 147 -> 154 -> 202: helpers added above this call site (selectsSolutionBuild, then the
      // asIdentityId uuid guard CC-20261015-g4w7, then grantApproverReviewer CC-20261027-p4k9, which grants the
      // approving admin a reviewer role on the project after the transaction). Same creation site, same
      // mechanism; re-pinned, not loosened.
      'services/factory/govDeliveryProject.ts:202 DeliveryProject.create(',
      'services/projectService.ts:67 Project.create(',
    ]);
  });
});

describe('LC-01 — registration coverage, split by what the row can supply', () => {
  const sites = sweep(CREATION);
  const deliverySites = sites.filter((s) => / DeliveryProject\./.test(s));
  const studentSites = sites.filter((s) => !/ DeliveryProject\./.test(s));

  it('covers every delivery-project creation site through the model hook', () => {
    // Not "we wrapped N call sites" — the hook is on the model, so coverage is structural and this
    // assertion exists to prove the set it covers is the whole set, not to prove the wiring.
    expect(deliverySites.length).toBeGreaterThan(0);
    const wiring = readNormalised(path.join(MODELS, 'DeliveryProject.ts'));
    expect(wiring).toMatch(/hooks:\s*\{[^}]*afterCreate:\s*deliveryProjectLifecycleHook/s);
  });

  it('covers student-project sites TOO, now that the tenancy gap is closed', () => {
    // THIS TEST USED TO ASSERT THE OPPOSITE, and its own comment specified the condition for
    // flipping it: "Project is deliberately unwired -- and this test fails if someone wires it
    // without closing the tenancy gap first, because a lifecycle row needs a tenant it cannot
    // get." P6-T1b closed the gap first. This is that change arriving.
    expect(studentSites.length).toBeGreaterThan(0);
    const projectModel = readNormalised(path.join(MODELS, 'Project.ts'));

    // BOTH hooks. Wiring only `afterCreate` would register nothing on the paths that do not
    // supply a tenant, because `tenant_id` would still be null at INSERT -- and it would do so
    // silently, which is the failure this pair exists to prevent.
    expect(projectModel).toMatch(/hooks:\s*\{[^}]*beforeCreate:\s*studentProjectTenantHook/s);
    expect(projectModel).toMatch(/hooks:\s*\{[^}]*afterCreate:\s*studentProjectLifecycleHook/s);

    // And the tenancy gap is genuinely CLOSED rather than stepped over: the column exists on
    // the model, it is nullable because an unattributable project must still be creatable, and
    // the resolver that fills it refuses rather than guessing once a second tenant owns
    // student projects.
    expect(projectModel).toMatch(/declare tenant_id: string \| null;/);
    const resolver = readNormalised(path.join(SRC, 'services', 'lifecycle', 'studentTenant.ts'));
    // The refusal it keeps, and the warning it uses instead of the one it dropped. The first
    // version refused on any multi-tenant observation; running it showed that one project in a
    // second tenant then disabled attribution for every project after it, so that became a
    // warning. Both strings are asserted because dropping either would change the policy
    // silently.
    expect(resolver).toContain('configured_tenant_missing');
    expect(resolver).toContain('student_tenant_multi_tenant_observed');
  });
});

describe('LC-01 — tripwires for the mechanisms a model hook CANNOT see', () => {
  /**
   * A model `afterCreate` hook fires for `create`, `findOrCreate`'s create branch and instance
   * `.save()`. It does NOT fire for `bulkCreate` without `individualHooks: true`
   * (`sequelize/lib/model.js:1568`), for `upsert`, for raw SQL, or when a caller passes
   * `hooks: false` (`model.js:2546` guards the entire invocation on it).
   *
   * All four are ZERO on these tables today. Each assertion below is therefore a tripwire rather
   * than a gap: it fails by name the moment someone introduces a mechanism that would silently
   * bypass registration. That converts the hook's disclosed residual gap from a paragraph in a
   * header comment into something CI enforces.
   *
   * SCOPE, stated because the test names now carry it and it is a real limit: this walker covers
   * the `backend/src` tree recursively, TypeScript files only. It does not see JavaScript, SQL,
   * the frontend, or the repository-root `scripts` tree. A wider sweep was run independently over
   * the whole repository and every file type: zero raw inserts into either identity table, zero
   * `upsert` or `bulkCreate` on either model, and the only `hooks: false` in the tree is inside
   * the hook's own header comment — which is incidentally the proof that the comment-stripper
   * above is load-bearing rather than decorative. That sweep also found 8 `DeliveryProject.create(`
   * sites under the root `scripts` tree; they `require` the real COMPILED model out of `dist`, so
   * the hook fires for them too and the coverage is genuinely structural. Widening this walker
   * would pull in `node_modules` and the frontend for no new signal, so the test NAMES carry the
   * limit instead of the sweep hiding it.
   *
   * (Written without a `**` glob on purpose: a `*` followed by `/` inside a block comment closes
   * it, and an earlier version of this paragraph did exactly that — everything after it parsed as
   * code and the whole suite failed to compile. It reported as ONE FAILED SUITE WITH ZERO FAILED
   * TESTS, so the run's totals still read "16 passed, 16 total". That is the selection trap this
   * programme already records: read the suite line, never only the test line.)
   */

  it('has no bulkCreate or upsert on either identity model anywhere in backend/src', () => {
    expect(sweep(/(?:^|[^A-Za-z0-9_])(?:Delivery)?Project\.(?:upsert|bulkCreate)\(/)).toEqual([]);
  });

  it('has no raw INSERT into either identity table anywhere in backend/src', () => {
    expect(sweep(/insert\s+into\s+"?(?:projects|delivery_projects)"?/i)).toEqual([]);
  });

  it('has no queryInterface.bulkInsert into either identity table anywhere in backend/src', () => {
    expect(sweep(/bulkInsert\(\s*['"`](?:projects|delivery_projects)/)).toEqual([]);
  });

  it('has no `hooks: false` in backend/src, which would disable registration one site at a time', () => {
    // Word-boundaried on the left for a measured reason: the first version of this sweep matched
    // `webhooks: false` in services/publishing/providerCapabilities.ts and reported a false
    // positive — the same substring bug that made an earlier `Project.create(` count wrong by 6.
    expect(sweep(/(?:^|[^A-Za-z0-9_])hooks:\s*false/)).toEqual([]);
  });
});

describe('each seed script labels its own lifecycle', () => {
  /**
   * Why this is a source assertion and not only a behavioural one.
   *
   * The behavioural test beside this (in the integration suite) proves the MECHANISM: a supplied
   * `lifecycleEntryPoint` reaches `entry_point`, and the default is the mechanism name. It uses a
   * probe label, so it says nothing about the three real ones.
   *
   * And nothing else can. Each seed passes its label inside an `as any` cast on the options object
   * — necessary because `lifecycleEntryPoint` is not part of Sequelize's `CreateOptions` — which
   * removes the compile-time guard. So a typo in `seed:factoryDemoContract` would be caught by
   * neither `tsc` nor any behavioural test, and would surface only as a mislabelled row nobody is
   * reading yet. The consequence is small; the fact that nothing at all would notice is not.
   *
   * These assertions are therefore about the one property left unguarded: that each script carries
   * exactly the label this test names.
   */
  const SCRIPTS: ReadonlyArray<readonly [string, string]> = [
    ['scripts/seedDevClientReviewer.ts', 'seed:devClientReviewer'],
    ['scripts/seedFactoryDemoContract.ts', 'seed:factoryDemoContract'],
    ['scripts/seedOrdinaryProjectDemo.ts', 'seed:ordinaryProjectDemo'],
  ];

  it.each(SCRIPTS)('%s passes %s', (file, label) => {
    const source = stripComments(readNormalised(path.join(SRC, file)));
    // Stripped, so a label mentioned only in a comment cannot satisfy this — the same discipline
    // the rest of this suite uses, and the failure mode a comment-satisfiable sweep already caused
    // once in this programme.
    expect(source).toContain(`lifecycleEntryPoint: '${label}'`);
  });

  it('every seed that creates a delivery project is in the list above', () => {
    // The guard against this describe block going stale: if a fourth seed script starts creating
    // delivery projects, the enumeration test fails on the new site AND this fails on the missing
    // label, so neither the coverage nor the provenance can drift silently.
    const seedCreationSites = sweep(CREATION)
      .filter((s) => s.startsWith('scripts/') && / DeliveryProject\./.test(s))
      .map((s) => s.split(':')[0]);
    expect(seedCreationSites.sort()).toEqual(SCRIPTS.map(([f]) => f).sort());
  });
});

describe('the registration hook keeps the contract that makes it worth having', () => {
  const HOOK = path.join(SRC, 'services', 'lifecycle', 'projectLifecycleRegistration.ts');
  /**
   * STRIPPED, and that is load-bearing for the `catch` assertion below. The hook's header
   * discusses try/catch at length — explaining why it must not have one — so an assertion read
   * against the raw file would fail on its own documentation. More importantly, the reverse would
   * be worse: a hook that DID catch its errors could satisfy a raw-text check purely because the
   * header still said it does not. These assertions are about what the code does.
   */
  const hookSource = stripComments(readNormalised(HOOK));

  it('forwards the caller transaction, because both live creations are transactional', () => {
    // govDeliveryProject.ts opens `sequelize.transaction` and creates inside it; leadConversion.ts
    // creates with `{ transaction: tx }`. project_lifecycle_states.delivery_project_id is a real FK
    // to delivery_projects(id), so a registration written on a different connection cannot see the
    // uncommitted parent row and trips the FK. Forwarding is not an optimisation, it is the only
    // way this hook can succeed at all.
    expect(hookSource).toMatch(/transaction:\s*\(options\?\.transaction/);
  });

  it('does NOT swallow its own errors — the deliberate inversion', () => {
    // The precedent this hook's STRUCTURE comes from, services/workLedger/ticketCreationLedgerHook,
    // wraps itself in try/catch so a bookkeeping failure can never abort the create. That is right
    // for a ledger event and WRONG here: joined to the transaction, a swallowed failure leaves a
    // created project with no lifecycle, which is precisely the hole LC-01 exists to close.
    //
    // This is the assertion that keeps a future well-intentioned "hardening" from reintroducing it.
    // A comment asking people not to add a try/catch is a request; this is a test.
    expect(hookSource).not.toMatch(/\bcatch\b/);
  });

  it('uses ON CONFLICT DO NOTHING, which is what keeps replay compatible with that inversion', () => {
    // manifestWriter.ts records why a caught duplicate is not an option: "a unique violation inside
    // a transaction poisons it, and Sequelize reports every integrity violation as the same
    // 'Validation error' regardless of which constraint fired." And a duplicate is not an error
    // here — gov re-approval re-runs ensureGovTwoTrackProject every time, so a conflict means
    // "already registered". Without this clause, abort-on-failure would turn every gov re-approval
    // into a failed approval.
    expect(hookSource).toMatch(/ON CONFLICT \(delivery_project_id\)[\s\S]*?DO NOTHING/);
  });

  it('ships a LIVE_SINCE stamp and a path-agnostic detector for its residual gap', () => {
    // A disclosed gap with no detector is a sentence. The ticket precedent pairs its disclosure
    // with TICKET_LEDGER_HOOK_LIVE_SINCE so an uncovered row proves a bypass; this does the same.
    // The query asks LC-01's actual question — is there a project with no lifecycle — rather than
    // checking the paths someone remembered, so a NEW bypass surfaces without changing it.
    expect(hookSource).toMatch(/export const LIFECYCLE_REGISTRATION_LIVE_SINCE/);
    expect(hookSource).toMatch(/export async function unregisteredDeliveryProjectsSince/);
    expect(hookSource).toMatch(/LEFT JOIN project_lifecycle_states/);
  });
});
