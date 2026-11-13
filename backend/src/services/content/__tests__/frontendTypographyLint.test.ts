import * as fs from 'fs';
import * as path from 'path';
import {
  BANNED_COPY_RULES,
  DASH_RULE,
  EMOJI_RULE,
  ESCAPED_DASH_RULE,
  FRONTEND_TYPOGRAPHY_RULES,
  isPatternRule,
  ruleRegex,
  type BannedCopyRule,
} from '../bannedCopyRule';
import {
  EXCLUSION_REASONS,
  rawMatchCount,
  scanSource,
  scanSourceRules,
  type Occurrence,
} from '../bannedCopyScanner';
import {
  BASELINE_SCOPE,
  FRONTEND_TYPOGRAPHY_BASELINE,
  FRONTEND_TYPOGRAPHY_BASELINE_TOTALS,
  isInScope,
} from '../frontendTypographyBaseline';

/**
 * D1 - the typography copy gate for the React source, as a shrink-only ratchet.
 *
 * Three rules: a literal em or en dash, the same dash written as an HTML character reference,
 * and an emoji. The second one is not a refinement of the first - it was added after the first
 * had been written, measured and believed, when `&mdash;` turned up 74 times in copy and the
 * dash rule caught none of them.
 *
 * The sibling of `frontendCopyLint.test.ts`, which does the same job for the word banned by
 * 40 TAC 807.172(d). Read that file's header first; the design is its design, and the four
 * ways it fails are the four ways this one fails:
 *
 *   1. a file not in the baseline has a violation        - a NEW violation
 *   2. a baseline file has MORE violations than recorded - a new violation in an old file
 *   3. a baseline file has FEWER                         - fix the baseline, the ratchet turns
 *   4. the scanner cannot classify an occurrence         - the scanner is wrong; never a pass
 *
 * AND THE WAY IT MUST NOT FAIL: silently reading nothing. A path that resolved to an empty
 * directory would make every assertion trivially true, so the file count is asserted against a
 * floor before any of the rest is believed.
 *
 * ## Why this is a separate suite and not three more describes over there
 *
 * `frontendCopyLint.test.ts` guards a legal requirement and has been audited line by line. Its
 * harness and this one share the thing that actually drifts - `isInScope`, the single scope
 * authority - and nothing else. The walk below is eight lines and asks that authority the same
 * question; rewriting the audited suite's measurement to carry a second rule family would have
 * put a compliance gate at risk to save those eight lines. Measured cost of the second walk:
 * 2.2 seconds for 1,659 files, because `scanSourceRules` parses each file once for all rules.
 *
 * ## What this suite does NOT claim
 *
 * Scope is `frontend/src/pages`, `components`, `config` and `constants`, `.ts` and `.tsx`
 * only. CSS is not covered, and a `content:` property can render a dash. Backend strings are
 * not covered. Those are stated so the hole is on the record rather than assumed away.
 */

/** `__tests__` -> content -> services -> src -> backend -> repo root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

function relative(file: string): string {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

/** Every file under `dir`, filtered by the one scope authority and nothing else. */
function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (isInScope(relative(full))) out.push(full);
  }
  return out;
}

interface RuleMeasurement {
  violationsByFile: Map<string, Occurrence[]>;
  reasonCounts: Record<string, number>;
  totalRaw: number;
  totalClassified: number;
  unclassified: string[];
  countMismatches: string[];
}

interface Measured {
  files: string[];
  byRule: Record<string, RuleMeasurement>;
}

function measure(): Measured {
  const files: string[] = [];
  for (const root of BASELINE_SCOPE.roots) {
    const abs = path.join(REPO_ROOT, root);
    // A missing root is a resolution bug, and a resolution bug must not read as "clean".
    if (!fs.existsSync(abs)) throw new Error(`Scope root does not exist: ${abs}`);
    walk(abs, files);
  }
  files.sort();

  const byRule: Record<string, RuleMeasurement> = {};
  for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
    byRule[rule.id] = {
      violationsByFile: new Map(),
      reasonCounts: {},
      totalRaw: 0,
      totalClassified: 0,
      unclassified: [],
      countMismatches: [],
    };
  }

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const rel = relative(file);

    const raw: Record<string, number> = {};
    let anyHit = false;
    for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
      raw[rule.id] = rawMatchCount(source, rule);
      byRule[rule.id].totalRaw += raw[rule.id];
      if (raw[rule.id] > 0) anyHit = true;
    }
    // Parsing a file that cannot contain a hit under ANY rule buys nothing, and skipping it is
    // safe only because the raw count is computed without the parser. That is the same second
    // opinion the completeness assertions below rest on.
    if (!anyHit) continue;

    const results = scanSourceRules(rel, source, FRONTEND_TYPOGRAPHY_RULES);
    for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
      const result = results[rule.id];
      const acc = byRule[rule.id];
      acc.totalClassified += result.occurrences.length;
      if (result.occurrences.length !== raw[rule.id]) {
        acc.countMismatches.push(`${rel}: parser ${result.occurrences.length} vs raw ${raw[rule.id]}`);
      }
      for (const o of result.occurrences) {
        const key = o.excluded ?? 'copy';
        acc.reasonCounts[key] = (acc.reasonCounts[key] ?? 0) + 1;
      }
      for (const o of result.unclassified) {
        acc.unclassified.push(`${rel}:${o.line} [${o.tokenKind}] ${o.snippet}`);
      }
      if (result.violations.length > 0) acc.violationsByFile.set(rel, result.violations);
    }
  }

  return { files, byRule };
}

