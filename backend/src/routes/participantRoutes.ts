import { Router } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { strategyPrepUpload } from '../config/upload';
import {
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

const router = Router();

// Public auth endpoints
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
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

// Mentor endpoints
router.post('/api/portal/mentor/chat', requireParticipant, handleSendMentorMessage);
router.get('/api/portal/mentor/history', requireParticipant, handleGetMentorHistory);

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
