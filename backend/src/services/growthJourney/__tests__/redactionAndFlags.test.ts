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
 *      names the model to read the rows - and it may rename it there, or take
 *      the name from a shim that renamed it first. So any file that reads those
 *      rows - directly, under an alias, or through a re-export chain - owes two
 *      things: it calls `isSuppressedForChannel`, and it does not re-implement
 *      the cutoff that function owns. T304's resolver is the first reader.
 *   5. And no scanned file spells an opt-out status literal itself, because a
 *      second list can be built on a surface rules 3 and 4 cannot follow.
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
 * WHAT IT SEES. The model named on an import line, under any local alias; and a
 * binding taken from a relative module that RESOLVES to the model through that
 * module's own re-exports or imports, up to three hops. The second half exists
 * because T304's verifier defeated the first: a one-line renaming re-export shim
 * placed outside the scanned tree left the reader's import line naming neither
 * the model nor the banned word, and a whole fourth detector lived behind it. So
 * the question asked here is where a name comes FROM, not what it is called.
 * `isLegacyGlobalEvent` and `isGlobalChannel` are the detector's own internals -
 * a reader calling those is assembling a second verdict out of the first one's
 * parts, which is the thing forbidden, not a legitimate reuse.
 *
 * WHAT IT PROVABLY CANNOT SEE, stated rather than implied, because a guard whose
 * limits are undocumented gets trusted past them:
 *
 *   * A detector built on a DIFFERENT surface - `campaign_leads.status = 'dnd'`
 *     is what the opt-out writer also sets, and reading it touches no suppression
 *     row at all. Not closed; NARROWED by the status-literal rule below, which
 *     costs nothing (zero occurrences in non-test source today) and stops the
 *     second list forming where this scan could never look.
 *   * A raw query whose table name is assembled from fragments at runtime
 *     (`['unsub', 'scribe_events'].join('')`). No static scan closes that one.
 *   * Three laundering shapes the resolver misses, each demonstrated by a plant
 *     rather than guessed at: a rename chain DEEPER than three hops; a shim that
 *     re-exports the model as a DEFAULT (`export default UnsubscribeEvent`, or
 *     `export { default as Rows } from './models/UnsubscribeEvent'`); and a shim
 *     that renames through a local const first (`const Rows = UnsubscribeEvent;
 *     export { Rows };`). The walk reads `{ ... }` specifier lists only. Named
 *     here because a guard trusted past its limits is worse than a known gap.
 *
 * For the file that actually ships, the property is held independently by
 * BEHAVIOUR as well as by this scan: replacing the delegation with a row count
 * fails `contactEvidence.test.ts` too. A guard is the cheap half of the proof.
 */
const SUPPRESSION_MODEL = 'UnsubscribeEvent';
const SUPPRESSION_MODEL_IMPORT = /^\s*import\b.*\bUnsubscribeEvent\b/;
const CUTOFF_REIMPLEMENTATION = /2026-09-09|isLegacyGlobalEvent\s*\(|isGlobalChannel\s*\(/;
/**
 * Statuses the canonical list owns. A literal here is a second list forming.
 *
 * Zero occurrences in scanned non-test source when this landed, so the rule cost
 * nothing - but there are 26 honest ones elsewhere in the repo (bounce analytics,
 * interaction outcomes), and sec 5.3's delivery-feasibility and friction-risk
 * dimensions are exactly where a bounce count belongs. WHEN THAT LANDS, the
 * narrowing is an ALLOW-LIST entry naming the honest source - never deletion of
 * the rule, which is how a guard dies quietly under deadline pressure.
 */
const OPT_OUT_STATUS_LITERAL = /['"](dnd|complained|bounced)['"]/;

/** Comments only, removed. `[^:]` keeps a `https://` out of the line-comment case. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** A module's source, however the caller chooses to find it. */
type ReadSource = (fromFile: string, spec: string) => { file: string; src: string } | null;

const fsRead: ReadSource = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return { file: candidate, src: fs.readFileSync(candidate, 'utf8') };
  }
  return null;
};

/** `import`/`export` name lists carrying a RELATIVE specifier, as (exported, local) pairs. */
function namedSpecifierLines(src: string): { spec: string; entries: { exported: string; local: string }[] }[] {
  const out: { spec: string; entries: { exported: string; local: string }[] }[] = [];
  const rx = /^[ \t]*(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/gm;
  for (const m of stripComments(src).matchAll(rx)) {
    const entries = (m[1] ?? '')
      .split(',')
      .map((e) => {
        const parts = e.trim().replace(/^type\s+/, '').split(/\s+as\s+/).map((p) => p.trim());
        return { exported: parts[0] ?? '', local: parts[1] ?? parts[0] ?? '' };
      })
      .filter((e) => e.exported.length > 0);
    out.push({ spec: m[2], entries });
  }
  return out;
}

/** `export { A as B }` with no `from` — the two-statement shape of the same shim. */
function localReexports(src: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of stripComments(src).matchAll(/export\s*\{([^}]*)\}\s*;/g)) {
    for (const entry of (m[1] ?? '').split(',')) {
      const parts = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/).map((p) => p.trim());
      if (!parts[0]) continue;
      out.set(parts[1] ?? parts[0], parts[0]);
    }
  }
  return out;
}

