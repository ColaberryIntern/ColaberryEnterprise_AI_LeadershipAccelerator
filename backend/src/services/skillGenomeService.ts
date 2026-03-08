import SkillMastery from '../models/SkillMastery';
import ontology from '../data/ontology.json';
import lessonSkillMap from '../data/lessonSkillMap.json';

const DECAY_DAYS = 30; // Lose 1 proficiency level per 30 days of inactivity

interface SkillWithMastery {
  id: string;
  name: string;
  description: string;
  proficiency_level: number;
  effective_level: number; // After decay
  last_demonstrated: string | null;
  evidence_count: number;
  decayed: boolean;
}

interface DomainWithSkills {
  id: string;
  name: string;
  skills: SkillWithMastery[];
  avg_proficiency: number;
}

interface LayerWithDomains {
  id: string;
  name: string;
  description: string;
  domains: DomainWithSkills[];
  avg_proficiency: number;
}

export interface SkillGenome {
  layers: LayerWithDomains[];
  overall_proficiency: number;
  total_skills: number;
  skills_started: number;
  skills_mastered: number; // Level 4+
}

function calculateDecay(lastDemonstrated: Date | null, currentLevel: number): number {
  if (!lastDemonstrated || currentLevel === 0) return currentLevel;
  const daysSince = Math.floor((Date.now() - new Date(lastDemonstrated).getTime()) / (1000 * 60 * 60 * 24));
  const decay = Math.floor(daysSince / DECAY_DAYS);
  return Math.max(0, currentLevel - decay);
}

export async function getSkillGenome(enrollmentId: string): Promise<SkillGenome> {
  const masteries = await SkillMastery.findAll({
    where: { enrollment_id: enrollmentId },
  });

  const masteryMap = new Map<string, SkillMastery>();
  for (const m of masteries) {
    masteryMap.set(m.skill_id, m);
  }

  let totalSkills = 0;
  let skillsStarted = 0;
  let skillsMastered = 0;
  let totalEffective = 0;

  const layers: LayerWithDomains[] = ontology.layers.map((layer) => {
    const domains: DomainWithSkills[] = layer.domains.map((domain) => {
      const skills: SkillWithMastery[] = domain.skills.map((skill) => {
        totalSkills++;
        const mastery = masteryMap.get(skill.id);
        const level = mastery?.proficiency_level || 0;
        const lastDemo = mastery?.last_demonstrated || null;
        const effectiveLevel = calculateDecay(lastDemo, level);
        const evidenceCount = mastery?.evidence_json?.length || 0;

        if (level > 0) skillsStarted++;
        if (effectiveLevel >= 4) skillsMastered++;
        totalEffective += effectiveLevel;

        return {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          proficiency_level: level,
          effective_level: effectiveLevel,
          last_demonstrated: lastDemo ? new Date(lastDemo).toISOString() : null,
          evidence_count: evidenceCount,
          decayed: effectiveLevel < level,
        };
      });

      const avgProf = skills.length > 0
        ? skills.reduce((sum, s) => sum + s.effective_level, 0) / skills.length
        : 0;

      return { id: domain.id, name: domain.name, skills, avg_proficiency: Math.round(avgProf * 10) / 10 };
    });

    const allSkills = domains.flatMap((d) => d.skills);
    const avgProf = allSkills.length > 0
      ? allSkills.reduce((sum, s) => sum + s.effective_level, 0) / allSkills.length
      : 0;

    return {
      id: layer.id,
      name: layer.name,
      description: layer.description,
      domains,
      avg_proficiency: Math.round(avgProf * 10) / 10,
    };
  });

  return {
    layers,
    overall_proficiency: totalSkills > 0 ? Math.round((totalEffective / (totalSkills * 5)) * 100) : 0,
    total_skills: totalSkills,
    skills_started: skillsStarted,
    skills_mastered: skillsMastered,
  };
}

export async function updateSkillMastery(
  enrollmentId: string,
  skillArea: string,
  lessonNumber: number,
  lessonId: string,
  score: number | null
): Promise<void> {
  const skillMap = lessonSkillMap as Record<string, Record<string, string[]>>;
  const areaMap = skillMap[skillArea];
  if (!areaMap) return;

  const skillIds = areaMap[String(lessonNumber)];
  if (!skillIds || skillIds.length === 0) return;

  const evidenceType = score != null ? 'assessment' : 'completion';
  const evidenceScore = score != null ? score : 100;

  for (const skillId of skillIds) {
    const [mastery] = await SkillMastery.findOrCreate({
      where: { enrollment_id: enrollmentId, skill_id: skillId },
      defaults: {
        enrollment_id: enrollmentId,
        skill_id: skillId,
        proficiency_level: 0,
        evidence_json: [],
      },
    });

    const evidence = mastery.evidence_json || [];
    evidence.push({
      lesson_id: lessonId,
      type: evidenceType,
      score: evidenceScore,
      date: new Date().toISOString(),
    });

    // Calculate new proficiency level based on evidence count and scores
    const avgScore = evidence.reduce((s: number, e: any) => s + (e.score || 0), 0) / evidence.length;
    let newLevel = mastery.proficiency_level;

    if (evidence.length >= 1 && avgScore >= 50 && newLevel < 1) newLevel = 1;
    if (evidence.length >= 2 && avgScore >= 60 && newLevel < 2) newLevel = 2;
    if (evidence.length >= 3 && avgScore >= 70 && newLevel < 3) newLevel = 3;
    if (evidence.length >= 4 && avgScore >= 80 && newLevel < 4) newLevel = 4;
    if (evidence.length >= 5 && avgScore >= 90 && newLevel < 5) newLevel = 5;

    await mastery.update({
      proficiency_level: newLevel,
      evidence_json: evidence,
      last_demonstrated: new Date(),
      updated_at: new Date(),
    });
  }
}

export async function getSkillGaps(enrollmentId: string): Promise<SkillWithMastery[]> {
  const genome = await getSkillGenome(enrollmentId);
  const gaps: SkillWithMastery[] = [];

  for (const layer of genome.layers) {
    for (const domain of layer.domains) {
      for (const skill of domain.skills) {
        if (skill.effective_level < 3) {
          gaps.push(skill);
        }
      }
    }
  }

  return gaps.sort((a, b) => a.effective_level - b.effective_level);
}