// One walk for the whole suite: the scan is the slow part and nothing here mutates it.
const measured = measure();

describe('frontend typography lint: em dashes, en dashes and emoji', () => {
  jest.setTimeout(120_000);

  it('actually reads the React source', () => {
    // The floor, not the exact count: files are added and removed constantly, and a lint that
    // fails because somebody wrote a new page is a lint that gets deleted. What is being
    // guarded is the difference between "scanned a thousand files" and "scanned nothing".
    expect(measured.files.length).toBeGreaterThan(800);
    for (const root of BASELINE_SCOPE.roots) {
      expect(measured.files.some((f) => relative(f).startsWith(root))).toBe(true);
    }
    // And each rule found SOMETHING raw. A rule whose regex silently stopped matching would
    // otherwise sail through every comparison below with zero on both sides, which is a gate
    // that cannot fail. The floors are per rule because the rules are not the same size: the
    // escaped form is rarer than the literal one by a factor of about seventy.
    const FLOORS: Record<string, number> = {
      [DASH_RULE.id]: 1000,
      [ESCAPED_DASH_RULE.id]: 20,
      [EMOJI_RULE.id]: 100,
    };
    for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
      expect(Object.keys(FLOORS)).toContain(rule.id);
      expect(measured.byRule[rule.id].totalRaw).toBeGreaterThan(FLOORS[rule.id]);
    }
  });

  it.each(FRONTEND_TYPOGRAPHY_RULES.map((r) => [r.id, r] as const))(
    '%s: classifies every occurrence it finds, with nothing left over',
    (_id, rule) => {
      // The completeness invariant. A parser hole shows up HERE, by file and line, instead of
      // showing up as a clean pass over copy nobody read.
      const m = measured.byRule[rule.id];
      expect(m.unclassified.join('\n')).toBe('');
      expect(m.countMismatches).toEqual([]);
      expect(m.totalClassified).toBe(m.totalRaw);
      expect(Object.values(m.reasonCounts).reduce((a, b) => a + b, 0)).toBe(m.totalRaw);
      for (const key of Object.keys(m.reasonCounts)) {
        expect(key === 'copy' || (EXCLUSION_REASONS as readonly string[]).includes(key)).toBe(true);
      }
    },
  );

  it.each(FRONTEND_TYPOGRAPHY_RULES.map((r) => [r.id, r] as const))(
    '%s: finds no NEW violating file',
    (_id, rule) => {
      const baseline = FRONTEND_TYPOGRAPHY_BASELINE[rule.id] ?? {};
      const unexpected = [...measured.byRule[rule.id].violationsByFile.entries()]
        .filter(([file]) => !(file in baseline))
        .map(([file, occ]) => `${file} (${occ.length}) ${rule.reason} Lines: ${occ.map((o) => `L${o.line} ${o.snippet}`).join(' | ')}`);
      expect(unexpected).toEqual([]);
    },
  );

  it.each(FRONTEND_TYPOGRAPHY_RULES.map((r) => [r.id, r] as const))(
    '%s: matches the frozen baseline exactly, file by file',
    (_id, rule) => {
      const baseline = FRONTEND_TYPOGRAPHY_BASELINE[rule.id] ?? {};
      const measurement = measured.byRule[rule.id];
      const drift: string[] = [];
      for (const [file, expected] of Object.entries(baseline)) {
        const actual = measurement.violationsByFile.get(file)?.length ?? 0;
        if (actual === expected) continue;
        if (actual === 0) {
          drift.push(`${file}: now clean - DELETE this entry from frontendTypographyBaseline.json under "${rule.id}"`);
        } else if (actual < expected) {
          drift.push(`${file}: improved, ${expected} -> ${actual} - lower this entry to ${actual}`);
        } else {
          const lines = (measurement.violationsByFile.get(file) ?? []).map((o) => `L${o.line} ${o.snippet}`).join(' | ');
          drift.push(`${file}: regressed, ${expected} -> ${actual}. ${rule.reason} Write ${rule.approvedAlternatives.map((a) => `"${a}"`).join(' or ')} instead. ${lines}`);
        }
      }
      expect(drift).toEqual([]);
    },
  );

  it.each(FRONTEND_TYPOGRAPHY_RULES.map((r) => [r.id, r] as const))(
    '%s: holds the recorded total',
    (_id, rule) => {
      const measurement = measured.byRule[rule.id];
      const total = [...measurement.violationsByFile.values()].reduce((n, v) => n + v.length, 0);
      expect(total).toBe(FRONTEND_TYPOGRAPHY_BASELINE_TOTALS[rule.id]);
      const summed = Object.values(FRONTEND_TYPOGRAPHY_BASELINE[rule.id] ?? {}).reduce((a, b) => a + b, 0);
      expect(summed).toBe(FRONTEND_TYPOGRAPHY_BASELINE_TOTALS[rule.id]);
    },
  );

  it('the overwhelming majority of dashes in this tree are in comments, and are not counted', () => {
    // Not a vanity statistic. It is the assertion that the EXCLUSION half of the scanner is
    // doing real work on this rule. If `comment` ever collapsed toward zero, every one of
    // those 3,476 JSDoc dashes would arrive as copy, the baseline comparison would fail with
    // thousands of entries, and the temptation would be to re-baseline rather than to notice
    // that the classifier broke. Asserted here so the diagnosis is on the screen instead.
    const dash = measured.byRule[DASH_RULE.id];
    expect(dash.reasonCounts.comment).toBeGreaterThan(dash.reasonCounts.copy);
    expect(dash.reasonCounts.comment).toBeGreaterThan(2000);
  });
});

