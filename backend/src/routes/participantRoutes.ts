import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { getInstrumentedOpenAI } from '../services/openaiInstrumented';
import { strategyPrepUpload } from '../config/upload';
import { saveProjectDna, getProjectDna } from '../services/projectDnaService';
import { startRequirementsGeneration } from '../services/requirementsGenerationService';
import {
  handleFreeSignup, handleGetPoints,
  handleRequestMagicLink, handleVerifyMagicLink, handleGetProfile,
  handleGetDashboard, handleGetSessions, handleGetSessionDetail,
  handleGetSubmissions, handleCreateSubmission, handleUploadSubmission,
  handleGetProgress,
} from '../controllers/participantController';
import {
  handleGetCurriculum, handleGetModuleDetail, handleStartLesson,
  handleCompleteLesson, handleSubmitLabData, handleCheckSessionReadiness,
  handleGetCurriculumProfile, handleUpdateCurriculumProfile,
  handleGetSkillGenome, handleGetSkillGaps,
  handleSaveQuizProgress, handleSaveTaskProgress, handleGradeArtifacts,
  handleGetOrchestrationContext,
} from '../controllers/curriculumController';
import {
  handleSendMentorMessage, handleGetMentorHistory,
} from '../controllers/mentorController';
import {
  handleGetSessionChat, handlePostSessionChat,
} from '../controllers/sessionChatController';
import { handleExecutePromptLab } from '../controllers/promptLabController';
import projectRoutes from './projectRoutes';
import studentOpsRoutes from './studentOpsRoutes';

const router = Router();

// Public auth endpoints
router.post('/api/portal/free-signup', handleFreeSignup); // self-serve free/guest account
router.post('/api/portal/request-link', handleRequestMagicLink);
router.get('/api/portal/verify', handleVerifyMagicLink);

// Authenticated participant endpoints
router.get('/api/portal/profile', requireParticipant, handleGetProfile);
router.get('/api/portal/dashboard', requireParticipant, handleGetDashboard);
router.get('/api/portal/sessions', requireParticipant, handleGetSessions);
router.get('/api/portal/sessions/:id', requireParticipant, handleGetSessionDetail);
router.get('/api/portal/sessions/:id/chat', requireParticipant, handleGetSessionChat);
router.post('/api/portal/sessions/:id/chat', requireParticipant, handlePostSessionChat);
router.get('/api/portal/submissions', requireParticipant, handleGetSubmissions);
router.post('/api/portal/submissions', requireParticipant, handleCreateSubmission);
router.post('/api/portal/submissions/:id/upload', requireParticipant, strategyPrepUpload.single('file'), handleUploadSubmission);
router.get('/api/portal/progress', requireParticipant, handleGetProgress);
router.get('/api/portal/points', requireParticipant, handleGetPoints);

// Curriculum endpoints
router.get('/api/portal/curriculum', requireParticipant, handleGetCurriculum);
router.get('/api/portal/curriculum/modules/:moduleId', requireParticipant, handleGetModuleDetail);
router.post('/api/portal/curriculum/lessons/:lessonId/start', requireParticipant, handleStartLesson);
router.put('/api/portal/curriculum/lessons/:lessonId/complete', requireParticipant, handleCompleteLesson);
router.post('/api/portal/curriculum/lessons/:lessonId/lab', requireParticipant, handleSubmitLabData);
router.post('/api/portal/curriculum/lessons/:lessonId/prompt-lab', requireParticipant, handleExecutePromptLab);
router.post('/api/portal/curriculum/lessons/:lessonId/quiz-progress', requireParticipant, handleSaveQuizProgress);
router.post('/api/portal/curriculum/lessons/:lessonId/task-progress', requireParticipant, handleSaveTaskProgress);
router.post('/api/portal/curriculum/lessons/:lessonId/grade-artifacts', requireParticipant, handleGradeArtifacts);
router.get('/api/portal/curriculum/session-readiness/:sessionId', requireParticipant, handleCheckSessionReadiness);
router.get('/api/portal/curriculum/profile', requireParticipant, handleGetCurriculumProfile);
router.put('/api/portal/curriculum/profile', requireParticipant, handleUpdateCurriculumProfile);
router.get('/api/portal/curriculum/skill-genome', requireParticipant, handleGetSkillGenome);
router.get('/api/portal/curriculum/skill-gaps', requireParticipant, handleGetSkillGaps);
router.get('/api/portal/curriculum/lessons/:lessonId/orchestration-context', requireParticipant, handleGetOrchestrationContext);

