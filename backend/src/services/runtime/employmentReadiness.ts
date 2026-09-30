/**
 * employmentReadiness — the "would an employer hire this student yet?" engine.
 * Pure + deterministic: maps the student's competency confidences + real
 * GitHub/portfolio evidence into 10 employer-legible skill scores, an overall
 * band, and a plain-English list of what employers still need to see.
 */
import { StudentSignals, EmploymentReadiness, SkillScore } from './readinessTypes';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** PURE — compute employment readiness from the student's signals. */
export function computeEmploymentReadiness(s: StudentSignals): EmploymentReadiness {
  const conf = (id: string) => (s.competencies.find((c) => c.domain_id === id)?.confidence ?? 0) * 100;

  const github_quality = clamp(s.github.commits * 7 + s.github.prs * 14 + s.github.repos * 18 + conf('github') * 0.3);
  const portfolio_quality = clamp(s.portfolio.entries * 16 + s.portfolio.artifacts * 22 + conf('documentation') * 0.2);

  const skills: SkillScore[] = [
    { key: 'prompt_engineering', label: 'Prompt Engineering', score: clamp(conf('prompt_engineering')) },
    { key: 'architecture', label: 'Architecture', score: clamp(conf('architecture')) },
    { key: 'context_engineering', label: 'Context Engineering', score: clamp(conf('context_engineering')) },
    { key: 'testing', label: 'Testing', score: clamp(conf('testing')) },
    { key: 'deployment', label: 'Deployment', score: clamp(conf('deployment')) },
    { key: 'security', label: 'Security', score: clamp(conf('security')) },
    { key: 'documentation', label: 'Documentation', score: clamp(conf('documentation')) },
    { key: 'communication', label: 'Communication', score: clamp(conf('communication')) },
    { key: 'leadership', label: 'Leadership', score: clamp(conf('leadership')) },
    { key: 'github_quality', label: 'GitHub Quality', score: github_quality },
    { key: 'portfolio_quality', label: 'Portfolio Quality', score: portfolio_quality },
  ];

  // Overall weights evidence-backed skills (github/portfolio/architecture) higher.
  const weights: Record<string, number> = { github_quality: 1.6, portfolio_quality: 1.5, architecture: 1.4, prompt_engineering: 1.2, deployment: 1.1, testing: 1.1 };
  const wsum = skills.reduce((a, sk) => a + (weights[sk.key] || 1), 0);
  const overall = clamp(skills.reduce((a, sk) => a + sk.score * (weights[sk.key] || 1), 0) / wsum);

  const band = overall >= 78 ? 'market-ready' : overall >= 58 ? 'competitive' : overall >= 35 ? 'developing' : 'emerging';

  const NEED: Record<string, string> = {
    github_quality: 'a public repo with real commits + a merged PR',
    portfolio_quality: 'at least two shipped artifacts with write-ups',
    architecture: 'an architecture doc for a system you built',
    prompt_engineering: 'a graded prompt library with before/after iterations',
    deployment: 'one deployed, running project',
    testing: 'tests that catch a real failure mode',
    security: 'a threat-model note on one build',
    documentation: 'a README that a stranger could follow',
    communication: 'a recorded demo or presentation',
    leadership: 'a peer review or mentored contribution',
    context_engineering: 'a retrieval/context build with an evaluation',
  };
  const employer_gaps = skills.filter((sk) => sk.score < 55).sort((a, b) => a.score - b.score).slice(0, 5)
    .map((sk) => ({ skill: sk.label, need: NEED[sk.key] || 'more evidence' }));

  return { skills, overall, band, employer_gaps };
}
