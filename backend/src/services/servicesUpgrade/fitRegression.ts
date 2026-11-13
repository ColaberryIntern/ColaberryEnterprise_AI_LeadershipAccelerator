/**
 * SV2.3 (code half) - PURE before/after diff of the Gov AI capability fit against the SV0.1 baseline.
 *
 * Input: one baseline pursuit (the SV0.1 `capability_fit_fresh` file), the SV0.1 catalog snapshot, today's catalog
 * statuses, and N fresh runs of the SV2 Fit on the same requirements. Each run carries the model's capabilities with
 * the proof rules applied BOTH ways (flag off = what ships; flag on = what ENABLE_GOV_FIT_REQUIRE_PROOF would do), so
 * the two views come from the same LLM calls and differ only by the deterministic rule.
 *
 * MAJORITY VOTE (the model is not deterministic, so one run proves little):
 *   - per-pursuit have/partial/new counts after = the MEDIAN across successful runs;
 *   - a service is "have after" when it is matched as have in a strict majority of successful runs (2 of 3).
 * EXPLANATIONS: every service matched as "have" BEFORE that is not a majority "have" AFTER gets exactly one reason:
 *   service-no-longer-active  today's catalog has it as growth/retired/missing (fit only matches active services);
 *   downgraded-no-proof       a majority of runs matched it as have and the proof rule downgraded it (flag on only);
 *   model-reassessed          anything else (the model assessed it differently, or matched another service).
 *
 * No I/O, no clock (generatedAt is passed in). Same input -> same report.
 */
import { z } from 'zod';
import type { CatalogSnapshot, PursuitBaseline } from './schemas';

export type Assessment = 'have' | 'partial' | 'new';
export type ServiceStatus = 'active' | 'growth' | 'retired' | 'unknown';

export interface RunCapability {
  id: string; name: string; assessment: Assessment; matchedServiceId: string | null;
  evidence?: unknown[]; possibleProof?: unknown[]; downgradedFrom?: 'have';
}
export interface FitRun { error: string | null; flagOff: RunCapability[]; flagOn: RunCapability[] }

const Counts = z.object({ have: z.number(), partial: z.number(), new: z.number() });
const Matched = z.object({ active: z.number(), growth: z.number(), retired: z.number(), unknown: z.number() });
const Explanation = z.object({
  serviceId: z.string(),
  reason: z.enum(['service-no-longer-active', 'downgraded-no-proof', 'model-reassessed']),
  statusNow: z.enum(['active', 'growth', 'retired', 'unknown']),
  /** What each successful run said about this service: an assessment, or 'unmatched'. */
  afterByRun: z.array(z.string()),
});
const View = z.object({
  median: Counts,
  matched: Matched,
  majorityHaveServices: z.array(z.string()),
  evidenceCited: z.number(),
  possibleProofOffered: z.number(),
  downgraded: z.number(),
  explanations: z.array(Explanation),
});
export const PursuitRegression = z.object({
  canonicalOpportunityId: z.string(),
  title: z.string().nullable(),
  runs: z.number().int(),
  failedRuns: z.number().int(),
  error: z.string().nullable(),
  before: z.object({ counts: Counts, matched: Matched, haveServices: z.array(z.string()) }),
  after: z.object({ flagOff: View, flagOn: View }).nullable(),
});
export type PursuitRegression = z.infer<typeof PursuitRegression>;
export const RegressionReport = z.object({
  kind: z.literal('capability_fit_regression'),
  generatedAt: z.string(),
  baselineTakenOn: z.string(),
  runsPerPursuit: z.number().int().min(1),
  majorityRule: z.string(),
  pursuits: z.array(PursuitRegression),
  totals: z.object({
    before: Counts, before_matched: Matched,
    flagOff: z.object({ median: Counts, matched: Matched, explained: z.number(), downgraded: z.number() }),
    flagOn: z.object({ median: Counts, matched: Matched, explained: z.number(), downgraded: z.number() }),
  }),
});
export type RegressionReport = z.infer<typeof RegressionReport>;

