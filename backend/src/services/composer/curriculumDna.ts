/**
 * curriculumDna — the fingerprint of a learning experience. Aggregates the
 * Blueprint intent + the generated plan + validation + evidence + journey into
 * one stable descriptor the UI renders and the optimizer compares across
 * versions. Pure.
 */
import { PlanCard } from './types';
import { ValidationResult, BlueprintLike } from './validationEngine';
import { estimateEvidence } from './evidenceEngine';
import { journeyContribution } from './architectJourney';

export interface CurriculumDna {
  purpose: string;
  learning_outcomes: string[];
  competencies: string[];
  architect_domains: string[];
  career_skills: string[];
  evidence: { github_commits: number; github_prs: number; portfolio_entries: number; evidence_items: number };
  certification_coverage: number;
  builder_progress: number;      // builder XP produced
  architect_progress: number;    // 0..1 readiness contribution
  ai_confidence: number;         // 0..1
  difficulty: string;
  quality: number;               // 0..100
  coverage: number;              // 0..100
  estimated_completion_hours: number;
  focus_stage: string;
  why_architect: string;
}

/** PURE — derive the Curriculum DNA. `aiConfidence` defaults high for scaffold; the
 *  LLM generator can override it. */
export function deriveDna(
  blueprint: BlueprintLike & { purpose?: string; title?: string; learning_objectives?: string[] },
  cards: PlanCard[],
  validation: ValidationResult,
  aiConfidence = 0.85,
): CurriculumDna {
  const ev = estimateEvidence(cards);
  const journey = journeyContribution(cards);
  const dominant = dominantDifficulty(cards);
  return {
    purpose: blueprint.purpose || (blueprint.title ? `Advance mastery of ${blueprint.title}` : 'Advance the student toward AI Systems Architect'),
    learning_outcomes: blueprint.learning_objectives || [],
    competencies: ev.competencies,
    architect_domains: blueprint.architect_domains || [],
    career_skills: journey.stages.filter((s) => s.contributes).map((s) => s.name),
    evidence: { github_commits: ev.github.commits, github_prs: ev.github.prs, portfolio_entries: ev.portfolio.entries, evidence_items: ev.counts.evidence_items },
    certification_coverage: ev.certification_coverage,
    builder_progress: ev.xp.builder,
    architect_progress: ev.architect_readiness,
    ai_confidence: Math.round(aiConfidence * 100) / 100,
    difficulty: dominant,
    quality: validation.quality,
    coverage: validation.coverage,
    estimated_completion_hours: validation.workload_hours,
    focus_stage: journey.focus_stage,
    why_architect: journey.why,
  };
}

function dominantDifficulty(cards: PlanCard[]): string {
  const c = { intro: 0, core: 0, stretch: 0 };
  cards.forEach((x) => { if (x.difficulty in c) (c as any)[x.difficulty] += 1; });
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]) || 'core';
}