describe('the pattern matcher itself', () => {
  const violations = (src: string, rule: BannedCopyRule, name = 'Sample.tsx'): Occurrence[] =>
    scanSource(name, src, rule).violations;

  it('POSITIVE CONTROL: a dash in copy is a violation, in every shape copy is written', () => {
    // Each of these is a real shape from frontend/src reduced to one line. If the matcher ever
    // stops matching, these fail and the baseline assertions above do not get to report
    // "clean" over copy nobody read.
    expect(violations('const a = <p>The class is live — join now.</p>;', DASH_RULE)).toHaveLength(1);
    expect(violations('const t = "Week 1 – Week 4";', DASH_RULE)).toHaveLength(1);
    expect(violations('const a = <Hero title="Build — fast" />;', DASH_RULE)).toHaveLength(1);
    expect(violations('const a = <img alt="A — B" src="/x.png" />;', DASH_RULE)).toHaveLength(1);
    expect(violations('const s = `Day ${n} — ready`;', DASH_RULE)).toHaveLength(1);
    expect(violations('const p = { label: "Start — now" };', DASH_RULE)).toHaveLength(1);
    // Two in one string are two, not one.
    expect(violations('const s = "A — B — C";', DASH_RULE)).toHaveLength(2);
    // An en dash is not a lesser offence. Banning one glyph and permitting the other relocates
    // the habit by a code point instead of ending it.
    expect(violations('const s = "A – B";', DASH_RULE)).toHaveLength(1);
  });

  it('POSITIVE CONTROL: an emoji in copy is a violation, including the ones already in the tree', () => {
    // `▶ Watch here` is `BroadcastWatchButton.tsx`, named in DOC 18 as a real violation.
    expect(violations('const a = <span>▶ Watch here</span>;', EMOJI_RULE)).toHaveLength(1);
    expect(violations('const t = "🎉 You are in";', EMOJI_RULE)).toHaveLength(1);
    // A surrogate pair is ONE emoji, not two halves. Without the `u` flag this returns 2, and
    // every count in the baseline would be inflated by one per astral character.
    expect(violations('const t = "🚀";', EMOJI_RULE)).toHaveLength(1);
    expect(violations('const a = <p>Done ✅ and ready ⚠</p>;', EMOJI_RULE)).toHaveLength(2);
  });

  it('POSITIVE CONTROL: an escaped dash is a dash, in every spelling a reference has', () => {
    // The whole point of the rule. Each of these renders as U+2014 or U+2013 in a browser and
    // is invisible to DASH_RULE, because the source text holds ASCII and not the character.
    for (const ref of ['&mdash;', '&ndash;', '&#8212;', '&#8211;', '&#x2014;', '&#x2013;', '&#X2014;', '&#08212;', '&#x02014;']) {
      expect(violations(`const s = "A ${ref} B";`, ESCAPED_DASH_RULE)).toHaveLength(1);
      // And the literal rule sees none of them, which is the hole this rule closes. If this
      // ever starts passing, one of the two rules has quietly grown into the other's job.
      expect(violations(`const s = "A ${ref} B";`, DASH_RULE)).toEqual([]);
    }
    expect(violations('const a = <p>Week 1 &mdash; Week 4</p>;', ESCAPED_DASH_RULE)).toHaveLength(1);
    expect(violations('const s = "A &mdash; B &ndash; C";', ESCAPED_DASH_RULE)).toHaveLength(2);
  });

  it('NEGATIVE CONTROL: the escaped rule does not fire on a reference to something else', () => {
    // A reference must carry its semicolon, must be one of the six code points, and must not
    // be a longer name that merely starts with one of them.
    for (const src of [
      'const s = "A &amp; B";',
      'const s = "A &hellip; B";',
      'const s = "A &nbsp; B";',
      'const s = "A &rarr; B";',
      'const s = "A &#8594; B";',
      'const s = "A &#10003; B";',
      'const s = "A &mdash B";',
      'const s = "A &#x2015; B";',
      'const s = "A &#82120; B";',
    ]) {
      expect(violations(src, ESCAPED_DASH_RULE)).toEqual([]);
    }
  });

  it('NEGATIVE CONTROL: a hyphen is not a dash, and the three legal marks are not emoji', () => {
    expect(violations('const s = "A - B, a well-known case";', DASH_RULE)).toEqual([]);
    expect(violations('const s = "2026-11-13";', DASH_RULE)).toEqual([]);
    // Copyright, registered and trademark carry Extended_Pictographic but are typography here.
    expect(violations('const a = <p>© 2026 Colaberry</p>;', EMOJI_RULE)).toEqual([]);
    expect(violations('const a = <p>Colaberry® and Refactored™</p>;', EMOJI_RULE)).toEqual([]);
    // Documented as NOT covered. A check mark, an arrow and a bullet are dingbats and
    // punctuation, already used as real UI glyphs, and banning them is a separate decision.
    expect(violations('const a = <p>✓ ok → next • last</p>;', EMOJI_RULE)).toEqual([]);
  });

  it('NEGATIVE CONTROL: machinery is machinery, for a pattern rule as much as for a word', () => {
    expect(violations('// written 2026-11-13 — see the ticket\nconst a = 1;', DASH_RULE)).toEqual([]);
    expect(violations('/** A note — with a dash 🎉 */\nconst a = 1;', DASH_RULE)).toEqual([]);
    expect(violations('/** A note — with a dash 🎉 */\nconst a = 1;', EMOJI_RULE)).toEqual([]);
    expect(violations('const a = <div>{/* a — comment */}</div>;', DASH_RULE)).toEqual([]);
    expect(violations('const a = <div className="x—y" data-testid="a—b" />;', DASH_RULE)).toEqual([]);
    expect(violations('const o = { "🎉": 1 };', EMOJI_RULE)).toEqual([]);
    expect(violations("import x from './a—b';", DASH_RULE)).toEqual([]);
    // No `&mdash;` sits in a comment in the tree today, so the measurement cannot prove the
    // exclusion works for this rule. Asserted here instead, rather than left to the day one
    // appears and the baseline moves for a reason nobody can explain.
    expect(violations('// a comment &mdash; with a reference\nconst a = 1;', ESCAPED_DASH_RULE)).toEqual([]);
    expect(violations('const a = <div className="a&mdash;b" />;', ESCAPED_DASH_RULE)).toEqual([]);
  });

  it('BOUNDARY: the word-shape heuristics do NOT apply to a pattern rule', () => {
    // `classifyTextToken`'s underscore and dotted-key tests reason about a WORD being part of
    // a name. Applied to a dash they can exclude real copy, and an exclusion that is wrong is
    // a silent pass.
    //
    // THE FIXTURES HAVE TO BE ADJACENT, and the first draft of this test got that wrong. The
    // heuristics read only the unbroken run of name characters either side of the match, so
    // `"Week 1 - Kickoff_v2"` with spaces around the dash leaves both runs EMPTY and takes the
    // same path whether the branch is there or not. Mutation testing is what caught it: with
    // the branch deleted the whole suite stayed green, which means the version below is the
    // only one of the two that is pinning anything.
    expect(violations('const s = "Sprint_1—Sprint_2 is live";', DASH_RULE)).toHaveLength(1);
    expect(violations('const s = "ready🎉_now";', EMOJI_RULE)).toHaveLength(1);
    // The word rule keeps every one of them, unchanged. This is the other half: the branch
    // must not leak across and loosen the rule it was not written for.
    const freeRule = { id: 'f', word: 'free', reason: 'r', approvedAlternatives: [] };
    expect(violations("const k = 'surface.free.workspace';", freeRule)).toEqual([]);
    expect(violations("const k = 'free_tier_label';", freeRule)).toEqual([]);
  });

  it('BOUNDARY: empty, markless and unparseable input', () => {
    for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
      expect(scanSource('Empty.tsx', '', rule).occurrences).toEqual([]);
      expect(scanSource('None.tsx', 'const a = 1;', rule).occurrences).toEqual([]);
      // A file the parser cannot make sense of must not come back clean AND unclassified-free
      // by accident: whatever it does, every occurrence is still accounted for.
      const src = 'const a = <p>x — y 🎉';
      const broken = scanSource('Broken.tsx', src, rule);
      expect(broken.occurrences).toHaveLength(rawMatchCount(src, rule));
      expect(broken.unclassified).toEqual([]);
    }
  });

  it('IDEMPOTENCY: the same source scans the same way twice, and the regex carries no state', () => {
    const src = 'const a = <p>A — B — C</p>;';
    const first = scanSource('A.tsx', src, DASH_RULE);
    expect(scanSource('A.tsx', src, DASH_RULE)).toEqual(first);
    expect(first.violations).toHaveLength(2);
    // A module-level /g regex would carry lastIndex between calls and silently miscount the
    // second body it was handed, which is a real bug `mandrillPreflight` documents having hit.
    expect(rawMatchCount(src, DASH_RULE)).toBe(rawMatchCount(src, DASH_RULE));
  });

  it('scanning for many rules at once gives the same answer as scanning for each alone', () => {
    // `scanSourceRules` exists to parse once instead of once per rule. The parse is shared
    // state, so this is the assertion that sharing it changed no answer.
    const src = 'const a = <p>Live — now 🎉</p>; /* and a — comment */';
    const together = scanSourceRules('A.tsx', src, FRONTEND_TYPOGRAPHY_RULES);
    for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
      expect(together[rule.id]).toEqual(scanSource('A.tsx', src, rule));
    }
    expect(together[DASH_RULE.id].violations).toHaveLength(1);
    expect(together[EMOJI_RULE.id].violations).toHaveLength(1);
  });

  it('scanning for NO rules throws, because zero rules means unchecked and never clean', () => {
    expect(() => scanSourceRules('A.tsx', 'const a = 1;', [])).toThrow(/UNCHECKED/);
  });
});

