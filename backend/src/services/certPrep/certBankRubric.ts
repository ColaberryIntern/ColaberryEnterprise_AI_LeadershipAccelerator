// Only the pure rubric. Importing the improver would drag in the OpenAI client
// and, through it, Sequelize models - which the admin service's tests mock away
// and which a bank-level audit has no business needing.
import { scoreItem, RubricItem, achievableScore } from './certQuestionRubric';
import { MOCK_DEMAND } from '../../data/certBlueprints/items';
import { CCAR_FOUNDATIONS_BLUEPRINT } from '../../data/certBlueprints/ccarFoundations';

/**
 * certBankRubric — properties of the WHOLE bank that no single question can have.
 *
 * WHY THIS EXISTS. On 2026-09-11, 150 generated questions went into production
 * with the correct answer at A in 144 of them. Every per-question gate passed:
 * the rubric measured shape and every item had the right shape; triage measured
 * defensibility and every key was defensible. A student who answered A on every
 * question would have scored 96% on that half of the bank. The defect was not in
 * any question. It was in the bank.
 *
 * The same class of defect had been caught weeks earlier in the authored bank —
 * 110 of 150 keyed to B — by a test in `bankShape.test.ts`. That test ran in CI
 * against the TypeScript files and never against the database, so the generated
 * items sat in production for a day before an export put them under it.
 *
 * This module is that test, lifted into a service, so the same definition runs
 * in two places: CI against the repo, and every script that changes the bank
 * against the database it just changed. A bank-level check that only runs in
 * one of those places is the gap this file closes.
 *
 * EVERY CHECK REPORTS ITS MEASUREMENT, not just pass/fail. "Position balance
 * failed" sends someone to go and count; "A holds 96% against a ceiling of 35%"
 * tells them what to do. Thresholds are named constants with the reasoning
 * beside them, because a threshold with no reason gets moved by whoever it
 * inconveniences.
 *
 * ADVISORY VERSUS HARD. Some checks are hard failures — a bank where one letter
 * wins is unusable as a measurement instrument. Others are advisory — an
 * objective at three questions is thin, not broken. The audit distinguishes,
 * because a report where everything is red teaches people to stop reading it.
 */

export interface BankItem extends RubricItem {
  scenario_family?: string | null;
  review_status?: string;
}

export type CheckSeverity = 'hard' | 'advisory';

export interface BankCheck {
  id: string;
  label: string;
  severity: CheckSeverity;
  pass: boolean;
  /** The number the check actually measured. */
  measured: number;
  /** The number it was compared against. */
  threshold: number;
  /** Human-readable: what was found, and what to do if it failed. */
  note: string;
}

export interface BankAudit {
  items: number;
  pass: boolean;
  hardFailures: number;
  advisoryFailures: number;
  checks: BankCheck[];
}

/**
 * Thresholds, with the reasoning that set them.
 *
 * POSITION_MAX_SHARE 0.35 — four positions give 0.25 at chance. A third is
 *   tolerance for a real bank; 0.6 is what the generated half shipped with.
 * POSITION_MIN_SHARE 0.15 — every position must actually be used. The authored
 *   bank once had one item between C and D.
 * ONE_LETTER_MOCK_MAX 0.5 — a student answering the same letter on every item of
 *   a 60-item mock must fail it. Pass mark is 0.72; half is a wide margin.
 * DOMAIN_POSITION_MAX 0.45 — a per-domain guess must fail too; a student who
 *   noticed "D3 is always C" would otherwise have a strategy.
 * LENGTH_CUE_MAX 0.6 — the correct option is the longest less than 60% of the
 *   time. Chance is 0.25. The authored bank sits at 0.37, the first generated
 *   batch at 0.61.
 * SCENARIO_MIN_RATIO 0.5 — the thinnest scenario holds at least half what the
 *   fattest does. The exam draws four scenarios of six at random; a student who
 *   lands the thin one is measured against a shallower pool. S5 was at 8 against
 *   S1 at 34 before the growth run.
 * OBJECTIVE_MIN 4 — below four items an objective cannot appear in a mock and a
 *   diagnostic without repeating. Advisory, because a new objective legitimately
 *   starts small.
 * CEILING_RATE_MIN 0.95 — nearly every item meets every rubric dimension it can.
 *   The 5% is for detector false negatives that are documented, not for slippage.
 * TARGET_MOCKS 5 — five non-overlapping 60-item mocks; see growCertQuestionBank.
 */
