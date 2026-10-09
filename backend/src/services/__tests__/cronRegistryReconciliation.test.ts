/**
 * cronRegistryReconciliation — the guard over the two hand-maintained lists that decide
 * whether a "scheduled" agent actually runs, and which nothing in production compares.
 *
 * The defect, the invariant and the reason this is a ratchet are documented where the logic
 * lives: fixtures/cronRegistryRatchet.ts. The parse and its two pinned historical bugs are
 * documented in fixtures/cronRegistrySourceParser.ts. The frozen disagreements, each with
 * its one-line reason, are in fixtures/cronRegistryBaseline.ts. This file is assertions.
 *
 * ── What is deliberately NOT asserted here ─────────────────────────────────────────
 * No entry census. This suite used to assert `parsedSeedRows.length === 239`,
 * `cronSites.exactNames.length === 68`, `trigger_type === 'cron'` rows `=== 197` and a
 * 114-entry baseline. Two fresh production defects — an instrumentCronJob('…') call with no
 * seed row, and a seed row named `Intel_<slug that does not exist>` — passed invariants
 * (i), (ii) and (iii) and were caught only by those literals, which a maintainer then
 * bumped 239→240 / 197→198 / 68→69 and got a green suite with both defects live. A number
 * a maintainer bumps is not a line held.
 *
 * Both defects are now caught by the invariants themselves, and are pinned below as
 * permanent tests ("a cron site with no seed row is a violation of (ii)" and "a seed row
 * whose Intel_ slug does not exist is a violation of (i)"). The entry counts are replaced
 * by `topLevelObjectLiterals()`, a string-aware brace walker that shares no regex with the
 * parser and counts the same entries a second, independent way — a count a maintainer
 * cannot bump, because it is derived from the same source text.
 *
 * ── The same bypass class, found a third and a fourth time ──────────────────────────
 * Twice more, coverage here turned out to depend on how a call happens to be WRITTEN.
 *
 * Third (2026-10-06): `instrumentCronJob(fn('Name'), …)` matched neither of the scanner's two
 * regexes and fell out of the accounting entirely, so the pinned-forms gate never saw it and
 * a live cron job tracked against a non-existent ai_agents row left this suite green. The
 * answer was an accounting rather than a match — but the accounting counted the contiguous
 * substring `instrumentCronJob(`.
 *
 * Fourth (same day, found by injection): that token is itself a shape. A space, an optional
 * call, a type argument or a line break between the identifier and its paren produces ZERO
 * occurrences, so `instrumentCronJob ('X', fn)`, `instrumentCronJob?.('X', fn)`,
 * `instrumentCronJob<void>('X', fn)` and a call whose '(' is on the next line were not
 * counted, not classified, not unclassifiable, and never reached registeredNames — and a
 * space and a line break are what a formatter writes. So the accounting is now over the
 * IDENTIFIER, /\binstrumentCronJob\b/: every occurrence is counted one way and classified
 * another, into exactly one kind including the ones that register nothing (importSpecifier,
 * proseMention, declaration), and the two numbers must agree. An alias is REPORTED, not
 * followed. The old token survives only as the negative control: the tests below prove it
 * sees nothing in four forms the identifier accounting resolves into real registrations.
 *
 * The other half of the same pass is the comment stripper, which had the opposite failure:
 * it cut `//` only after start-of-line or whitespace, so `void 0;//instrumentCronJob('X', fn)`
 * was read as live code and reported as a real registration. A guard that cries wolf gets
 * switched off, so that is worse than a miss. It is a single-pass scanner now, with both
 * controls pinned below — a commented-out call must not count, a real call must still count,
 * and a `//` inside a string literal must stay in the string.
 *
 * ── Mutation evidence ───────────────────────────────────────────────────────────────
 * Every claim below was re-run after the last edit to these five files. Each mutation was
 * applied, the suite was run, and the mutation was undone by re-editing. Suite size: 33.
 *
 *   M1  parser scanSource(): cut `//` only after start-of-line/whitespace (the old regex
 *       rule, i.e. the F2 bug)       → 1 failed, 32 passed: "does not count a commented-out
 *       call, and still counts a real one (both controls)"
 *   M2  parser scanSource(): stop tracking single/double-quoted literals, so a `//` inside a
 *       string cuts                  → 4 failed, 29 passed: "counts every entry a second,
 *       independent way (no census literal to bump)", "accounts for every instrumentCronJob
 *       IDENTIFIER occurrence (parser completeness)", "every source file ends the scan in the
 *       base code context (stripper self-check)", "does not count a commented-out call…"
 *   M3  parser scanSource(): disable the regex-literal branch
 *                                    → 1 failed, 32 passed: "every source file ends the scan
 *       in the base code context (stripper self-check)"
 *   M4  parser classifyCronCallSite(): drop the `inString` short-circuit
 *                                    → 1 failed, 32 passed: "accounts for every
 *       instrumentCronJob IDENTIFIER occurrence (parser completeness)"
 *   M5  parser classifyCronCallSite(): classify a non-call value reference as importSpecifier
 *       instead of aliasAssignment   → 1 failed, 32 passed: "reports an alias rather than
 *       guessing through it, and says so by file and line"
 *   M6  parser classifyCronCallSite(): require the '(' to be adjacent (no skipSpace), i.e.
 *       the F1 bug                    → 1 failed, 32 passed: "resolves the call forms a
 *       formatter writes, which the old call-shape token saw as zero"
 *   M7  parser scanSource(): delete a block comment instead of replacing it with its own
 *       newlines                      → 1 failed, 32 passed: "strips comments identically
 *       under LF and CRLF on the real list files"
 *   M8  ratchet(): return `healedBaselineEntries: []`
 *                                    → 6 failed, 27 passed: "(iv) a baselined entry heals the
 *       moment its seed row stops contradicting the timers", "(v) a baselined entry heals the
 *       moment the name stops being shared", "reports a healed baseline entry on every one of
 *       the five real lists", "catches a baseline entry that has stopped violating (the
 *       ratchet half)", "handles empty inputs on both sides (boundary)", "is order-independent
 *       and duplicate-tolerant (boundary)"
 *   M9  parser scanCronSites(): skip in-string occurrences instead of classifying them
 *                                    → 2 failed, 31 passed: "non-vacuity: every list and every
 *       scan found something", "accounts for every instrumentCronJob IDENTIFIER occurrence
 *       (parser completeness)"
 *   M10 this file's sites(): print the kind and argument but not file:line:text
 *                                    → 1 failed, 32 passed: "reports an alias rather than
 *       guessing through it, and says so by file and line"
 *
 * And four injections into services/schedulerService.ts (restored byte-identically after
 * each; sha256 verified):
 *
 *   I1  the four formatter forms — a space, `?.`, `<void>`, a line break before the paren
 *                                    → 3 failed, 30 passed, and invariant (ii) names all four:
 *       GenericArgCronJob, NewlineParenCronJob, OptionalCallCronJob, SpacedParenCronJob
 *   I2  `const aliasRun = instrumentCronJob; aliasRun('AliasedCronJob', …)`
 *                                    → 1 failed, 32 passed, printing
 *       `services/schedulerService.ts:3682  [aliasAssignment]  const aliasRun = instrumentCronJob;`
 *   I3  `void 0;//instrumentCronJob('CommentedOutCronJob', …)`
 *                                    → 33 passed. This is the F2 false positive: the same
 *       injection against the previous stripper was reported as a live registration.
 *   I4  `instrumentCronJob('InjectedRealCronJob', …)` — the positive control for I3
 *                                    → 3 failed, 30 passed, naming InjectedRealCronJob
 *
 * Invariants (iv) and (v) were added in the same pass, for the sibling blind spot on the
 * reconcile side: (i) only inspects seed rows that say `cron` and (iii) only compares rows
 * where both sides carry a schedule, so a registered name whose row declares a non-cron
 * trigger with an empty schedule escaped all three invariants, and several registry entries
 * sharing one agentName — several timers, one counter — were never checked at all.
 */
