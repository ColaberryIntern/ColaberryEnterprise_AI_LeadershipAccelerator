import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListPrograms, handleGetProgram, handleCreateProgram,
  handleUpdateProgram, handleDeleteProgram, handleCloneProgram,
} from '../../controllers/programBlueprintController';
import {
  handleListMiniSections, handleGetMiniSection, handleCreateMiniSection,
  handleUpdateMiniSection, handleDeleteMiniSection, handleReorderMiniSections,
  handleGetVariableMap,
} from '../../controllers/miniSectionController';
import {
  handleListVariableDefinitions, handleGetVariableDefinition, handleCreateVariableDefinition,
  handleUpdateVariableDefinition, handleDeleteVariableDefinition,
} from '../../controllers/variableDefinitionController';
import {
  handleListChecklistItems, handleCreateChecklistItem,
  handleUpdateChecklistItem, handleDeleteChecklistItem,
} from '../../controllers/sessionChecklistController';
import {
  handleListPromptTemplates, handleGetPromptTemplate, handleCreatePromptTemplate,
  handleUpdatePromptTemplate, handleDeletePromptTemplate, handlePreviewPromptTemplate,
  handleListSections as handleListOrchSections, handleGetSection as handleGetOrchSection,
  handleCreateSection as handleCreateOrchSection, handleUpdateSection as handleUpdateOrchSection,
  handleDeleteSection as handleDeleteOrchSection,
  handleListArtifacts as handleListOrchArtifacts, handleGetArtifact, handleCreateArtifact,
  handleUpdateArtifact, handleDeleteArtifact,
  handleGetVariables, handleGetVariableGraph,
  handleGetSessionFlow, handleGetSessionDetail as handleGetOrchSessionDetail,
  handleGetDashboard as handleGetOrchDashboard, handleGetArtifactStatus,
  handleGetProgramModules, handleGetProgramSessions, handleGetProgramFlow,
  handleGetProgramSkills, handleGetProgramGates,
  handleGetLesson, handleUpdateLesson, handleUpdateSessionFields,
  handleValidatePrompt, handlePreviewPrompt,
  handleIntegrityCheck, handleDryRunSection,
  handleRouteAudit,
} from '../../controllers/orchestrationController';
import { SkillDefinition, CurriculumModule, CurriculumLesson, MiniSection } from '../../models';
import { runIntegrityCheck, runFinalValidation } from '../../services/curriculumManagerService';
import { scoreMiniSection, scoreLessonMiniSections, scoreAllMiniSections } from '../../services/qualityScoringService';
import { getSuggestions } from '../../services/suggestionService';
import { autoRepairMiniSection, autoRepairLesson, autoRepairAll } from '../../services/autoRepairService';
import { extensiveCheckMiniSection, extensiveCheckLesson, extensiveCheckAll, checkPreviewConfidence } from '../../services/extensiveCheckService';
import { checkAIReadiness } from '../../services/aiReadinessService';
import { backfillInlinePrompts, getBackfillStatus } from '../../services/backfillService';
import { deepReconcile } from '../../services/deepReconciliationService';
import { simulateContentGeneration, listSimulations, deleteSimulation } from '../../services/testSimulationService';
import { runPreflight } from '../../utils/preflightCheck';
import { generateArchitectureDoc, generateApiDoc } from '../../utils/docGenerator';
import { scanFrontendApiCalls } from '../../utils/linkScanner';
import { getSystemStatus, createSnapshot, listSnapshots, rollbackToSnapshot } from '../../services/managementService';
import * as analytics from '../../services/analyticsService';
import { generateHealthReport } from '../../services/healthReportService';
import OrchestrationHealth from '../../models/OrchestrationHealth';
import AiAgent from '../../models/AiAgent';
import { Op } from 'sequelize';
import { runOrchestrationHealth } from '../../services/aiOrchestrator';

const router = Router();

