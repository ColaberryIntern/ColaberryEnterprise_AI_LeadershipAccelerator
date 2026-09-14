import * as fs from 'fs';
import * as path from 'path';
import { phase2SourceFiles } from './phase2Sources';

/**
 * Two Phase 2 contract lines, enforced on the source rather than promised:
 *
 *   1. A log line that could carry a person's identifier goes through
 *      `redactForLogs`. Approximated as: any logger/console call whose argument
 *      names an `email`, `to`, `body` or `message` key must sit in a statement
 *      that also calls `redactForLogs(`.
 *   2. Flags are read ONLY through the flags module. No `process.env.GROWTH_JOURNEY`
 *      anywhere under the scanned dirs.
 *
 * Plus the fourth-opt-out-detector guard, in two halves:
 *
 *   3. The word `unsubscribe` appears in Phase 2 source only in a test or on an
 *      import line.
 *   4. Which leaves one hole, because an import line is exactly where a module
 *      names the model to read the rows - and it may rename it there. Alias the
 *      model, derive a verdict from `rows.length > 0`, and rule 3 sees nothing.
 *      So any file whose import line names that model owes two things: it calls
 *      `isSuppressedForChannel`, and it does not re-implement the cutoff that
 *      function owns. T304's contact-evidence resolver is the first reader.
 */

const ROOT = path.join(__dirname, '..', '..', '..');
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, '/');

/** Statements (split on `;`) containing a logger/console call. */
function logStatements(src: string): string[] {
  return src
    .split(/;\s*\n/)
    .filter((stmt) => /\b(logger|console)\.(info|warn|error|debug|log)\s*\(/.test(stmt));
}

// `message` is deliberately NOT here: it is the repo's standard field for an
// ERROR's text (`err.message`), which Phase 1 already logs. A person's message
// is never logged under that key by Phase 2 code — the evidence-privacy test in
// classify.test.ts covers the path a person's text actually takes.
const SENSITIVE_KEY = /\b(email|to|body|email_normalized|phone)\s*:/;

/**
 * Does this file read the suppression-event rows, and if so does it delegate?
 *
 * The model is matched on the IMPORT line, so an alias cannot hide the read: the
 * specifier `UnsubscribeEvent` has to appear there whatever local name follows.
 * `isLegacyGlobalEvent` and `isGlobalChannel` are the detector's own internals -
 * a reader calling those is assembling a second verdict out of the first one's
 * parts, which is the thing being forbidden, not a legitimate reuse.
 */
const SUPPRESSION_MODEL_IMPORT = /^\s*import\b.*\bUnsubscribeEvent\b/;
const CUTOFF_REIMPLEMENTATION = /2026-09-09|isLegacyGlobalEvent\s*\(|isGlobalChannel\s*\(/;

/** Comments only, removed. `[^:]` keeps a `https://` out of the line-comment case. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function suppressionDelegationOffenders(src: string): string[] {
  const lines = src.split('\n');
  if (!lines.some((l) => SUPPRESSION_MODEL_IMPORT.test(l))) return [];

  const offenders: string[] = [];
  if (!src.includes('isSuppressedForChannel(')) {
    offenders.push('reads suppression rows without calling isSuppressedForChannel');
  }
  // The cutoff half reads CODE only. A reader explaining in prose which case the
  // detector owns is doing the opposite of re-implementing it, and the first
  // version of this rule failed exactly that comment.
  const own = stripComments(src)
    .split('\n')
    .filter((l) => CUTOFF_REIMPLEMENTATION.test(l) && !/^\s*import\b/.test(l));
  if (own.length > 0) {
    offenders.push(`re-implements the cutoff the detector owns on ${own.length} line(s)`);
  }
  return offenders;
}

describe('the scanner itself', () => {
  it('flags a control statement that logs an email without redaction', () => {
    const control = "logger.info({ event: 'x', email: lead.email });";
    const stmts = logStatements(control);
    expect(stmts).toHaveLength(1);
    expect(SENSITIVE_KEY.test(stmts[0])).toBe(true);
    expect(stmts[0].includes('redactForLogs(')).toBe(false);
  });

  it('passes a control statement that redacts', () => {
    const ok = "logger.info({ event: 'x', email: redactForLogs(lead.email) });";
    expect(logStatements(ok)[0].includes('redactForLogs(')).toBe(true);
  });

  it('flags a fourth opt-out detector hidden behind an import alias', () => {
    // The bypass the word-scan alone cannot see: not one line below carries the
    // banned word outside the import, and the verdict is still home-made.
    const control = [
      "import { UnsubscribeEvent as Rows } from '../../models';",
      'export const blocked = async (leadId: number): Promise<boolean> =>',
      '  (await Rows.findAll({ where: { lead_id: leadId } })).length > 0;',
    ].join('\n');
    expect(suppressionDelegationOffenders(control)).toEqual([
      'reads suppression rows without calling isSuppressedForChannel',
    ]);
  });

  it('flags a reader that rebuilds the cutoff out of the detector parts', () => {
    const control = [
      "import { UnsubscribeEvent } from '../../models';",
      "import { isLegacyGlobalEvent, isSuppressedForChannel } from '../channelSuppression';",
      'export const blocked = (rows: { channel: null; created_at: Date }[]) =>',
      "  rows.some((r) => isLegacyGlobalEvent(r)) || isSuppressedForChannel(rows, 'email').suppressed;",
    ].join('\n');
    const offenders = suppressionDelegationOffenders(control);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]).toContain('re-implements the cutoff');
  });

  it('passes a reader that hands the rows and the verdict to the one detector', () => {
    const control = [
      "import { UnsubscribeEvent as SuppressionEventRow } from '../../models';",
      "import { isSuppressedForChannel } from '../channelSuppression';",
      'export const blocked = async (leadId: number) => {',
      '  const rows = await SuppressionEventRow.findAll({ where: { lead_id: leadId } });',
      "  return isSuppressedForChannel(rows.map((r: any) => ({ channel: r.channel, created_at: r.created_at })), 'sms');",
      '};',
    ].join('\n');
    expect(suppressionDelegationOffenders(control)).toEqual([]);
  });

  it('lets a reader NAME the cutoff case in prose while delegating it', () => {
    // The both-directions half of the control above: same date, in a comment.
    const control = [
      "import { UnsubscribeEvent as SuppressionEventRow } from '../../models';",
      "import { isSuppressedForChannel } from '../channelSuppression';",
      '// Delegates the legacy pre-2026-09-09 global case to isGlobalChannel() upstream.',
      '/* Also mentions isLegacyGlobalEvent(2026-09-09) in a block comment. */',
      'export const blocked = (rows: never[]) => isSuppressedForChannel(rows, \'voice\');',
    ].join('\n');
    expect(suppressionDelegationOffenders(control)).toEqual([]);
  });

  it('says nothing about a file that never reads those rows', () => {
    expect(suppressionDelegationOffenders('export const x = 1;\n')).toEqual([]);
  });
});

