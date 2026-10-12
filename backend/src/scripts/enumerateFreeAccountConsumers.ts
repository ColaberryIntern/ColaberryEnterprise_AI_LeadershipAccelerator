/**
 * Growth OS Reset Phase 2 T202 — enumerate every consumer of the two columns
 * that describe a free account, from the source tree, by command.
 *
 * WHY THIS EXISTS. Three successive revisions of the Phase 2 plan carried a
 * hand-written list of the consumers that would change behaviour when
 * `enrollment_type` and `tier` start being written together. The list was short
 * every time: audit cycle 1 found one missing consumer, cycle 2 found two more,
 * and a direct count found 31 non-test files mentioning `enrollment_type` at the
 * phase-1 base where the plan had named 8. A list a human maintains in prose will be short again
 * the next time someone adds a reader.
 *
 * So the list is generated, committed, and asserted against by a tripwire. A
 * consumer arriving later that nobody has classified is a failed build rather than a silent
 * behaviour change on a public signup path.
 *
 * TWO CLASSES, because they need different treatment and conflating them is
 * what made the earlier lists useless:
 *
 *   BRANCHING   — the file compares the column to a literal, or filters a query
 *                 by one, so its OUTPUT can flip when the value changes. Each
 *                 of these needs a behaviour test in T202.
 *   REPORTING   — the file selects, returns or displays the value without
 *                 branching on it. Its output changes only in the sense that it
 *                 now reports a different value. These need DISCLOSURE in the
 *                 checkpoint, not a behaviour test.
 *
 * Deliberately NOT a jest test: it is a generator whose output is committed and
 * then asserted by `freeAccountConsumers.test.ts`. Keeping generation separate
 * from assertion means the tripwire compares the committed artifact against a
 * fresh scan, rather than comparing a scan against itself.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..');

/**
 * Comparisons and query filters, i.e. the places a value change flips an
 * outcome. Covers `x === 'explorer'`, `x !== 'explorer'`, `enrollment_type:
 * 'explorer'` inside a `where`, and the SQL forms, which this repo uses heavily
 * through `sql.query`.
 */
