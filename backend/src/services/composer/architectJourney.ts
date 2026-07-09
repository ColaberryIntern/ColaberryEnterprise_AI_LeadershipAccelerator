/**
 * architectJourney — the north star. Every curriculum decision must move a
 * student along the path Builder → Prompt Engineer → Context Engineer → Systems
 * Builder → AI Engineer → Architect Candidate → AI Systems Architect. This maps
 * a plan's competencies onto that journey and names the stage it advances, so
 * every generated week can answer "why does this move the student closer to
 * becoming an Architect?". Pure.
 */
import { resolve } from '../timeline/typeRegistry';
import { PlanCard } from './types';

export const ARCHITECT_JOURNEY = [
  'Builder', 'Prompt Engineer', 'Context Engineer', 'Systems Builder',
  'AI Engineer', 'Architect Candidate', 'AI Systems Architect',
] as const;
export type ArchitectStage = typeof ARCHITECT_JOURNEY[number];

/** competencies that characterize each stage (Builder is the entry stage). */
const STAGE_COMPETENCIES: Record<ArchitectStage, string[]> = {
  'Builder': [],
  'Prompt Engineer': ['prompt_engineering'],
  'Context Engineer': ['context_engineering'],
  'Systems Builder': ['architecture', 'testing'],
  'AI Engineer': ['deployment', 'github'],
  'Architect Candidate': ['leadership', 'documentation', 'security', 'communication'],
  'AI Systems Architect': [],
};

export interface JourneyStage { name: ArchitectStage; index: number; contributes: boolean; competencies: string[] }
export interface JourneyResult { stages: JourneyStage[]; focus_stage: ArchitectStage; why: string }

/** PURE — which journey stages this plan advances, and its primary focus. */
export function journeyContribution(cards: PlanCard[]): JourneyResult {
  const present = new Set<string>();
  for (const c of cards) {
    (c.competencies || []).forEach((k) => present.add(k));
    (resolve(c.type)?.competencies || []).forEach((k) => present.add(k));
  }

  let focus: ArchitectStage = 'Builder';
  let focusHits = 0;
  const stages: JourneyStage[] = ARCHITECT_JOURNEY.map((name, index) => {
    const comps = STAGE_COMPETENCIES[name].filter((k) => present.has(k));
    const contributes = comps.length > 0;
    if (comps.length > focusHits) { focusHits = comps.length; focus = name; }
    return { name, index, contributes, competencies: comps };
  });

  const touched = stages.filter((s) => s.contributes).map((s) => s.name);
  const why = touched.length
    ? `This span advances ${touched.join(', ')} — moving the student toward AI Systems Architect via ${focus}.`
    : 'This span builds foundational fluency (Builder stage).';
  return { stages, focus_stage: focus, why };
}