export const BANK_THRESHOLDS = {
  POSITION_MAX_SHARE: 0.35,
  POSITION_MIN_SHARE: 0.15,
  ONE_LETTER_MOCK_MAX: 0.5,
  DOMAIN_POSITION_MAX: 0.45,
  LENGTH_CUE_MAX: 0.6,
  SCENARIO_MIN_RATIO: 0.5,
  OBJECTIVE_MIN: 4,
  CEILING_RATE_MIN: 0.95,
  TARGET_MOCKS: 5,
} as const;

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Single-select items only; position has no single answer when two are right. */
const singles = (items: BankItem[]) => items.filter((i) => i.correct_keys.length === 1);

function positionCounts(items: BankItem[]): Record<string, number> {
  const c: Record<string, number> = {};
  for (const i of singles(items)) c[i.correct_keys[0]] = (c[i.correct_keys[0]] ?? 0) + 1;
  return c;
}

/**
 * What a student scores on a 60-item mock by answering one letter throughout.
 * Weighted by mock demand, because a mock draws sixteen D1 items and nine D5,
 * not an even share.
 */
export function bestOneLetterMockScore(items: BankItem[]): { letter: string; score: number } {
  let best = { letter: '', score: 0 };
  for (const letter of ['A', 'B', 'C', 'D']) {
    let expected = 0; let total = 0;
    for (const [domain, demanded] of Object.entries(MOCK_DEMAND)) {
      const inDomain = singles(items).filter((i) => i.domain_id === domain);
      if (inDomain.length === 0) continue;
      const hit = inDomain.filter((i) => i.correct_keys[0] === letter).length / inDomain.length;
      expected += hit * demanded;
      total += demanded;
    }
    const score = total ? expected / total : 0;
    if (score > best.score) best = { letter, score };
  }
  return best;
}

/** Mocks the bank supports: the SMALLEST domain division, never the average. */
export function mocksSupported(items: BankItem[]): number {
  const byDomain: Record<string, number> = {};
  for (const i of items) byDomain[i.domain_id] = (byDomain[i.domain_id] ?? 0) + 1;
  return Math.min(...Object.entries(MOCK_DEMAND).map(([d, need]) => Math.floor((byDomain[d] ?? 0) / need)));
}