/** Does `exported`, taken from `mod`, come from the suppression model? */
function bindingResolvesToModel(
  mod: { file: string; src: string },
  exported: string,
  read: ReadSource,
  depth: number,
): boolean {
  if (exported === SUPPRESSION_MODEL) return true;
  if (depth <= 0) return false;

  for (const { spec, entries } of namedSpecifierLines(mod.src)) {
    for (const e of entries) {
      if (e.local !== exported) continue;
      if (e.exported === SUPPRESSION_MODEL) return true;
      const next = read(mod.file, spec);
      if (next && bindingResolvesToModel(next, e.exported, read, depth - 1)) return true;
    }
  }
  return localReexports(mod.src).get(exported) === SUPPRESSION_MODEL;
}

function readsSuppressionRows(src: string, file: string, read: ReadSource): boolean {
  if (src.split('\n').some((l) => SUPPRESSION_MODEL_IMPORT.test(l))) return true;
  for (const { spec, entries } of namedSpecifierLines(src)) {
    const next = read(file, spec);
    if (!next) continue;
    for (const e of entries) {
      if (bindingResolvesToModel(next, e.exported, read, 3)) return true;
    }
  }
  return false;
}

export function suppressionDelegationOffenders(
  src: string,
  opts: { file?: string; read?: ReadSource } = {},
): string[] {
  const file = opts.file ?? path.join(ROOT, 'services', 'growthJourney', '__control__.ts');
  const read = opts.read ?? fsRead;
  const offenders: string[] = [];

  // Applies to EVERY scanned file, reader or not: a second opt-out list can be
  // built on a surface this scan cannot follow, and it needs these words.
  const literals = stripComments(src)
    .split('\n')
    .filter((l) => OPT_OUT_STATUS_LITERAL.test(l) && !/^\s*import\b/.test(l));
  if (literals.length > 0) {
    offenders.push(`spells an opt-out status itself on ${literals.length} line(s)`);
  }

  if (!readsSuppressionRows(src, file, read)) return offenders;

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

  it('flags a detector hidden behind a renaming re-export shim outside the tree', () => {
    // T304's verifier's P1, reproduced exactly. The reader's import line names
    // neither the model nor the banned word; the shim it imports from is a single
    // line in a directory this scan does not walk.
    const shim = "export { UnsubscribeEvent as SuppressionRows } from '../models';";
    const reader = [
      "import { SuppressionRows } from '../_bridge';",
      'export const blocked = async (leadId: number): Promise<boolean> =>',
      '  (await SuppressionRows.findAll({ where: { lead_id: leadId } })).length > 0;',
    ].join('\n');
    const read: ReadSource = (_from, spec) =>
      spec.endsWith('_bridge') ? { file: '/repo/src/services/_bridge.ts', src: shim } : null;
    expect(suppressionDelegationOffenders(reader, { file: '/repo/src/services/growthJourney/x.ts', read })).toEqual([
      'reads suppression rows without calling isSuppressedForChannel',
    ]);
  });

  it('follows a two-hop shim chain, and the second shape of a shim', () => {
    // A chain, and a shim written as import-then-export rather than one line.
    const outer = "export { Rows as PublicRows } from './inner';";
    const inner = [
      "import { UnsubscribeEvent } from '../models';",
      'export { UnsubscribeEvent as Rows };',
    ].join('\n');
    const reader = [
      "import { PublicRows } from '../_outer';",
      'export const blocked = async (leadId: number): Promise<boolean> =>',
      '  (await PublicRows.findAll({ where: { lead_id: leadId } })).length > 0;',
    ].join('\n');
    const read: ReadSource = (_from, spec) =>
      spec.endsWith('_outer')
        ? { file: '/repo/src/services/_outer.ts', src: outer }
        : spec.endsWith('inner')
          ? { file: '/repo/src/services/inner.ts', src: inner }
          : null;
    expect(suppressionDelegationOffenders(reader, { file: '/repo/src/services/growthJourney/x.ts', read })).toEqual([
      'reads suppression rows without calling isSuppressedForChannel',
    ]);
  });

  it('does NOT flag an honest binding that merely comes from a relative module', () => {
    // The other direction for the resolver: `contactEvidence.ts` imports the
    // canonical status list from a relative module, and that must stay silent.
    const reader = [
      "import { SUPPRESSED_LEAD_STATUSES } from '../../explorerGrowth/explorerContactabilityService';",
      'export const blocked = (status: string) => SUPPRESSED_LEAD_STATUSES.includes(status);',
    ].join('\n');
    const read: ReadSource = () => ({
      file: '/repo/src/services/explorerGrowth/explorerContactabilityService.ts',
      src: "export const SUPPRESSED_LEAD_STATUSES = ['a', 'b'];",
    });
    expect(suppressionDelegationOffenders(reader, { file: '/repo/src/services/growthJourney/x.ts', read })).toEqual([]);
  });

  it('flags a second opt-out list built on a different surface entirely', () => {
    // T304's verifier's P2: `campaign_leads.status = 'dnd'` is what the opt-out
    // writer also sets, so this detector touches no suppression row at all and
    // neither rule 3 nor rule 4 can see it.
    const control = [
      "import { CampaignLead } from '../../models';",
      'export const blocked = async (leadId: number): Promise<boolean> =>',
      "  (await CampaignLead.count({ where: { lead_id: leadId, status: 'dnd' } })) > 0;",
    ].join('\n');
    expect(suppressionDelegationOffenders(control)).toEqual(['spells an opt-out status itself on 1 line(s)']);
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
      const offenders = suppressionDelegationOffenders(fs.readFileSync(f, 'utf8'), { file: f });
      expect({ file: rel(f), offenders }).toEqual({ file: rel(f), offenders: [] });
    }
  });

  it('spells no opt-out status literal anywhere in the scanned tree', () => {
    // Covered by the per-file assertion above too; asserted separately so a
    // failure names THIS rule rather than arriving as a surprise inside the
    // delegation one.
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, 'utf8'));
      const offenders = src
        .split('\n')
        .map((l, i) => ({ line: i + 1, l }))
        .filter(({ l }) => OPT_OUT_STATUS_LITERAL.test(l) && !/^\s*import\b/.test(l))
        .map(({ line }) => line);
      expect({ file: rel(f), offenders }).toEqual({ file: rel(f), offenders: [] });
    }
  });

  it('at least one scanned file really does read those rows, so the rule is not vacuous', () => {
    const readers = files
      .filter((f) => fs.readFileSync(f, 'utf8').split('\n').some((l) => SUPPRESSION_MODEL_IMPORT.test(l)))
      .map(rel);
    expect(readers).toContain('services/growthJourney/governor/contactEvidence.ts');
  });

  /**
   * The ONE non-import shape the word may take in production: populating
   * Explorer's own `HardStopFlags.unsubscribed` field, as an object-literal
   * key. T309 first needed it - the contact evidence has to become a tier-0
   * flag somewhere, and that somewhere is `contactEvidence.ts`, once, for every
   * strategy. An event name, a model, a `.findAll`, a status literal, a property
   * read - none of those match this, and the control below proves it.
   */
  // The key may OPEN the line only if the word appears nowhere else on it. The
  // first version was a bare prefix, and T309's verifier put Explorer's own
  // `/unsubscrib|complain/i` detector after the colon and walked it through.
  const HARD_STOP_KEY = /^\s*unsubscribed:(?!.*unsubscrib)/i;
  const fourthDetectorOffenders = (src: string) =>
    src
      .split('\n')
      .map((l, i) => ({ l, i: i + 1 }))
      .filter(({ l }) => /unsubscribe/i.test(l) && !/^\s*import\b/.test(l) && !HARD_STOP_KEY.test(l));

  it('defines no fourth opt-out detector: "unsubscribe" appears only on import lines or as the tier-0 key', () => {
    for (const f of files) {
      expect({ file: rel(f), offenders: fourthDetectorOffenders(fs.readFileSync(f, 'utf8')) }).toEqual({
        file: rel(f),
        offenders: [],
      });
    }
  });

  it('and that allowance is exactly one shape - a detector still trips it', () => {
    const trips = [
      "if (lead.status === 'unsubscribed') return false;",
      "const rows = await UnsubscribeEvent.findAll({ where: { lead_id } });",
      "reason: 'unsubscribe_event_email',",
      "if (ctx.hardStop.unsubscribed) stop();",
      "const unsubscribed = events.length > 0;",
      // V4: a detector hiding behind the allowed key. The allowance is the KEY,
      // not the line.
      "    unsubscribed: /unsubscrib|complain/i.test(contactability.email?.reason ?? ''),",
      "    unsubscribed: ctx.hardStop.unsubscribed || reason.includes('unsubscribe'),",
    ];
    for (const l of trips) expect({ l, trips: fourthDetectorOffenders(l).length }).toEqual({ l, trips: 1 });
    expect(fourthDetectorOffenders("    unsubscribed: email.evaluator === 'suppression',")).toEqual([]);
    expect(fourthDetectorOffenders("    unsubscribed: email.evaluator === 'suppression' || optedOutByStatus(email),")).toEqual([]);
    expect(fourthDetectorOffenders("import { UnsubscribeEvent as SuppressionEventRow } from '../../../models';")).toEqual([]);
    // Non-vacuity: the production file that carries the allowed shape really does.
    const ce = fs.readFileSync(path.join(__dirname, '..', 'governor', 'contactEvidence.ts'), 'utf8');
    expect(ce.split('\n').filter((l) => HARD_STOP_KEY.test(l))).toHaveLength(1);
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
