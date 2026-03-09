import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import { PromptTemplate } from '../models';

interface QualityCategory {
  name: string;
  score: number;
  maxScore: number;
  details: string[];
}

interface QualityResult {
  miniSectionId: string;
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: QualityCategory[];
}

// Which inline prompt fields are required per type
const REQUIRED_PROMPTS: Record<string, string[]> = {
  executive_reality_check: ['concept_prompt_user'],
  ai_strategy: ['concept_prompt_user'],
  prompt_template: ['concept_prompt_user', 'build_prompt_user'],
  implementation_task: ['build_prompt_user'],
  knowledge_check: ['kc_prompt_user'],
};

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}

export async function scoreMiniSection(id: string): Promise<QualityResult> {
  const ms = await MiniSection.findByPk(id, {
    include: [
      { model: PromptTemplate, as: 'conceptPrompt', required: false },
      { model: PromptTemplate, as: 'buildPrompt', required: false },
      { model: PromptTemplate, as: 'mentorPrompt', required: false },
    ],
  });
  if (!ms) throw new Error('Mini-section not found');

  const categories: QualityCategory[] = [];

  // 1. Prompt Completeness (25 points)
  const promptCat = scorePromptCompleteness(ms);
  categories.push(promptCat);

  // 2. Variable Integrity (20 points)
  const varCat = await scoreVariableIntegrity(ms);
  categories.push(varCat);

  // 3. Skill Mapping (15 points)
  const skillCat = scoreSkillMapping(ms);
  categories.push(skillCat);

  // 4. Artifact Configuration (15 points)
  const artifactCat = scoreArtifactConfig(ms);
  categories.push(artifactCat);

  // 5. Validation Coverage (15 points)
  const validationCat = scoreValidationCoverage(ms);
  categories.push(validationCat);

  // 6. Testing Readiness (10 points)
  const testCat = scoreTestingReadiness(ms);
  categories.push(testCat);

  const overall = Math.round(categories.reduce((sum, c) => sum + c.score, 0));

  // Store score on the mini-section
  await ms.update({
    quality_score: overall,
    quality_details: { overall, grade: getGrade(overall), categories },
    last_validated_at: new Date(),
  } as any);

  return { miniSectionId: id, overall, grade: getGrade(overall), categories };
}

function scorePromptCompleteness(ms: MiniSection): QualityCategory {
  const maxScore = 25;
  const details: string[] = [];
  const required = REQUIRED_PROMPTS[ms.mini_section_type] || [];

  if (required.length === 0) {
    return { name: 'Prompt Completeness', score: maxScore, maxScore, details: ['No prompts required for this type'] };
  }

  let filled = 0;
  for (const field of required) {
    const inlineValue = (ms as any)[field] as string;
    const fkField = field.replace('_user', '_template_id').replace('concept_prompt', 'concept_prompt').replace('build_prompt', 'build_prompt').replace('mentor_prompt', 'mentor_prompt');
    const fkValue = field.startsWith('kc_') || field.startsWith('reflection_') ? null : (ms as any)[fkField.replace('_user_template_id', '_template_id')];

    if (inlineValue && inlineValue.length >= 50) {
      filled++;
    } else if (inlineValue) {
      filled += 0.5;
      details.push(`${field} is too short (${inlineValue.length} chars, min 50)`);
    } else if (fkValue) {
      filled += 0.7; // FK reference exists but not inline
      details.push(`${field} uses FK template only (not inline)`);
    } else {
      details.push(`${field} is missing`);
    }
  }

  const score = Math.round((filled / required.length) * maxScore);
  return { name: 'Prompt Completeness', score: Math.min(score, maxScore), maxScore, details };
}

async function scoreVariableIntegrity(ms: MiniSection): Promise<QualityCategory> {
  const maxScore = 20;
  const details: string[] = [];
  let score = maxScore;

  const referenced = ms.associated_variable_keys || [];
  const created = ms.creates_variable_keys || [];

  if (referenced.length === 0 && created.length === 0) {
    return { name: 'Variable Integrity', score: maxScore, maxScore, details: ['No variables referenced or created'] };
  }

  // Check all referenced vars have definitions
  if (referenced.length > 0) {
    const defs = await VariableDefinition.findAll({
      where: { variable_key: referenced },
    });
    const defKeys = new Set(defs.map(d => d.variable_key));
    const missing = referenced.filter(k => !defKeys.has(k));
    if (missing.length > 0) {
      score -= Math.min(10, missing.length * 3);
      details.push(`Missing definitions: ${missing.join(', ')}`);
    }
  }

  // Check created vars have definitions
  if (created.length > 0) {
    const defs = await VariableDefinition.findAll({
      where: { variable_key: created },
    });
    const defKeys = new Set(defs.map(d => d.variable_key));
    const missing = created.filter(k => !defKeys.has(k));
    if (missing.length > 0) {
      score -= Math.min(5, missing.length * 2);
      details.push(`Created vars without definitions: ${missing.join(', ')}`);
    }
  }

  return { name: 'Variable Integrity', score: Math.max(0, score), maxScore, details };
}

