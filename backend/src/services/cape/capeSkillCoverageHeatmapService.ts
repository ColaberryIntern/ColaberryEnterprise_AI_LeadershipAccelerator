/**
 * capeSkillCoverageHeatmapService — CAPE Phase 6 (design doc §12 "Skill coverage
 * heatmap", §16 Phase 6). Read-only. Builds the full registered-type x
 * Architecture-Skill matrix from Phase 3's `curriculum_skill_maps` (type-level,
 * `is_current:true`, `approved:true` rows only — the same resolution rule
 * `capeCurriculumSkillMapService.resolveSkillMapping()` uses for the `type`
 * tier), cross-referenced against `typeRegistry.allTypes()` (the full registered
 * roster) and Phase 0-1's `listCurrentSkillDefinitions()` (the 10 axes).
 *
 * A type with NO current type-level mapping row surfaces as `source: 'none'`
 * with an empty cell for every skill — never silently omitted from the matrix
 * (the whole point of a coverage heatmap is to show gaps, including "nothing
 * mapped yet").
 *
 * `gaps`: design doc §12's "special warning when a skill has only passive
 * content and no proof task" — a cell counts as a gap when it has a
 * meaningful weight (>0) AND its declared bands are ONLY `claim`/`knowledge`
 * (no `application`/`judgment`), i.e. the type teaches or claims the skill but
 * never proves it.
 */
import CurriculumSkillMap, { type ArchitectureSkillImpact, type EvidenceBandName } from '../../models/CurriculumSkillMap';
import { allTypes } from '../timeline/typeRegistry';
import { listCurrentSkillDefinitions } from './capeSkillDefinitionsService';
import { ARCHITECTURE_SKILL_IDS, type ArchitectureSkillId } from '../../constants/architectureSkills';

const PROOF_BANDS: EvidenceBandName[] = ['application', 'judgment'];

export interface HeatmapTypeRow {
  slug: string;
  label: string;
}

export interface HeatmapSkillColumn {
  skill_id: ArchitectureSkillId;
  name: string;
}

export interface HeatmapCell {
  type_slug: string;
  skill_id: ArchitectureSkillId;
  weight: number;
  credit_strength: string | null;
  bands: EvidenceBandName[];
  has_proof_task: boolean;
  source: 'type_default' | 'none';
}

export interface HeatmapGap {
  type_slug: string;
  skill_id: ArchitectureSkillId;
  reason: string;
}

export interface SkillCoverageHeatmapResponse {
  types: HeatmapTypeRow[];
  skills: HeatmapSkillColumn[];
  cells: HeatmapCell[];
  gaps: HeatmapGap[];
}

function hasProofTask(bands: EvidenceBandName[]): boolean {
  return bands.some((b) => PROOF_BANDS.includes(b));
}

/** One impact entry -> zero or more (type_slug, skill_id) cells (a type may
 * declare impacts for more than one skill; each becomes its own cell). */
function cellsFromImpacts(typeSlug: string, impacts: ArchitectureSkillImpact[]): HeatmapCell[] {
  return impacts
    .filter((i) => (ARCHITECTURE_SKILL_IDS as readonly string[]).includes(i.skill_id))
    .map((i) => ({
      type_slug: typeSlug,
      skill_id: i.skill_id,
      weight: i.weight,
      credit_strength: i.credit_strength,
      bands: i.bands,
      has_proof_task: hasProofTask(i.bands),
      source: 'type_default' as const,
    }));
}

export async function getSkillCoverageHeatmap(): Promise<SkillCoverageHeatmapResponse> {
  const [typeMaps, skillDefs] = await Promise.all([
    CurriculumSkillMap.findAll({ where: { scope_type: 'type', is_current: true, approved: true } }),
    listCurrentSkillDefinitions(),
  ]);

  const mapByType = new Map<string, CurriculumSkillMap>();
  for (const row of typeMaps) {
    if (row.type_slug) mapByType.set(row.type_slug, row);
  }

  const types: HeatmapTypeRow[] = allTypes().map((t) => ({ slug: t.slug, label: t.label }));
  const skills: HeatmapSkillColumn[] = skillDefs.length
    ? skillDefs.map((d) => ({ skill_id: d.skill_id, name: d.name }))
    // Fail-soft: if the Phase 0-1 skill-definitions table hasn't been seeded
    // yet in this environment, fall back to the canonical id list with the id
    // as a placeholder name — the matrix still renders 10 columns, never zero.
    : ARCHITECTURE_SKILL_IDS.map((id) => ({ skill_id: id, name: id }));

  const cells: HeatmapCell[] = [];
  for (const type of types) {
    const row = mapByType.get(type.slug);
    if (!row) {
      // No current type-level mapping at all — surface every skill as an
      // explicit empty/none cell rather than omitting the row.
      for (const skill of skills) {
        cells.push({ type_slug: type.slug, skill_id: skill.skill_id, weight: 0, credit_strength: null, bands: [], has_proof_task: false, source: 'none' });
      }
      continue;
    }
    const mapped = cellsFromImpacts(type.slug, row.skill_impacts);
    const mappedSkillIds = new Set(mapped.map((c) => c.skill_id));
    cells.push(...mapped);
    // Skills this type's mapping doesn't touch at all still get an explicit
    // zero-weight cell (source: type_default, the row exists, this skill just
    // isn't one of its impacts) so every (type, skill) pair has exactly one cell.
    for (const skill of skills) {
      if (!mappedSkillIds.has(skill.skill_id)) {
        cells.push({ type_slug: type.slug, skill_id: skill.skill_id, weight: 0, credit_strength: null, bands: [], has_proof_task: false, source: 'type_default' });
      }
    }
  }

  const gaps: HeatmapGap[] = cells
    .filter((c) => c.weight > 0 && c.bands.length > 0 && !c.has_proof_task)
    .map((c) => ({
      type_slug: c.type_slug,
      skill_id: c.skill_id,
      reason: `"${c.type_slug}" claims ${c.skill_id} (weight ${c.weight}) but its declared bands (${c.bands.join(', ')}) include no Application or Judgment proof task`,
    }));

  return { types, skills, cells, gaps };
}