const BRANCHING = [
  /enrollment_type\s*(===|!==|==|!=)\s*['"`]/,
  /enrollment_type\s*:\s*['"`](explorer|standard|internship|cohort)['"`]/,
  /enrollment_type\s*(=|<>|!=)\s*'(explorer|standard|internship|cohort)'/i,
  /\btier\s*(===|!==|==|!=)\s*['"`](guest|member)['"`]/,
  /\btier\s*:\s*['"`](guest|member)['"`]/,
  /\btier\s*(=|<>|!=)\s*'(guest|member)'/i,
  // Sequelize operator objects. `{ enrollment_type: { [Op.ne]: 'explorer' } }`
  // is a query filter — the artifact's own definition of branching — but after
  // the colon comes `{`, not a quote, so none of the rules above see it.
  //
  // This gap misfiled `cohortService.ts` as a reporting-only consumer when it
  // filters three dashboard counts (`totalEnrollments`, `paidEnrollments`,
  // `pendingInvoice`) on exactly that form. The verifier found it, and it is the
  // same under-count class as the comment-stripper bug: the file was present in
  // the artifact, so the completeness tripwire passed, while the thing that
  // decides whether it gets a behaviour test was wrong.
  /(enrollment_type|\btier)\s*:\s*\{\s*\[\s*Op\./,
];

/**
 * Mentions either column.
 *
 * `enrollment_type` is distinctive enough to take on its own. **`tier` is not**:
 * a bare `\btier\b` matched 259 non-test files, because this repo also has build
 * tiers, pricing tiers, provider-capability tiers and curriculum prose using the
 * word. Those files cannot change behaviour when an ENROLLMENT's tier changes,
 * and including them produced a 277-row list that no one could act on.
 *
 * So a `tier` mention counts only when the file also talks about enrollments,
 * which is the join that makes it this column rather than one of the others.
 */
const MENTIONS = [/enrollment_type/];
const TIER_MENTION = [/'tier'/, /"tier"/, /\.tier\b/, /\btier\s*:\s*['"`](guest|member)['"`]/];
const ENROLLMENT_CONTEXT = [/[Ee]nrollment/, /enrollments/];

export interface ConsumerRow {
  file: string;
  branching: boolean;
  /** The first matching line, so a reader can see WHY the file is listed. */
  evidence: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(p, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Strip comments before classifying.
 *
 * This repo documents its own semantics heavily, so the FIRST version of this
 * scan classified `config/env.ts`, `cohortService.ts` and
 * `withdrawTestDemoRevenueAccounts.ts` as branching consumers on the strength of
 * sentences like "not just enrollment_type='explorer'". A comment cannot flip an
 * outcome, and a "behaviour test per branching file" criterion is unsatisfiable
 * for a file whose only mention is prose — so the criterion would have been
 * quietly dropped for those files, which is how a list stops meaning anything.
 *
 * **Per line, deliberately, and never with multi-line state.** The first version
 * matched block comments with a lazy dot-all regex, which cannot tell a real
 * block-comment opener from the same two characters inside a string or a regex
 * literal. On `server.ts` — 187 KB, full of SQL template literals — it swallowed
 * **61% of the non-whitespace** (149,436 chars down to 58,663) and with it the
 * `enrollment_type` mention, so the file dropped out of the scan entirely. A
 * tripwire that under-counts is worse than no tripwire, because it reports clean
 * while missing a consumer.
 *
 * So a line counts as a comment only when its first non-space characters are a
 * line-comment opener, a block-comment opener or closer, or the lone asterisk
 * this repo's docblock style uses for continuation lines. That cannot run away
 * past its own line. It keeps the code half of a trailing comment, so a mention
 * inside a trailing comment is counted as real — **over-counting, which is the
 * safe direction** for a check whose job is to make sure nobody is missed.
 *
 * Blanks comment lines rather than deleting them, so line numbers and the
 * evidence line stay aligned with the real file.
 */
export function stripComments(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*/') || t.startsWith('*')) {
        return '';
      }
      return line;
    })
    .join('\n');
}

/** Pure: classify one file's content. Exported so the tripwire can reuse it. */
export function classify(content: string): { mentions: boolean; branching: boolean; evidence: string } {
  const code = stripComments(content);
  const codeLines = code.split('\n');
  const rawLines = content.split('\n');
  let evidence = '';
  let branching = false;

  for (let i = 0; i < codeLines.length; i++) {
    if (!branching && BRANCHING.some((re) => re.test(codeLines[i]))) {
      branching = true;
      evidence = rawLines[i].trim().slice(0, 160);
    }
  }
  if (!branching) {
    const idx = codeLines.findIndex((l) => MENTIONS.some((re) => re.test(l)) || TIER_MENTION.some((re) => re.test(l)));
    evidence = idx >= 0 ? rawLines[idx].trim().slice(0, 160) : '';
  }

  const mentionsType = MENTIONS.some((re) => re.test(code));
  const mentionsTier =
    TIER_MENTION.some((re) => re.test(code)) && ENROLLMENT_CONTEXT.some((re) => re.test(code));

  return { mentions: mentionsType || mentionsTier, branching, evidence };
}

/** Scan the tree. Exported so the tripwire scans with the same rule. */
export function enumerateConsumers(): ConsumerRow[] {
  const rows: ConsumerRow[] = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, 'utf8');
    const { mentions, branching, evidence } = classify(content);
    if (!mentions) continue;
    rows.push({
      file: path.relative(SRC, file).split(path.sep).join('/'),
      branching,
      evidence,
    });
  }
  return rows.sort((a, b) => (a.branching === b.branching ? a.file.localeCompare(b.file) : a.branching ? -1 : 1));
}

/**
 * Phase 2 T203 — who WRITES learner-programme semantics.
 *
 * A separate question from `enumerateConsumers`, and the distinction is the whole
 * point: `enrollmentService.ts:163` and `explorerIdentityBridge.ts:122` both
 * contain `enrollment_type: 'explorer'` and neither is a writer — the first is the
 * retirement sweep's `where` clause, the second is the population loader's.
 * Counting those two reads would report **9 sites across 4 files** where there are
 * **7 across 3**, and a reviewer who checked the guard once and found it wrong would
 * stop trusting it. (Both figures were stale here through two verification rounds —
 * the text said 8 and 6 while the suite asserted 7. A derived number in a comment
 * goes out of date the moment the derivation improves, which is why the suite, not
 * this comment, is the authority.)
 *
 * The rule itself is documented on `findWriteSites`, which is the only account of
 * it. An earlier draft of this comment described a different rule — scanning only
 * `.create({ … })`/`.update({ … })` blocks — that was replaced twice over; leaving
 * it here gave the file two contradictory explanations of its own behaviour, which
 * a verifier flagged as failing "a junior developer can understand the change".
 */
/**
 * The negative lookahead excludes a TYPE UNION. `declare tier: 'guest' | 'member'`
 * and the response schema's `tier: 'guest' | 'member'` both match a bare
 * `tier: 'guest'`, and listing a type declaration as a writer would put noise in
 * an allow-list that is supposed to be read by a human and trusted.
 */
/*
 * `LEARNER_WRITE_LITERALS` used to live here — the narrow syntax list from the
 * first three attempts. **Deleted rather than kept**, because it had a comment
 * saying "No longer how writers are detected" while `writeLiteralOutsideReadSpans`
 * was still using it on every line containing `where:`. That is how the one-line
 * `findOrCreate({ where, defaults })` and two-argument `update(payload, { where })`
 * forms stayed invisible through three verification rounds: the inversion was
 * applied to detection and not to subtraction, and a reassuring comment covered the
 * gap. A constant nobody uses cannot drift back into use.
 */

/**
 * Either column's name in an ASSIGNING position, however it is spelled or quoted.
 *
 * The trailing group is the load-bearing part: `:` or a **single** `=`. An earlier
 * draft used `[:=]`, which matched the first character of `===` — so every
 * comparison in the tree (`enrollment_type === 'explorer'`, of which there are
 * many) counted as a write and the derived set jumped from 6 sites to 19. A
 * comparison reads; only `:` and a lone `=` assign.
 */
const LEARNER_COLUMN =
  /(^|[^a-zA-Z_!=<>])['"`]?(enrollment_type|tier)['"`]?\s*(:(?!:)|=(?!=))/;
/** Either column's free-account value, in any quote style. */
const LEARNER_VALUE = /['"`](explorer|guest)['"`]/;
/** A type union — `'guest' | 'member'` — which declares rather than writes. */
const LEARNER_UNION = /['"`](explorer|guest|standard|member)['"`]\s*\|/;

/**
 * Sequelize's `setDataValue('col', value)`, where the column is a string argument
 * rather than a key, so no `:`/`=` rule can see it. A real API on every model
 * instance, so it gets its own rule rather than a line in the limitations list.
 */
const LEARNER_SET_DATA_VALUE =
  /setDataValue\(\s*['"`](enrollment_type|tier)['"`]\s*,\s*['"`](explorer|guest)['"`]/;

/**
 * Raw SQL that writes, as opposed to filters.
 *
 * `UPDATE … SET enrollment_type = 'explorer'` and
 * `INSERT INTO enrollments … VALUES (… 'explorer' …)` are writes; a `WHERE` on the
 * same column is a read. The statement keyword is the only difference, so the
 * keyword is what this looks for — and it looks for it **anywhere in the preceding
 * window**, not on the same line, because this repo writes multi-line SQL.
 *
 * An earlier version required `SET` on the SAME line and justified that with "which
 * is how every single-statement update in this repo is written". That was false:
 * `services/paymentSyncService.ts:191` opens `UPDATE enrollments SET` with every
 * assignment on later lines — the exact missed shape, in the same folder.
 */
const SQL_WRITE_KEYWORD = /\b(SET|INSERT\s+INTO\s+enrollments|VALUES)\b/i;
const SQL_READ_KEYWORD = /\bWHERE\b/i;

export interface WriterSite {
  file: string;
  line: number;
  call: string;
  evidence: string;
}

/**
 * Pure: every line that WRITES one of the two columns. **The only account of the
 * rule. If a comment elsewhere disagrees with this one, this one is the code.**
 *
 * THE RULE. A line is a candidate write when the column name appears in an
 * assigning position — `:` or a lone `=`, never `===` — with its value on that
 * line or within the next two; or when `setDataValue('col', 'value')` appears; or
 * when a value sits inside a raw-SQL statement whose keyword (`SET`,
 * `INSERT INTO enrollments`, `VALUES`) is found looking back, with a `WHERE` or a
 * statement boundary ending the search. Candidates are then **subtracted**: a
 * `where: { … }` span, an operator object nested under the column, a type union, a
 * declaration, or a SQL `WHERE` ahead of the column all mean read.
 *
 * WHY IT IS SHAPED THAT WAY, in the order the mistakes happened, because three
 * rounds of this were wrong and the reasons are not obvious:
 *
 *  1. Scanning only `.create({ … })`/`.update({ … })` blocks excluded the two known
 *     `where` reads correctly but missed the canonical service's own defaults at
 *     `freeAccountRegistration.ts:80`, a returned object literal.
 *  2. Walking BACK twelve lines for an unclosed `where: {` treated a *balanced*
 *     one-liner as open, so a single `findOne({ where: { email } })` suppressed
 *     every write beneath it. A verifier dropped a third writer in exactly that
 *     shape into a new file and the scan reported its old answer unchanged. The
 *     docblock then claimed the error mode was over-counting; it was the opposite,
 *     which is the one direction that makes a guard worthless.
 *  3. Enumerating write *syntaxes* still missed this repo's idioms — property
 *     assignment then `save()`, raw `INSERT`, a ternary value, a quoted key. So the
 *     rule stopped recognising syntaxes and started recognising the column-and-value
 *     pairing, subtracting reads instead.
 *
 * WHAT IT DOES NOT SEE, measured rather than assumed: a value behind a constant
 * (`tier: TIERS.GUEST`), which would need type resolution rather than a better
 * pattern. That limit is asserted as a test in `learnerWriterTripwire.test.ts`, as
 * are all the shapes above, so this comment cannot drift away from the behaviour
 * without the suite failing.
 */
export function findWriteSites(content: string): Omit<WriterSite, 'file'>[] {
  // Trailing comments are removed HERE and nowhere else. `stripComments` keeps
  // them on purpose — over-counting is the safe direction for the consumer scan —
  // but for "who writes this column" a trailing comment is a false positive, and
  // one was: `subscriptionAnalyticsService.ts:295` is `isExplorer: false, //
  // fetchPayingMembers already excludes enrollment_type='explorer'`. The `[^:]`
  // guard protects `https://`, which the suite tests.
  const code = stripComments(content)
    .split('\n')
    // `[^\r\n]*`, NOT `.*$`. JS `.` does not match `\r`, so on this CRLF tree the
    // anchored form never reached end-of-string and stripped nothing — a trailing
    // comment survived and `subscriptionAnalyticsService.ts:295` counted as a
    // writer. The bug was invisible in an isolated test because the fixture I
    // wrote by hand used LF endings while every file in the repo uses CRLF.
    .map((l) => l.replace(/(^|[^:])\/\/[^\r\n]*/, '$1'))
    .join('\n');
  const lines = code.split('\n');
  const raw = content.split('\n');
  const out: Omit<WriterSite, 'file'>[] = [];

  // Every `where: { … }` block's own line span, by matching braces FORWARD from
  // the opener. Only lines inside a span are reads.
  //
  // The previous version walked BACKWARD up to 12 lines looking for an unclosed
  // `where: {`, and a balanced one-liner leaves the depth at zero — so a single
  // `findOne({ where: { email } })` suppressed every write in the next twelve
  // lines. That is the most ordinary shape in this repo: look the person up, then
  // create them. A verifier dropped a brand-new third writer into a new file in
  // exactly that shape and the tripwire reported clean. The docblock above
  // claimed the error mode was over-counting; as shipped it was the opposite,
  // which is the one direction that makes a guard worthless.
  const readSpans: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i++) {
    let from = 0;
    for (;;) {
      const at = lines[i].indexOf('where:', from);
      if (at === -1) break;
      from = at + 6;
      const open = lines[i].indexOf('{', at);
      if (open === -1) break;
      // Match forward from this brace.
      let depth = 0;
      let endLine = i;
      let done = false;
      for (let j = i; j < lines.length && !done; j++) {
        const startCol = j === i ? open : 0;
        for (let c = startCol; c < lines[j].length; c++) {
          if (lines[j][c] === '{') depth++;
          else if (lines[j][c] === '}') {
            depth--;
            if (depth === 0) { endLine = j; done = true; break; }
          }
        }
        if (!done) endLine = j;
      }
      readSpans.push([i, endLine]);
    }
  }
  const insideRead = (idx: number) => readSpans.some(([a, b]) => idx >= a && idx <= b);

  /** Does a value literal appear on this line, or within the next two? */
  const valueNearby = (i: number): boolean =>
    LEARNER_VALUE.test(lines[i])
    || (!!lines[i + 1] && LEARNER_VALUE.test(lines[i + 1]))
    || (!!lines[i + 2] && LEARNER_VALUE.test(lines[i + 2]));

  /** Is this line inside a raw-SQL statement whose keyword says "write"? */
  const sqlWriteContext = (i: number): boolean => {
    if (!LEARNER_VALUE.test(lines[i]) && !/\b(enrollment_type|tier)\b/.test(lines[i])) return false;
    for (let k = i; k >= 0 && i - k < 12; k--) {
      if (SQL_WRITE_KEYWORD.test(lines[k])) return true;
      // A WHERE between here and the keyword means this is the filter half.
      if (k < i && SQL_READ_KEYWORD.test(lines[k])) return false;
      // Stop at a statement boundary, so a SQL keyword from an EARLIER statement
      // cannot label a later object literal as SQL. Without this, a `VALUES` twelve
      // lines up tagged two ordinary `create({ … })` writes as `.sql` — the right
      // count with the wrong reason printed beside it.
      if (k < i && /(^|\s)\};?\s*$|\)\s*;\s*$/.test(lines[k])) return false;
    }
    return false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (LEARNER_UNION.test(line)) continue;              // a type declaration
    if (/^\s*(declare|export type|type )/.test(line)) continue;

    // A SQL `WHERE` ahead of the column on the same line makes it a filter, not a
    // write. Without this, `WHERE e.enrollment_type = 'explorer'` inside a template
    // literal counted as a write — the roster queries this scanner exists to leave
    // alone.
    // A `defaults:` payload is the WRITE half of a `findOrCreate`, and it is tested
    // BEFORE the WHERE-ahead guard below. On a one-line
    // `findOrCreate({ where: { email }, defaults: { enrollment_type: 'explorer' } })`
    // the column sits after `where:`, so that guard — added for SQL — was throwing
    // the write away. `findOrCreate` appears 366 times in non-test backend source,
    // so this was the single most common shape the guard could miss.
    const defaultsAt = line.indexOf('defaults:');
    const defaultsWrite = defaultsAt !== -1 && LEARNER_COLUMN.test(line.slice(defaultsAt));

    const whereIdx = line.search(/\bWHERE\b/i);
    const colIdx = line.search(/\b(enrollment_type|tier)\b/);
    if (!defaultsWrite && whereIdx !== -1 && colIdx > whereIdx) continue;

    // An operator object under the column is a FILTER, not a write:
    // `{ enrollment_type: { [Op.ne]: 'explorer' } }` at `cohortService.ts:431` is
    // assigned to a variable and spread into a `where`, so no span can see it. A
    // write never nests an object under the column name.
    if (/(enrollment_type|tier)['"`]?\s*:\s*\{/.test(line)) continue;

    const sql = sqlWriteContext(i) && LEARNER_VALUE.test(line);
    // A candidate in ANY syntax: the column named, with its value here or just
    // below. That covers `col: 'explorer'`, `'col': 'explorer'`, a backtick
    // literal, `row.col = 'explorer'`, a ternary value, and a value wrapped onto
    // the next line — without this scanner needing to know those shapes exist.
    const objectOrAssignment = LEARNER_COLUMN.test(line) && valueNearby(i);
    const setDataValue = LEARNER_SET_DATA_VALUE.test(line);
    if (!sql && !objectOrAssignment && !setDataValue) continue;

    // Reads are subtracted, rather than writes being recognised. `where: { … }`
    // spans are computed by forward brace-matching above; the two-argument update
    // form puts the payload before the filter on one line, so a literal that
    // precedes the `where:` still counts.
    const sameLineWhere = line.includes('where:');
    if (!sql && insideRead(i) && !(sameLineWhere && writeLiteralOutsideReadSpans(line))) continue;

    out.push({ line: i + 1, call: sql ? 'sql' : 'write', evidence: raw[i].trim().slice(0, 160) });
  }
  return out;
}

/**
 * True when a line that also carries `where:` nonetheless writes.
 *
 * **This was the hole that survived three attempts, and it survived because the
 * inversion was applied to detection and not to subtraction.** The previous version
 * looped `LEARNER_WRITE_LITERALS` — the narrow syntax list the rest of the scanner
 * had stopped using — so on any line containing `where:` the whole thing reverted
 * to attempt 1's behaviour. Two forms fall in that gap and both are everywhere in
 * this repo: a one-line `findOrCreate({ where: …, defaults: { … } })`
 * (`findOrCreate` appears 366 times in non-test backend source) and a one-line
 * two-argument `update(payload, { where })` (32 occurrences) whenever the payload
 * uses a quoted key, a ternary or `sequelize.literal`.
 *
 * Now it applies the same rule as detection — the column in an assigning position
 * with its value — and treats a `defaults:` payload as outside the filter, because
 * that is exactly what it is.
 */
function writeLiteralOutsideReadSpans(line: string): boolean {
  const whereAt = line.indexOf('where:');
  if (whereAt === -1) return true;

  // `defaults: { … }` in a findOrCreate is the WRITE half of that call, wherever it
  // sits relative to `where:`.
  const defaultsAt = line.indexOf('defaults:');
  if (defaultsAt !== -1 && LEARNER_COLUMN.test(line.slice(defaultsAt))) return true;

  // Otherwise: the column, assigning, before the filter.
  const before = line.slice(0, whereAt);
  return LEARNER_COLUMN.test(before) && LEARNER_VALUE.test(before);
}

/** Scan the tree for every file that writes learner-programme semantics. */
export function enumerateLearnerWriters(): WriterSite[] {
  const out: WriterSite[] = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    for (const site of findWriteSites(fs.readFileSync(file, 'utf8'))) {
      out.push({ file: rel, ...site });
    }
  }
  return out.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}

if (require.main === module) {
  const rows = enumerateConsumers();
  const branching = rows.filter((r) => r.branching);
  const reporting = rows.filter((r) => !r.branching);

  console.log(`BRANCHING (output can flip; needs a behaviour test): ${branching.length}`);
  for (const r of branching) console.log(`  ${r.file}\n      ${r.evidence}`);
  console.log(`\nREPORTING (surfaces the value; needs disclosure): ${reporting.length}`);
  for (const r of reporting) console.log(`  ${r.file}`);
  console.log(`\nTOTAL: ${rows.length}`);

  const writers = enumerateLearnerWriters();
  const byFile = [...new Set(writers.map((w) => w.file))];
  console.log(`\nLEARNER-SEMANTICS WRITERS: ${writers.length} write sites across ${byFile.length} files`);
  for (const w of writers) console.log(`  ${w.file}:${w.line} (.${w.call})\n      ${w.evidence}`);
}
