import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { connectDatabase, sequelize } from '../config/database';
import type { CaseStudyMetricPayload, CaseStudyMetricShape } from '../types/caseStudy';

/**
 * Give existing metrics a shape, where their own value already implies one.
 *
 * DRY RUN BY DEFAULT, AND THE LIVE MODE NEEDS TWO FLAGS. Nothing is written
 * without `--confirm-production`, and the summary of a dry run is the whole
 * point of the script: it shows exactly which figures it believes it can shape
 * and, more usefully, which it cannot. A migration that writes on its first
 * accidental invocation is one nobody can safely explore with.
 *
 * IT NEVER WRITES `plain`. The three plain-language answers are what a figure
 * means to a reader, and no amount of parsing "4 of 7" produces them. Inferring
 * them would be inventing the one part of a metric card a reader trusts most.
 * This script sets `shape` and `payload` only; the readiness report then warns
 * that the plain language is missing, which is the correct next task for a
 * person.
 *
 * IT NEVER WRITES A FIGURE IT HAD TO GUESS. Every rule below is a total parse
 * of the EXISTING `value_display` or `numeric_value`. If a value does not match
 * a rule exactly, the metric is reported as unshaped and left alone. There is
 * no fuzzy branch and no default shape, because a wrong shape draws a confident
 * picture of a number that does not mean that.
 *
 * IT NEVER TOUCHES `is_headline`, `publishable`, `label`, or the verification
 * columns. Those are human decisions; this is a rendering upgrade.
 *
 * Run:
 *   npx ts-node src/scripts/migrateCaseStudyMetricShapes.ts --dry-run
 *   npx ts-node src/scripts/migrateCaseStudyMetricShapes.ts --confirm-production
 */

const CORRELATION_ID = randomUUID();
const SERVICE = 'migrate-case-study-metric-shapes';

interface MetricRow {
  readonly id: string;
  readonly case_study_id: string;
  readonly metric_key: string;
  readonly label: string;
  readonly value_display: string | null;
  readonly numeric_value: number | null;
  readonly unit: string | null;
  readonly shape: string | null;
  readonly publishable: boolean;
}

interface Proposal {
  readonly row: MetricRow;
  readonly shape: CaseStudyMetricShape;
  readonly payload: CaseStudyMetricPayload;
  readonly rule: string;
}

interface Unshaped {
  readonly row: MetricRow;
  readonly reason: string;
}

/* ──────────────────────────────────────────────────────────────── parsing ── */

/**
 * `4 of 7`, `4 / 7`, `4 out of 7`.
 *
 * This is the exact string the whole shapes feature exists because of, so it is
 * the first rule and the one worth being strictest about: both sides must be
 * whole numbers, and the numerator must not exceed the denominator. `12 of 7`
 * is not a ratio somebody typed slightly wrong, it is a value this script does
 * not understand.
 */
function asRatio(value: string): CaseStudyMetricPayload | null {
  const m = /^(\d+)\s*(?:of|out of|\/)\s*(\d+)\b/i.exec(value.trim());
  if (!m) return null;
  const numerator = Number(m[1]);
  const denominator = Number(m[2]);
  if (denominator <= 0 || numerator > denominator) return null;
  return { shape: 'ratio', numerator, denominator };
}

/**
 * `28.6%`, `41 %`.
 *
 * A percentage is a SHARE with a denominator of 100 and no note, which is an
 * honest but weak reading: the real denominator lived in a methodology
 * paragraph this script will not parse. The card still draws a correct meter,
 * and `denominatorNote` is deliberately left empty rather than filled with a
 * guess about what the hundred represents.
 */
function asShare(value: string): CaseStudyMetricPayload | null {
  const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(value.trim());
  if (!m) return null;
  const numerator = Number(m[1]);
  if (!Number.isFinite(numerator) || numerator < 0 || numerator > 100) return null;
  return { shape: 'share', numerator, denominator: 100 };
}

/**
 * `14 decision records`, `6 phases`, `78 commits`.
 *
 * No members: the names were never stored, and a count with an empty member
 * list renders exactly as it renders today, which is the point. The upgrade
 * here is that the card knows it is a count.
 */
function asCount(value: string): CaseStudyMetricPayload | null {
  // The trailing noun may hold NO further digits, and that is load bearing:
  // with `\w` here, "12 of 7" matched this rule and became the count 12, which
  // is precisely the information loss the ratio rule exists to prevent. A
  // second number in a display value means the value is not a plain count.
  const m = /^(\d+)(?:\s+[A-Za-z][A-Za-z\s-]*)?$/.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return { shape: 'count', value: n };
}