export function auditBank(items: BankItem[]): BankAudit {
  const T = BANK_THRESHOLDS;
  const checks: BankCheck[] = [];
  const n = items.length;
  const s = singles(items);

  // ── answer position ──────────────────────────────────────────────────────
  const pos = positionCounts(items);
  const worst = Object.entries(pos).sort((a, b) => b[1] - a[1])[0] ?? ['-', 0];
  const worstShare = s.length ? worst[1] / s.length : 0;
  checks.push({
    id: 'position_max_share', label: 'No answer position dominates', severity: 'hard',
    pass: worstShare < T.POSITION_MAX_SHARE, measured: worstShare, threshold: T.POSITION_MAX_SHARE,
    note: `${worst[0]} holds ${pct(worstShare)} of single-select keys (ceiling ${pct(T.POSITION_MAX_SHARE)}). `
      + (worstShare < T.POSITION_MAX_SHARE ? 'Balanced.' : 'Run rebalanceCertAnswerPositions.'),
  });

  const least = ['A', 'B', 'C', 'D'].map((k) => ({ k, share: s.length ? (pos[k] ?? 0) / s.length : 0 }))
    .sort((a, b) => a.share - b.share)[0];
  checks.push({
    id: 'position_min_share', label: 'Every answer position is used', severity: 'hard',
    pass: least.share > T.POSITION_MIN_SHARE, measured: least.share, threshold: T.POSITION_MIN_SHARE,
    note: `${least.k} holds ${pct(least.share)} (floor ${pct(T.POSITION_MIN_SHARE)}).`,
  });

  const one = bestOneLetterMockScore(items);
  checks.push({
    id: 'one_letter_mock', label: 'Answering one letter throughout fails a mock', severity: 'hard',
    pass: one.score < T.ONE_LETTER_MOCK_MAX, measured: one.score, threshold: T.ONE_LETTER_MOCK_MAX,
    note: `Always-${one.letter || '?'} scores ${pct(one.score)} on a 60-item mock (must be under ${pct(T.ONE_LETTER_MOCK_MAX)}; pass mark is 72%).`,
  });

  let domainSkew = 0; let skewDomain = '-';
  for (const d of Object.keys(MOCK_DEMAND)) {
    const inD = s.filter((i) => i.domain_id === d);
    if (inD.length === 0) continue;
    const c = positionCounts(inD);
    const share = Math.max(...Object.values(c)) / inD.length;
    if (share > domainSkew) { domainSkew = share; skewDomain = d; }
  }
  checks.push({
    id: 'domain_position_skew', label: 'No domain is skewed to one position', severity: 'hard',
    pass: domainSkew < T.DOMAIN_POSITION_MAX, measured: domainSkew, threshold: T.DOMAIN_POSITION_MAX,
    note: `Worst is ${skewDomain} at ${pct(domainSkew)} on one letter (ceiling ${pct(T.DOMAIN_POSITION_MAX)}).`,
  });

  // ── length cue ───────────────────────────────────────────────────────────
  const longestIsCorrect = s.filter((i) => {
    const longest = [...(i.options ?? [])].sort((a, b) => (b.text ?? '').length - (a.text ?? '').length)[0];
    return longest && i.correct_keys.includes(longest.key);
  }).length;
  const lengthCue = s.length ? longestIsCorrect / s.length : 0;
  checks.push({
    id: 'length_cue', label: 'The correct option is not usually the longest', severity: 'hard',
    pass: lengthCue < T.LENGTH_CUE_MAX, measured: lengthCue, threshold: T.LENGTH_CUE_MAX,
    note: `Correct is longest in ${pct(lengthCue)} of items (ceiling ${pct(T.LENGTH_CUE_MAX)}, chance 25%). `
      + (lengthCue < T.LENGTH_CUE_MAX ? 'No cue.' : 'Run balanceCertOptionLengths.'),
  });

  // ── coverage ─────────────────────────────────────────────────────────────
  const mocks = mocksSupported(items);
  checks.push({
    id: 'mocks_supported', label: `Supports ${T.TARGET_MOCKS} non-overlapping mocks`, severity: 'advisory',
    pass: mocks >= T.TARGET_MOCKS, measured: mocks, threshold: T.TARGET_MOCKS,
    note: `${mocks} mock(s) without a repeated item; limited by the thinnest domain.`,
  });

  const byScen: Record<string, number> = {};
  for (const i of items) byScen[i.scenario_family ?? '?'] = (byScen[i.scenario_family ?? '?'] ?? 0) + 1;
  const scenVals = Object.values(byScen);
  const scenRatio = scenVals.length ? Math.min(...scenVals) / Math.max(...scenVals) : 1;
  const thinScen = Object.entries(byScen).sort((a, b) => a[1] - b[1])[0] ?? ['-', 0];
  checks.push({
    id: 'scenario_spread', label: 'No scenario is starved', severity: 'advisory',
    pass: scenRatio >= T.SCENARIO_MIN_RATIO, measured: scenRatio, threshold: T.SCENARIO_MIN_RATIO,
    note: `Thinnest scenario ${thinScen[0]} holds ${thinScen[1]}; ratio to fattest ${scenRatio.toFixed(2)} (floor ${T.SCENARIO_MIN_RATIO}).`,
  });

  const byObj: Record<string, number> = {};
  for (const i of items) byObj[i.objective_id] = (byObj[i.objective_id] ?? 0) + 1;
  const allObjectives = CCAR_FOUNDATIONS_BLUEPRINT.domains.flatMap((d) => d.objectives.map((o) => o.objective_id));
  const thinObjs = allObjectives.filter((o) => (byObj[o] ?? 0) < T.OBJECTIVE_MIN);
  const minObj = Math.min(...allObjectives.map((o) => byObj[o] ?? 0));
  checks.push({
    id: 'objective_floor', label: `Every objective has at least ${T.OBJECTIVE_MIN} items`, severity: 'advisory',
    pass: thinObjs.length === 0, measured: minObj, threshold: T.OBJECTIVE_MIN,
    note: thinObjs.length === 0 ? `Thinnest objective holds ${minObj}.` : `Below floor: ${thinObjs.join(', ')}.`,
  });

  // ── per-item quality, aggregated ─────────────────────────────────────────
  const atCeiling = items.filter((i) => {
    const sc = scoreItem(i);
    return sc.met >= achievableScore(i, sc.of);
  }).length;
  const ceilingRate = n ? atCeiling / n : 0;
  checks.push({
    id: 'ceiling_rate', label: 'Items meet every rubric dimension they can', severity: 'hard',
    pass: ceilingRate >= T.CEILING_RATE_MIN, measured: ceilingRate, threshold: T.CEILING_RATE_MIN,
    note: `${atCeiling}/${n} at their ceiling (${pct(ceilingRate)}, floor ${pct(T.CEILING_RATE_MIN)}). `
      + (ceilingRate >= T.CEILING_RATE_MIN ? '' : 'Run sweepCertQuestionRubric.'),
  });

  // ── integrity ────────────────────────────────────────────────────────────
  const stems = new Map<string, string>();
  const dupes: string[] = [];
  for (const i of items) {
    // A malformed row (no stem) must not take the admin dashboard down with it.
    const k = (i.stem ?? '').trim().toLowerCase();
    if (stems.has(k)) dupes.push(`${i.question_key}=${stems.get(k)}`); else stems.set(k, i.question_key);
  }
  checks.push({
    id: 'duplicate_stems', label: 'No two items ask the same question', severity: 'hard',
    pass: dupes.length === 0, measured: dupes.length, threshold: 0,
    note: dupes.length === 0 ? 'No duplicates.' : `Duplicates: ${dupes.slice(0, 5).join(', ')}.`,
  });

  const unapproved = items.filter((i) => i.review_status !== undefined && i.review_status !== 'approved').length;
  checks.push({
    id: 'all_approved', label: 'Every live item is approved', severity: 'advisory',
    pass: unapproved === 0, measured: unapproved, threshold: 0,
    note: unapproved === 0 ? 'All approved.' : `${unapproved} item(s) not yet approved — a student cannot be served them.`,
  });

  const hardFailures = checks.filter((c) => c.severity === 'hard' && !c.pass).length;
  const advisoryFailures = checks.filter((c) => c.severity === 'advisory' && !c.pass).length;
  return { items: n, pass: hardFailures === 0, hardFailures, advisoryFailures, checks };
}

/** One line per check, for a script's stdout. */
export function formatBankAudit(a: BankAudit): string {
  const lines = [
    `BANK AUDIT: ${a.items} items — ${a.pass ? 'PASS' : 'FAIL'}`
      + ` (${a.hardFailures} hard, ${a.advisoryFailures} advisory failure${a.advisoryFailures === 1 ? '' : 's'})`,
  ];
  for (const c of a.checks) {
    const mark = c.pass ? 'ok  ' : (c.severity === 'hard' ? 'FAIL' : 'warn');
    lines.push(`  ${mark}  ${c.label.padEnd(46)} ${c.note}`);
  }
  return lines.join('\n');
}