function scoreSkillMapping(ms: MiniSection): QualityCategory {
  const maxScore = 15;
  const details: string[] = [];

  // Knowledge check type should have skills
  if (ms.mini_section_type === 'knowledge_check') {
    if (!ms.associated_skill_ids?.length) {
      details.push('No skills mapped to knowledge check');
      return { name: 'Skill Mapping', score: 0, maxScore, details };
    }
    return { name: 'Skill Mapping', score: maxScore, maxScore, details: [`${ms.associated_skill_ids.length} skill(s) mapped`] };
  }

  // Other types: having skills is good but not required
  if (ms.associated_skill_ids?.length) {
    return { name: 'Skill Mapping', score: maxScore, maxScore, details: [`${ms.associated_skill_ids.length} skill(s) mapped`] };
  }

  // No skills — partial score
  return { name: 'Skill Mapping', score: 10, maxScore, details: ['No skills mapped (optional for this type)'] };
}

function scoreArtifactConfig(ms: MiniSection): QualityCategory {
  const maxScore = 15;

  if (ms.mini_section_type !== 'implementation_task') {
    return { name: 'Artifact Configuration', score: maxScore, maxScore, details: ['N/A for this type'] };
  }

  const details: string[] = [];
  if (!ms.creates_artifact_ids?.length) {
    details.push('No artifacts linked to implementation task');
    return { name: 'Artifact Configuration', score: 0, maxScore, details };
  }

  return { name: 'Artifact Configuration', score: maxScore, maxScore, details: [`${ms.creates_artifact_ids.length} artifact(s) linked`] };
}

function scoreValidationCoverage(ms: MiniSection): QualityCategory {
  const maxScore = 15;
  const details: string[] = [];
  let score = maxScore;

  if (!ms.title) { score -= 3; details.push('Missing title'); }
  if (!ms.description) { score -= 3; details.push('Missing description'); }
  if (!ms.mini_section_type) { score -= 5; details.push('Missing type'); }

  if (ms.mini_section_type === 'knowledge_check' && !ms.knowledge_check_config?.enabled) {
    score -= 5;
    details.push('Knowledge check config not enabled');
  }

  if (details.length === 0) details.push('All basic validation checks pass');
  return { name: 'Validation Coverage', score: Math.max(0, score), maxScore, details };
}

function scoreTestingReadiness(ms: MiniSection): QualityCategory {
  const maxScore = 10;
  const details: string[] = [];
  let score = maxScore;

  // Check if we can build a composite prompt
  const hasAnyPrompt = !!(
    (ms as any).concept_prompt_user || (ms as any).build_prompt_user ||
    (ms as any).mentor_prompt_user || (ms as any).kc_prompt_user ||
    ms.concept_prompt_template_id || ms.build_prompt_template_id || ms.mentor_prompt_template_id
  );

  if (!hasAnyPrompt) {
    score -= 5;
    details.push('No prompts available for composite prompt building');
  }

  if (!ms.description) {
    score -= 2;
    details.push('Missing description for context');
  }

  const settingsJson = ms.settings_json || {};
  if (!settingsJson.learning_goal) {
    score -= 3;
    details.push('Missing learning goal');
  }

  if (details.length === 0) details.push('Ready for testing');
  return { name: 'Testing Readiness', score: Math.max(0, score), maxScore, details };
}

export async function scoreLessonMiniSections(lessonId: string): Promise<{ lessonId: string; scores: QualityResult[]; average: number }> {
  const miniSections = await MiniSection.findAll({ where: { lesson_id: lessonId, is_active: true } });
  const scores: QualityResult[] = [];
  for (const ms of miniSections) {
    scores.push(await scoreMiniSection(ms.id));
  }
  const average = scores.length > 0 ? Math.round(scores.reduce((s, r) => s + r.overall, 0) / scores.length) : 0;
  return { lessonId, scores, average };
}

export async function scoreAllMiniSections(): Promise<{ total: number; scored: number; average: number; gradeDistribution: Record<string, number> }> {
  const all = await MiniSection.findAll({ where: { is_active: true } });
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let totalScore = 0;

  for (const ms of all) {
    const result = await scoreMiniSection(ms.id);
    totalScore += result.overall;
    gradeDistribution[result.grade]++;
  }

  return {
    total: all.length,
    scored: all.length,
    average: all.length > 0 ? Math.round(totalScore / all.length) : 0,
    gradeDistribution,
  };
}
