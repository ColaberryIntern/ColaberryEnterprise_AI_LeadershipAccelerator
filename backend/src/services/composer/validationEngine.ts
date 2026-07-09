/**
 * validationEngine — the pre-publish gate. Runs a battery of deterministic
 * checks over a plan + its Blueprint and produces a Quality / Coverage /
 * Readiness score plus a pass/warn/fail per check. Publishing is impossible
 * unless nothing FAILS. Pure (no LLM) so the gate is reproducible and testable.
 */
import { resolve } from '../timeline/typeRegistry';
import { PlanCard } from './types';
import { checkDependencies } from './dependencyEngine';
import { estimateEvidence } from './evidenceEngine';

export interface BlueprintLike {
  competencies?: string[];
  architect_domains?: string[];
  learning_objectives?: string[];
  difficulty?: string | null;
  estimated_hours?: number | null;
}

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface Check { key: string; label: string; status: CheckStatus; detail: string }

export interface ValidationResult {
  quality: number;      // 0..100
  coverage: number;     // 0..100
  readiness: number;    // 0..100
  publishable: boolean;
  checks: Check[];
  workload_hours: number;
  difficulty_mix: { intro: number; core: number; stretch: number };
  competency_coverage: number;  // 0..1 vs blueprint
  domain_coverage: number;      // 0..1 vs blueprint
}

function pct(n: number): number { return Math.round(n * 100); }
function coverFrac(required: string[] | undefined, present: Set<string>): number {
  const req = (required || []).filter(Boolean);
  if (req.length === 0) return 1;
  return req.filter((r) => present.has(r)).length / req.length;
}

/** PURE — validate a plan against its blueprint. */
export function validateCurriculum(cards: PlanCard[], blueprint: BlueprintLike = {}): ValidationResult {
  const dep = checkDependencies(cards);
  const ev = estimateEvidence(cards);
  const checks: Check[] = [];

  // difficulty mix + workload
  const mix = { intro: 0, core: 0, stretch: 0 };
  let minutes = 0;
  const typeCounts = new Map<string, number>();
  const compsPresent = new Set<string>();
  const domainsPresent = new Set<string>();
  for (const c of cards) {
    if (c.difficulty in mix) (mix as any)[c.difficulty] += 1;
    minutes += c.estimated_time || 0;
    typeCounts.set(c.type, (typeCounts.get(c.type) || 0) + 1);
    (c.competencies || []).forEach((k) => compsPresent.add(k));
    const def = resolve(c.type);
    (def?.competencies || []).forEach((k) => compsPresent.add(k));
  }
  // architect domains are derived from blueprint intent + competency spread here.
  (blueprint.architect_domains || []).forEach((d) => { if (compsPresent.has(d)) domainsPresent.add(d); });
  const workload_hours = Math.round((minutes / 60) * 10) / 10;

  const add = (key: string, label: string, ok: boolean, warnOnly: boolean, detail: string) =>
    checks.push({ key, label, status: ok ? 'pass' : warnOnly ? 'warn' : 'fail', detail });

  add('dependencies', 'Dependencies satisfied', dep.ok, false,
    dep.ok ? 'Every prerequisite appears before its dependent.' : dep.issues.map((i) => `${i.type} needs ${i.missing.join(', ')}`).join('; '));

  const hasCompletion = cards.some((c) => ['completion_badge', 'milestone', 'evaluation', 'certification_exercise'].includes(c.type)) ||
    cards.some((c) => resolve(c.type)?.bucket === 'advance');
  add('completion', 'Has a completion / capstone', hasCompletion, false, hasCompletion ? 'Ends on an advance-bucket capstone.' : 'No terminal evaluation, capstone, or completion card.');

  const compCov = coverFrac(blueprint.competencies, compsPresent);
  add('competencies', 'Competency coverage', compCov >= 0.75, compCov >= 0.5, `${pct(compCov)}% of blueprint competencies covered.`);

  const domCov = coverFrac(blueprint.architect_domains, domainsPresent);
  add('domains', 'Architect domain coverage', domCov >= 0.6, true, `${pct(domCov)}% of targeted architect domains touched.`);

  add('evidence', 'Produces evidence', ev.counts.evidence_items >= 2, false, `${ev.counts.evidence_items} evidence-producing activities.`);
  add('github', 'GitHub evidence present', ev.github.commits > 0, true, ev.github.commits > 0 ? `~${ev.github.commits} commits, ${ev.github.prs} PR(s).` : 'No GitHub-backed work this span.');
  add('portfolio', 'Portfolio growth', ev.portfolio.entries > 0, true, `${ev.portfolio.entries} portfolio entr${ev.portfolio.entries === 1 ? 'y' : 'ies'}.`);

  const balanced = mix.core > 0 && (mix.intro + mix.stretch) > 0;
  add('difficulty', 'Difficulty curve', balanced, true, `intro ${mix.intro} · core ${mix.core} · stretch ${mix.stretch}.`);

  const targetHrs = blueprint.estimated_hours || 6;
  const workloadOk = workload_hours <= Math.max(8, targetHrs * 1.4);
  add('workload', 'Student workload sane', workloadOk, true, `~${workload_hours}h vs. ~${targetHrs}h target.`);

  const dupes = Array.from(typeCounts.entries()).filter(([, n]) => n > 2).map(([t]) => t);
  add('duplicates', 'No over-duplicated activities', dupes.length === 0, true, dupes.length ? `Repeated: ${dupes.join(', ')}.` : 'Activity mix is varied.');

  // scores
  const competency_coverage = compCov;
  const domain_coverage = domCov;
  const coverage = pct((compCov * 0.4 + domCov * 0.2 + (ev.counts.evidence_items >= 2 ? 1 : ev.counts.evidence_items / 2) * 0.2 + (ev.github.commits > 0 ? 1 : 0) * 0.1 + (ev.portfolio.entries > 0 ? 1 : 0) * 0.1));
  const passN = checks.filter((c) => c.status === 'pass').length;
  const failN = checks.filter((c) => c.status === 'fail').length;
  const quality = Math.max(0, Math.round((passN / checks.length) * 100 - failN * 8));
  const readiness = Math.round((ev.architect_readiness * 0.7 + ev.certification_coverage * 0.3) * 100);

  return {
    quality, coverage, readiness,
    publishable: failN === 0,
    checks, workload_hours, difficulty_mix: mix,
    competency_coverage: Math.round(competency_coverage * 100) / 100,
    domain_coverage: Math.round(domain_coverage * 100) / 100,
  };
}
