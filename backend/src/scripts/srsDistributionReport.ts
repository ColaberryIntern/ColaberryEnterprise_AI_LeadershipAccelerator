/**
 * M25 - compute the Sales Readiness Score across a real population and report the distribution.
 *
 * READ ONLY. It issues SELECTs through the normal Person 360 reader and writes nothing: no score
 * is persisted, no row is updated, nothing is sent. M25 requires the distribution to be shown to
 * Ali BEFORE the score is surfaced anywhere, so this exists to be looked at and argued with, not
 * to go live.
 *
 * WHY IT SCORES THROUGH `getPersonProfile` RATHER THAN A FAST BESPOKE QUERY. A hand-written
 * aggregate would be an order of magnitude quicker and would measure something subtly different
 * from what the product will actually score. The whole point of the exercise is to see what the
 * real evidence package yields, including its absences, so it pays the cost of the real reader.
 * That is also why it runs SEQUENTIALLY and takes a LIMIT: it is a report, not a batch job, and
 * it must not hammer production.
 *
 *   LIMIT=250 npx ts-node src/scripts/srsDistributionReport.ts
 *   LIMIT=25 DRY=1 npx ts-node src/scripts/srsDistributionReport.ts   # tiny smoke run
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { getPersonProfile } from '../services/adminOs/personProfileService';
import { inputsFromProfile } from '../services/salesReadiness/srsInputs';
import { scoreReadiness, ScoreResult } from '../services/salesReadiness/srsEngine';
import { FACTORS, MAX_POSSIBLE, RULESET_VERSION } from '../services/salesReadiness/srsRuleset';
import { measureDiscrimination } from '../services/salesReadiness/srsDiscrimination';

/** Every section, so the report sees the evidence an unrestricted reader would see. */
const ALL_SECTIONS = [
  'leads', 'revenue', 'lead_ingestion', 'students', 'program', 'career_review',
  'campaigns', 'inbox_content',
];

const LIMIT = Number(process.env.LIMIT || 250);

interface Row { email: string }

/** Fixed, so two runs of the report describe the same people. */
async function population(): Promise<string[]> {
  const rows = await sequelize.query<Row>(
    `SELECT DISTINCT lower(btrim(email)) AS email
       FROM enrollments
      WHERE email IS NOT NULL AND btrim(email) <> ''
        AND enrollment_type = 'explorer'
      ORDER BY 1
      LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { limit: LIMIT } },
  );
  return rows.map((r) => r.email);
}

function histogram(values: number[], buckets: number): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  const width = MAX_POSSIBLE / buckets;
  for (let b = 0; b < buckets; b += 1) {
    const lo = Math.round(b * width);
    const hi = Math.round((b + 1) * width);
    const n = values.filter((v) => v >= lo && (b === buckets - 1 ? v <= hi : v < hi)).length;
    out.push([`${lo}-${hi}`, n]);
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function main(): Promise<void> {
  const started = Date.now();
  const emails = await population();
  console.log(`ruleset ${RULESET_VERSION}, max possible ${MAX_POSSIBLE}`);
  console.log(`population: ${emails.length} explorer email(s), LIMIT=${LIMIT}\n`);

  const scores: ScoreResult[] = [];
  let unreadable = 0;
  for (const email of emails) {
    const profile = await getPersonProfile({
      email, sections: ALL_SECTIONS, visibleEnrollmentIds: null,
    });
    if (!profile) { unreadable += 1; continue; }
    scores.push(scoreReadiness(inputsFromProfile(profile), new Date().toISOString()));
  }

  const totals = scores.map((s) => s.total).sort((a, b) => a - b);
  const coverage = scores.map((s) => s.coverage);

  console.log(`scored ${scores.length}, unreadable ${unreadable}, `
    + `${Math.round((Date.now() - started) / 1000)}s\n`);

  console.log('SCORE DISTRIBUTION');
  for (const [range, n] of histogram(totals, 10)) {
    console.log(`  ${range.padStart(9)} | ${'#'.repeat(Math.min(n, 60)).padEnd(60)} ${n}`);
  }
  console.log(`\n  min ${totals[0] ?? 0}  p25 ${percentile(totals, 25)}  `
    + `median ${percentile(totals, 50)}  p75 ${percentile(totals, 75)}  `
    + `p95 ${percentile(totals, 95)}  max ${totals[totals.length - 1] ?? 0}`);
  const mean = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  console.log(`  mean ${Math.round(mean * 100) / 100}`);
  console.log(`  ALL ZERO: ${totals.filter((t) => t === 0).length} of ${totals.length}`);

  console.log('\nEVIDENCE COVERAGE (how much of the ruleset each person had evidence for)');
  const meanCov = coverage.reduce((a, b) => a + b, 0) / (coverage.length || 1);
  console.log(`  mean coverage ${Math.round(meanCov * 100)}%  `
    + `min ${Math.round(Math.min(...coverage, 1) * 100)}%  `
    + `max ${Math.round(Math.max(...coverage, 0) * 100)}%`);

  console.log('\nPER FACTOR: how often there was evidence at all, and what it contributed');
  for (const def of FACTORS) {
    const mine = scores.map((s) => s.factors.find((f) => f.key === def.key));
    const scored = mine.filter((f) => f && f.state === 'scored');
    const pts = scored.map((f) => f?.points ?? 0);
    const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
    const pct = scores.length ? Math.round((scored.length / scores.length) * 100) : 0;
    console.log(`  ${def.key.padEnd(18)} present ${String(pct).padStart(3)}%  `
      + `mean when present ${(Math.round(avg * 100) / 100).toFixed(2)} / ${def.max}`);
  }

  // ── WHICH FACTORS ACTUALLY RANK ───────────────────────────────────────────
  //
  // "Present %" and "mean when present" say whether a factor has evidence. They do not say
  // whether it ORDERS anybody: a factor identical for every person has evidence for all of them
  // and still sorts nobody. Variance share is the measurement that separates the two.
  const disc = measureDiscrimination(scores);
  console.log('\nDISCRIMINATION: how much of the ORDERING each factor actually carries');
  const ranked = [...disc.factors].sort((a, b) => b.rankingShare - a.rankingShare);
  for (const f of ranked) {
    const pct = (f.rankingShare * 100).toFixed(1);
    const bar = '#'.repeat(Math.round(f.rankingShare * 40));
    console.log(`  ${f.key.padEnd(18)} ${String(pct).padStart(5)}%  ${bar.padEnd(40)} `
      + `${f.verdict}  (max ${f.max}, ${f.distinctValues} distinct value(s))`);
  }
  console.log(`\n  DEAD WEIGHT: ${disc.deadPoints} of ${disc.totalPoints} points `
    + `(${Math.round(disc.deadShare * 100)}%) sit in factors that cannot rank anybody here.`);

  console.log('\nNOTHING WAS WRITTEN. No score persisted, no row updated, nothing sent.');
}

main()
  .catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await sequelize.close(); });
