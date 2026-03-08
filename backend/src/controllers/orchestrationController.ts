import { Request, Response } from 'express';
import * as promptService from '../services/promptService';
import * as artifactService from '../services/artifactService';
import * as variableService from '../services/variableService';
import * as orchestrationService from '../services/orchestrationService';
import * as promptValidationService from '../services/promptValidationService';
import * as curriculumManagerService from '../services/curriculumManagerService';
import { Cohort, SectionConfig, CurriculumModule, CurriculumLesson, LiveSession, SkillDefinition, SessionGate } from '../models';

// --- Prompt Template CRUD ---

export async function handleListPromptTemplates(req: Request, res: Response) {
  try {
    const prompt_type = req.query.prompt_type as string | undefined;
    const is_active = req.query.is_active as string | undefined;
    const templates = await promptService.listPromptTemplates({
      prompt_type,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    });
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetPromptTemplate(req: Request, res: Response) {
  try {
    const template = await promptService.getPromptTemplate(req.params.id as string);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreatePromptTemplate(req: Request, res: Response) {
  try {
    const template = await promptService.createPromptTemplate(req.body);
    res.status(201).json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdatePromptTemplate(req: Request, res: Response) {
  try {
    const template = await promptService.updatePromptTemplate(req.params.id as string, req.body);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeletePromptTemplate(req: Request, res: Response) {
  try {
    const deleted = await promptService.deletePromptTemplate(req.params.id as string);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handlePreviewPromptTemplate(req: Request, res: Response) {
  try {
    const result = await promptService.previewPrompt(req.params.id as string, req.body.variables || {});
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Section Config CRUD ---

export async function handleListSections(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId as string;
    const sections = await SectionConfig.findAll({
      where: { session_id: sessionId },
      order: [['section_order', 'ASC']],
    });
    res.json(sections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetSection(req: Request, res: Response) {
  try {
    const section = await SectionConfig.findByPk(req.params.id as string);
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreateSection(req: Request, res: Response) {
  try {
    const section = await SectionConfig.create({
      ...req.body,
      session_id: req.params.sessionId as string,
    });
    res.status(201).json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateSection(req: Request, res: Response) {
  try {
    const section = await SectionConfig.findByPk(req.params.id as string);
    if (!section) return res.status(404).json({ error: 'Not found' });
    await section.update(req.body);
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeleteSection(req: Request, res: Response) {
  try {
    const count = await SectionConfig.destroy({ where: { id: req.params.id as string } });
    if (!count) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Artifact Definition CRUD ---

export async function handleListArtifacts(req: Request, res: Response) {
  try {
    const artifacts = await artifactService.listArtifactDefinitions(req.params.sessionId as string);
    res.json(artifacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetArtifact(req: Request, res: Response) {
  try {
    const artifact = await artifactService.getArtifactDefinition(req.params.id as string);
    if (!artifact) return res.status(404).json({ error: 'Not found' });
    res.json(artifact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreateArtifact(req: Request, res: Response) {
  try {
    const artifact = await artifactService.createArtifactDefinition({
      ...req.body,
      session_id: req.params.sessionId as string,
    });
    res.status(201).json(artifact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateArtifact(req: Request, res: Response) {
  try {
    const artifact = await artifactService.updateArtifactDefinition(req.params.id as string, req.body);
    if (!artifact) return res.status(404).json({ error: 'Not found' });
    res.json(artifact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeleteArtifact(req: Request, res: Response) {
  try {
    const deleted = await artifactService.deleteArtifactDefinition(req.params.id as string);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Variable Store ---

export async function handleGetVariables(req: Request, res: Response) {
  try {
    const variables = await variableService.getAllVariables(req.params.enrollmentId as string);
    res.json(variables);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetVariableGraph(req: Request, res: Response) {
  try {
    const enrollmentId = req.params.enrollmentId as string;
    const graph = await variableService.getVariableDependencyGraph(enrollmentId);
    res.json(graph);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Session Flow ---

export async function handleGetSessionFlow(req: Request, res: Response) {
  try {
    const flow = await orchestrationService.getSessionFlow(req.params.cohortId as string);
    res.json(flow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetSessionDetail(req: Request, res: Response) {
  try {
    const session = await orchestrationService.getSessionWithSections(req.params.sessionId as string);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetDashboard(req: Request, res: Response) {
  try {
    const dashboard = await orchestrationService.getOrchestrationDashboard(req.params.cohortId as string);
    res.json(dashboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Artifact Status for Enrollment ---

export async function handleGetArtifactStatus(req: Request, res: Response) {
  try {
    const status = await artifactService.getArtifactStatus(
      req.params.enrollmentId as string,
      req.params.sessionId as string
    );
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Program-Wide Endpoints (no cohort dependency) ---

// --- Lesson Construction Update ---

export async function handleGetLesson(req: Request, res: Response) {
  try {
    const lesson = await CurriculumLesson.findByPk(req.params.id as string);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateLesson(req: Request, res: Response) {
  try {
    const lesson = await CurriculumLesson.findByPk(req.params.id as string);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    const allowedFields = [
      'learning_goal', 'mandatory', 'build_phase_flag', 'presentation_phase_flag',
      'associated_session_id', 'required_min_completion_before_session', 'sort_order',
    ];
    const updates: any = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    await lesson.update(updates);
    res.json(lesson);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateSessionFields(req: Request, res: Response) {
  try {
    const session = await LiveSession.findByPk(req.params.id as string);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const allowedFields = [
      'minimum_section_completion_pct', 'required_variable_keys',
      'email_trigger_config', 'reminder_trigger_config',
    ];
    const updates: any = {};
    for (const f of allowedFields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    await session.update(updates);
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

async function getFirstCohortId(): Promise<string | null> {
  const cohort = await Cohort.findOne({ order: [['created_at', 'ASC']] });
  return cohort ? cohort.id : null;
}

export async function handleGetProgramModules(req: Request, res: Response) {
  try {
    const cohortId = await getFirstCohortId();
    if (!cohortId) return res.json([]);
    const modules = await CurriculumModule.findAll({
      where: { cohort_id: cohortId },
      include: [{ model: CurriculumLesson, as: 'lessons' }],
      order: [['module_number', 'ASC'], [{ model: CurriculumLesson, as: 'lessons' }, 'lesson_number', 'ASC']],
    });
    res.json(modules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetProgramSessions(req: Request, res: Response) {
  try {
    const cohortId = await getFirstCohortId();
    if (!cohortId) return res.json([]);
    const sessions = await LiveSession.findAll({
      where: { cohort_id: cohortId },
      order: [['session_number', 'ASC']],
    });
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetProgramFlow(req: Request, res: Response) {
  try {
    const cohortId = await getFirstCohortId();
    if (!cohortId) return res.json({ sessions: [] });
    const flow = await orchestrationService.getSessionFlow(cohortId);
    res.json(flow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetProgramSkills(req: Request, res: Response) {
  try {
    const skills = await SkillDefinition.findAll({
      order: [['layer_id', 'ASC'], ['domain_id', 'ASC'], ['skill_id', 'ASC']],
    });
    // Group by layer_id -> domain_id for hierarchical display
    const grouped: Record<string, { layer_id: string; domains: Record<string, any[]> }> = {};
    for (const s of skills) {
      const plain = (s as any).toJSON ? (s as any).toJSON() : s;
      if (!grouped[plain.layer_id]) grouped[plain.layer_id] = { layer_id: plain.layer_id, domains: {} };
      if (!grouped[plain.layer_id].domains[plain.domain_id]) grouped[plain.layer_id].domains[plain.domain_id] = [];
      grouped[plain.layer_id].domains[plain.domain_id].push(plain);
    }
    res.json({ skills, grouped });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetProgramGates(req: Request, res: Response) {
  try {
    const cohortId = await getFirstCohortId();
    if (!cohortId) return res.json([]);
    // Get all sessions for this cohort, then all gates for those sessions
    const sessions = await LiveSession.findAll({ where: { cohort_id: cohortId }, attributes: ['id'] });
    const sessionIds = sessions.map(s => s.id);
    if (sessionIds.length === 0) return res.json([]);
    const { Op } = require('sequelize');
    const gates = await SessionGate.findAll({
      where: { session_id: { [Op.in]: sessionIds } },
      include: [
        { model: LiveSession, as: 'session', attributes: ['id', 'session_number', 'title'] },
        { model: CurriculumModule, as: 'module', attributes: ['id', 'module_number', 'title'], required: false },
        { model: CurriculumLesson, as: 'lesson', attributes: ['id', 'lesson_number', 'title'], required: false },
      ],
      order: [['created_at', 'ASC']],
    });
    res.json(gates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Prompt Validation ---

export async function handleValidatePrompt(req: Request, res: Response) {
  try {
    const result = await promptValidationService.validateCompositePrompt(
      req.params.lessonId as string,
      req.params.enrollmentId as string
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handlePreviewPrompt(req: Request, res: Response) {
  try {
    const result = await promptValidationService.dryRunCompositePrompt(
      req.params.lessonId as string,
      req.params.enrollmentId as string
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Curriculum Manager ---

export async function handleIntegrityCheck(req: Request, res: Response) {
  try {
    const report = await curriculumManagerService.runIntegrityCheck();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDryRunSection(req: Request, res: Response) {
  try {
    const result = await curriculumManagerService.dryRunSectionBuild(req.params.lessonId as string);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Route Audit ---

export async function handleRouteAudit(req: Request, res: Response) {
  try {
    const { generateRouteAudit } = await import('../utils/routeAudit');
    const audit = generateRouteAudit(req.app);
    res.json(audit);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
