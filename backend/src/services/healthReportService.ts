import { Op } from 'sequelize';
import { CurriculumModule, CurriculumLesson, MiniSection, PromptTemplate, SkillDefinition, Enrollment, LessonInstance } from '../models';
import ArtifactDefinition from '../models/ArtifactDefinition';
import VariableDefinition from '../models/VariableDefinition';
import SessionGate from '../models/SessionGate';
import { runIntegrityCheck } from './curriculumManagerService';
import { getBackfillStatus } from './backfillService';

interface Finding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  count?: number;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  counts: {
    modules: number;
    lessons: number;
    miniSections: number;
    promptTemplates: number;
    variableDefinitions: number;
    skillDefinitions: number;
    artifactDefinitions: number;
    enrollments: number;
    lessonInstances: number;
    sessionGates: number;
  };
  findings: Finding[];
  integrity: any | null;
  backfillStatus: any | null;
}

export async function generateHealthReport(): Promise<HealthReport> {
  const findings: Finding[] = [];

  // 1. Model counts
  const [modules, lessons, miniSections, promptTemplates, variableDefinitions,
    skillDefinitions, artifactDefinitions, enrollments, lessonInstances, sessionGates] =
    await Promise.all([
      CurriculumModule.count(),
      CurriculumLesson.count(),
      MiniSection.count(),
      PromptTemplate.count(),
      VariableDefinition.count(),
      SkillDefinition.count(),
      ArtifactDefinition.count(),
      Enrollment.count(),
      LessonInstance.count(),
      SessionGate.count(),
    ]);

  const counts = {
    modules, lessons, miniSections, promptTemplates, variableDefinitions,
    skillDefinitions, artifactDefinitions, enrollments, lessonInstances, sessionGates,
  };

  // 2. Configuration gap checks
  if (modules === 0) {
    findings.push({ severity: 'critical', category: 'Curriculum', message: 'No curriculum modules found. Seed data may not have run.' });
  }

  if (lessons === 0) {
    findings.push({ severity: 'critical', category: 'Curriculum', message: 'No curriculum lessons found.' });
  }

  // Lessons without mini-sections
  const allLessons = await CurriculumLesson.findAll({ attributes: ['id'] });
  const lessonsWithMS = await MiniSection.findAll({
    attributes: ['lesson_id'],
    where: { is_active: true },
    group: ['lesson_id'],
  });
  const lessonIdsWithMS = new Set(lessonsWithMS.map((ms: any) => ms.lesson_id));
  const lessonsWithoutMS = allLessons.filter(l => !lessonIdsWithMS.has(l.id)).length;
  if (lessonsWithoutMS > 0) {
    findings.push({
      severity: 'warning',
      category: 'Curriculum',
      message: `${lessonsWithoutMS} lessons have no active mini-sections configured.`,
      count: lessonsWithoutMS,
    });
  }

  // Mini-sections without any prompts
  const msWithoutPrompts = await MiniSection.count({
    where: {
      is_active: true,
      concept_prompt_template_id: { [Op.is]: null } as any,
      build_prompt_template_id: { [Op.is]: null } as any,
      concept_prompt_system: { [Op.is]: null } as any,
      build_prompt_system: { [Op.is]: null } as any,
      concept_prompt_user: { [Op.is]: null } as any,
      build_prompt_user: { [Op.is]: null } as any,
    },
  });
  if (msWithoutPrompts > 0) {
    findings.push({
      severity: 'warning',
      category: 'Prompts',
      message: `${msWithoutPrompts} active mini-sections have no prompts (inline or template).`,
      count: msWithoutPrompts,
    });
  }

  // Skill definitions check
  if (skillDefinitions === 0) {
    findings.push({ severity: 'warning', category: 'Skills', message: 'No skill definitions found. Skill ontology may not be seeded.' });
  }

  // Enrollments without lesson instances
  if (enrollments > 0 && lessonInstances === 0) {
    findings.push({
      severity: 'warning',
      category: 'Pipeline',
      message: 'Enrollments exist but no lesson instances found. Curriculum may not be initialized.',
    });
  }

  // 3. Run integrity check
  let integrity = null;
  try {
    integrity = await runIntegrityCheck();
    if (integrity?.issues?.length > 0) {
      findings.push({
        severity: 'warning',
        category: 'Integrity',
        message: `Integrity check found ${integrity.issues.length} issue(s).`,
        count: integrity.issues.length,
      });
    }
  } catch (err: any) {
    findings.push({ severity: 'warning', category: 'Integrity', message: `Integrity check failed: ${err.message}` });
  }

  // 4. Backfill status
  let backfillStatus = null;
  try {
    backfillStatus = await getBackfillStatus();
    if (backfillStatus?.withFKOnly > 0) {
      findings.push({
        severity: 'info',
        category: 'Prompts',
        message: `${backfillStatus.withFKOnly} mini-sections have FK-only prompts (not yet backfilled to inline).`,
        count: backfillStatus.withFKOnly,
      });
    }
  } catch (err: any) {
    findings.push({ severity: 'info', category: 'Backfill', message: `Backfill status unavailable: ${err.message}` });
  }

  // Determine overall status
  const hasCritical = findings.some(f => f.severity === 'critical');
  const hasWarning = findings.some(f => f.severity === 'warning');
  const status = hasCritical ? 'critical' : hasWarning ? 'degraded' : 'healthy';

  return {
    status,
    timestamp: new Date().toISOString(),
    counts,
    findings,
    integrity,
    backfillStatus,
  };
}