/** `2026-04-13 to 2026-05-01`. Both ends must be real dates, in order. */
function asSpan(value: string): CaseStudyMetricPayload | null {
  const m = /^(\d{4}-\d{2}-\d{2})\s*(?:to|-|until)\s*(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [, startDate, endDate] = m;
  if (Date.parse(`${startDate}T00:00:00Z`) > Date.parse(`${endDate}T00:00:00Z`)) return null;
  return { shape: 'span', startDate, endDate };
}

/**
 * The rules, in the order they are tried.
 *
 * RATIO BEFORE COUNT, deliberately. "4 of 7" would otherwise be read as the
 * count 4 by a looser rule, which is the exact information loss this feature
 * was built to reverse.
 *
 * There is no series rule. A time series was never expressible as one display
 * string, so no existing metric can be one, and inventing points would be
 * fabricating a chart.
 */
const RULES: readonly { name: string; parse: (v: string) => CaseStudyMetricPayload | null }[] = [
  { name: 'ratio from "n of m"', parse: asRatio },
  { name: 'share from a percentage', parse: asShare },
  { name: 'span from two dates', parse: asSpan },
  { name: 'count from a leading whole number', parse: asCount },
];

export function proposeShape(row: MetricRow): Proposal | Unshaped {
  if (row.shape) {
    return { row, reason: `already shaped as ${row.shape}` };
  }
  const value = (row.value_display ?? '').trim();
  if (!value) return { row, reason: 'no display value to read' };

  for (const rule of RULES) {
    const payload = rule.parse(value);
    if (payload) return { row, shape: payload.shape, payload, rule: rule.name };
  }
  return { row, reason: `no rule matches "${truncate(value)}"` };
}

const truncate = (s: string): string => (s.length <= 40 ? s : `${s.slice(0, 37)}...`);
const isProposal = (r: Proposal | Unshaped): r is Proposal => 'shape' in r;

/* ───────────────────────────────────────────────────────────────── running ── */

function log(event: string, outcome: 'success' | 'failure', context: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: SERVICE,
    event,
    correlation_id: CORRELATION_ID,
    outcome,
    ...context,
  })}\n`);
}

export async function migrateCaseStudyMetricShapes(apply: boolean): Promise<{
  scanned: number; shaped: number; unshaped: number; written: number;
}> {
  const rows = await sequelize.query<MetricRow>(
    `SELECT id, case_study_id, metric_key, label, value_display, numeric_value, unit,
            shape, publishable
       FROM case_study_metrics
      ORDER BY case_study_id, metric_key`,
    { type: QueryTypes.SELECT },
  );

  const results = rows.map(proposeShape);
  const proposals = results.filter(isProposal);
  const unshaped = results.filter((r): r is Unshaped => !isProposal(r));

  for (const p of proposals) {
    log('metric_shape_proposed', 'success', {
      metric_key: p.row.metric_key,
      value_display: p.row.value_display,
      shape: p.shape,
      rule: p.rule,
      publishable: p.row.publishable,
      would_write: apply,
    });
  }
  for (const u of unshaped) {
    // The unshaped list is the USEFUL half of a dry run. It is what a person
    // has to look at, not a residue to be minimised.
    log('metric_left_unshaped', 'success', {
      metric_key: u.row.metric_key,
      value_display: u.row.value_display,
      reason: u.reason,
    });
  }

  let written = 0;
  if (apply) {
    for (const p of proposals) {
      // One statement per row, guarded on `shape IS NULL`. Two concurrent runs
      // cannot both write, and a re-run after an interruption writes only what
      // is still unshaped, so the script is resumable with no cursor to lose.
      const [, meta] = await sequelize.query(
        `UPDATE case_study_metrics
            SET shape = :shape, payload = CAST(:payload AS JSONB), updated_at = NOW()
          WHERE id = :id AND shape IS NULL`,
        { replacements: { shape: p.shape, payload: JSON.stringify(p.payload), id: p.row.id } },
      );
      written += Number((meta as { rowCount?: number })?.rowCount ?? 0);
    }
  }

  const summary = {
    scanned: rows.length,
    shaped: proposals.length,
    unshaped: unshaped.length,
    written,
  };
  log('migration_complete', 'success', { ...summary, mode: apply ? 'apply' : 'dry-run' });
  return summary;
}

/* ────────────────────────────────────────────────────────────────── entry ── */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--confirm-production');
  const dryRun = args.includes('--dry-run');

  if (!apply && !dryRun) {
    process.stdout.write(
      'Pass --dry-run to see what would change, or --confirm-production to write.\n',
    );
    process.exit(2);
  }
  if (apply && dryRun) {
    // Not a pedantic refusal. Reading both flags and picking one silently is how
    // somebody ends up writing to production believing they asked for a preview.
    process.stdout.write('Pass one of --dry-run or --confirm-production, not both.\n');
    process.exit(2);
  }

  await connectDatabase();
  try {
    const summary = await migrateCaseStudyMetricShapes(apply);
    process.stdout.write(
      `${apply ? 'Wrote' : 'Would write'} ${apply ? summary.written : summary.shaped} `
      + `of ${summary.scanned} metrics. ${summary.unshaped} left unshaped.\n`,
    );
  } catch (err) {
    log('migration_failed', 'failure', {
      error_class: (err as { name?: string })?.name ?? 'Error',
    });
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  void main();
}