export const MAJORITY_RULE = 'counts = median across successful runs; "have after" = matched as have in a strict majority of successful runs';

const zero = (): z.infer<typeof Counts> => ({ have: 0, partial: 0, new: 0 });
const zeroMatched = (): z.infer<typeof Matched> => ({ active: 0, growth: 0, retired: 0, unknown: 0 });
const ASSESSMENTS: Assessment[] = ['have', 'partial', 'new'];
const STATUSES: ServiceStatus[] = ['active', 'growth', 'retired', 'unknown'];

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function countAssessments(caps: Array<{ assessment: string }>): z.infer<typeof Counts> {
  const c = zero();
  for (const x of caps) if ((ASSESSMENTS as string[]).includes(x.assessment)) c[x.assessment as Assessment] += 1;
  return c;
}

export function countMatched(caps: Array<{ matchedServiceId: string | null }>, statusById: Map<string, string>): z.infer<typeof Matched> {
  const m = zeroMatched();
  for (const x of caps) {
    if (!x.matchedServiceId) continue;
    const s = statusById.get(x.matchedServiceId);
    m[(STATUSES as string[]).includes(s ?? '') ? (s as ServiceStatus) : 'unknown'] += 1;
  }
  return m;
}

const haveServices = (caps: RunCapability[]): Set<string> =>
  new Set(caps.filter((c) => c.assessment === 'have' && c.matchedServiceId).map((c) => c.matchedServiceId as string));

function view(ok: FitRun[], key: 'flagOff' | 'flagOn', beforeHave: string[], statusNow: Map<string, string>): z.infer<typeof View> {
  const runs = ok.map((r) => r[key]);
  const need = Math.floor(runs.length / 2) + 1; // strict majority
  const counts = runs.map(countAssessments);
  const matched = runs.map((r) => countMatched(r, statusNow));
  const tally = new Map<string, number>();
  for (const r of runs) for (const id of haveServices(r)) tally.set(id, (tally.get(id) ?? 0) + 1);
  const majorityHave = [...tally.entries()].filter(([, n]) => n >= need).map(([id]) => id).sort();
  const explanations = beforeHave.filter((id) => !majorityHave.includes(id)).map((serviceId) => {
    const st = (statusNow.get(serviceId) ?? 'unknown') as ServiceStatus;
    const afterByRun = runs.map((r) => r.find((c) => c.matchedServiceId === serviceId)?.assessment ?? 'unmatched');
    const downgradedRuns = runs.filter((r) => r.some((c) => c.matchedServiceId === serviceId && c.downgradedFrom === 'have')).length;
    const reason = st !== 'active' ? 'service-no-longer-active' as const
      : downgradedRuns >= need ? 'downgraded-no-proof' as const : 'model-reassessed' as const;
    return { serviceId, reason, statusNow: (STATUSES as string[]).includes(st) ? st : 'unknown', afterByRun };
  });
  return {
    median: { have: median(counts.map((c) => c.have)), partial: median(counts.map((c) => c.partial)), new: median(counts.map((c) => c.new)) },
    matched: { active: median(matched.map((m) => m.active)), growth: median(matched.map((m) => m.growth)), retired: median(matched.map((m) => m.retired)), unknown: median(matched.map((m) => m.unknown)) },
    majorityHaveServices: majorityHave,
    evidenceCited: median(runs.map((r) => r.reduce((n, c) => n + (Array.isArray(c.evidence) ? c.evidence.length : 0), 0))),
    possibleProofOffered: median(runs.map((r) => r.reduce((n, c) => n + (Array.isArray(c.possibleProof) ? c.possibleProof.length : 0), 0))),
    downgraded: median(runs.map((r) => r.filter((c) => c.downgradedFrom === 'have').length)),
    explanations,
  };
}