// --- Program Blueprint Routes ---
router.get('/api/admin/orchestration/programs', requireAdmin, handleListPrograms);
router.post('/api/admin/orchestration/programs', requireAdmin, handleCreateProgram);
router.get('/api/admin/orchestration/programs/:id', requireAdmin, handleGetProgram);
router.put('/api/admin/orchestration/programs/:id', requireAdmin, handleUpdateProgram);
router.delete('/api/admin/orchestration/programs/:id', requireAdmin, handleDeleteProgram);
router.post('/api/admin/orchestration/programs/:id/clone', requireAdmin, handleCloneProgram);

// --- Mini-Section Routes ---
router.get('/api/admin/orchestration/lessons/:lessonId/mini-sections', requireAdmin, handleListMiniSections);
router.post('/api/admin/orchestration/lessons/:lessonId/mini-sections', requireAdmin, handleCreateMiniSection);
router.put('/api/admin/orchestration/lessons/:lessonId/mini-sections/reorder', requireAdmin, handleReorderMiniSections);
router.get('/api/admin/orchestration/mini-sections/:id', requireAdmin, handleGetMiniSection);
router.put('/api/admin/orchestration/mini-sections/:id', requireAdmin, handleUpdateMiniSection);
router.delete('/api/admin/orchestration/mini-sections/:id', requireAdmin, handleDeleteMiniSection);
router.get('/api/admin/orchestration/lessons/:lessonId/variable-map', requireAdmin, handleGetVariableMap);

