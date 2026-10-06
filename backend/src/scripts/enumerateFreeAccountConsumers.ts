/**
 * Growth OS Reset Phase 2 T202 — enumerate every consumer of the two columns
 * that describe a free account, from the source tree, by command.
 *
 * WHY THIS EXISTS. Three successive revisions of the Phase 2 plan carried a
 * hand-written list of the consumers that would change behaviour when
 * `enrollment_type` and `tier` start being written together. The list was short
 * every time: audit cycle 1 found one missing consumer, cycle 2 found two more,
 * and a direct count found 33 non-test files mentioning `enrollment_type` where
 * the plan had named 8. A list a human maintains in prose will be short again
 * the next time someone adds a reader.
 *
 * So the list is generated, committed, and asserted against by a tripwire. A
 * thirty-fourth consumer arriving later is a failed build rather than a silent
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

if (require.main === module) {
  const rows = enumerateConsumers();
  const branching = rows.filter((r) => r.branching);
  const reporting = rows.filter((r) => !r.branching);

  console.log(`BRANCHING (output can flip; needs a behaviour test): ${branching.length}`);
  for (const r of branching) console.log(`  ${r.file}\n      ${r.evidence}`);
  console.log(`\nREPORTING (surfaces the value; needs disclosure): ${reporting.length}`);
  for (const r of reporting) console.log(`  ${r.file}`);
  console.log(`\nTOTAL: ${rows.length}`);
}
