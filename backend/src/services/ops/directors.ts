/**
 * directors — the AI Executive Team. Each Director owns a domain, reads the
 * school signals, and writes ranked recommendations that explain WHY, the
 * EVIDENCE, the expected IMPACT, a CONFIDENCE, and a one-click ACTION. Rule-based
 * + deterministic (the executive briefing adds LLM narrative on top). Every
 * recommendation carries a stable `key` so the Work Queue can track its status.
 */
import { SchoolSignals } from './schoolSignals';

export type ActionType = 'create_tasks' | 'email' | 'schedule' | 'review' | 'open' | 'compose';
export interface Recommendation {
  key: string; domain: string; title: string; why: string; evidence: string[];
  impact: string; confidence: number; action_type: ActionType; severity: 'high' | 'medium' | 'low';
}
export interface Director {
  domain: string; title: string; headline: string;
  metrics: Array<{ label: string; value: string }>;
  recommendations: Recommendation[];
}

const pct = (n: number) => `${Math.round(n)}%`;

export function runDirectors(s: SchoolSignals): Director[] {
  const R = (r: Omit<Recommendation, 'domain'>, domain: string): Recommendation => ({ ...r, domain });
  const directors: Director[] = [];

  // ── Student Success ──
  {
    const recs: Recommendation[] = [];
    if (s.students.at_risk > 0) recs.push(R({ key: 'student.intervene', title: `Intervene with ${s.students.at_risk} at-risk student${s.students.at_risk > 1 ? 's' : ''}`, why: 'Their employment readiness or attendance has dropped below the safe threshold — the leading indicator of dropout.', evidence: [`${s.students.at_risk} of ${s.students.active} flagged`, `avg attendance ${s.learning.avg_attendance}%`], impact: 'Reduce dropout; recover architect trajectory', confidence: 0.82, action_type: 'create_tasks', severity: 'high' }, 'student_success'));
    if (s.students.excelling > 0) recs.push(R({ key: 'student.fasttrack', title: `Fast-track ${s.students.excelling} excelling student${s.students.excelling > 1 ? 's' : ''}`, why: 'They are ahead of the curve; stretch work keeps them engaged and accelerates architect readiness.', evidence: [`${s.students.excelling} excelling`, `${s.students.architect_ready} architect-ready`], impact: 'Faster placements; stronger case studies', confidence: 0.7, action_type: 'create_tasks', severity: 'low' }, 'student_success'));
    directors.push({ domain: 'student_success', title: 'Student Success Director', headline: `${s.students.active} active · ${s.students.at_risk} at risk · ${s.students.excelling} excelling`, metrics: [{ label: 'Active', value: String(s.students.active) }, { label: 'At risk', value: String(s.students.at_risk) }, { label: 'Excelling', value: String(s.students.excelling) }, { label: 'Architect-ready', value: String(s.students.architect_ready) }], recommendations: recs });
  }

  // ── Career / Employer ──
  {
    const recs: Recommendation[] = [];
    if (s.employment.avg_readiness < 45) recs.push(R({ key: 'career.close_gap', title: 'Close the employment-readiness gap', why: 'Average employment readiness is below the hiring bar; the fastest movers are GitHub-backed builds + portfolio artifacts.', evidence: [`avg readiness ${s.employment.avg_readiness}/100`, `${s.employment.market_ready} market-ready`], impact: 'More students clear the hiring bar', confidence: 0.76, action_type: 'create_tasks', severity: 'high' }, 'career'));
    directors.push({ domain: 'career', title: 'Career Director', headline: `avg readiness ${s.employment.avg_readiness} · ${s.employment.market_ready} market-ready`, metrics: [{ label: 'Avg readiness', value: String(s.employment.avg_readiness) }, { label: 'Market-ready', value: String(s.employment.market_ready) }, { label: 'Employment-ready', value: String(s.students.employment_ready) }], recommendations: recs });
  }

  // ── Certification ──
  {
    const recs: Recommendation[] = [];
    if (s.certification.avg_pass_prob < 55) recs.push(R({ key: 'cert.boost', title: 'Boost certification readiness', why: 'Estimated pass probability is under target; graded certification exercises targeting weak Anthropic domains move it fastest.', evidence: [`avg pass ${s.certification.avg_pass_prob}%`, `${s.certification.exam_ready} exam-ready`], impact: 'Higher certification pass rate', confidence: 0.72, action_type: 'compose', severity: 'medium' }, 'certification'));
    directors.push({ domain: 'certification', title: 'Certification Director', headline: `avg pass ${s.certification.avg_pass_prob}% · ${s.certification.exam_ready} exam-ready`, metrics: [{ label: 'Avg pass prob', value: pct(s.certification.avg_pass_prob) }, { label: 'Exam-ready', value: String(s.certification.exam_ready) }], recommendations: recs });
  }

  // ── Curriculum ──
  {
    const recs: Recommendation[] = [];
    if (s.curriculum.blueprints === 0) recs.push(R({ key: 'curriculum.first', title: 'Compose the first curriculum blueprint', why: 'No blueprints yet — the Composer can assemble a validated week from approved components.', evidence: ['0 blueprints'], impact: 'Curriculum coverage begins', confidence: 0.9, action_type: 'compose', severity: 'medium' }, 'curriculum'));
    else if (s.curriculum.avg_quality > 0 && s.curriculum.avg_quality < 65) recs.push(R({ key: 'curriculum.improve', title: 'Improve low-quality curriculum', why: 'Average blueprint quality is below the bar; the Composer flags the specific gaps to fix.', evidence: [`avg quality ${s.curriculum.avg_quality}`], impact: 'Better learning outcomes', confidence: 0.68, action_type: 'open', severity: 'medium' }, 'curriculum'));
    directors.push({ domain: 'curriculum', title: 'Curriculum Director', headline: `${s.curriculum.blueprints} blueprints · quality ${s.curriculum.avg_quality || '—'}`, metrics: [{ label: 'Blueprints', value: String(s.curriculum.blueprints) }, { label: 'Avg quality', value: String(s.curriculum.avg_quality || '—') }], recommendations: recs });
  }

  // ── Finance ──
  {
    const recs: Recommendation[] = [];
    if (s.revenue.unpaid > 0) recs.push(R({ key: 'finance.collect', title: `Collect ${s.revenue.unpaid} unpaid tuition${s.revenue.unpaid > 1 ? 's' : ''}`, why: 'Active students without confirmed payment represent recoverable revenue and an enrollment-integrity risk.', evidence: [`${s.revenue.unpaid} unpaid`, `${s.revenue.collection_rate}% collected`], impact: 'Recovered revenue', confidence: 0.8, action_type: 'email', severity: 'high' }, 'finance'));
    directors.push({ domain: 'finance', title: 'Finance Director', headline: `${s.revenue.collection_rate}% collected · ${s.revenue.unpaid} unpaid`, metrics: [{ label: 'Collected', value: `$${s.revenue.collected.toLocaleString()}` }, { label: 'Collection rate', value: pct(s.revenue.collection_rate) }, { label: 'Unpaid', value: String(s.revenue.unpaid) }], recommendations: recs });
  }

  // ── Operations ──
  {
    const recs: Recommendation[] = [];
    if (s.learning.avg_attendance > 0 && s.learning.avg_attendance < 70) recs.push(R({ key: 'ops.attendance', title: 'Run an attendance intervention', why: 'Attendance is under 70%, which correlates with weaker completion and readiness downstream.', evidence: [`${s.learning.avg_attendance}% avg attendance`], impact: 'Higher engagement + completion', confidence: 0.65, action_type: 'schedule', severity: 'medium' }, 'operations'));
    directors.push({ domain: 'operations', title: 'Operations Director', headline: `${s.learning.avg_attendance}% attendance`, metrics: [{ label: 'Avg attendance', value: pct(s.learning.avg_attendance) }, { label: 'Avg builder XP', value: String(s.learning.avg_builder_xp) }], recommendations: recs });
  }

  // ── Community ──
  {
    const recs: Recommendation[] = [];
    if (s.portfolio.total_artifacts < s.students.active) recs.push(R({ key: 'community.share', title: 'Spark portfolio sharing', why: 'Fewer portfolio artifacts than active students; showcased work drives community energy and employer signal.', evidence: [`${s.portfolio.total_artifacts} artifacts across ${s.students.active} students`], impact: 'More visible student work', confidence: 0.6, action_type: 'schedule', severity: 'low' }, 'community'));
    directors.push({ domain: 'community', title: 'Community Director', headline: `${s.portfolio.total_artifacts} portfolio artifacts`, metrics: [{ label: 'Artifacts', value: String(s.portfolio.total_artifacts) }], recommendations: recs });
  }

  return directors;
}

/** Flatten + rank every director's recommendations for the Work Queue. */
export function rankRecommendations(directors: Director[]): Recommendation[] {
  const sev = { high: 3, medium: 2, low: 1 };
  return directors.flatMap((d) => d.recommendations).sort((a, b) => (sev[b.severity] - sev[a.severity]) || (b.confidence - a.confidence));
}
