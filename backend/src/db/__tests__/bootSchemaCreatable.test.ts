/**
 * A table the boot path ALTERs must be creatable BY the boot path.
 *
 * WHY THIS EXISTS. On 2026-10-17 a bare Postgres was pointed at the suites that normally
 * self-skip. 12 suites and 81 tests failed, and the failures were not varied:
 *
 *     11 x relation "student_tasks" does not exist
 *      6 x relation "github_connections" does not exist
 *
 * Those two tables are ALTERed at boot and created by nothing the boot path runs -
 * `student_tasks` only by a seed script, `github_connections` by nothing at all. The
 * `ensure*Schema` modules EVOLVE tables; they do not bootstrap them, and the bootstrap is
 * `sequelize.sync` behind `DB_BOOT_SYNC`, off by default.
 *
 * This is why "give CI a Postgres" is not a two-line change: it would convert 15 visible
 * skips into red suites on every pull request. Making a pristine database bootable comes first,
 * and that is an infrastructure decision, not a test's to make. This sweep does the cheap half -
 * it names the population and stops it growing.
 *
 * THE INSTRUMENT FAILED ITS OWN CONTROL FIRST, and the reason is encoded below. A draft matched
 * `CREATE TABLE IF NOT EXISTS github_connections` inside a DOC COMMENT - prose written that same
 * morning to document the table's ABSENCE - and classified it as creatable. The sweep read the
 * description of a thing as the thing. Comments are stripped before matching, and a test asserts
 * that stripping, because without it this file would cheerfully report the opposite of the truth.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const DB_DIR = path.join(SRC, 'db');

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const ALTER = /ALTER TABLE\s+(?:IF EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
const CREATE = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;

/** Strip comments so prose ABOUT sql is never mistaken for sql. */
export function stripComments(source: string): string {
  return source.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}

function matchAll(source: string, re: RegExp): string[] {
  const out: string[] = [];
  const r = new RegExp(re.source, re.flags);
  let m = r.exec(source);
  while (m) { out.push(m[1].toLowerCase()); m = r.exec(source); }
  return out;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules') return [];
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Tables the boot path ALTERs, and the files that CREATE each table.
 *
 * Memoised: the walk reads every .ts file under src, which costs about ten seconds. Three tests
 * need it, and paying that three times would make this the slowest file in the suite for no
 * additional truth.
 */
let surveyCache: { altered: Set<string>; createdIn: Map<string, string[]> } | null = null;
function survey() {
  if (surveyCache) return surveyCache;
  const altered = new Set<string>();
  const createdIn = new Map<string, string[]>();
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const code = stripComments(fs.readFileSync(file).toString('utf8'));
    for (const t of matchAll(code, CREATE)) {
      createdIn.set(t, [...(createdIn.get(t) ?? []), rel]);
    }
    const inBootDir = file.startsWith(DB_DIR) && !rel.includes('__tests__');
    if (inBootDir) for (const t of matchAll(code, ALTER)) altered.add(t);
  }
  surveyCache = { altered, createdIn };
  return surveyCache;
}

/** True when something the BOOT PATH runs creates this table. `server.ts` counts; a seed does not. */
function bootCreatable(table: string, createdIn: Map<string, string[]>): boolean {
  return (createdIn.get(table) ?? []).some(
    (w) => (w.startsWith('db/') || w === 'server.ts') && !w.includes('__tests__'),
  );
}

/**
 * Tables the boot path ALTERs that nothing in the boot path creates, as measured 2026-10-17.
 *
 * GRANDFATHERED, NOT APPROVED. Every entry is a table that cannot exist on a pristine database.
 * The comment on a line names where its only CREATE lives, when it has one at all.
 *
 * This list SHRINKS. Adding a boot-path CREATE for one of these means deleting its line here;
 * the test below fails if a listed table becomes creatable, so the list cannot rot into a record
 * of things that used to be broken.
 */
