import MiniSection from '../models/MiniSection';
import VariableDefinition from '../models/VariableDefinition';
import { PromptTemplate, ArtifactDefinition, SkillDefinition } from '../models';

interface AIReadinessStage {
  ready: boolean;
  issues: string[];
}

interface AIReadinessResult {
  lessonId: string;
  readinessScore: number;
  stages: {
    promptExecution: AIReadinessStage;
    artifactCreation: AIReadinessStage;
    knowledgeScoring: AIReadinessStage;
    skillUpdates: AIReadinessStage;
    variableFlow: AIReadinessStage;
  };
  blockers: string[];
  recommendations: string[];
}

export async function checkAIReadiness(lessonId: string): Promise<AIReadinessResult> {
  const miniSections = await MiniSection.findAll({
    where: { lesson_id: lessonId, is_active: true },
    include: [
      { model: PromptTemplate, as: 'conceptPrompt', required: false },
      { model: PromptTemplate, as: 'buildPrompt', required: false },
      { model: PromptTemplate, as: 'mentorPrompt', required: false },
    ],
    order: [['mini_section_order', 'ASC']],
  });

  const blockers: string[] = [];
  const recommendations: string[] = [];

  // Stage 1: Prompt Execution Readiness
  const promptStage = checkPromptExecution(miniSections);
  if (!promptStage.ready) blockers.push(...promptStage.issues.filter(i => i.startsWith('BLOCKER:')));

  // Stage 2: Artifact Creation Readiness
  const artifactStage = await checkArtifactCreation(miniSections);

  // Stage 3: Knowledge Scoring Readiness
  const kcStage = checkKnowledgeScoring(miniSections);

  // Stage 4: Skill Updates Readiness
  const skillStage = await checkSkillUpdates(miniSections);

  // Stage 5: Variable Flow Readiness
  const varStage = await checkVariableFlow(miniSections);

  // Calculate readiness score
  const stages = [promptStage, artifactStage, kcStage, skillStage, varStage];
  const readyCount = stages.filter(s => s.ready).length;
  const readinessScore = Math.round((readyCount / stages.length) * 100);

  // Generate recommendations
  if (!promptStage.ready) recommendations.push('Configure inline prompts for all mini-sections');
  if (!artifactStage.ready) recommendations.push('Link artifact definitions to implementation tasks');
  if (!kcStage.ready) recommendations.push('Enable knowledge check configuration');
  if (!skillStage.ready) recommendations.push('Map skills to knowledge check mini-sections');
  if (!varStage.ready) recommendations.push('Resolve variable ordering and definition issues');

  return {
    lessonId,
    readinessScore,
    stages: {
      promptExecution: promptStage,
      artifactCreation: artifactStage,
      knowledgeScoring: kcStage,
      skillUpdates: skillStage,
      variableFlow: varStage,
    },
    blockers,
    recommendations,
  };
}

function checkPromptExecution(miniSections: MiniSection[]): AIReadinessStage {
  const issues: string[] = [];

  if (miniSections.length === 0) {
    return { ready: false, issues: ['BLOCKER: No mini-sections found'] };
  }

  for (const ms of miniSections) {
    const hasInlinePrompt = !!(
      (ms as any).concept_prompt_user || (ms as any).build_prompt_user ||
      (ms as any).mentor_prompt_user || (ms as any).kc_prompt_user
    );
    const hasFKPrompt = !!(
      ms.concept_prompt_template_id || ms.build_prompt_template_id || ms.mentor_prompt_template_id
    );

    if (!hasInlinePrompt && !hasFKPrompt) {
      issues.push(`BLOCKER: ${ms.title} (order ${ms.mini_section_order}) has no prompts configured`);
    }
  }

  return { ready: issues.length === 0, issues };
}

async function checkArtifactCreation(miniSections: MiniSection[]): Promise<AIReadinessStage> {
  const issues: string[] = [];
  const implTasks = miniSections.filter(ms => ms.mini_section_type === 'implementation_task');

  for (const ms of implTasks) {
    if (!ms.creates_artifact_ids?.length) {
      issues.push(`${ms.title}: No artifacts linked`);
      continue;
    }
    const arts = await ArtifactDefinition.findAll({ where: { id: ms.creates_artifact_ids } });
    const foundIds = new Set(arts.map(a => a.id));
    const missing = ms.creates_artifact_ids.filter(id => !foundIds.has(id));
    if (missing.length > 0) {
      issues.push(`${ms.title}: ${missing.length} artifact reference(s) broken`);
    }
  }

  // No impl tasks = N/A, which is ready
  if (implTasks.length === 0) {
    return { ready: true, issues: ['No implementation tasks in this lesson'] };
  }

  return { ready: issues.length === 0, issues };
}

function checkKnowledgeScoring(miniSections: MiniSection[]): AIReadinessStage {
  const issues: string[] = [];
  const kcSections = miniSections.filter(ms => ms.mini_section_type === 'knowledge_check');

  for (const ms of kcSections) {
    if (!ms.knowledge_check_config?.enabled) {
      issues.push(`${ms.title}: Knowledge check not enabled`);
    }
    if (!ms.knowledge_check_config?.question_count || ms.knowledge_check_config.question_count < 1) {
      issues.push(`${ms.title}: Question count is 0 or not set`);
    }
  }

  if (kcSections.length === 0) {
    return { ready: true, issues: ['No knowledge check sections in this lesson'] };
  }

  return { ready: issues.length === 0, issues };
}

async function checkSkillUpdates(miniSections: MiniSection[]): Promise<AIReadinessStage> {
  const issues: string[] = [];
  const allSkillIds = new Set<string>();

  for (const ms of miniSections) {
    if (ms.associated_skill_ids?.length) {
      ms.associated_skill_ids.forEach(id => allSkillIds.add(id));
    }
  }

  if (allSkillIds.size === 0) {
    return { ready: true, issues: ['No skills mapped to any mini-section'] };
  }

  const skills = await SkillDefinition.findAll({ where: { skill_id: [...allSkillIds] } });
  const foundIds = new Set(skills.map(s => s.skill_id));
  const missing = [...allSkillIds].filter(id => !foundIds.has(id));

  if (missing.length > 0) {
    issues.push(`${missing.length} skill reference(s) not found: ${missing.join(', ')}`);
  }

  return { ready: issues.length === 0, issues };
}

async function checkVariableFlow(miniSections: MiniSection[]): Promise<AIReadinessStage> {
  const issues: string[] = [];

  // Get system variables
  const systemVars = await VariableDefinition.findAll({ where: { source_type: 'system', is_active: true } });
  const available = new Set(systemVars.map(v => v.variable_key));

  // Walk through mini-sections in order
  for (const ms of miniSections) {
    const referenced = ms.associated_variable_keys || [];
    for (const key of referenced) {
      if (!available.has(key)) {
        // Check if it exists anywhere
        const def = await VariableDefinition.findOne({ where: { variable_key: key } });
        if (!def) {
          issues.push(`${ms.title}: Variable "${key}" not defined anywhere`);
        } else {
          issues.push(`${ms.title}: Variable "${key}" not available at order ${ms.mini_section_order} (created later)`);
        }
      }
    }
    // Add created vars for subsequent sections
    (ms.creates_variable_keys || []).forEach(k => available.add(k));
  }

  return { ready: issues.length === 0, issues };
}