describe('Phase 2 source', () => {
  const files = phase2SourceFiles();

  it('never logs a sensitive key without redactForLogs in the same statement', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const offenders = logStatements(src).filter((s) => SENSITIVE_KEY.test(s) && !s.includes('redactForLogs('));
      expect({ file: rel(f), offenders }).toEqual({ file: rel(f), offenders: [] });
    }
  });

  it('reads no growth-journey flag from process.env directly', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      expect({ file: rel(f), direct: /process\.env\.GROWTH_JOURNEY/.test(src) }).toEqual({ file: rel(f), direct: false });
    }
  });

  it('every file that reads suppression rows hands the verdict to the one detector', () => {
    for (const f of files) {
      const offenders = suppressionDelegationOffenders(fs.readFileSync(f, 'utf8'));
      expect({ file: rel(f), offenders }).toEqual({ file: rel(f), offenders: [] });
    }
  });

  it('at least one scanned file really does read those rows, so the rule is not vacuous', () => {
    const readers = files
      .filter((f) => fs.readFileSync(f, 'utf8').split('\n').some((l) => SUPPRESSION_MODEL_IMPORT.test(l)))
      .map(rel);
    expect(readers).toContain('services/growthJourney/governor/contactEvidence.ts');
  });

  it('defines no fourth opt-out detector: "unsubscribe" appears only on import lines outside tests', () => {
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      const offenders = lines
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(({ l }) => /unsubscribe/i.test(l) && !/^\s*import\b/.test(l));
      expect({ file: rel(f), offenders }).toEqual({ file: rel(f), offenders: [] });
    }
  });

  it('never updates or destroys an append-only row (classifications, transitions, decisions, snapshots)', () => {
    // §6.4. FOUR models now declare no updated_at — classifications and
    // transitions (T222) plus decisions and score snapshots (T301) — and this is
    // the behavioural half: any source file that imports one of them contains no
    // `.update(` and no `.destroy(` at all. Strict on purpose — a file that needs
    // to update an enrolment or a PROFILE keeps the append-only models out of its
    // imports. `GrowthJourneyProfile` is deliberately NOT in this pattern: it is
    // the one mutable table this run owns, and updating it is the point.
    const APPEND_ONLY = /GrowthJourney(Classification|Transition|Decision|ScoreSnapshot)\b/;
    let scanned = 0;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      if (!APPEND_ONLY.test(src)) continue;
      scanned += 1;
      expect({ file: rel(f), updates: /\.update\(/.test(src), destroys: /\.destroy\(/.test(src) })
        .toEqual({ file: rel(f), updates: false, destroys: false });
    }
    // Vacuity guard: T225 shipped the writers (classificationService.ts and the
    // input loader both name the model), so the scan must have looked at them.
    //
    // Stated plainly rather than implied: the Decision and ScoreSnapshot halves of
    // the pattern match NOTHING yet, because no service names those models until
    // T307/T311. They are pre-emptive. The Classification/Transition halves are
    // what keeps this scan non-vacuous today, which is why the count stays >= 2.
    expect(scanned).toBeGreaterThanOrEqual(2);

    // One control per half of the pattern, so a half that stops matching is caught
    // here rather than the day a service first imports the model.
    for (const control of [
      "import { GrowthJourneyClassification } from '../../models'; await row.update({ locked: true });",
      "import { GrowthJourneyTransition } from '../../models'; await row.update({ status: 'applied' });",
      "import GrowthJourneyDecision from '../../models/GrowthJourneyDecision'; await row.update({ executed: true });",
      "import GrowthJourneyScoreSnapshot from '../../models/GrowthJourneyScoreSnapshot'; await row.destroy();",
    ]) {
      expect(APPEND_ONLY.test(control) && /\.update\(|\.destroy\(/.test(control)).toBe(true);
    }

    // The mutable one must NOT be caught, or T307's profile writer could not work.
    expect(
      APPEND_ONLY.test("import GrowthJourneyProfile from '../../models/GrowthJourneyProfile'; await row.update({ state: 'CUSTOMER' });"),
    ).toBe(false);
  });

  it('carries no literal control byte (heredoc tripwire)', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const ch of ['\u0007', '\u0008', '\u000b', '\u000c', '\u001b']) {
        expect({ file: rel(f), has: src.includes(ch) }).toEqual({ file: rel(f), has: false });
      }
    }
  });
});
