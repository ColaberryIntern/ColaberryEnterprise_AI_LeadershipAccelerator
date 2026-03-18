/**
 * Curriculum Graph Service
 *
 * Cross-section intelligence: skill progression, artifact flow,
 * section dependencies, and downstream impact analysis.
 *
 * All functions load data into memory and compute in-memory graphs.
 * The dataset is small (~30 sections, <100 skills/artifacts) so this is fast.
 */

import CurriculumModule from '../models/CurriculumModule';
import CurriculumLesson from '../models/CurriculumLesson';
import SkillDefinition from '../models/SkillDefinition';
import ArtifactDefinition from '../models/ArtifactDefinition';

// ─── Types ──────────────────────────────────────────────────────────

export interface SectionRef {
  lesson_id: string;
  lesson_title: string;
  module_number: number;
  lesson_number: number;
  role: 'introduced' | 'reinforced' | 'mastered';
}

export interface SkillCrossRef {
  skill_id: string;
  name: string;
  skill_type: string;
  layer_id: string;
  domain_id: string;
  sections: SectionRef[];
  first_introduced: { lesson_id: string; lesson_title: string } | null;
  progression_order: number;
}

export interface ArtifactFlowRef {
  artifact_id: string;
  name: string;
  artifact_type: string;
  artifact_role: string;
  produced_by: { lesson_id: string; lesson_title: string } | null;
  consumed_by: { lesson_id: string; lesson_title: string }[];
}

export interface SectionDependencies {
  section_id: string;
  inherited_skills: { skill_id: string; name: string; from_section: string }[];
  required_artifacts: { artifact_id: string; name: string; from_section: string }[];
  upstream_sections: { lesson_id: string; lesson_title: string }[];
}

export interface DownstreamImpact {
  section_id: string;
  impacted_sections: { lesson_id: string; title: string; reason: string }[];
  reused_artifacts: { artifact_id: string; name: string; used_in: string[] }[];
  extended_skills: { skill_id: string; name: string; used_in: string[] }[];
}

// ─── Internal helpers ───────────────────────────────────────────────

interface OrderedLesson {
  id: string;
  title: string;
  module_number: number;
  lesson_number: number;
  section_skill_ids: string[];
  section_artifact_ids: string[];
  globalOrder: number; // for sorting across modules
}

