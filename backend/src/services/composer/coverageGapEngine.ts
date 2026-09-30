/**
 * coverageGapEngine — the deterministic bridge between "the gauge" and "the
 * filler". Given a blueprint + its plan, it returns the blueprint competencies
 * that are covered by NEITHER a typed card NOR the week's live/Academy session
 * (session_competencies). This ranked gap list is the single input the video
 * recommender (and any future gap-filler) consumes. Pure, no LLM, stable order
 * (blueprint declaration order) so the same inputs always yield the same gaps.
 */
import { PlanCard } from './types';
import { resolve } from '../timeline/typeRegistry';
import { resolveCompetencies, resolveCompetency } from './competencyDictionary';
import { BlueprintLike } from './validationEngine';

export interface CoverageGap {
  competency: string;   // canonical competency id
  label: string;        // human-readable, from the blueprint's own wording
}

/** PURE — competencies the blueprint declares but nothing this span teaches. */
export function coverageGaps(blueprint: BlueprintLike, cards: PlanCard[]): CoverageGap[] {
  const present = new Set<string>();
  for (const c of cards) {
    resolveCompetencies(c.competencies).forEach((k) => present.add(k));
    resolveCompetencies(resolve(c.type)?.competencies).forEach((k) => present.add(k));
  }
  resolveCompetencies(blueprint.session_competencies).forEach((k) => present.add(k));

  const seen = new Set<string>();
  const gaps: CoverageGap[] = [];
  for (const raw of blueprint.competencies || []) {
    const id = resolveCompetency(raw);
    if (!id || present.has(id) || seen.has(id)) continue;
    seen.add(id);
    gaps.push({ competency: id, label: humanize(raw) });
  }
  return gaps;
}

function humanize(raw: string): string {
  return String(raw || '')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
