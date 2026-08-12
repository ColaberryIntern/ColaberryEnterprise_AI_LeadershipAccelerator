/**
 * certificationReadiness — maps the student's competencies onto the Anthropic
 * certification domains and estimates a pass probability, weak/strong areas, and
 * the next activities that would move the needle. Pure + deterministic.
 */
import { StudentSignals, CertificationReadiness, CertDomain } from './readinessTypes';

/** cert domain -> the competency ids that feed it. */
const DOMAIN_MAP: Record<string, string[]> = {
  'Prompt Engineering': ['prompt_engineering'],
  'Context Engineering': ['context_engineering'],
  'Agents & Tool Use': ['architecture', 'deployment'],
  'Evaluation & Testing': ['testing'],
  'Deployment & Ops': ['deployment', 'github'],
  'Safety & Governance': ['security', 'documentation'],
};
/** weak-domain -> a recommended component type to practice. */
const NEXT_FOR: Record<string, string> = {
  'Prompt Engineering': 'prompt_lab',
  'Context Engineering': 'deep_dive',
  'Agents & Tool Use': 'implementation_task',
  'Evaluation & Testing': 'evaluation',
  'Deployment & Ops': 'implementation_task',
  'Safety & Governance': 'certification_exercise',
};

/** PURE — certification readiness from the student's competency signals. */
export function computeCertificationReadiness(s: StudentSignals): CertificationReadiness {
  const conf = (id: string) => s.competencies.find((c) => c.domain_id === id)?.confidence ?? 0;
  const domains: CertDomain[] = Object.entries(DOMAIN_MAP).map(([domain, ids]) => {
    const c = ids.length ? ids.reduce((a, id) => a + conf(id), 0) / ids.length : 0;
    return { domain, confidence: Math.round(c * 100) / 100, band: c >= 0.7 ? 'strong' : c >= 0.4 ? 'developing' : 'weak' };
  });

  const confidence = Math.round((domains.reduce((a, d) => a + d.confidence, 0) / domains.length) * 100) / 100;
  const evidenceBoost = Math.min(0.15, (s.github.commits + s.portfolio.entries) * 0.01);
  const pass_probability = Math.max(0, Math.min(1, Math.round((confidence * 0.85 + evidenceBoost) * 100) / 100));

  const weak = domains.filter((d) => d.band === 'weak').map((d) => d.domain);
  const strong = domains.filter((d) => d.band === 'strong').map((d) => d.domain);
  const next_activities = Array.from(new Set((weak.length ? weak : domains.filter((d) => d.band === 'developing').map((d) => d.domain)).map((d) => NEXT_FOR[d]).filter(Boolean)));

  return { domains, strong, weak, confidence, pass_probability, next_activities };
}