const NOT_CREATABLE_AT_BOOT: readonly string[] = [
  'admin_users',  // 
  'ai_agents',  // 
  'campaigns',
  'community_posts',
  'enrollments',  // 
  'entry_points',
  'event_ledger',
  'follow_up_sequences',
  'github_connections',
  'lead_sources',
  // Same case as scheduled_emails below: no CREATE anywhere in src (only a one-column stub in
  // claimLease.integration.test.ts); it exists because sequelize.sync once created it. Newly ALTERed
  // at boot by ensureLeadAttributionColumns (C94, 2026-10-30), two nullable ADD COLUMN IF NOT EXISTS
  // that warn and continue when the table is absent. A CREATE TABLE for this ~70-column legacy table
  // written from its model is how two definitions start to disagree, so none is invented here.
  'leads',
  'onboarding_profiles',
  'org_members',
  'organizations',  // scripts/rehearseRefactoredDeliverySchema.ts
  'page_events',
  'projects',  // 
  'routing_rules',
  // No CREATE anywhere in the repo: it predates the ensure-module convention and exists
  // only because sequelize.sync once created it. Newly ALTERed at boot by
  // ensureScheduledEmailStatusWidth, which widens `status` to 32 so the 23-character
  // `explorer_draft_rejected` can be written at all. That widen is deliberately a
  // probe-then-ALTER with no CREATE: inventing a CREATE TABLE for a 40-column legacy
  // table from its Sequelize model is how the two definitions start to disagree.
  'scheduled_emails',
  'student_tasks',  // seeds/seedStudentTasks.ts
  'tickets',
  'today_feed_impressions',
  'visitor_sessions',
];

describe('every table the boot path ALTERs should be creatable by the boot path', () => {
  it('surveys a real population, so a passing sweep is not an empty one', () => {
    const { altered } = survey();
    // 73 when written. A collapse means the walk broke, not that the debt was paid.
    expect(altered.size).toBeGreaterThan(50);
    expect([...altered]).toContain('build_plans');
  });

  it('NO NEW TABLE may be ALTERed at boot without something creating it', () => {
    const { altered, createdIn } = survey();
    const offenders = [...altered]
      .filter((t) => !bootCreatable(t, createdIn))
      .filter((t) => !NOT_CREATABLE_AT_BOOT.includes(t))
      .sort();
    // Named, not counted: a count says something is wrong and not what.
    expect(offenders).toEqual([]);
  });

  it('every grandfathered table is still uncreatable, so the list cannot go stale', () => {
    const { createdIn } = survey();
    const fixed = NOT_CREATABLE_AT_BOOT.filter((t) => bootCreatable(t, createdIn));
    expect(fixed).toEqual([]);
  });

  it('names the two tables that actually broke against a real Postgres', () => {
    // Provenance. These are the 11x and 6x failures from the 2026-10-17 measurement.
    expect(NOT_CREATABLE_AT_BOOT).toContain('student_tasks');
    expect(NOT_CREATABLE_AT_BOOT).toContain('github_connections');
  });
});

describe('the detector itself', () => {
  const createdIn = new Map<string, string[]>([
    ['in_boot_dir', ['db/ensureThing.ts']],
    ['in_server', ['server.ts']],
    ['seed_only', ['seeds/seedThing.ts']],
    ['test_only', ['db/__tests__/thing.test.ts']],
  ]);

  it('POSITIVE: a CREATE under db/ counts as bootable', () => {
    expect(bootCreatable('in_boot_dir', createdIn)).toBe(true);
  });

  it('server.ts counts too - it runs on every start', () => {
    expect(bootCreatable('in_server', createdIn)).toBe(true);
  });

  it('NEGATIVE: a seed does not count, because a seed does not run at boot', () => {
    expect(bootCreatable('seed_only', createdIn)).toBe(false);
  });

  it('a CREATE that exists only in a test does not count', () => {
    expect(bootCreatable('test_only', createdIn)).toBe(false);
  });

  it('a table nothing creates is not bootable', () => {
    expect(bootCreatable('unknown_table', createdIn)).toBe(false);
  });

  it('STRIPS COMMENTS, which is the bug that produced a backwards answer', () => {
    // The exact sentence that fooled the first draft: prose documenting an ABSENCE, read as a
    // presence. If comment stripping regresses, this sweep reports the opposite of the truth.
    const prose = '/** there is no `CREATE TABLE IF NOT EXISTS github_connections` anywhere */';
    expect(matchAll(stripComments(prose), CREATE)).toEqual([]);
    // And a line comment, the other shape.
    expect(matchAll(stripComments('// CREATE TABLE IF NOT EXISTS ghosts'), CREATE)).toEqual([]);
    // Control: real SQL in a template literal still matches, so stripping is not over-broad.
    expect(matchAll(stripComments('`CREATE TABLE IF NOT EXISTS real_one (id UUID)`'), CREATE))
      .toEqual(['real_one']);
  });
});
