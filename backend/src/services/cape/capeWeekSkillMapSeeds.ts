/**
 * capeWeekSkillMapSeeds — seeds `curriculum_skill_maps` week-scope rows for Weeks 0-12
 * from design doc §8's "Curriculum coverage across Week 0-12" table (the second tier
 * of the resolution hierarchy from §7, superseding a type default for any card that
 * carries a `week` number — the common case for scheduled curriculum).
 *
 * Grounding: `TimelineCard.week` is a plain nullable integer (no FK to
 * `curriculum_blueprints`), so week-scope resolution keys on that integer directly —
 * it does not need a blueprint row to exist to function. As a data-quality signal
 * (not a hard dependency), `seedWeekSkillMaps()` checks that a real `CurriculumBlueprint`
 * row exists for each week under the canonical program and logs (structured,
 * non-fatal) any week with none found, so a genuinely missing blueprint is visible in
 * boot logs rather than silently unnoticed.
 */
import CurriculumSkillMap from '../../models/CurriculumSkillMap';
import CurriculumBlueprint from '../../models/CurriculumBlueprint';
import { CANONICAL_PROGRAM_ID } from '../../data/weekBlueprints';
import type { ArchitectureSkillId } from '../../constants/architectureSkills';
import type { ArchitectureSkillImpact } from '../../models/CurriculumSkillMap';

/** design doc §8 "Primary Architecture Skills" column, transcribed week-for-week.
 * Week 12 lists "All ten; strongest in System Design, Governance, Eval, Deploy & Ops" —
 * modeled as the strongest-4 subset (weighted higher) rather than all ten at equal
 * weight, so the capstone week doesn't dilute credit across axes it only touches
 * lightly (execution-contract.md Assumption 3 territory: a reasonable, logged
 * translation of the doc's qualitative "strongest in" language). */
export const WEEK_PRIMARY_SKILLS: Record<number, ArchitectureSkillId[]> = {
  0: ['llm_core', 'prompting'],
  1: ['agents_mcp', 'context_engineering', 'deploy_ops'],
  2: ['agents_mcp', 'context_engineering', 'governance'],
  3: ['llm_core', 'prompting', 'agents_mcp', 'eval_guardrails'],
  4: ['prompting', 'context_engineering', 'eval_guardrails', 'rag'],
  5: ['agents_mcp', 'context_engineering', 'system_design'],
  6: ['agents_mcp', 'system_design', 'governance', 'deploy_ops'],
  7: ['agents_mcp', 'system_design', 'context_engineering'],
  8: ['deploy_ops', 'agents_mcp', 'eval_guardrails', 'governance'],
  9: ['eval_guardrails', 'deploy_ops', 'system_design', 'governance'],
  10: ['governance', 'eval_guardrails', 'system_design'],
  11: ['system_design', 'governance', 'deploy_ops'],
  12: ['system_design', 'governance', 'eval_guardrails', 'deploy_ops'], // "strongest in" 4-skill subset of "all ten"
};

function recommendedRangeForWeek(week: number): { min: number; max: number } {
  if (week === 0) return { min: 0, max: 30 };      // free preview, foundation-only
  if (week <= 4) return { min: 10, max: 55 };       // early weeks — foundation through working
  if (week <= 8) return { min: 30, max: 80 };       // mid weeks — working through stretch
  return { min: 50, max: 100 };                     // weeks 9-12 — stretch through architect
}

export interface WeekSkillMapDraft {
  week_number: number;
  skill_impacts: ArchitectureSkillImpact[];
  recommended_range: { min: number; max: number };
}

/** Pure function — directly unit-testable without the DB. */
export function computeWeekSkillMapDraft(week: number): WeekSkillMapDraft {
  const skillIds = WEEK_PRIMARY_SKILLS[week] ?? [];
  const weight = skillIds.length > 0 ? Math.round((1 / skillIds.length) * 10000) / 10000 : 0;
  const skill_impacts: ArchitectureSkillImpact[] = skillIds.map((skill_id) => ({
    skill_id,
    weight,
    bands: ['knowledge', 'application'],
    credit_strength: 'medium',
    evidence_required: false, // the week target itself doesn't gate credit — the resolved card's own type/card mapping does
    max_credit: 10,
  }));
  return { week_number: week, skill_impacts, recommended_range: recommendedRangeForWeek(week) };
}

export function computeAllWeekSkillMapDrafts(): WeekSkillMapDraft[] {
  return Object.keys(WEEK_PRIMARY_SKILLS).map((w) => computeWeekSkillMapDraft(Number(w)));
}

/**
 * Idempotent seeder: `findOrCreate`s a version-1, `is_current:true` row per week
 * 0-12. Also runs the blueprint-existence grounding check described above (logs only,
 * never blocks or fails the seed).
 */
export async function seedWeekSkillMaps(): Promise<{ created: number; skipped: number; blueprintGapsLogged: number }> {
  const drafts = computeAllWeekSkillMapDrafts();
  let created = 0;
  let skipped = 0;
  let blueprintGapsLogged = 0;

  for (const draft of drafts) {
    const [, wasCreated] = await CurriculumSkillMap.findOrCreate({
      where: { scope_type: 'week', week_number: draft.week_number, is_current: true },
      defaults: {
        scope_type: 'week',
        week_number: draft.week_number,
        skill_impacts: draft.skill_impacts,
        prerequisite_skills: [],
        recommended_range: draft.recommended_range,
        freshness_days: null,
        reviewable: true,
        source: 'human',
        approved: true,
        version: 1,
        is_current: true,
        created_by: 'system:capeWeekSkillMapSeeds',
      } as any,
    });
    if (wasCreated) created += 1; else skipped += 1;

    try {
      const blueprintCount = await CurriculumBlueprint.count({
        where: { program_id: CANONICAL_PROGRAM_ID, week: draft.week_number },
      });
      if (blueprintCount === 0) {
        blueprintGapsLogged += 1;
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
          event: 'cape_week_skill_map_no_blueprint_found', outcome: 'partial',
          context: { week: draft.week_number, program_id: CANONICAL_PROGRAM_ID },
        }));
      }
    } catch (err: any) {
      // Grounding check only — never fail the seed itself over a query error.
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'cape_week_skill_map_blueprint_check_failed', error_class: err?.name || 'Error',
        outcome: 'failure', context: { week: draft.week_number, message: err?.message },
      }));
    }
  }

  return { created, skipped, blueprintGapsLogged };
}