import * as fs from 'fs';
import * as path from 'path';
import { classifyAgent, REGISTRY_AUDIT_DATE } from '../agentRegistryAuditClassification';
import {
  EXPECTED_CRON_ALIAS_FILES,
  EXPECTED_CRON_DECLARATION_FILES,
  EXPECTED_CRON_IMPORT_FILES,
  EXPECTED_CRON_NAME_PREFIXES,
  EXPECTED_DYNAMIC_ARG_FORMS,
  EXPECTED_NON_CALL_MENTION_FILES,
  KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION,
  KNOWN_DUPLICATE_REGISTRY_NAMES,
  KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE,
  KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW,
  KNOWN_SCHEDULE_DISAGREEMENTS,
} from './fixtures/cronRegistryBaseline';
import {
  CRON_CALL_SHAPE_TOKEN,
  CRON_IDENTIFIER,
  CRON_IDENTIFIER_PATTERN,
  CronCallSite,
  CronSiteKind,
  SeedRow,
  parseRegistryRows,
  parseSeedRows,
  scanCronSites,
  scanSource,
  sliceArrayLiteral,
  stripComments,
  topLevelObjectLiterals,
} from './fixtures/cronRegistrySourceParser';
import { ratchet, reconcile } from './fixtures/cronRegistryRatchet';
import { EXPANDABLE_NAME_PREFIXES, readCronRegistryWorld } from './fixtures/cronRegistryWorld';

const world = readCronRegistryWorld();
const { cronSites, observed, registryRows, seedRows } = world;

/** backend/src, and a backend/src-relative path, so a failure names a file a reader opens. */
const SRC = path.resolve(__dirname, '..', '..');
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

/**
 * The one way this file names a cron occurrence. EVERY failure path that concerns an
 * occurrence routes through it, because the first thing a reader needs is the file and the
 * line — a bare argument string or a bare kind name sends them to grep, and the previous pass
 * printed exactly that on the argument-form gate.
 */
const sites = (list: ReadonlyArray<CronCallSite>): string =>
  list.map((s) => `${rel(s.file)}:${s.line}  [${s.kind}]  ${s.text}`).join('\n  ');

/** `''` when there is nothing to report, so `expect(…).toBe('')` prints the whole list. */
const report = (list: ReadonlyArray<CronCallSite>, headline: string): string =>
  list.length === 0 ? '' : `${headline}\n  ${sites(list)}`;

/** Turns a ratchet failure into something a reader can act on without re-deriving it. */
function explain(names: string[]): string {
  return names
    .map((n) => {
      const audit = classifyAgent(n.split('|')[0]);
      return audit ? `${n} [audit ${REGISTRY_AUDIT_DATE}: ${audit.status}]` : n;
    })
    .join('\n  ');
}

// ─── Positive controls on the parser ─────────────────────────────────────────────────