// Context state — returns learner's context mode for UX adaptation
router.get('/api/portal/context-state', requireParticipant, async (req, res) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { detectContextMode } = require('../services/userContextService');
    const state = await detectContextMode(enrollmentId);
    res.json(state);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to detect context state' });
  }
});

// Save prompt template fill values as variables
router.post('/api/portal/curriculum/variables', requireParticipant, async (req, res) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { variables } = req.body;
    if (!variables || typeof variables !== 'object') {
      return res.status(400).json({ error: 'variables object required' });
    }
    const variableService = require('../services/variableService');
    let saved = 0;
    for (const [key, value] of Object.entries(variables)) {
      if (value && typeof value === 'string' && value.trim()) {
        await variableService.setVariable(enrollmentId, key, (value as string).trim(), 'section');
        saved++;
      }
    }
    res.json({ saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// NotebookLM upload endpoint
router.post('/api/portal/curriculum/lessons/:lessonId/notebooklm-upload', requireParticipant, strategyPrepUpload.single('file'), async (req, res) => {
  try {
    const enrollmentId = req.participant!.sub;
    const { lessonId } = req.params;
    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    // Extract text from file (simple text extraction)
    const fs = await import('fs');
    const rawText = fs.readFileSync(file.path, 'utf-8').substring(0, 20000);

    // Summarize via OpenAI
    const openai = getInstrumentedOpenAI({ workflow_id: 'participant_routes' });
    const response = await openai.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a research assistant. Summarize the following document into a concise research brief (3-5 paragraphs) that captures the key findings, methodologies, and actionable insights.' },
        { role: 'user', content: `Document content:\n\n${rawText}` },
      ],
      max_tokens: 2000,
    });
    const summary = response.choices[0]?.message?.content || 'Summary unavailable.';

    // Store as variable
    const variableService = await import('../services/variableService');
    const { SectionConfig } = await import('../models');
    const sectionConfig = await SectionConfig.findOne({ where: { lesson_id: lessonId } });
    await variableService.setVariable(enrollmentId, 'research_brief', summary, 'section', {
      sectionId: sectionConfig?.id,
    });

    res.json({ summary, file_name: file.originalname });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Project DNA endpoints
const projectDnaSchema = z.object({
  businessProblem: z.string().trim().min(5, 'businessProblem must be at least 5 characters'),
  targetUser:      z.string().trim().min(2, 'targetUser is required'),
  industry:        z.string().trim().min(1, 'industry is required'),
  orientation:     z.enum(['internal', 'external']),
  focus:           z.enum(['revenue', 'operational']),
  projectTypes:    z.array(z.string()).min(1, 'At least one project type is required'),
  dataSources:     z.array(z.string()).default([]),
  aiComponents:    z.array(z.string()).min(1, 'At least one AI component is required'),
  industryTrack:   z.string().trim().min(1, 'industryTrack is required'),
});

router.post('/api/portal/project-dna', requireParticipant, async (req, res) => {
  const parse = projectDnaSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid input' });
    return;
  }
  try {
    const enrollmentId = req.participant!.sub;
    const record = await saveProjectDna(enrollmentId, parse.data);
    res.status(201).json(record);
    // Fire-and-forget: kick off requirements generation; does not block the response
    startRequirementsGeneration(enrollmentId).catch(err =>
      console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'requirements_gen_trigger_failed', outcome: 'failure', error_class: err.constructor?.name ?? 'Error', context: { message: err.message, enrollment_id: enrollmentId } }))
    );
  } catch (err: any) {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'project_dna_save_failed', correlation_id: correlationId, outcome: 'failure', error_class: err.constructor?.name ?? 'Error', context: { message: err.message } }));
    res.status(500).json({ error: 'Failed to save Project DNA' });
  }
});