// Skill Definitions CRUD (with field whitelisting)
router.post('/api/admin/orchestration/skills', requireAdmin, async (req, res) => {
  try {
    const { skill_id, name, description, layer_id, domain_id, weights, mastery_threshold, is_active } = req.body;
    const skill = await SkillDefinition.create({ id: crypto.randomUUID(), skill_id, name, description, layer_id, domain_id, weights, mastery_threshold, is_active });
    res.status(201).json(skill);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
router.put('/api/admin/orchestration/skills/:id', requireAdmin, async (req, res) => {
  try {
    const skill = await SkillDefinition.findByPk(req.params.id as string);
    if (!skill) { res.status(404).json({ error: 'Not found' }); return; }
    const { skill_id, name, description, layer_id, domain_id, weights, mastery_threshold, is_active } = req.body;
    await skill.update({ skill_id, name, description, layer_id, domain_id, weights, mastery_threshold, is_active });
    res.json(skill);
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});
router.delete('/api/admin/orchestration/skills/:id', requireAdmin, async (req, res) => {
  try {
    const skill = await SkillDefinition.findByPk(req.params.id as string);
    if (!skill) { res.status(404).json({ error: 'Not found' }); return; }
    await skill.destroy();
    res.json({ deleted: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Bulk Curriculum Operations
router.get('/api/admin/orchestration/bulk/curriculum-matrix', requireAdmin, async (_req, res) => {
  try {
    const modules = await CurriculumModule.findAll({
      include: [{
        model: CurriculumLesson,
        as: 'lessons',
        include: [{
          model: MiniSection,
          as: 'miniSections',
          where: { is_active: true },
          required: false,
          attributes: ['id', 'mini_section_type', 'title', 'mini_section_order',
            'associated_skill_ids', 'associated_variable_keys', 'creates_variable_keys',
            'creates_artifact_ids', 'concept_prompt_template_id', 'build_prompt_template_id',
            'quality_score', 'last_validated_at', 'concept_prompt_system', 'build_prompt_system'],
        }],
      }],
      order: [['module_number', 'ASC'], [{ model: CurriculumLesson, as: 'lessons' }, 'lesson_number', 'ASC']],
    });

    const matrix = [];
    for (const mod of modules) {
      for (const lesson of (mod as any).lessons || []) {
        const miniSections = lesson.miniSections || [];
        const types = new Set(miniSections.map((ms: any) => ms.mini_section_type));
        const hasPrompts = miniSections.some((ms: any) => ms.concept_prompt_template_id || ms.build_prompt_template_id || ms.concept_prompt_system || ms.build_prompt_system);
        const hasSkills = miniSections.some((ms: any) => ms.associated_skill_ids?.length > 0);
        const hasVars = miniSections.some((ms: any) => ms.associated_variable_keys?.length > 0 || ms.creates_variable_keys?.length > 0);

        let status: 'complete' | 'partial' | 'empty' = 'empty';
        if (miniSections.length >= 5 && types.size >= 5) status = 'complete';
        else if (miniSections.length > 0) status = 'partial';

        const warnings: string[] = [];
        if (!types.has('executive_reality_check')) warnings.push('Missing executive_reality_check');
        if (!types.has('ai_strategy')) warnings.push('Missing ai_strategy');
        if (!types.has('prompt_template')) warnings.push('Missing prompt_template');
        if (!types.has('implementation_task')) warnings.push('Missing implementation_task');
        if (!types.has('knowledge_check')) warnings.push('Missing knowledge_check');

        const qualityScores = miniSections.map((ms: any) => ms.quality_score).filter((s: any) => s != null);
        const avgQualityScore = qualityScores.length > 0 ? Math.round(qualityScores.reduce((a: number, b: number) => a + b, 0) / qualityScores.length) : null;

        matrix.push({
          moduleId: mod.id,
          moduleNumber: (mod as any).module_number,
          moduleTitle: (mod as any).title,
          lessonId: lesson.id,
          lessonNumber: lesson.lesson_number,
          lessonTitle: lesson.title,
          miniSectionCount: miniSections.length,
          types: Object.fromEntries([...types].map(t => [t, miniSections.filter((ms: any) => ms.mini_section_type === t).length])),
          hasPrompts,
          hasSkills,
          hasVars,
          status,
          warnings,
          avgQualityScore,
          miniSectionScores: miniSections.map((ms: any) => ({ id: ms.id, title: ms.title, score: ms.quality_score })),
        });
      }
    }
    res.json(matrix);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/orchestration/bulk/validate-all', requireAdmin, async (_req, res) => {
  try {
    const result = await runIntegrityCheck();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Quality Scoring, Suggestions, Auto-Repair, Diagnostics Routes ---
router.get('/api/admin/orchestration/mini-sections/:id/quality', requireAdmin, async (req, res) => {
  try {
    const result = await scoreMiniSection(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/lessons/:lessonId/quality', requireAdmin, async (req, res) => {
  try {
    const result = await scoreLessonMiniSections(req.params.lessonId as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/bulk/quality-scan', requireAdmin, async (_req, res) => {
  try {
    const result = await scoreAllMiniSections();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/mini-sections/:id/suggestions', requireAdmin, async (req, res) => {
  try {
    const result = await getSuggestions(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/mini-sections/:id/auto-repair', requireAdmin, async (req, res) => {
  try {
    const result = await autoRepairMiniSection(req.params.id as string, req.body?.dryRun === true);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/lessons/:lessonId/auto-repair', requireAdmin, async (req, res) => {
  try {
    const result = await autoRepairLesson(req.params.lessonId as string, req.body?.dryRun === true);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/bulk/auto-repair-all', requireAdmin, async (req, res) => {
  try {
    const result = await autoRepairAll(req.body?.dryRun === true);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/mini-sections/:id/extensive-check', requireAdmin, async (req, res) => {
  try {
    const result = await extensiveCheckMiniSection(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/lessons/:lessonId/extensive-check', requireAdmin, async (req, res) => {
  try {
    const result = await extensiveCheckLesson(req.params.lessonId as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/bulk/run-all-diagnostics', requireAdmin, async (_req, res) => {
  try {
    const result = await extensiveCheckAll();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/mini-sections/:id/preview-confidence', requireAdmin, async (req, res) => {
  try {
    const result = await checkPreviewConfidence(req.params.id as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/lessons/:lessonId/ai-readiness', requireAdmin, async (req, res) => {
  try {
    const result = await checkAIReadiness(req.params.lessonId as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.post('/api/admin/orchestration/lessons/:lessonId/final-validation', requireAdmin, async (req, res) => {
  try {
    const result = await runFinalValidation(req.params.lessonId as string);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Backfill Routes ---
router.post('/api/admin/orchestration/backfill/inline-prompts', requireAdmin, async (_req, res) => {
  try {
    const result = await backfillInlinePrompts();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/backfill/status', requireAdmin, async (_req, res) => {
  try {
    const result = await getBackfillStatus();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Deep Reconciliation Routes ---
router.post('/api/admin/orchestration/deep-reconcile', requireAdmin, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === 'true';
    const result = await deepReconcile({ dryRun });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/deep-reconcile/preview', requireAdmin, async (_req, res) => {
  try {
    const result = await deepReconcile({ dryRun: true });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Variable Definition Routes ---
router.get('/api/admin/orchestration/variable-definitions', requireAdmin, handleListVariableDefinitions);
router.post('/api/admin/orchestration/variable-definitions', requireAdmin, handleCreateVariableDefinition);
router.get('/api/admin/orchestration/variable-definitions/:id', requireAdmin, handleGetVariableDefinition);
router.put('/api/admin/orchestration/variable-definitions/:id', requireAdmin, handleUpdateVariableDefinition);
router.delete('/api/admin/orchestration/variable-definitions/:id', requireAdmin, handleDeleteVariableDefinition);

// --- Session Checklist Routes ---
router.get('/api/admin/orchestration/sessions/:sessionId/checklist', requireAdmin, handleListChecklistItems);
router.post('/api/admin/orchestration/sessions/:sessionId/checklist', requireAdmin, handleCreateChecklistItem);
router.put('/api/admin/orchestration/checklist/:id', requireAdmin, handleUpdateChecklistItem);
router.delete('/api/admin/orchestration/checklist/:id', requireAdmin, handleDeleteChecklistItem);

// --- Orchestration Engine Routes ---

// Prompt Templates
router.get('/api/admin/orchestration/prompts', requireAdmin, handleListPromptTemplates);
router.post('/api/admin/orchestration/prompts', requireAdmin, handleCreatePromptTemplate);
router.get('/api/admin/orchestration/prompts/:id', requireAdmin, handleGetPromptTemplate);
router.put('/api/admin/orchestration/prompts/:id', requireAdmin, handleUpdatePromptTemplate);
router.delete('/api/admin/orchestration/prompts/:id', requireAdmin, handleDeletePromptTemplate);
router.post('/api/admin/orchestration/prompts/:id/preview', requireAdmin, handlePreviewPromptTemplate);

// Section Configs
router.get('/api/admin/orchestration/sessions/:sessionId/sections', requireAdmin, handleListOrchSections);
router.post('/api/admin/orchestration/sessions/:sessionId/sections', requireAdmin, handleCreateOrchSection);
router.get('/api/admin/orchestration/sections/:id', requireAdmin, handleGetOrchSection);
router.put('/api/admin/orchestration/sections/:id', requireAdmin, handleUpdateOrchSection);
router.delete('/api/admin/orchestration/sections/:id', requireAdmin, handleDeleteOrchSection);

// Artifact Definitions
router.get('/api/admin/orchestration/sessions/:sessionId/artifacts', requireAdmin, handleListOrchArtifacts);
router.post('/api/admin/orchestration/sessions/:sessionId/artifacts', requireAdmin, handleCreateArtifact);
router.get('/api/admin/orchestration/artifacts/:id', requireAdmin, handleGetArtifact);
router.put('/api/admin/orchestration/artifacts/:id', requireAdmin, handleUpdateArtifact);
router.delete('/api/admin/orchestration/artifacts/:id', requireAdmin, handleDeleteArtifact);

// All artifacts (no session filter)
router.get('/api/admin/orchestration/program/artifacts', requireAdmin, async (_req, res) => {
  try {
    const { listArtifactDefinitions } = require('../../services/artifactService');
    const artifacts = await listArtifactDefinitions();
    res.json(artifacts);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Variables
router.get('/api/admin/orchestration/enrollments/:enrollmentId/variables', requireAdmin, handleGetVariables);
router.get('/api/admin/orchestration/enrollments/:enrollmentId/variables/graph', requireAdmin, handleGetVariableGraph);

// Session Flow & Dashboard
router.get('/api/admin/orchestration/cohorts/:cohortId/flow', requireAdmin, handleGetSessionFlow);
router.get('/api/admin/orchestration/cohorts/:cohortId/dashboard', requireAdmin, handleGetOrchDashboard);
router.get('/api/admin/orchestration/sessions/:sessionId/detail', requireAdmin, handleGetOrchSessionDetail);
router.get('/api/admin/orchestration/enrollments/:enrollmentId/sessions/:sessionId/artifact-status', requireAdmin, handleGetArtifactStatus);

// Lesson Construction
router.get('/api/admin/orchestration/lessons/:id', requireAdmin, handleGetLesson);
router.put('/api/admin/orchestration/lessons/:id', requireAdmin, handleUpdateLesson);

// Session Fields (completion threshold, variable keys, triggers)
router.put('/api/admin/orchestration/sessions/:id/fields', requireAdmin, handleUpdateSessionFields);

// Program-Wide (no cohort required)
router.get('/api/admin/orchestration/program/modules', requireAdmin, handleGetProgramModules);
router.get('/api/admin/orchestration/program/sessions', requireAdmin, handleGetProgramSessions);
router.get('/api/admin/orchestration/program/flow', requireAdmin, handleGetProgramFlow);
router.get('/api/admin/orchestration/program/skills', requireAdmin, handleGetProgramSkills);
router.get('/api/admin/orchestration/program/gates', requireAdmin, handleGetProgramGates);

// Prompt Validation & Preview
router.get('/api/admin/orchestration/validate/prompt/:lessonId/:enrollmentId', requireAdmin, handleValidatePrompt);
router.get('/api/admin/orchestration/preview/prompt/:lessonId/:enrollmentId', requireAdmin, handlePreviewPrompt);

// Curriculum Manager — Integrity & Dry-Run
router.get('/api/admin/orchestration/integrity', requireAdmin, handleIntegrityCheck);
router.get('/api/admin/orchestration/dry-run/section/:lessonId', requireAdmin, handleDryRunSection);

// Test AI Simulation
router.post('/api/admin/orchestration/simulate/section/:lessonId', requireAdmin, async (req, res) => {
  try {
    const { testProfile, testVariables } = req.body;
    const adminUserId = (req as any).admin?.sub;
    const result = await simulateContentGeneration(req.params.lessonId as string, testProfile, testVariables || {}, adminUserId);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/simulate/section/:lessonId/history', requireAdmin, async (req, res) => {
  try {
    res.json(await listSimulations(req.params.lessonId as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.delete('/api/admin/orchestration/simulate/:id', requireAdmin, async (req, res) => {
  try {
    await deleteSimulation(req.params.id as string);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Health Report
router.get('/api/admin/orchestration/health-report', requireAdmin, async (_req, res) => {
  try {
    const report = await generateHealthReport();
    res.json(report);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// --- Orchestration Monitoring Routes ---

// Health snapshots time-series (default last 24 hours)
router.get('/api/admin/orchestration/health-snapshots', requireAdmin, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours as string) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const snapshots = await OrchestrationHealth.findAll({
      where: { scan_timestamp: { [Op.gte]: since } },
      order: [['scan_timestamp', 'DESC']],
    });
    res.json(snapshots);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Latest health snapshot
router.get('/api/admin/orchestration/health-snapshots/latest', requireAdmin, async (_req, res) => {
  try {
    const latest = await OrchestrationHealth.findOne({
      order: [['scan_timestamp', 'DESC']],
    });
    res.json(latest || { health_score: null, status: 'no_data', findings: [], component_scores: {} });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Monitoring agents (accelerator category)
router.get('/api/admin/orchestration/monitoring/agents', requireAdmin, async (_req, res) => {
  try {
    const agents = await AiAgent.findAll({
      where: { category: 'accelerator' },
      order: [['agent_name', 'ASC']],
    });
    res.json(agents);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Trigger on-demand health scan
router.post('/api/admin/orchestration/monitoring/scan', requireAdmin, async (_req, res) => {
  try {
    const result = await runOrchestrationHealth();
    res.json(result || { error: 'Agent not found or disabled' });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Route Audit
router.get('/api/admin/orchestration/route-audit', requireAdmin, handleRouteAudit);

// Preflight Check
router.get('/api/admin/orchestration/preflight', requireAdmin, async (_req, res) => {
  try {
    const result = await runPreflight();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Documentation Generation
router.get('/api/admin/orchestration/docs/architecture', requireAdmin, async (_req, res) => {
  try {
    res.type('text/markdown').send(generateArchitectureDoc());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/orchestration/docs/api', requireAdmin, async (req, res) => {
  try {
    res.type('text/markdown').send(generateApiDoc(req.app));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Link Scanner
router.get('/api/admin/orchestration/link-scan', requireAdmin, async (_req, res) => {
  try {
    const frontendSrc = path.resolve(__dirname, '../../../../frontend/src');
    const calls = scanFrontendApiCalls(frontendSrc);
    res.json({ total: calls.length, calls });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Management API — Blueprint Snapshots & System Status
router.get('/api/admin/orchestration/management/status', requireAdmin, async (_req, res) => {
  try {
    res.json(await getSystemStatus());
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/orchestration/management/blueprint/:id/snapshot', requireAdmin, async (req, res) => {
  try {
    const adminUser = (req as any).adminUser;
    const snapshot = await createSnapshot(req.params.id as string, req.body.description, adminUser?.id);
    res.status(201).json(snapshot);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.get('/api/admin/orchestration/management/blueprint/:id/snapshots', requireAdmin, async (req, res) => {
  try {
    res.json(await listSnapshots(req.params.id as string));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/api/admin/orchestration/management/blueprint/:id/rollback/:snapshotId', requireAdmin, async (req, res) => {
  try {
    const blueprint = await rollbackToSnapshot(req.params.id as string, req.params.snapshotId as string);
    res.json(blueprint);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Analytics
router.get('/api/admin/orchestration/analytics/completion/:cohortId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getSessionCompletionRates(req.params.cohortId as string);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/artifacts/:cohortId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getArtifactCompletionMatrix(req.params.cohortId as string);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/build-phase/:cohortId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getBuildPhaseTracker(req.params.cohortId as string);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/github/:cohortId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getGitHubCommitSummary(req.params.cohortId as string);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/presentation/:cohortId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getPresentationReadiness(req.params.cohortId as string);
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Program-wide analytics (not cohort-scoped)
router.get('/api/admin/orchestration/analytics/program/summary', requireAdmin, async (_req, res) => {
  try {
    const data = await analytics.getProgramEnrollmentSummary();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/program/student-progress', requireAdmin, async (_req, res) => {
  try {
    const data = await analytics.getProgramStudentProgress();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/program/skill-mastery', requireAdmin, async (_req, res) => {
  try {
    const data = await analytics.getProgramSkillMastery();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/program/artifact-tracker', requireAdmin, async (_req, res) => {
  try {
    const data = await analytics.getProgramArtifactTracker();
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/program/student-detail/:enrollmentId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getStudentDetail(req.params.enrollmentId as string);
    if (!data) { res.status(404).json({ error: 'Enrollment not found' }); return; }
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});
router.get('/api/admin/orchestration/analytics/program/skill-detail/:skillId', requireAdmin, async (req, res) => {
  try {
    const data = await analytics.getSkillDetail(req.params.skillId as string);
    if (!data) { res.status(404).json({ error: 'Skill not found' }); return; }
    res.json(data);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