describe('cron registry parser (positive controls)', () => {
  it('reproduces the one array in this family that can be imported, exactly', () => {
    // The strongest available control: parsed source vs the real evaluated array.
    expect(world.parsedGrowthRows).toEqual(world.importedGrowthRows);
    expect(world.parsedGrowthRows.length).toBeGreaterThan(0);
  });

  it('counts every entry a second, independent way (no census literal to bump)', () => {
    const cases: Array<[string, string, RegExp, number]> = [
      ['SCHEDULE_REGISTRY', world.arrayLiterals.schedule, /agentName:/, world.scheduleRows.length],
      ['DYNAMIC_SCHEDULE_REGISTRY', world.arrayLiterals.dynamic, /agentName:/, world.dynamicRows.length],
      ['AGENT_REGISTRY', world.arrayLiterals.seed, /agent_name:/, world.parsedSeedRows.length],
      ['GROWTH_JOURNEY_AGENT_ENTRIES', world.arrayLiterals.growth, /agent_name:/, world.parsedGrowthRows.length],
    ];
    for (const [label, src, key, parsedCount] of cases) {
      const structural = topLevelObjectLiterals(src).filter((o) => key.test(o));
      expect(`${label}: structural ${structural.length} vs parsed ${parsedCount}`).toBe(
        `${label}: structural ${structural.length} vs parsed ${structural.length}`,
      );
      // Over-matching (a nested `config: { agent_name }` read as an entry) and under-matching
      // (an anchor miss) both move one side only, so equality is the whole assertion.
      expect(topLevelObjectLiterals(src).length).toBe(structural.length);
    }
  });

  it('non-vacuity: every list and every scan found something', () => {
    // A parser that silently matches nothing makes this whole suite vacuous. These are the
    // floors; the equality above is what pins the actual sizes.
    expect(world.scheduleRows.length).toBeGreaterThan(0);
    expect(world.dynamicRows.length).toBeGreaterThan(0);
    expect(world.parsedSeedRows.length).toBeGreaterThan(0);
    expect(seedRows.filter((r) => r.triggerType === 'cron').length).toBeGreaterThan(0);
    expect(cronSites.exactNames.length).toBeGreaterThan(0);
    expect(cronSites.identifierOccurrences).toBeGreaterThan(cronSites.exactNames.length);
    expect(cronSites.callSites.length).toBe(cronSites.identifierOccurrences);
    expect(world.registeredNames.length).toBeGreaterThan(0);
    expect(world.intelSourceSlugs.length).toBeGreaterThan(0);
    // The walker reached nested directories, not just the top of services/.
    const walked = new Set(world.sourceFiles.map((f) => path.relative(path.resolve(__dirname, '..', '..'), f)));
    for (const rel of ['services/aiOpsScheduler.ts', 'services/schedulerService.ts', 'services/intel/sources/index.ts']) {
      expect([...walked].some((w) => w.split(path.sep).join('/') === rel)).toBe(true);
    }
    expect(cronSites.files.length).toBeGreaterThan(0);
    expect(world.sourceFiles.length).toBeGreaterThan(cronSites.files.length);
  });

  it('every parsed name and schedule is well-formed', () => {
    const names = [...seedRows.map((r) => r.agentName), ...registryRows.map((r) => r.agentName), ...cronSites.exactNames];
    // A name carrying whitespace, a quote, a backtick or an unexpanded `${` means the parse
    // captured source syntax instead of a value — and would silently never match anything.
    expect(names.filter((n) => n.trim() === '' || /[\s'"`${}]/.test(n))).toEqual([]);
    expect(registryRows.filter((r) => r.hardcodedSchedule.trim().split(/\s+/).length !== 5)).toEqual([]);
    expect(
      seedRows.filter((r) => r.triggerType === 'cron' && r.schedule.trim().split(/\s+/).length !== 5).map((r) => r.agentName),
    ).toEqual([]);
    expect([...new Set(seedRows.map((r) => r.triggerType))].sort()).toEqual(['cron', 'event_driven', 'on_demand']);
  });

  it('reads sentinel entries with their exact values', () => {
    expect(world.scheduleRows[0]).toEqual({
      agentName: 'CampaignHealthScanner',
      hardcodedSchedule: '*/15 * * * *',
      registry: 'SCHEDULE_REGISTRY',
    });
    expect(world.dynamicRows[0].agentName).toBe('DailyExecutiveBriefing');
    expect(world.parsedSeedRows[0]).toEqual({
      agentName: 'ExplorerContentSync',
      triggerType: 'cron',
      schedule: '50 2 * * *',
    });
  });

  it('leaves no field unparsed (the phantom-entry and anchor-miss bug classes)', () => {
    // A nested `config: { …, agent_name: 'X' }` used to be read as an entry of its own,
    // producing 16 rows with no trigger_type. Any such phantom shows up here.
    expect(world.parsedSeedRows.filter((r) => r.triggerType === '').map((r) => r.agentName)).toEqual([]);
    expect(seedRows.filter((r) => r.triggerType === 'cron' && r.schedule === '').map((r) => r.agentName)).toEqual([]);
    expect(registryRows.filter((r) => r.hardcodedSchedule === '').map((r) => r.agentName)).toEqual([]);
    expect(new Set(seedRows.map((r) => r.agentName)).size).toBe(seedRows.length);
  });

  it('strips line comments on CRLF sources (JS "." does not match \\r)', () => {
    const crlf = "const A = [\r\n  // { agentName: 'Ghost', hardcodedSchedule: '* * * * *' },\r\n];\r\n";
    expect(stripComments(crlf)).not.toContain('Ghost');
    expect(parseRegistryRows(sliceArrayLiteral(stripComments(crlf), 'const A ='), 'SCHEDULE_REGISTRY')).toEqual([]);
    // …and the unstripped form proves the assertion above is not vacuous.
    expect(parseRegistryRows(sliceArrayLiteral(crlf, 'const A ='), 'SCHEDULE_REGISTRY')).toHaveLength(1);
  });

  it('strips comments identically under LF and CRLF on the real list files', () => {
    // The synthetic case above pins stripComments on a two-line fixture. This pins it on the
    // real production text, because this repo has a history of CRLF changing a result locally
    // while CI stayed green.
    //
    // The assertion is on the STRIPPER's output, not on the parsed rows, and deliberately so:
    // neither production array happens to contain a commented-out entry today, so the parsed
    // rows are identical even with CRLF handling removed. Asserting the rows would have been
    // an assertion that cannot fail. The stripped text can and does.
    const lf = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const src = path.resolve(__dirname, '..', '..');
    const asCrlf = (text: string) => text.replace(/\n/g, '\r\n');
    for (const rel of ['services/aiOpsScheduler.ts', 'services/agentRegistrySeed.ts']) {
      const text = lf(path.join(src, ...rel.split('/')));
      const crlf = asCrlf(text);
      expect(crlf).not.toEqual(text); // the rewrite really did change the bytes
      // Both forms must lose their comments. Equal length before and after is the CRLF bug's
      // exact signature: `//.*$` matches nothing on a `\r`-terminated line, so the stripper
      // silently returns its input and commented-out code stays visible to the parser.
      expect(stripComments(text).length).toBeLessThan(text.length);
      expect(stripComments(crlf).length).toBeLessThan(crlf.length);
      expect(`${rel}: ${stripComments(crlf) === stripComments(text)}`).toBe(`${rel}: true`);
      // Line-count preserving, on the real files. Every cron call-site diagnostic prints a
      // line number a reader is expected to open, and a block comment that took its newlines
      // with it shifts every number after it in the same file. Deleting those newlines instead
      // of keeping them is mutation M7, and this is the test it kills.
      expect(`${rel}: ${stripComments(text).split('\n').length}`).toBe(`${rel}: ${text.split('\n').length}`);
      expect(`${rel}: ${stripComments(crlf).split('\n').length}`).toBe(`${rel}: ${text.split('\n').length}`);
    }
    // …and on a fixture that pins the mechanism rather than the outcome: the block comment's
    // own newlines survive, its content does not. (The scanner cuts from the `//` itself and
    // leaves the space before it, where the old regex consumed one whitespace character too.
    // Trailing space cannot reach any parser here, and asserting the exact bytes is the point.)
    const blocky = 'const A = 1;\n/* a\n   b */\nconst B = 2; // tail\n';
    expect(stripComments(blocky).split('\n')).toEqual(['const A = 1;', '', '', 'const B = 2; ', '']);
    // Downstream, the rows parsed from either form are the same rows.
    const scheduler = lf(path.join(src, 'services', 'aiOpsScheduler.ts'));
    const rows = (text: string) =>
      parseRegistryRows(
        sliceArrayLiteral(stripComments(text), 'export const SCHEDULE_REGISTRY: ScheduleEntry[] ='),
        'SCHEDULE_REGISTRY',
      ).map((r) => `${r.agentName}|${r.hardcodedSchedule}`);
    expect(rows(asCrlf(scheduler))).toEqual(rows(scheduler));
    expect(rows(scheduler).length).toBeGreaterThan(0);
  });

  it('accounts for every instrumentCronJob IDENTIFIER occurrence (parser completeness)', () => {
    // THE invariant on the scan, and the reason it is an accounting rather than a match. Two
    // regexes, then a contiguous token, each in turn let a differently-written call resolve to
    // NOTHING — not an exactName, not a dynamicArgForm, so the pinned-forms gate never saw it
    // either. A live cron job, tracked against an ai_agents row that does not exist, with this
    // suite green. The accounting is over the one thing every call must contain.
    //
    // Two numbers derived twice from the same source text: occurrences counted by
    // CRON_IDENTIFIER_PATTERN, call sites found by an independent indexOf walk and classified
    // by an anchored read. Neither is a literal to bump.
    expect(CRON_IDENTIFIER).toBe('instrumentCronJob');
    expect('x instrumentCronJob y'.match(CRON_IDENTIFIER_PATTERN())).toHaveLength(1);
    expect('instrumentCronJobSafe(x)'.match(CRON_IDENTIFIER_PATTERN())).toBe(null); // whole word only
    const counted = cronSites.identifierOccurrences;
    expect(counted).toBeGreaterThan(0);
    expect(`classified ${cronSites.callSites.length} of ${counted} occurrences`).toBe(
      `classified ${counted} of ${counted} occurrences`,
    );

    const byKind = (kind: CronSiteKind) => cronSites.callSites.filter((s) => s.kind === kind);
    expect(
      report(
        byKind('unclassifiable'),
        'instrumentCronJob occurrences this parser cannot read. Teach it the form — do not widen ' +
          'a regex, and do not let them fall through:',
      ),
    ).toBe('');

    // The kinds are exhaustive: their sum is the count, so a kind added to the parser without
    // being accounted for here shows up as a disagreement rather than as a quiet omission.
    const KINDS: CronSiteKind[] = [
      'exactName', 'namePrefix', 'dynamicArg', 'noArgument', 'declaration', 'importSpecifier',
      'proseMention', 'aliasAssignment', 'unclassifiable',
    ];
    expect(KINDS.reduce((n, k) => n + byKind(k).length, 0)).toBe(counted);
    expect([...new Set(cronSites.callSites.map((s) => s.kind))].filter((k) => !KINDS.includes(k))).toEqual([]);

    // No exempt kind is a place a registration can hide: each is pinned to the files allowed
    // to contain it, by file:line:text in both directions.
    const filesOf = (kind: CronSiteKind) => [...new Set(byKind(kind).map((s) => rel(s.file)))].sort();
    const pinned = (kind: CronSiteKind, allowed: ReadonlyArray<string>, why: string) => {
      expect(report(byKind(kind).filter((s) => !allowed.includes(rel(s.file))), why)).toBe('');
      expect(`${kind}: ${filesOf(kind).join(', ')}`).toBe(`${kind}: ${[...allowed].sort().join(', ')}`);
    };
    pinned('proseMention', EXPECTED_NON_CALL_MENTION_FILES,
      'Identifier named inside a string literal, in a file not admitted for prose:');
    pinned('declaration', EXPECTED_CRON_DECLARATION_FILES,
      'instrumentCronJob declared somewhere unexpected:');
    pinned('importSpecifier', EXPECTED_CRON_IMPORT_FILES,
      'A NEW file imports instrumentCronJob and can now schedule crons — admit it deliberately:');
    // The alias decision, stated out loud: this parser REPORTS an alias, it does not resolve
    // one. `const run = instrumentCronJob; run('X', fn)` registers 'X' under a name this scan
    // cannot see, and following it needs whole-file data-flow analysis — the same trap as
    // widening a regex. So the expected set is empty and any alias is red, by file and line.
    pinned('aliasAssignment', EXPECTED_CRON_ALIAS_FILES,
      'instrumentCronJob used as a VALUE. Registrations can happen through this name and the scan ' +
        'cannot follow it. Call it directly, or teach the scan to resolve this alias:');
    // Zero-argument calls are illegal (two required parameters) and prose now classifies as
    // proseMention, so there must be none at all in live code.
    expect(report(byKind('noArgument'),
      'instrumentCronJob() called with no arguments — not legal code (two required parameters):')).toBe('');
    // Exactly one declaration, not "at least one in the right file": the scan used to skip
    // the whole file holding the declaration, so a real registration written beside it was
    // invisible. Only the declaration occurrence itself is exempt now.
    expect(byKind('declaration').length).toBe(1);
    // Non-vacuity on the exempt kinds: they really found the prose and the imports, so a
    // stripper that ate them would not pass this as "nothing to see".
    expect(byKind('proseMention').length).toBeGreaterThanOrEqual(EXPECTED_NON_CALL_MENTION_FILES.length);
    expect(byKind('importSpecifier').length).toBe(EXPECTED_CRON_IMPORT_FILES.length);

    // Non-vacuity: the classification resolved real names, it did not merely tally.
    expect(byKind('exactName').length).toBeGreaterThan(0);
    expect(byKind('exactName').filter((s) => s.value === '' || !cronSites.exactNames.includes(s.value))).toEqual([]);
    expect(byKind('namePrefix').filter((s) => !cronSites.namePrefixes.includes(s.value))).toEqual([]);
    expect(byKind('dynamicArg').filter((s) => !cronSites.dynamicArgForms.includes(s.arg))).toEqual([]);
    // Every registering site's file is in `files`, and no exempt-only file is. The three kinds
    // are restated here as a literal rather than imported from the parser, so promoting a kind
    // there — counting prose as a registration, say — disagrees with `files` and fails.
    const registering = cronSites.callSites.filter((s) => ['exactName', 'namePrefix', 'dynamicArg'].includes(s.kind));
    expect([...new Set(registering.map((s) => s.file))].sort()).toEqual(cronSites.files);

    // And the negative control, on the real tree: the token the scan used to count sees
    // strictly FEWER occurrences than the identifier does. An import can never be followed by
    // '(', so the gap is at least the number of importers — i.e. the old accounting was
    // reporting those occurrences as nothing at all. The forms test below is where the gap is
    // pinned per shape; the exact census is deliberately not asserted anywhere.
    expect(CRON_CALL_SHAPE_TOKEN).toBe('instrumentCronJob(');
    expect(cronSites.callShapeOccurrences).toBeGreaterThan(0); // the token itself still works
    expect(cronSites.callShapeOccurrences).toBeLessThan(counted);
    expect(cronSites.callShapeOccurrences).toBeLessThanOrEqual(counted - byKind('importSpecifier').length);
  });

  it('every source file ends the scan in the base code context (stripper self-check)', () => {
    // The stripper is a state machine over ~4,000 files, and a desync is what silently
    // reclassified 67 real registrations as prose the last time one was attempted here. A file
    // that does not end back in plain code has lost its place, so its string spans — and
    // therefore the prose/live-call verdict for every occurrence in it — cannot be trusted.
    // Measured empty over all of backend/src; the regex-literal handling is what makes it so
    // (`.replace(/'/g, "''")` and `/[*_`]/g` each leave an unbalanced quote behind without it).
    expect(world.unbalancedSourceFiles.map(rel)).toEqual([]);
    expect(cronSites.unbalancedFiles.map(rel)).toEqual([]);
    // Non-vacuity, two ways: the walk really covered the tree, and the check really can fail.
    expect(world.sourceFiles.length).toBeGreaterThan(1000);
    expect(scanSource('const a = `open').balanced).toBe(false);
    expect(scanSource("const a = `ok ${'x'}`;").balanced).toBe(true);
    expect(scanSource(`const a = m.replace(/'/g, "''"); const b = \`https://x\`;`).balanced).toBe(true);
    expect(scanSource('const a = /[*_`]/g; const b = `t`;').balanced).toBe(true);
  });

  it('classifies a call-expression argument instead of silently dropping it', () => {
    // The exact shape that passed the whole suite undetected. It must land in a kind, be
    // visible by line, and NOT be mistaken for a resolved name — pretending to resolve it
    // would clear a seed row out of invariant (i) just as thoroughly as dropping it.
    const injected = [
      'const graderName = (s: string) => s;',
      "instrumentCronJob(graderName('GraderFnCallCronJob'), async () => { return; }).catch(() => {});",
    ].join('\n');
    const scan = scanCronSites([{ file: path.join(SRC, 'services', 'synthetic.ts'), text: injected }]);
    expect(scan.identifierOccurrences).toBe(1);
    expect(scan.callSites.map((s) => `${s.kind}@${s.line}`)).toEqual(['dynamicArg@2']);
    expect(scan.dynamicArgForms).toEqual(["graderName('GraderFnCallCronJob')"]);
    expect(scan.exactNames).toEqual([]);
    expect(scan.namePrefixes).toEqual([]);
    // …and this is what turns visible into red: the form is not in the pinned set, so the
    // equality gate in the next test fails and names it.
    expect(scan.dynamicArgForms.filter((f) => !EXPECTED_DYNAMIC_ARG_FORMS.includes(f))).toEqual([
      "graderName('GraderFnCallCronJob')",
    ]);

    // Every other shape a maintainer might reach for, each classified, none silent. A
    // single-argument call is 'unclassifiable' rather than a third tolerated category: the
    // real function takes two required parameters, so one argument is not legal code.
    const shapes: Array<[string, CronSiteKind]> = [
      ["instrumentCronJob(names.pick('A'), fn);", 'dynamicArg'],
      ['instrumentCronJob(`${slug}_Daily`, fn);', 'dynamicArg'], // no leading prefix to expand
      ['instrumentCronJob("DoubleQuoted", fn);', 'exactName'],
      ['instrumentCronJob(`Intel_${s}`, fn);', 'namePrefix'],
      ["instrumentCronJob({ name: 'A' }, fn);", 'dynamicArg'],
      ['instrumentCronJob(cfg[0], fn);', 'dynamicArg'],
      ["instrumentCronJob(\n  'MultiLine',\n  fn,\n);", 'exactName'],
      ["instrumentCronJob('WithCommaInside' + ',', fn);", 'dynamicArg'],
      ['instrumentCronJob(fn);', 'unclassifiable'],
      ['instrumentCronJob();', 'noArgument'],
    ];
    for (const [src, kind] of shapes) {
      const one = scanCronSites([{ file: 'x.ts', text: src }]);
      const flat = src.replace(/\n\s*/g, ' ');
      expect(`${flat} → ${one.callSites.map((s) => s.kind).join(',')}`).toBe(`${flat} → ${kind}`);
      expect(one.identifierOccurrences).toBe(1);
    }
    expect(scanCronSites([{ file: 'x.ts', text: 'nothing here' }]).identifierOccurrences).toBe(0);
  });

  it('resolves the call forms a formatter writes, which the old call-shape token saw as zero', () => {
    // The fourth instance of this file's recurring defect, pinned shape by shape. Each of
    // these produces NO occurrence of `instrumentCronJob(` — the contiguous token the scan
    // used to count — so each one was previously not counted, not classified, not
    // unclassifiable, and never reached registeredNames. A space, a type argument and a line
    // break are what prettier or a hand-edit produces. Injection I1 in the header is the
    // end-to-end proof: all four written into services/schedulerService.ts now fail three
    // tests, and invariant (ii) names all four by the agent name they register.
    const forms: Array<[string, string, CronSiteKind, string]> = [
      ['a space', "instrumentCronJob ('SpacedParenCronJob', async () => { return; });", 'exactName', 'SpacedParenCronJob'],
      ['an optional call', "instrumentCronJob?.('OptionalCallCronJob', async () => { return; });", 'exactName', 'OptionalCallCronJob'],
      ['a type argument', "instrumentCronJob<void>('GenericArgCronJob', async () => { return; });", 'exactName', 'GenericArgCronJob'],
      ['a line break', "instrumentCronJob\n  ('NewlineParenCronJob', async () => { return; });", 'exactName', 'NewlineParenCronJob'],
      ['both, nested', "await instrumentCronJob <void> ( `Intel_${s}`, fn );", 'namePrefix', 'Intel_'],
    ];
    for (const [label, src, kind, value] of forms) {
      const one = scanCronSites([{ file: path.join(SRC, 'services', 'synthetic.ts'), text: src }]);
      // Counted and classified…
      expect(`${label}: ${one.identifierOccurrences} occurrence(s), kinds ${one.callSites.map((s) => s.kind).join(',')}`).toBe(
        `${label}: 1 occurrence(s), kinds ${kind}`,
      );
      // …resolved to the real name, so it reaches registeredNames and invariant (ii) can see it…
      expect(`${label}: ${one.callSites[0].value}`).toBe(`${label}: ${value}`);
      expect(`${label}: ${[...one.exactNames, ...one.namePrefixes].join(',')}`).toBe(`${label}: ${value}`);
      // …and the diagnostic knows where it is.
      expect(one.callSites[0].line).toBe(src.slice(0, src.indexOf(CRON_IDENTIFIER)).split('\n').length);
      // THE control: the token the old accounting counted sees nothing here at all.
      expect(`${label}: ${one.callShapeOccurrences} call-shaped`).toBe(`${label}: 0 call-shaped`);
      expect(src.split(CRON_CALL_SHAPE_TOKEN).length - 1).toBe(0);
    }
  });

  it('reports an alias rather than guessing through it, and says so by file and line', () => {
    // The fifth form, and the one shape that cannot be resolved honestly: an alias is a second
    // name registrations happen through, and following it needs whole-file data-flow analysis
    // — the same trap as widening a regex. So the parser REPORTS it. EXPECTED_CRON_ALIAS_FILES
    // is empty, so the completeness test above turns this into red with the file and the line.
    const injected = [
      'const aliasRun = instrumentCronJob;',
      "aliasRun('AliasedCronJob', async () => { return; });",
    ].join('\n');
    const scan = scanCronSites([{ file: path.join(SRC, 'services', 'synthetic.ts'), text: injected }]);
    expect(scan.identifierOccurrences).toBe(1);
    expect(scan.callSites.map((s) => `${s.kind}@${s.line}`)).toEqual(['aliasAssignment@1']);
    expect(scan.callShapeOccurrences).toBe(0); // invisible to the old token, as every one of these was
    // It is NOT mistaken for a registration: pretending to resolve it would clear a seed row
    // out of invariant (i) just as thoroughly as dropping it.
    expect([...scan.exactNames, ...scan.namePrefixes, ...scan.dynamicArgForms]).toEqual([]);
    expect(scan.files).toEqual([]);
    // And the failure a reader actually sees names the site, not just the kind.
    expect(report(scan.callSites, 'alias:')).toContain('services/synthetic.ts:1');
    expect(report(scan.callSites, 'alias:')).toContain('const aliasRun = instrumentCronJob;');
    // An UNRENAMED import is the one binding form that is NOT an alias: it introduces the same
    // name, which every call rule above already covers.
    for (const binding of [
      "import { instrumentCronJob } from './cronInstrumentation';",
      "import type { instrumentCronJob } from './cronInstrumentation';",
      "export { instrumentCronJob } from './cronInstrumentation';",
      "import instrumentCronJob from './cronInstrumentation';",
    ]) {
      const one = scanCronSites([{ file: 'x.ts', text: binding }]);
      expect(`${binding} → ${one.callSites.map((s) => s.kind).join(',')}`).toBe(`${binding} → importSpecifier`);
    }
    // …but a RENAMED specifier is an alias, and was the last way to register a live cron with
    // this suite fully green. `import { instrumentCronJob as runCron }` followed by
    // `runCron('X', …)` introduces a second name this scan cannot predict, so it must be
    // reported for the same reason `const aliasRun = instrumentCronJob` is: following an alias
    // needs whole-file data flow, which is the "one syntax further out" trap this file exists to
    // refuse. Reporting costs one line in EXPECTED_CRON_ALIAS_FILES; waving it through costs an
    // invisible cron tracked against no ai_agents row.
    for (const renamed of [
      "import { foo, instrumentCronJob as wrap } from './cronInstrumentation';",
      "import { instrumentCronJob as runCron } from './cronInstrumentation';",
      "export { instrumentCronJob as runCron } from './cronInstrumentation';",
    ]) {
      const one = scanCronSites([{ file: 'x.ts', text: renamed }]);
      expect(`${renamed} → ${one.callSites.map((s) => s.kind).join(',')}`).toBe(`${renamed} → aliasAssignment`);
    }
    // …while a destructured require is deliberately NOT admitted: it is a binding form this
    // parser has not been taught, so it fails loudly instead of being waved through.
    const req = scanCronSites([{ file: 'x.ts', text: "const { instrumentCronJob } = require('./cronInstrumentation');" }]);
    expect(req.callSites.map((s) => s.kind)).toEqual(['aliasAssignment']);
  });

  it('does not count a commented-out call, and still counts a real one (both controls)', () => {
    // The false positive, which is the opposite failure and worse for trust: the stripper cut
    // `//` only after start-of-line or whitespace, so a comment opened straight after a
    // semicolon was read as LIVE CODE and the guard reported a commented-out registration as a
    // real one. Injections I3 and I4 in the header are the end-to-end proof: the commented-out
    // call written into services/schedulerService.ts leaves the suite green, the real call
    // written the same way fails three tests. Both directions are controls here, because a
    // stripper that cuts too much is how 67 real registrations once got reclassified as prose.
    const file = path.join(SRC, 'services', 'synthetic.ts');
    const commented = [
      "void 0;//instrumentCronJob('CommentedOutCronJob', async () => { return; });",
      "\tvoid 1;\t//instrumentCronJob('TabCommentedCronJob', fn);",
      "void 2; /*instrumentCronJob('BlockCommentedCronJob', fn);*/",
      "const k = 1;///instrumentCronJob('TripleSlashCronJob', fn);",
    ].join('\n');
    const dead = scanCronSites([{ file, text: stripComments(commented) }]);
    expect(`commented-out: ${dead.identifierOccurrences} occurrence(s), names ${dead.exactNames.join(',')}`).toBe(
      'commented-out: 0 occurrence(s), names ',
    );
    expect(dead.callSites).toEqual([]);
    // …and the comment really was the only thing removed: the code before it survives, so this
    // is not passing because the stripper ate the file.
    expect(stripComments(commented).split('\n').map((l) => l.trim())).toEqual(['void 0;', 'void 1;', 'void 2;', 'const k = 1;']);

    // The positive control, on the same stripper: a real call next to a real comment is still
    // a real call, and keeps its line number.
    const live = [
      '// a leading comment',
      "instrumentCronJob('LiveCronJob', async () => { return; });//trailing",
      "const url = 'https://example.com/a//b'; // a URL is not a comment",
      "const tpl = `https://example.com/${x}`;",
    ].join('\n');
    const alive = scanCronSites([{ file, text: stripComments(live) }]);
    expect(alive.callSites.map((s) => `${s.kind}@${s.line}`)).toEqual(['exactName@2']);
    expect(alive.exactNames).toEqual(['LiveCronJob']);
    // A `//` inside a string literal must not start a comment. This is the trap that desynced
    // the previous attempt: cutting there leaves an unbalanced quote behind, and everything
    // after it is read in the wrong state.
    expect(stripComments(live)).toContain("'https://example.com/a//b'");
    expect(stripComments(live)).toContain('`https://example.com/${x}`');
    expect(stripComments(live)).not.toContain('trailing');
    expect(stripComments(live)).not.toContain('a leading comment');
    expect(stripComments(live)).not.toContain('not a comment');
    // A `/*` inside a string literal is not a block comment either — the old regex stripper
    // deleted four real `import` lines in data/architectMindsetScenario.ts for exactly this.
    const starred = ["const a = '/*';", "const b = 2;", "const c = '*/';"].join('\n');
    expect(stripComments(starred).split('\n')).toEqual(["const a = '/*';", 'const b = 2;', "const c = '*/';"]);
  });

  it('accounts for every instrumentCronJob() argument form', () => {
    // The diagnostic comes FIRST and names the site, not just the argument text. The previous
    // pass printed the bare argument string here, so a reader who hit this failure on a
    // readable-but-new form had to grep the tree to find out where it was; only the
    // unreadable variant routed through the completeness test's file:line:text report.
    expect(
      report(
        cronSites.callSites.filter((s) => s.kind === 'dynamicArg' && !EXPECTED_DYNAMIC_ARG_FORMS.includes(s.arg)),
        'A new instrumentCronJob() argument form. It resolves to NO name, so every seed row it ' +
          'should have cleared is now invisible to invariant (i). Add it to EXPECTED_DYNAMIC_ARG_FORMS ' +
          'and give it a resolution rule:',
      ),
    ).toBe('');
    // …and the other direction: a pinned form that is gone must be deleted from the list.
    expect([...cronSites.dynamicArgForms].sort()).toEqual([...EXPECTED_DYNAMIC_ARG_FORMS].sort());
    // Every UPPER_SNAKE indirection must resolve to a name; an unresolved one would shrink
    // the registered set and quietly clear a seed row's way into invariant (i).
    const identifierArgs = cronSites.dynamicArgForms.filter((a) => /^[A-Z][A-Z0-9_]*$/.test(a));
    expect(identifierArgs.length).toBeGreaterThan(0);
    expect(
      report(
        cronSites.callSites.filter((s) => /^[A-Z][A-Z0-9_]*$/.test(s.arg) && !world.resolvedConstants.has(s.arg)),
        'An UPPER_SNAKE name constant handed to instrumentCronJob() that resolveNameConstants() ' +
          'could not read. It resolves to no name, so the registered set silently shrinks:',
      ),
    ).toBe('');
    expect(identifierArgs.filter((a) => !world.resolvedConstants.has(a))).toEqual([]);
    expect(world.resolvedConstants.get('HANDOFF_DIGEST_AGENT')).toBe('GrowthJourneyHandoffDigest');
  });

  it('expands every template-literal cron site through real data, never a bare prefix', () => {
    // `Intel_${src.slug}` used to be matched with `name.startsWith('Intel_')`, which cleared
    // ANY seed row beginning with those six characters whether or not a source of that slug
    // existed. Registration is now a resolved set, and a prefix with no expansion rule
    // resolves to nothing rather than to a wildcard.
    expect(
      report(
        cronSites.callSites.filter(
          (s) => s.kind === 'namePrefix'
            && !(EXPECTED_CRON_NAME_PREFIXES.includes(s.value) && EXPANDABLE_NAME_PREFIXES.includes(s.value)),
        ),
        'A template-literal cron site whose prefix has no expansion rule in ' +
          "cronRegistryWorld's PREFIX_EXPANSIONS. It resolves to NO names, so every seed row it " +
          'should have cleared is invisible to invariant (i):',
      ),
    ).toBe('');
    expect([...cronSites.namePrefixes].sort()).toEqual([...EXPECTED_CRON_NAME_PREFIXES].sort());
    expect(cronSites.namePrefixes.filter((p) => !EXPANDABLE_NAME_PREFIXES.includes(p))).toEqual([]);
    expect(world.unexpandedNamePrefixes).toEqual([]);
    expect(world.expandedPrefixNames).toEqual(world.intelSourceSlugs.map((s) => `Intel_${s}`).sort());

    // The real slugs clear their real seed rows (non-vacuous: there are nine of each)…
    const intelSeedRows = seedRows.filter((r) => r.agentName.startsWith('Intel_') && r.triggerType === 'cron');
    expect(intelSeedRows.length).toBe(world.intelSourceSlugs.length);
    expect(observed.cronSeedRowsWithNoRegistration.filter((n) => n.startsWith('Intel_'))).toEqual([]);

    // …and a slug that does not exist is a violation of (i). This is one of the two defects
    // that used to pass every invariant.
    const phantomSlugRow: SeedRow = {
      agentName: 'Intel_grader_fake_slug',
      triggerType: 'cron',
      schedule: '45 3 * * *',
    };
    const withPhantom = reconcile([...seedRows, phantomSlugRow], registryRows, world.registeredNames);
    expect(
      ratchet(withPhantom.cronSeedRowsWithNoRegistration, KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION).newViolations,
    ).toEqual(['Intel_grader_fake_slug']);
  });

  it('fails loudly instead of returning nothing when a list moves or is malformed', () => {
    expect(() => sliceArrayLiteral('const X = [];', 'const GONE =')).toThrow(/marker not found/);
    expect(() => sliceArrayLiteral('const X = [1, 2', 'const X =')).toThrow(/unterminated/);
    expect(() => sliceArrayLiteral('const X = 3;', 'const X =')).toThrow(/no array literal/);
    expect(parseSeedRows('[]')).toEqual([]);
    expect(parseRegistryRows('[]', 'SCHEDULE_REGISTRY')).toEqual([]);
    expect(topLevelObjectLiterals('[]')).toEqual([]);
    // The brace walker must not be fooled by braces inside strings.
    expect(topLevelObjectLiterals("[{ a: '}{' }, { b: 1 }]")).toEqual(["{ a: '}{' }", '{ b: 1 }']);
  });
});

// ─── The ratchet, over the real lists ────────────────────────────────────────────────

describe('SCHEDULE_REGISTRY ⇄ agent seed rows (ratchet)', () => {
  it('(i) no seed row claims cron without a cron site registering it', () => {
    const r = ratchet(observed.cronSeedRowsWithNoRegistration, KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION);
    expect(
      r.newViolations.length === 0
        ? ''
        : `New unreachable cron seed rows (add a SCHEDULE_REGISTRY entry or stop advertising cron):\n  ${explain(r.newViolations)}`,
    ).toBe('');
    expect(
      r.healedBaselineEntries.length === 0
        ? ''
        : `Reconciled — delete these from KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION:\n  ${r.healedBaselineEntries.join('\n  ')}`,
    ).toBe('');
  });

  it('(ii) nothing a timer can fire runs without a seed row to track it', () => {
    const r = ratchet(observed.scheduledNamesWithNoSeedRow, KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW);
    expect(
      r.newViolations.length === 0
        ? ''
        : `Scheduled with no ai_agents row — every run is tracked against nothing:\n  ${explain(r.newViolations)}`,
    ).toBe('');
    expect(
      r.healedBaselineEntries.length === 0
        ? ''
        : `Reconciled — delete these from KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW:\n  ${r.healedBaselineEntries.join('\n  ')}`,
    ).toBe('');
  });

  it('(iii) a schedule advertised by a seed row is the schedule that fires', () => {
    const r = ratchet(observed.scheduleDisagreements, KNOWN_SCHEDULE_DISAGREEMENTS);
    expect(
      r.newViolations.length === 0
        ? ''
        : `Seed row advertises a schedule the scheduler does not use (name|registry|seed):\n  ${r.newViolations.join('\n  ')}`,
    ).toBe('');
    expect(
      r.healedBaselineEntries.length === 0
        ? ''
        : `Changed or reconciled — update KNOWN_SCHEDULE_DISAGREEMENTS:\n  ${r.healedBaselineEntries.join('\n  ')}`,
    ).toBe('');
  });

  it('(iv) a registered name whose seed row denies having a schedule is reported', () => {
    // The dashboard renders the seed row. A row declaring a non-cron trigger and/or an empty
    // schedule while timers fire the name tells a reader this agent has no schedule, which is
    // exactly the harm this guard's own header describes — and the one combination invariants
    // (i) and (iii) both exclude.
    const r = ratchet(observed.registeredRowsDenyingSchedule, KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE);
    expect(
      r.newViolations.length === 0
        ? ''
        : `Registered and fired by a timer, while the seed row the dashboard shows denies carrying ` +
          `a schedule (name|trigger|seedSchedule|firing):\n  ${explain(r.newViolations)}`,
    ).toBe('');
    expect(
      r.healedBaselineEntries.length === 0
        ? ''
        : `Changed or reconciled — update KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE:\n  ${r.healedBaselineEntries.join('\n  ')}`,
    ).toBe('');
  });

  it('(v) one agentName is one registry entry, so one row owns its counters', () => {
    // Several entries under one name are several timers reporting run_count and error_count
    // into a single ai_agents row. Nothing is unreachable; the counters are pooled, so a
    // silent failure in one duty is indistinguishable from the others succeeding.
    const r = ratchet(observed.duplicateRegistryNames, KNOWN_DUPLICATE_REGISTRY_NAMES);
    expect(
      r.newViolations.length === 0
        ? ''
        : `Several registry entries share one agentName, so several timers pool their run_count/` +
          `error_count into one row (name|registries|schedules):\n  ${explain(r.newViolations)}`,
    ).toBe('');
    expect(
      r.healedBaselineEntries.length === 0
        ? ''
        : `Changed or reconciled — update KNOWN_DUPLICATE_REGISTRY_NAMES:\n  ${r.healedBaselineEntries.join('\n  ')}`,
    ).toBe('');
  });

  it('(iv) a baselined entry heals the moment its seed row stops contradicting the timers', () => {
    // The answer to "is the baseline entry just silencing it?". For each entry, rewrite ONLY
    // the seed row it describes so it declares cron on a schedule that really fires, and the
    // entry must come back as healed — the suite then demands its deletion. An entry that
    // cannot heal is a mute button; this proves these can, against the real lists.
    for (const entry of KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE) {
      const [name, , , firing] = entry.split('|');
      const declared = firing.split(',')[0];
      const conformed = seedRows.map((r) => (r.agentName === name ? { ...r, triggerType: 'cron', schedule: declared } : r));
      const after = reconcile(conformed, registryRows, world.registeredNames);
      const r = ratchet(after.registeredRowsDenyingSchedule, KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE);
      expect(r.healedBaselineEntries).toContain(entry);
      expect(r.newViolations).toEqual([]);

      // And it records what the real repair is, rather than implying one edit finishes it:
      // declaring ONE schedule leaves every OTHER timer disagreeing with the row under
      // invariant (iii), because a single row cannot honestly describe several firing times.
      // For Dara that is two further disagreements — three duties, one row. Measured here.
      const others = [...new Set(firing.split(','))].filter((s) => s !== declared);
      const stillWrong = ratchet(after.scheduleDisagreements, KNOWN_SCHEDULE_DISAGREEMENTS).newViolations.filter((e) =>
        e.startsWith(`${name}|`),
      );
      expect(`${name}: ${stillWrong.length} further disagreement(s)`).toBe(`${name}: ${others.length} further disagreement(s)`);
    }
  });

  it('(v) a baselined entry heals the moment the name stops being shared', () => {
    // Same question for (v), and the other half of the same repair: give each duty its own
    // tracked name and the entry must be reported healed.
    for (const entry of KNOWN_DUPLICATE_REGISTRY_NAMES) {
      const name = entry.split('|')[0];
      let duty = 0;
      const unshared = registryRows.map((r) => (r.agentName === name ? { ...r, agentName: `${name}Duty${duty++}` } : r));
      expect(duty).toBeGreaterThan(1); // the entry really did describe several rows
      const after = reconcile(seedRows, unshared, world.registeredNames);
      const r = ratchet(after.duplicateRegistryNames, KNOWN_DUPLICATE_REGISTRY_NAMES);
      expect(r.healedBaselineEntries).toContain(entry);
      expect(r.newViolations).toEqual([]);
    }
  });

  it('keeps the baseline honest: unique within each list, disjoint across the first three', () => {
    const lists: Array<[string, ReadonlyArray<string>]> = [
      ['KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION', KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION],
      ['KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW', KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW],
      ['KNOWN_SCHEDULE_DISAGREEMENTS', KNOWN_SCHEDULE_DISAGREEMENTS],
      ['KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE', KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE],
      ['KNOWN_DUPLICATE_REGISTRY_NAMES', KNOWN_DUPLICATE_REGISTRY_NAMES],
    ];
    for (const [label, list] of lists) {
      const dupes = list.filter((e, i) => list.indexOf(e) !== i);
      expect(`${label}: ${dupes.join(', ')}`).toBe(`${label}: `);
      expect(list.filter((e) => e.trim() !== e || e === '')).toEqual([]);
    }
    // Disjointness across the FIRST three lists, which the old count test never checked. Those
    // three directions are mutually exclusive by construction — (i) needs a seed row and no
    // registration, (ii) a registration and no seed row, (iii) both — so a name in two of them
    // means one is stale. Compared on the agent name, since (iii) is `name|a|b`.
    //
    // (iv) and (v) are deliberately outside that claim, and this is not a loophole: both
    // describe a name that IS registered AND HAS a seed row, the one combination (i) and (ii)
    // exclude, and one name can honestly be in both — Dara is, because "the row denies the
    // schedule" and "three timers share the row" are two separate repairs that heal
    // independently. What is asserted for them instead is below: their shape, and that every
    // name in them really is registered, really is seeded, and for (v) really does have more
    // than one registry row. A fabricated entry fails those.
    const all = lists.slice(0, 3).flatMap(([label, list]) => list.map((e) => ({ label, name: e.split('|')[0] })));
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const { label, name } of all) {
      const first = seen.get(name);
      if (first) collisions.push(`${name} (in ${first} and ${label})`);
      else seen.set(name, label);
    }
    expect(collisions).toEqual([]);
    expect(seen.size).toBe(all.length); // non-vacuity: the loop really walked every entry
    expect(KNOWN_SCHEDULE_DISAGREEMENTS.filter((e) => e.split('|').length !== 3)).toEqual([]);

    // Shape and truth of the two lists that are not part of the disjointness claim.
    expect(KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE.filter((e) => e.split('|').length !== 4)).toEqual([]);
    expect(KNOWN_DUPLICATE_REGISTRY_NAMES.filter((e) => e.split('|').length !== 3)).toEqual([]);
    const seeded = new Set(seedRows.map((r) => r.agentName));
    const registered = new Set(world.registeredNames);
    for (const entry of KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE) {
      const name = entry.split('|')[0];
      expect(`${name}: seeded ${seeded.has(name)}, registered ${registered.has(name)}`).toBe(
        `${name}: seeded true, registered true`,
      );
    }
    for (const entry of KNOWN_DUPLICATE_REGISTRY_NAMES) {
      const [name, registries] = entry.split('|');
      const rows = registryRows.filter((r) => r.agentName === name);
      expect(`${name}: ${rows.length} rows in ${[...new Set(rows.map((r) => r.registry))].sort().join('+')}`).toBe(
        `${name}: ${rows.length} rows in ${registries}`,
      );
      expect(rows.length).toBeGreaterThan(1);
    }
  });
});

// ─── The ratchet itself: happy path, failure, boundary, replay, mutation proof ────────

describe('ratchet()', () => {
  it('passes when observation and baseline agree exactly (happy path)', () => {
    expect(ratchet(['a', 'b'], ['a', 'b'])).toEqual({ newViolations: [], healedBaselineEntries: [] });
  });

  it('catches a fabricated new violation in each direction (positive control)', () => {
    // (i) a seed row that claims cron with nothing registering it
    const fabricatedSeed: SeedRow[] = [
      ...seedRows,
      { agentName: 'FabricatedGhostAgent', triggerType: 'cron', schedule: '0 * * * *' },
    ];
    const i = reconcile(fabricatedSeed, registryRows, world.registeredNames);
    expect(ratchet(i.cronSeedRowsWithNoRegistration, KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION).newViolations).toEqual([
      'FabricatedGhostAgent',
    ]);

    // (ii) a cron site with no seed row — registered by instrumentCronJob() alone, with no
    // SCHEDULE_REGISTRY entry. This is the shape invariant (ii) was blind to: the name
    // cleared direction (i) and was never itself checked, so 33 live cron jobs were invisible.
    const ii = reconcile(seedRows, registryRows, [...world.registeredNames, 'FabricatedCronSiteOnly']);
    expect(ratchet(ii.scheduledNamesWithNoSeedRow, KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW).newViolations).toEqual([
      'FabricatedCronSiteOnly',
    ]);

    // (iii) a name on both sides with two schedules
    const name = world.scheduleRows.find((r) => seedRows.some((s) => s.agentName === r.agentName))!.agentName;
    const skewed = seedRows.map((s) => (s.agentName === name ? { ...s, schedule: '0 0 29 2 *' } : s));
    const iii = reconcile(skewed, registryRows, world.registeredNames);
    expect(ratchet(iii.scheduleDisagreements, KNOWN_SCHEDULE_DISAGREEMENTS).newViolations.length).toBeGreaterThan(0);

    // (iv) a registered name whose seed row stops admitting it has a schedule. This is the
    // shape invariants (i) and (iii) both miss: not `cron`, so (i) ignores it; no schedule to
    // compare, so (iii) ignores it; and it has a seed row, so (ii) ignores it too.
    const firedCron = seedRows.find((s) => s.triggerType === 'cron' && world.registeredNames.includes(s.agentName))!;
    const denied = seedRows.map((s) =>
      s.agentName === firedCron.agentName ? { ...s, triggerType: 'event_driven', schedule: '' } : s,
    );
    const iv = reconcile(denied, registryRows, world.registeredNames);
    const ivNew = ratchet(iv.registeredRowsDenyingSchedule, KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE).newViolations;
    expect(ivNew.length).toBe(1);
    expect(ivNew[0].startsWith(`${firedCron.agentName}|event_driven||`)).toBe(true);
    // The fourth field must name what fires it, or the report cannot be acted on.
    expect(ivNew[0].split('|').length).toBe(4);
    expect(ivNew[0].split('|')[3]).not.toBe('');
    // …and it is reported while every other invariant stays quiet about it, which is the
    // whole reason (iv) exists.
    expect(iv.cronSeedRowsWithNoRegistration).toEqual(observed.cronSeedRowsWithNoRegistration);
    expect(iv.scheduledNamesWithNoSeedRow).toEqual(observed.scheduledNamesWithNoSeedRow);
    expect(iv.scheduleDisagreements.filter((e) => e.startsWith(`${firedCron.agentName}|`))).toEqual([]);

    // (v) a second registry entry under a name that has exactly one today
    const once = world.scheduleRows.find((r) => registryRows.filter((x) => x.agentName === r.agentName).length === 1)!;
    const duped = reconcile(
      seedRows,
      [...registryRows, { ...once, hardcodedSchedule: '0 0 29 2 *' }],
      world.registeredNames,
    );
    expect(ratchet(duped.duplicateRegistryNames, KNOWN_DUPLICATE_REGISTRY_NAMES).newViolations).toEqual([
      `${once.agentName}|SCHEDULE_REGISTRY|${[once.hardcodedSchedule, '0 0 29 2 *'].sort().join(',')}`,
    ]);
  });

  it('reports a healed baseline entry on every one of the five real lists', () => {
    // The five list tests above consume healedBaselineEntries, but today's baseline matches
    // observation exactly, so they can never exercise it against the real data. This test
    // does: a phantom baseline entry on each list must come back as healed, which is what
    // forces a reconciled entry to be DELETED rather than left as a permanent allowlist.
    //
    // The last column is the non-vacuity floor. (i)-(iii) have large observations that must
    // not silently become empty. (iv) and (v) each describe ONE live state that a real fix
    // will empty, and a floor there would mean repairing production breaks this test — the
    // exact pressure to edit a test for green that this file exists to resist. Their
    // non-vacuity comes from the ratchet instead: their baselines are non-empty, so an
    // observation that silently went empty is reported as a healed entry by their own list
    // test and the suite is red anyway.
    const lists: Array<[string, string[], ReadonlyArray<string>, number]> = [
      ['(i)', observed.cronSeedRowsWithNoRegistration, KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION, 1],
      ['(ii)', observed.scheduledNamesWithNoSeedRow, KNOWN_SCHEDULED_NAMES_WITH_NO_SEED_ROW, 1],
      ['(iii)', observed.scheduleDisagreements, KNOWN_SCHEDULE_DISAGREEMENTS, 1],
      ['(iv)', observed.registeredRowsDenyingSchedule, KNOWN_REGISTERED_ROWS_DENYING_SCHEDULE, 0],
      ['(v)', observed.duplicateRegistryNames, KNOWN_DUPLICATE_REGISTRY_NAMES, 0],
    ];
    for (const [label, obs, baseline, floor] of lists) {
      expect(obs.length).toBeGreaterThanOrEqual(floor);
      const r = ratchet(obs, [...baseline, 'PhantomHealedEntry']);
      expect(`${label} ${r.healedBaselineEntries.join(',')}`).toBe(`${label} PhantomHealedEntry`);
      expect(r.newViolations).toEqual([]);
    }
  });

  it('catches a baseline entry that has stopped violating (the ratchet half)', () => {
    // This is the assertion that makes the baseline shrink-only. Measured, not assumed:
    // mutating `ratchet` to return `healedBaselineEntries: []` is M8 in the header — 6 failed,
    // 27 passed, and this is one of the six.
    //
    // The two previous versions of this comment both got that wrong. The first claimed the
    // mutation "must fail here and in the three list tests above", which was false: today's
    // baseline equals observation exactly, so (i)/(ii)/(iii) have nothing healed to report and
    // stay green under it. The second claimed "exactly three tests … 3 failed, 20 passed",
    // which was measured before the last two tests of that pass landed and was wrong in both
    // numbers and in the list of names. In a file whose whole argument is rigour, a false claim
    // about its own rigour is the worst line in it — so every number in the header's mutation
    // table was re-run after the last edit, and the six names are listed there in full.
    //
    // What actually dies: this test, the two "a baselined entry heals…" tests against the real
    // Dara entries, the per-list phantom-entry test, and the two ratchet boundary tests. The
    // real-data coverage of the ratchet half comes from those first three, not from this one.
    expect(ratchet(['a'], ['a', 'alreadyFixed']).healedBaselineEntries).toEqual(['alreadyFixed']);
    const healed = ratchet(
      observed.cronSeedRowsWithNoRegistration.filter((n) => n !== 'Policy_Agent'),
      KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION,
    );
    expect(healed.healedBaselineEntries).toEqual(['Policy_Agent']);
    expect(healed.newViolations).toEqual([]);
  });

  it('rejects a missing or malformed baseline instead of reporting health', () => {
    // ts-jest runs with isolatedModules (transpile only, no type check), so a renamed,
    // moved or deleted baseline export reaches this function as `undefined` at runtime with
    // no compile error — and `new Set(undefined)` is an empty set, i.e. perfect health.
    const asList = undefined as unknown as ReadonlyArray<string>;
    expect(() => ratchet([], asList)).toThrow(/baseline must be an array, got undefined/);
    expect(() => ratchet([], null as unknown as ReadonlyArray<string>)).toThrow(/baseline must be an array, got null/);
    expect(() => ratchet(asList, [])).toThrow(/observed must be an array, got undefined/);
    // A blank entry can never be observed, so it would be reported as healed forever.
    expect(() => ratchet([], ['ok', '  '])).toThrow(/baseline\[1\] must be a non-empty string/);
    expect(() => ratchet([42 as unknown as string], [])).toThrow(/observed\[0\] must be a non-empty string/);
    // reconcile() carries the same guard, for the same reason.
    expect(() => reconcile(seedRows, registryRows, asList)).toThrow(/registeredNames must be an array/);
  });

  it('handles empty inputs on both sides (boundary)', () => {
    expect(ratchet([], [])).toEqual({ newViolations: [], healedBaselineEntries: [] });
    expect(ratchet(['x'], []).newViolations).toEqual(['x']);
    expect(ratchet([], ['x']).healedBaselineEntries).toEqual(['x']);
  });

  it('is order-independent and duplicate-tolerant (boundary)', () => {
    // Both assertions this test used to make were on EMPTY results — ratchet(['b','a'],['a','b'])
    // and ratchet(['a','a'],['a']) — so they held under every mutation of ratchet() and under
    // every production injection, and proved nothing about either property. A test that cannot
    // fail is decoration. These make the same two claims where they can fail: on non-empty
    // results, where dropping either `.sort()` reorders the output and dropping either
    // `new Set()` duplicates it.
    const sorted = ratchet(['c', 'a', 'b'], ['y', 'x']);
    expect(sorted).toEqual({ newViolations: ['a', 'b', 'c'], healedBaselineEntries: ['x', 'y'] });
    expect(ratchet(['b', 'c', 'a'], ['x', 'y'])).toEqual(sorted); // input order cannot be read back out
    // A repeated observation is one violation; a repeated baseline entry is one healed entry.
    expect(ratchet(['a', 'a', 'b'], ['b']).newViolations).toEqual(['a']);
    expect(ratchet(['a'], ['b', 'b']).healedBaselineEntries).toEqual(['b']);
    // And duplicates on both sides still cancel, which is the original claim, kept.
    expect(ratchet(['a', 'a'], ['a'])).toEqual({ newViolations: [], healedBaselineEntries: [] });
  });

  it(
    'is idempotent across a second full read of every source file (replay)',
    () => {
      // The point of re-reading rather than re-calling: `readCronRegistryWorld()` holds no
      // cache, so this re-walks backend/src and re-reads all ~4,000 files off disk. It is the
      // half that can catch readdir ordering, encoding and CRLF instability between reads —
      // compared on parsed names, never on raw bytes, because byte comparison is what breaks
      // locally on Windows CRLF while passing in CI.
      const again = readCronRegistryWorld();
      expect(again.sourceFiles).toEqual(world.sourceFiles);
      expect(again.unbalancedSourceFiles).toEqual(world.unbalancedSourceFiles);
      expect(again.registeredNames).toEqual(world.registeredNames);
      expect(again.intelSourceSlugs).toEqual(world.intelSourceSlugs);
      expect(again.cronSites).toEqual(cronSites);
      expect(again.seedRows).toEqual(seedRows);
      expect(again.registryRows).toEqual(registryRows);
      expect(again.observed).toEqual(observed);
      expect([...again.resolvedConstants]).toEqual([...world.resolvedConstants]);
      // Non-vacuity: a second read that returned nothing would also "match" an empty first.
      expect(again.sourceFiles.length).toBeGreaterThan(0);
      expect(again.observed.cronSeedRowsWithNoRegistration.length).toBeGreaterThan(0);

      // And the ratchet over the re-read world is stable, including against its own cleared
      // state: no oscillation.
      const first = ratchet(observed.cronSeedRowsWithNoRegistration, KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION);
      expect(ratchet(again.observed.cronSeedRowsWithNoRegistration, KNOWN_CRON_SEED_ROWS_WITH_NO_REGISTRATION)).toEqual(
        first,
      );
      expect(ratchet(again.observed.scheduledNamesWithNoSeedRow, again.observed.scheduledNamesWithNoSeedRow)).toEqual({
        newViolations: [],
        healedBaselineEntries: [],
      });
    },
    120_000,
  );
});
