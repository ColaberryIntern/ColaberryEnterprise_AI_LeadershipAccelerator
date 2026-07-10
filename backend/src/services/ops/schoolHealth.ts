/**
 * schoolHealth — the one unified School Health Score, broken into 8 sub-scores
 * (admissions, learning, curriculum, employment, certification, revenue,
 * community, operations). Pure + deterministic over SchoolSignals so the number
 * is reproducible and explainable.
 */
import { SchoolSignals } from './schoolSignals';

export interface HealthSub { key: string; label: string; score: number; note: string }
export interface SchoolHealth { overall: number; band: 'critical' | 'at-risk' | 'steady' | 'thriving'; subs: HealthSub[] }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** PURE — compute the School Health Score from the signal vector. */
export function computeSchoolHealth(s: SchoolSignals): SchoolHealth {
  const active = Math.max(1, s.students.active);
  const riskFree = clamp(100 - (s.students.at_risk / active) * 140);
  const learning = clamp(s.learning.avg_attendance * 0.6 + Math.min(100, s.learning.avg_builder_xp / 3) * 0.4);
  const curriculum = clamp(s.curriculum.avg_quality || (s.curriculum.blueprints > 0 ? 60 : 40));
  const employment = clamp(s.employment.avg_readiness);
  const certification = clamp(s.certification.avg_pass_prob);
  const revenue = clamp(s.revenue.collection_rate);
  const community = clamp(Math.min(100, (s.portfolio.total_artifacts / active) * 40 + 30));
  const operations = clamp((riskFree + learning) / 2);

  const subs: HealthSub[] = [
    { key: 'admissions', label: 'Admissions', score: riskFree, note: `${s.students.active} active · ${s.students.at_risk} at risk` },
    { key: 'learning', label: 'Learning', score: learning, note: `${s.learning.avg_attendance}% attendance · ${s.learning.avg_builder_xp} avg builder XP` },
    { key: 'curriculum', label: 'Curriculum', score: curriculum, note: `${s.curriculum.blueprints} blueprints · quality ${s.curriculum.avg_quality || '—'}` },
    { key: 'employment', label: 'Employment', score: employment, note: `avg readiness ${s.employment.avg_readiness} · ${s.employment.market_ready} market-ready` },
    { key: 'certification', label: 'Certification', score: certification, note: `${s.certification.exam_ready} exam-ready · avg pass ${s.certification.avg_pass_prob}%` },
    { key: 'revenue', label: 'Revenue', score: revenue, note: `${s.revenue.collection_rate}% collected · ${s.revenue.unpaid} unpaid` },
    { key: 'community', label: 'Community', score: community, note: `${s.portfolio.total_artifacts} portfolio artifacts` },
    { key: 'operations', label: 'Operations', score: operations, note: 'attendance + risk composite' },
  ];

  // Weighted overall — employment + learning + certification lead (the school's mission).
  const w: Record<string, number> = { employment: 1.6, learning: 1.4, certification: 1.3, admissions: 1.2, curriculum: 1.1, revenue: 1.1, community: 0.8, operations: 1.0 };
  const wsum = subs.reduce((a, x) => a + (w[x.key] || 1), 0);
  const overall = clamp(subs.reduce((a, x) => a + x.score * (w[x.key] || 1), 0) / wsum);
  const band = overall >= 75 ? 'thriving' : overall >= 55 ? 'steady' : overall >= 35 ? 'at-risk' : 'critical';
  return { overall, band, subs };
}
