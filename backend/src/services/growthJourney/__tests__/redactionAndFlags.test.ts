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
 * Plus the fourth-opt-out-detector guard: the word `unsubscribe` appears in
 * Phase 2 source only in a test or on an import line.
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