export function diffPursuit(before: PursuitBaseline, runs: FitRun[], beforeCatalog: CatalogSnapshot, statusNow: Map<string, string>, error: string | null = null): PursuitRegression {
  const beforeStatus = new Map(beforeCatalog.rows.map((r) => [r.id, r.status as string]));
  const beforeHave = [...haveServices(before.capabilities as RunCapability[])].sort();
  const ok = runs.filter((r) => !r.error);
  return {
    canonicalOpportunityId: before.canonicalOpportunityId,
    title: before.title,
    runs: runs.length,
    failedRuns: runs.length - ok.length,
    error: error ?? (runs.length && !ok.length ? `every run failed: ${runs[0].error}` : null),
    before: { counts: countAssessments(before.capabilities), matched: countMatched(before.capabilities, beforeStatus), haveServices: beforeHave },
    after: ok.length ? { flagOff: view(ok, 'flagOff', beforeHave, statusNow), flagOn: view(ok, 'flagOn', beforeHave, statusNow) } : null,
  };
}

const add = <T extends Record<string, number>>(a: T, b: T): T => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]])) as T;

export function buildRegressionReport(input: { generatedAt: string; baselineTakenOn: string; runsPerPursuit: number; pursuits: PursuitRegression[] }): RegressionReport {
  const t = {
    before: zero(), before_matched: zeroMatched(),
    flagOff: { median: zero(), matched: zeroMatched(), explained: 0, downgraded: 0 },
    flagOn: { median: zero(), matched: zeroMatched(), explained: 0, downgraded: 0 },
  };
  for (const p of input.pursuits) {
    t.before = add(t.before, p.before.counts);
    t.before_matched = add(t.before_matched, p.before.matched);
    if (!p.after) continue;
    for (const k of ['flagOff', 'flagOn'] as const) {
      t[k].median = add(t[k].median, p.after[k].median);
      t[k].matched = add(t[k].matched, p.after[k].matched);
      t[k].explained += p.after[k].explanations.length;
      t[k].downgraded += p.after[k].downgraded;
    }
  }
  return RegressionReport.parse({ kind: 'capability_fit_regression', ...input, majorityRule: MAJORITY_RULE, totals: t });
}

/** Plain-text summary for the operator's terminal. Ids and counts only - no titles, no capability names. */
export function summarizeRegression(r: RegressionReport): string {
  const c = (x: z.infer<typeof Counts>): string => `have ${x.have} / partial ${x.partial} / new ${x.new}`;
  const m = (x: z.infer<typeof Matched>): string => `active ${x.active}, growth ${x.growth}, retired ${x.retired}, unknown ${x.unknown}`;
  const lines = [
    `Capability-fit regression vs SV0.1 baseline ${r.baselineTakenOn} (${r.runsPerPursuit} runs per pursuit; ${r.majorityRule})`,
    `BEFORE           ${c(r.totals.before)} | matched: ${m(r.totals.before_matched)}`,
    `AFTER flag off   ${c(r.totals.flagOff.median)} | matched: ${m(r.totals.flagOff.matched)} | explained have-losses ${r.totals.flagOff.explained}`,
    `AFTER flag on    ${c(r.totals.flagOn.median)} | matched: ${m(r.totals.flagOn.matched)} | downgraded ${r.totals.flagOn.downgraded} | explained have-losses ${r.totals.flagOn.explained}`,
    '',
  ];
  for (const p of r.pursuits) {
    lines.push(`${p.canonicalOpportunityId}: runs ${p.runs} (failed ${p.failedRuns})${p.error ? ` ERROR ${p.error}` : ''}`);
    if (!p.after) continue;
    for (const k of ['flagOff', 'flagOn'] as const) {
      const reasons = p.after[k].explanations.map((e) => `${e.serviceId}:${e.reason}`).join(', ') || 'none';
      lines.push(`  ${k.padEnd(7)} ${c(p.after[k].median)} | have lost: ${reasons}`);
    }
  }
  return lines.join('\n') + '\n';
}