async function loadOrderedLessons(): Promise<OrderedLesson[]> {
  const modules = await CurriculumModule.findAll({ order: [['module_number', 'ASC']] });
  const moduleMap = new Map(modules.map(m => [m.id, m.module_number]));

  const lessons = await CurriculumLesson.findAll({ order: [['lesson_number', 'ASC']] });

  return lessons
    .map(l => ({
      id: l.id,
      title: l.title,
      module_number: moduleMap.get(l.module_id) || 0,
      lesson_number: l.lesson_number,
      section_skill_ids: (l.section_skill_ids || []) as string[],
      section_artifact_ids: (l.section_artifact_ids || []) as string[],
      globalOrder: (moduleMap.get(l.module_id) || 0) * 1000 + l.lesson_number,
    }))
    .sort((a, b) => a.globalOrder - b.globalOrder);
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * For each skill in the program: which sections reference it,
 * where it's first introduced, and its progression role per section.
 */
export async function getSkillCrossMap(): Promise<SkillCrossRef[]> {
  const [lessons, skills] = await Promise.all([
    loadOrderedLessons(),
    SkillDefinition.findAll({ where: { is_active: true } }),
  ]);

  const skillMap = new Map(skills.map(s => [s.skill_id, s]));
  // Also map by UUID id for lessons that store UUIDs in section_skill_ids
  const skillByUuid = new Map(skills.map(s => [s.id, s]));

  // Build: skill_id → ordered list of lessons referencing it
  const refMap = new Map<string, OrderedLesson[]>();

  for (const lesson of lessons) {
    for (const sid of lesson.section_skill_ids) {
      // Resolve to skill_id (could be UUID or skill_id string)
      const skill = skillMap.get(sid) || skillByUuid.get(sid);
      const key = skill?.skill_id || sid;
      if (!refMap.has(key)) refMap.set(key, []);
      refMap.get(key)!.push(lesson);
    }
  }

  const result: SkillCrossRef[] = [];
  let order = 0;

  for (const [skillId, refLessons] of refMap) {
    const skill = skillMap.get(skillId) || skillByUuid.get(skillId);
    const sections: SectionRef[] = refLessons.map((l, idx) => ({
      lesson_id: l.id,
      lesson_title: l.title,
      module_number: l.module_number,
      lesson_number: l.lesson_number,
      role: refLessons.length === 1
        ? 'introduced' as const
        : idx === 0
          ? 'introduced' as const
          : idx === refLessons.length - 1
            ? 'mastered' as const
            : 'reinforced' as const,
    }));

    result.push({
      skill_id: skillId,
      name: skill?.name || skillId,
      skill_type: (skill as any)?.skill_type || 'core',
      layer_id: skill?.layer_id || '',
      domain_id: skill?.domain_id || '',
      sections,
      first_introduced: sections.length > 0
        ? { lesson_id: sections[0].lesson_id, lesson_title: sections[0].lesson_title }
        : null,
      progression_order: order++,
    });
  }

  return result;
}

/**
 * For each artifact: where it's produced (by lesson_id FK) and
 * which other sections consume it (via section_artifact_ids).
 */
export async function getArtifactFlowMap(): Promise<ArtifactFlowRef[]> {
  const [lessons, artifacts] = await Promise.all([
    loadOrderedLessons(),
    ArtifactDefinition.findAll(),
  ]);

  const lessonById = new Map(lessons.map(l => [l.id, l]));

  return artifacts.map(art => {
    const producerLesson = art.lesson_id ? lessonById.get(art.lesson_id) : null;

    // Find all lessons that reference this artifact in section_artifact_ids
    // but are NOT the producing lesson
    const consumers = lessons
      .filter(l => l.section_artifact_ids.includes(art.id) && l.id !== art.lesson_id)
      .map(l => ({ lesson_id: l.id, lesson_title: l.title }));

    return {
      artifact_id: art.id,
      name: art.name,
      artifact_type: art.artifact_type || 'document',
      artifact_role: art.artifact_role || 'output',
      produced_by: producerLesson
        ? { lesson_id: producerLesson.id, lesson_title: producerLesson.title }
        : null,
      consumed_by: consumers,
    };
  });
}

/**
 * For a given section: which skills come from prior sections,
 * which artifacts are required from upstream, and the upstream section list.
 */
export async function getSectionDependencies(lessonId: string): Promise<SectionDependencies> {
  const lessons = await loadOrderedLessons();
  const targetIdx = lessons.findIndex(l => l.id === lessonId);
  if (targetIdx < 0) {
    return { section_id: lessonId, inherited_skills: [], required_artifacts: [], upstream_sections: [] };
  }

  const target = lessons[targetIdx];
  const priorLessons = lessons.slice(0, targetIdx);

  const skills = await SkillDefinition.findAll({ where: { is_active: true } });
  const skillMap = new Map(skills.map(s => [s.skill_id, s]));
  const skillByUuid = new Map(skills.map(s => [s.id, s]));

  const artifacts = await ArtifactDefinition.findAll();
  const artifactMap = new Map(artifacts.map(a => [a.id, a]));

  // Skills that appear in both target AND a prior section
  const inherited_skills: SectionDependencies['inherited_skills'] = [];
  const upstreamSet = new Set<string>();

  for (const sid of target.section_skill_ids) {
    for (const prior of priorLessons) {
      if (prior.section_skill_ids.includes(sid)) {
        const skill = skillMap.get(sid) || skillByUuid.get(sid);
        inherited_skills.push({
          skill_id: sid,
          name: skill?.name || sid,
          from_section: prior.title,
        });
        upstreamSet.add(prior.id);
        break; // first prior occurrence is enough
      }
    }
  }

  // Artifacts in target's section_artifact_ids that are produced by a different lesson
  const required_artifacts: SectionDependencies['required_artifacts'] = [];
  for (const aid of target.section_artifact_ids) {
    const art = artifactMap.get(aid);
    if (art && art.lesson_id && art.lesson_id !== lessonId) {
      const producerLesson = lessons.find(l => l.id === art.lesson_id);
      if (producerLesson && producerLesson.globalOrder < target.globalOrder) {
        required_artifacts.push({
          artifact_id: aid,
          name: art.name,
          from_section: producerLesson.title,
        });
        upstreamSet.add(producerLesson.id);
      }
    }
  }

  const upstream_sections = [...upstreamSet].map(id => {
    const l = lessons.find(x => x.id === id)!;
    return { lesson_id: l.id, lesson_title: l.title };
  });

  return { section_id: lessonId, inherited_skills, required_artifacts, upstream_sections };
}

/**
 * For a given section: which later sections are impacted
 * by its skills and artifacts.
 */
export async function getDownstreamImpact(lessonId: string): Promise<DownstreamImpact> {
  const lessons = await loadOrderedLessons();
  const targetIdx = lessons.findIndex(l => l.id === lessonId);
  if (targetIdx < 0) {
    return { section_id: lessonId, impacted_sections: [], reused_artifacts: [], extended_skills: [] };
  }

  const target = lessons[targetIdx];
  const laterLessons = lessons.slice(targetIdx + 1);

  const skills = await SkillDefinition.findAll({ where: { is_active: true } });
  const skillMap = new Map(skills.map(s => [s.skill_id, s]));
  const skillByUuid = new Map(skills.map(s => [s.id, s]));

  const artifacts = await ArtifactDefinition.findAll();
  const artifactMap = new Map(artifacts.map(a => [a.id, a]));

  // Skills from this section that also appear in later sections
  const skillUsage = new Map<string, string[]>();
  for (const sid of target.section_skill_ids) {
    for (const later of laterLessons) {
      if (later.section_skill_ids.includes(sid)) {
        if (!skillUsage.has(sid)) skillUsage.set(sid, []);
        skillUsage.get(sid)!.push(later.title);
      }
    }
  }

  // Artifacts produced here that are referenced in later sections
  const artifactUsage = new Map<string, string[]>();
  const producedHere = artifacts.filter(a => a.lesson_id === lessonId);
  for (const art of producedHere) {
    for (const later of laterLessons) {
      if (later.section_artifact_ids.includes(art.id)) {
        if (!artifactUsage.has(art.id)) artifactUsage.set(art.id, []);
        artifactUsage.get(art.id)!.push(later.title);
      }
    }
  }

  // Build impacted sections set
  const impactedSet = new Map<string, string>();
  for (const [sid, titles] of skillUsage) {
    const skill = skillMap.get(sid) || skillByUuid.get(sid);
    for (const t of titles) {
      impactedSet.set(t, `Shares skill: ${skill?.name || sid}`);
    }
  }
  for (const [aid, titles] of artifactUsage) {
    const art = artifactMap.get(aid);
    for (const t of titles) {
      const existing = impactedSet.get(t);
      impactedSet.set(t, existing ? `${existing}; Uses artifact: ${art?.name}` : `Uses artifact: ${art?.name}`);
    }
  }

  const impacted_sections = [...impactedSet].map(([title, reason]) => {
    const l = laterLessons.find(x => x.title === title);
    return { lesson_id: l?.id || '', title, reason };
  });

  const extended_skills = [...skillUsage].map(([sid, titles]) => {
    const skill = skillMap.get(sid) || skillByUuid.get(sid);
    return { skill_id: sid, name: skill?.name || sid, used_in: titles };
  });

  const reused_artifacts = [...artifactUsage].map(([aid, titles]) => {
    const art = artifactMap.get(aid);
    return { artifact_id: aid, name: art?.name || aid, used_in: titles };
  });

  return { section_id: lessonId, impacted_sections, reused_artifacts, extended_skills };
}