router.get('/api/portal/project-dna', requireParticipant, async (req, res) => {
  try {
    const record = await getProjectDna(req.participant!.sub);
    if (!record) { res.status(404).json({ error: 'No Project DNA found' }); return; }
    res.json(record);
  } catch (err: any) {
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'project_dna_get_failed', correlation_id: correlationId, outcome: 'failure', error_class: err.constructor?.name ?? 'Error', context: { message: err.message } }));
    res.status(500).json({ error: 'Failed to retrieve Project DNA' });
  }
});

// Project endpoints
router.use(projectRoutes);

// Student CB-System operating model (priority queue, Run My Day, decisions)
router.use(studentOpsRoutes);

// Mentor endpoints
router.post('/api/portal/mentor/chat', requireParticipant, handleSendMentorMessage);
router.get('/api/portal/mentor/history', requireParticipant, handleGetMentorHistory);

// Mentor feedback on submissions
router.get('/api/portal/submissions/:submissionId/mentor-feedback', requireParticipant, async (req, res) => {
  try {
    const { getFeedbackForSubmission } = await import('../services/mentorFeedbackService');
    const feedback = await getFeedbackForSubmission(
      req.params.submissionId as string,
      req.participant!.sub
    );
    if (!feedback) return res.status(404).json({ error: 'No mentor feedback available yet' });
    res.json(feedback);
  } catch (err: any) {
    console.error('[ParticipantRoutes] mentor-feedback error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve mentor feedback' });
  }
});

// GitHub OAuth endpoints
router.get('/api/portal/github/oauth/start', requireParticipant, async (req, res) => {
  const { buildOAuthUrl } = await import('../services/githubIntegrationService');
  res.redirect(buildOAuthUrl(req.participant!.sub));
});

// Returns the OAuth URL as JSON so SPA clients can redirect via JS (Bearer token auth)
router.get('/api/portal/github/oauth/url', requireParticipant, async (req, res) => {
  const { buildOAuthUrl } = await import('../services/githubIntegrationService');
  res.json({ url: buildOAuthUrl(req.participant!.sub) });
});

// Callback from GitHub — no session cookie present, identity comes from state param
router.get('/api/portal/github/oauth/callback', async (req, res) => {
  const { code, state: enrollmentId } = req.query;
  if (!code || !enrollmentId || typeof code !== 'string' || typeof enrollmentId !== 'string') {
    res.status(400).json({ error: 'Missing code or state' });
    return;
  }
  try {
    const { handleOAuthCallback } = await import('../services/githubIntegrationService');
    await handleOAuthCallback(code, enrollmentId);
    res.redirect('/portal/home?github_connected=1');
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'github_oauth_callback_failed', outcome: 'failure', error_class: err.constructor?.name ?? 'Error', context: { message: err.message } }));
    res.status(500).json({ error: 'GitHub connection failed' });
  }
});

// GitHub integration endpoints
router.post('/api/portal/github/connect', requireParticipant, async (req, res) => {
  try {
    const githubService = await import('../services/githubService');
    const connection = await githubService.connectRepo(
      req.participant!.sub,
      req.body.repo_url,
      req.body.access_token
    );
    res.json(connection);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/portal/github/status', requireParticipant, async (req, res) => {
  try {
    const githubService = await import('../services/githubService');
    const status = await githubService.getRepoStatus(req.participant!.sub);
    res.json(status || { connected: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/github/check-files', requireParticipant, async (req, res) => {
  try {
    const githubService = await import('../services/githubService');
    const result = await githubService.checkRequiredFiles(
      req.participant!.sub,
      req.body.required_files
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/github/status-report', requireParticipant, async (req, res) => {
  try {
    const githubService = await import('../services/githubService');
    const report = await githubService.generateStatusReport(req.participant!.sub);
    res.json({ report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