describe('the pattern rule cannot reach the guard that would fail open on it', () => {
  it('BANNED_COPY_RULES contains word rules only', () => {
    // `explorerGrowth/explorerQuoteGuard.ts:133` consumes BANNED_COPY_RULES and builds its own
    // `\b${rule.word}\b` rather than calling `ruleRegex`. Handed a pattern rule it compiles
    // `\bundefined\b`, matches nothing, and reports every quote clean - a gate that cannot
    // fail. The separation of the two rule sets is what prevents that, and this is the test
    // that makes moving a rule between them fail here rather than in production silence.
    expect(BANNED_COPY_RULES.length).toBeGreaterThan(0);
    for (const rule of BANNED_COPY_RULES) {
      expect(isPatternRule(rule)).toBe(false);
      expect(typeof (rule as { word?: string }).word).toBe('string');
    }
  });

  it('a pattern rule has no word, and a word rule has no pattern', () => {
    expect(FRONTEND_TYPOGRAPHY_RULES.length).toBeGreaterThan(0);
    for (const rule of FRONTEND_TYPOGRAPHY_RULES) {
      expect(isPatternRule(rule)).toBe(true);
      expect((rule as { word?: string }).word).toBeUndefined();
    }
  });

  it('ruleRegex compiles each shape with the flags that shape needs', () => {
    const word = ruleRegex({ id: 'w', word: 'free', reason: 'r', approvedAlternatives: [] });
    expect(word.flags).toBe('gi');
    expect(word.source).toBe('\\bfree\\b');
    expect(ruleRegex(DASH_RULE).flags).toBe('gu');
    // Fresh per call: a shared lastIndex makes a result depend on call order.
    expect(ruleRegex(DASH_RULE)).not.toBe(ruleRegex(DASH_RULE));
    expect(ruleRegex(DASH_RULE).lastIndex).toBe(0);
  });
});
