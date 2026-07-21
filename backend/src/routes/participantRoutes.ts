import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireOrgManager } from '../middlewares/orgAuth';
import {
  handleOrgRegister, handleOrgInvites, handleOrgOverview,
  handleOrgRoster, handleOrgMemberDetail, handleOrgFeed,
} from '../controllers/orgController';
import { getInstrumentedOpenAI } from '../services/openaiInstrumented';
import path from 'path';
import fs from 'fs';
import { strategyPrepUpload, certificateUpload, fieldGuideUpload, communityMediaUpload, COMMUNITY_MEDIA_DIR } from '../config/upload';
import { saveProjectDna, getProjectDna } from '../services/projectDnaService';
import { startRequirementsGeneration } from '../services/requirementsGenerationService';
import {
  handleFreeSignup, handleGetPoints, handleGetPointsDrilldown, handleGetStreak, handleClaimStreak,
  handleGetSubscription, handleStartSubscriptionCheckout, handleCancelSubscription, handleConfirmCheckout,
  handleGetEnrollment, handleSelectEnrollmentCohort,
  handleGetOnboardingSchedule, handleRsvpOpenHouse, handleGetPublicEvents,
  handleIngestBackground, handleGetOnboardingProfile,
  handleRequestMagicLink, handleVerifyMagicLink, handleGetProfile,
  handleGetDashboard, handleGetSessions, handleGetSessionDetail, handleGetNextSession,
  handleGetSubmissions, handleCreateSubmission, handleUploadSubmission,
  handleGetProgress,
} from '../controllers/participantController';
import {
  handleGetCurriculum, handleGetModuleDetail, handleStartLesson,
  handleCompleteLesson, handleSubmitLabData, handleCheckSessionReadiness,
  handleGetCurriculumProfile, handleUpdateCurriculumProfile,
  handleGetSkillGenome, handleGetSkillGaps,
  handleSaveQuizProgress, handleSaveTaskProgress, handleGradeArtifacts,
  handleGetOrchestrationContext, handleSaveSurveyResponse,
} from '../controllers/curriculumController';
import {
  handleSendMentorMessage, handleGetMentorHistory,
} from '../controllers/mentorController';
import {
  handleGetSessionChat, handlePostSessionChat,
} from '../controllers/sessionChatController';
import { handleExecutePromptLab } from '../controllers/promptLabController';
import { listPodcastsPortal } from '../controllers/podcastController';
import { handleGetClassroomFeed, handleCompleteCard } from '../controllers/timelineController';
import { handleListCardComments, handleCreateCardComment } from '../controllers/timelineCommentController';
import { handleCreateHandoff, handleExchangeHandoff, handleGetPortalFlags } from '../controllers/portalHandoffController';
import {
  handleGetSettings, handleUpdateProfile, handleSetAvatar, handleClearAvatar,
  handleSetResume, handleGetResume, handleClearResume,
} from '../controllers/portalSettingsController';
import {
  handleOpenCard, handleMentor, handleNudge, handleReflection, handleEnsureContent, handleUploadCertificate, handleGetCertificate, handlePromptLab,
  handleComplete, handleReadiness, handleListNotes, handleCreateNote, handleDeleteNote,
  handleWatchBeat, handleGetSurvey, handleSaveSurvey,
  handleGetAssessment, handleSubmitAssessment,
  handleUploadFieldGuide, handleGetFieldGuide, handleBuildArtifactUpload,
  handleArchitectState, handleArchitectAdvance, handleArchitectInterview,
  handleArchitectEvaluate, handleArchitectComplete, handleArchitectLedger,
} from '../controllers/runtimeController';
import { handleGetToday, handleTodayInteract } from '../controllers/todayController';
import projectRoutes from './projectRoutes';
import studentOpsRoutes from './studentOpsRoutes';
import projectsPortalRoutes from './projectsPortalRoutes';
import workspaceRoutes from './workspaceRoutes';

const router = Router();

// Public auth endpoints
router.post('/api/portal/free-signup', handleFreeSignup); // self-serve free/guest account
router.post('/api/portal/org/register', handleOrgRegister); // free management account (dual account)
router.post('/api/portal/request-link', handleRequestMagicLink);
router.get('/api/portal/verify', handleVerifyMagicLink);
// Portal feature flags (public — the shell reads these to pick the Today
// experience) and the phone-handoff exchange (public — no session yet).
router.get('/api/portal/flags', handleGetPortalFlags);
router.get('/api/portal/handoff/exchange', handleExchangeHandoff);

// Authenticated participant endpoints
router.get('/api/portal/profile', requireParticipant, handleGetProfile);
router.get('/api/portal/dashboard', requireParticipant, handleGetDashboard);
router.get('/api/portal/podcasts', requireParticipant, listPodcastsPortal);
// Timeline Engine — Classroom feed (flag-gated inside the controller; 404 -> legacy curriculum).
router.get('/api/portal/classroom', requireParticipant, handleGetClassroomFeed);
router.post('/api/portal/classroom/cards/:cardId/complete', requireParticipant, handleCompleteCard);
// Learning Runtime Intelligence (Phase 3) — consumes the published Timeline; never edits curriculum.
router.get('/api/portal/runtime/readiness', requireParticipant, handleReadiness);
// Today Timeline v2 — never-ending engagement feed (flag-gated in the controller).
router.get('/api/portal/runtime/today', requireParticipant, handleGetToday);
router.post('/api/portal/runtime/today/:cardRef/interact', requireParticipant, handleTodayInteract);
router.get('/api/portal/runtime/notebook', requireParticipant, handleListNotes);
router.post('/api/portal/runtime/notebook', requireParticipant, handleCreateNote);
router.delete('/api/portal/runtime/notebook/:id', requireParticipant, handleDeleteNote);
router.get('/api/portal/runtime/cards/:cardId', requireParticipant, handleOpenCard);
router.post('/api/portal/runtime/cards/:cardId/mentor', requireParticipant, handleMentor);
router.get('/api/portal/runtime/cards/:cardId/nudge', requireParticipant, handleNudge);
router.get('/api/portal/runtime/cards/:cardId/reflection', requireParticipant, handleReflection);
router.post('/api/portal/runtime/cards/:cardId/content', requireParticipant, handleEnsureContent);
// Anthropic Skills Course — upload + AI-verify the completion certificate.
router.post('/api/portal/runtime/cards/:cardId/certificate', requireParticipant, certificateUpload.single('file'), handleUploadCertificate);
router.get('/api/portal/runtime/cards/:cardId/certificate', requireParticipant, handleGetCertificate);
// Deep Dive Field Guide — upload the .html built in Claude Code (+100 pts, once); GET = status.
router.post('/api/portal/runtime/cards/:cardId/field-guide', requireParticipant, fieldGuideUpload.single('file'), handleUploadFieldGuide);
router.get('/api/portal/runtime/cards/:cardId/field-guide', requireParticipant, handleGetFieldGuide);

// Build Artifact(s) Lab — upload the file the student built in Claude Code. Reuses
// the strategy-prep multer config (PDF/Word/PPT/Excel/RTF/Text/Markdown/CSV) on the
// persistent uploads volume; a bad type returns a clear 400. The handler stores it
// as a PortfolioArtifact (portfolio + instructor review); the card is then marked
// complete via the normal /complete endpoint (points on the first build).
router.post('/api/portal/runtime/cards/:cardId/build-artifact', requireParticipant, strategyPrepUpload.single('file'), handleBuildArtifactUpload);
router.post('/api/portal/runtime/cards/:cardId/prompt-lab', requireParticipant, handlePromptLab);
router.post('/api/portal/runtime/cards/:cardId/complete', requireParticipant, handleComplete);
// Weekly feedback Survey — read the questions + saved answers, and store answers.
router.get('/api/portal/runtime/cards/:cardId/survey', requireParticipant, handleGetSurvey);
router.post('/api/portal/runtime/cards/:cardId/survey', requireParticipant, handleSaveSurvey);
router.get('/api/portal/runtime/cards/:cardId/assessment', requireParticipant, handleGetAssessment);
router.post('/api/portal/runtime/cards/:cardId/assessment', requireParticipant, handleSubmitAssessment);
// The Architect Time Machine (architect_mindset) — state/resume, validated stage
// advance (autosave), interview answers, graceful evaluation, and the 14-gate
// backend-authoritative completion, plus the derived Mindset Ledger.
router.get('/api/portal/runtime/cards/:cardId/architect/state', requireParticipant, handleArchitectState);
router.post('/api/portal/runtime/cards/:cardId/architect/advance', requireParticipant, handleArchitectAdvance);
router.post('/api/portal/runtime/cards/:cardId/architect/interview', requireParticipant, handleArchitectInterview);
router.post('/api/portal/runtime/cards/:cardId/architect/evaluate', requireParticipant, handleArchitectEvaluate);
router.post('/api/portal/runtime/cards/:cardId/architect/complete', requireParticipant, handleArchitectComplete);
router.get('/api/portal/runtime/cards/:cardId/architect/ledger', requireParticipant, handleArchitectLedger);
// Watch-progress heartbeat (~1 per 15s of playback per player; limiter blunts floods).
const watchBeatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many watch beats — please slow down' },
});
router.post('/api/portal/runtime/cards/:cardId/watch', watchBeatRateLimiter, requireParticipant, handleWatchBeat);
router.get('/api/portal/sessions', requireParticipant, handleGetSessions);
router.get('/api/portal/next-session', requireParticipant, handleGetNextSession);
router.get('/api/portal/sessions/:id', requireParticipant, handleGetSessionDetail);
router.get('/api/portal/sessions/:id/chat', requireParticipant, handleGetSessionChat);
router.post('/api/portal/sessions/:id/chat', requireParticipant, handlePostSessionChat);
router.get('/api/portal/submissions', requireParticipant, handleGetSubmissions);
router.post('/api/portal/submissions', requireParticipant, handleCreateSubmission);
router.post('/api/portal/submissions/:id/upload', requireParticipant, strategyPrepUpload.single('file'), handleUploadSubmission);
router.get('/api/portal/progress', requireParticipant, handleGetProgress);
router.get('/api/portal/points', requireParticipant, handleGetPoints);
router.get('/api/portal/points/drilldown', requireParticipant, handleGetPointsDrilldown);
router.get('/api/portal/streak', requireParticipant, handleGetStreak);
router.post('/api/portal/streak/claim', requireParticipant, handleClaimStreak);
// Enrollment (class-date selection) — enrolling reserves a spot; payment locks it.
router.get('/api/portal/enrollment', requireParticipant, handleGetEnrollment);
router.post('/api/portal/enrollment', requireParticipant, handleSelectEnrollmentCohort);
router.get('/api/portal/subscription', requireParticipant, handleGetSubscription);
router.post('/api/portal/subscription/checkout', requireParticipant, handleStartSubscriptionCheckout);
router.post('/api/portal/subscription/confirm', requireParticipant, handleConfirmCheckout);
router.post('/api/portal/subscription/cancel', requireParticipant, handleCancelSubscription);
router.get('/api/portal/onboarding/schedule', requireParticipant, handleGetOnboardingSchedule);
router.get('/api/portal/events', requireParticipant, handleGetPublicEvents); // public events (CCPP) for the calendar
router.post('/api/portal/open-house/:id/rsvp', requireParticipant, handleRsvpOpenHouse);
router.post('/api/portal/onboarding/ingest-background', requireParticipant, handleIngestBackground);
router.get('/api/portal/onboarding/profile', requireParticipant, handleGetOnboardingProfile);
// "Open on your phone" — authed desktop mints a single-use QR handoff code.
router.post('/api/portal/handoff', requireParticipant, handleCreateHandoff);

// Student account Settings — profile, photo, resume file, account read.
// Photo + resume are base64 JSON bodies (they ride the global 5mb express.json
// limit); the resume download streams the decoded file back to its owner.
router.get('/api/portal/settings', requireParticipant, handleGetSettings);
router.put('/api/portal/settings/profile', requireParticipant, handleUpdateProfile);
router.post('/api/portal/settings/avatar', requireParticipant, handleSetAvatar);
router.delete('/api/portal/settings/avatar', requireParticipant, handleClearAvatar);
router.post('/api/portal/settings/resume', requireParticipant, handleSetResume);
router.get('/api/portal/settings/resume', requireParticipant, handleGetResume);
router.delete('/api/portal/settings/resume', requireParticipant, handleClearResume);

// Organization / Manager layer — all require an authed participant who manages an org.
router.post('/api/portal/org/invites', requireParticipant, requireOrgManager, handleOrgInvites);
router.get('/api/portal/org/overview', requireParticipant, requireOrgManager, handleOrgOverview);
router.get('/api/portal/org/members', requireParticipant, requireOrgManager, handleOrgRoster);
router.get('/api/portal/org/members/:enrollmentId', requireParticipant, requireOrgManager, handleOrgMemberDetail);
router.get('/api/portal/org/feed', requireParticipant, requireOrgManager, handleOrgFeed);

// Curriculum endpoints
router.get('/api/portal/curriculum', requireParticipant, handleGetCurriculum);
router.get('/api/portal/curriculum/modules/:moduleId', requireParticipant, handleGetModuleDetail);
router.post('/api/portal/curriculum/lessons/:lessonId/start', requireParticipant, handleStartLesson);
router.put('/api/portal/curriculum/lessons/:lessonId/complete', requireParticipant, handleCompleteLesson);
router.post('/api/portal/curriculum/lessons/:lessonId/lab', requireParticipant, handleSubmitLabData);
router.post('/api/portal/curriculum/lessons/:lessonId/prompt-lab', requireParticipant, handleExecutePromptLab);
router.post('/api/portal/curriculum/lessons/:lessonId/quiz-progress', requireParticipant, handleSaveQuizProgress);
router.post('/api/portal/curriculum/lessons/:lessonId/survey', requireParticipant, handleSaveSurveyResponse);
router.post('/api/portal/curriculum/lessons/:lessonId/task-progress', requireParticipant, handleSaveTaskProgress);
router.post('/api/portal/curriculum/lessons/:lessonId/grade-artifacts', requireParticipant, handleGradeArtifacts);
router.get('/api/portal/curriculum/session-readiness/:sessionId', requireParticipant, handleCheckSessionReadiness);
router.get('/api/portal/curriculum/profile', requireParticipant, handleGetCurriculumProfile);
router.put('/api/portal/curriculum/profile', requireParticipant, handleUpdateCurriculumProfile);
router.get('/api/portal/curriculum/skill-genome', requireParticipant, handleGetSkillGenome);
router.get('/api/portal/curriculum/skill-gaps', requireParticipant, handleGetSkillGaps);
router.get('/api/portal/curriculum/lessons/:lessonId/orchestration-context', requireParticipant, handleGetOrchestrationContext);

// Architect project evaluation — latest AI evaluation for this enrollment
router.get('/api/portal/project/evaluation', requireParticipant, async (req, res, next) => {
  try {
    const { getLatestEvaluation } = await import('../services/agents/architectEvaluationAgent');
    const evaluation = await getLatestEvaluation(req.participant!.sub);
    res.json(evaluation ? evaluation.toJSON() : null);
  } catch (err) { next(err); }
});

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

// Per-student workspace repo endpoints (platform-provisioned GitHub repo + sync)
router.use(workspaceRoutes);

// Student CB-System operating model (priority queue, Run My Day, decisions)
router.use(studentOpsRoutes);

// Persisted student projects read API (Project Backend P1, flag-gated)
router.use(projectsPortalRoutes);

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
    res.redirect('/portal/project/builder?github_connected=1');
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'github_oauth_callback_failed', outcome: 'failure', error_class: err.constructor?.name ?? 'Error', context: { message: err.message } }));
    res.status(500).json({ error: 'GitHub connection failed' });
  }
});

// GitHub integration endpoints
const ConnectRepoSchema = z.object({
  repo_url: z.string().trim().min(1, 'repo_url is required'),
  access_token: z.string().trim().optional(),
});

router.post('/api/portal/github/connect', requireParticipant, async (req, res) => {
  const parsed = ConnectRepoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }
  try {
    const enrollmentId = req.participant!.sub;
    const githubService = await import('../services/githubService');
    const connection = await githubService.connectRepo(
      enrollmentId,
      parsed.data.repo_url,
      parsed.data.access_token
    );

    // Best-effort: same pattern as handleOAuthCallback — a webhook/sync
    // failure never fails the connect response, since the repo link itself
    // already succeeded and these can be retried by the daily sync cron.
    const { registerWebhook, syncStudentActivity } = await import('../services/githubIntegrationService');
    await registerWebhook(enrollmentId).catch((err: Error) => {
      console.error(JSON.stringify({ level: 'warn', service: 'backend', event: 'github_webhook_register_failed', outcome: 'failure', error_class: err.constructor.name, context: { message: err.message, enrollment_id: enrollmentId } }));
    });
    await syncStudentActivity(enrollmentId).catch((err: Error) => {
      console.error(JSON.stringify({ level: 'warn', service: 'backend', event: 'github_initial_sync_failed', outcome: 'failure', error_class: err.constructor.name, context: { message: err.message, enrollment_id: enrollmentId } }));
    });

    res.json(connection);
  } catch (err: any) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'github_connect_repo_failed', outcome: 'failure', error_class: err.constructor?.name ?? 'Error', context: { message: err.message } }));
    res.status(500).json({ error: 'GitHub repository connection failed' });
  }
});

router.get('/api/portal/github/status', requireParticipant, async (req, res) => {
  try {
    const githubService = await import('../services/githubService');
    const status = await githubService.getRepoStatus(req.participant!.sub);
    res.json(status || { connected: false, hasToken: false });
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

// ─── Classroom Week View ──────────────────────────────────────────────────────

import { GetWeekSchema, RevealActivitySchema, StartInterviewSchema, SubmitInterviewSchema } from '../schemas/interviewSchemas';
import {
  CreatePostSchema, ListPostsQuerySchema, TogglePinSchema, PostIdParamSchema,
  CreateCommentSchema, CommentIdParamSchema, MemberIdParamSchema, UpdateProfileSchema,
  ReportPostSchema, LeaderboardQuerySchema, NotificationIdParamSchema,
} from '../schemas/communitySchemas';

router.get('/api/portal/classroom/week/:weekNum', requireParticipant, async (req, res) => {
  const parsed = GetWeekSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Week must be 1–12', details: parsed.error.flatten() });
    return;
  }
  try {
    const { getWeekData } = await import('../services/weekVisibilityService');
    const data = await getWeekData(req.participant!.sub, parseInt(parsed.data.weekNum, 10));
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/classroom/week/:weekNum/reveal', requireParticipant, async (req, res) => {
  const weekParsed = GetWeekSchema.safeParse(req.params);
  const bodyParsed = RevealActivitySchema.safeParse(req.body);
  if (!weekParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    const { revealNextActivity } = await import('../services/weekVisibilityService');
    const result = await revealNextActivity(
      req.participant!.sub,
      parseInt(weekParsed.data.weekNum, 10),
      bodyParsed.data.completed_item
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/portal/interview/start', requireParticipant, async (req, res) => {
  const parsed = StartInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }
  try {
    const { startInterview } = await import('../services/interviewService');
    const result = await startInterview(req.participant!.sub, parsed.data.week_number);
    res.json(result);
  } catch (err: any) {
    const status = err.error_class === 'ValidationError' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/api/portal/interview/:sessionId/submit', requireParticipant, async (req, res) => {
  const parsed = SubmitInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid answers', details: parsed.error.flatten() });
    return;
  }
  try {
    const { submitInterview } = await import('../services/interviewService');
    const result = await submitInterview(
      req.params.sessionId as string,
      req.participant!.sub,
      parsed.data.answers
    );
    res.json(result);
  } catch (err: any) {
    const status = err.error_class === 'ValidationError' ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// ─── Community Feed ───────────────────────────────────────────────────────────

function communityErrorStatus(err: any): number {
  switch (err.error_class) {
    case 'ValidationError':
      return 400;
    case 'NotFoundError':
      return 404;
    case 'ForbiddenError':
      return 403;
    default:
      return 500;
  }
}

// Posting rate limits (REQ-C9) — generous enough for normal discussion, tight
// enough to blunt a spam/flood script. Keyed by IP like the v1 limiter
// elsewhere in this repo; per-member limiting would need a keyGenerator
// reading req.participant, which isn't available until after this middleware
// runs in the current chain — IP is the pragmatic v1 choice here too.
const communityPostRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many posts — please slow down' },
});

const communityCommentRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many comments — please slow down' },
});

router.post('/api/portal/community/posts', communityPostRateLimiter, requireParticipant, async (req, res) => {
  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid post', details: parsed.error.flatten() });
    return;
  }
  try {
    const { createPost } = await import('../services/communityService');
    const post = await createPost(req.participant!.sub, parsed.data);
    res.status(201).json({ post });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/posts', requireParticipant, async (req, res) => {
  const parsed = ListPostsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }
  try {
    const { listPosts } = await import('../services/communityService');
    const { posts, next_cursor } = await listPosts(req.participant!.sub, {
      category: parsed.data.category,
      cursor: parsed.data.cursor,
      limit: parsed.data.limit,
    });
    res.json({ posts, next_cursor });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/posts/:postId', requireParticipant, async (req, res) => {
  const paramsParsed = PostIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const { getPostById } = await import('../services/communityService');
    const post = await getPostById(req.participant!.sub, paramsParsed.data.postId);
    res.json({ post });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/leaderboard', requireParticipant, async (req, res) => {
  const parsed = LeaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }
  try {
    const { getLeaderboard } = await import('../services/communityLeaderboardService');
    const entries = await getLeaderboard(req.participant!.sub, parsed.data.period);
    res.json({ period: parsed.data.period, entries });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

// Local image upload from the student's computer (Ali feedback 2026-07-20).
// Returns a relative media URL the composer adds to media_urls.
router.post('/api/portal/community/upload', requireParticipant, (req, res) => {
  communityMediaUpload.single('file')(req, res, (err: any) => {
    if (err) { res.status(400).json({ error: err.message }); return; }
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    // Return the URL WITHOUT the file extension so nginx's `~* \.png$`
    // static-asset location can't hijack it — it must proxy to the backend.
    const id = req.file.filename.replace(/\.[^./]+$/, '');
    res.status(201).json({ url: `/api/portal/community/media/${id}` });
  });
});

// Public serve — extension-less path so nginx proxies it here (an image-ext URL
// would be grabbed by the static-asset location). :id is the opaque UUID; the
// real file (id.ext) is resolved on disk and sendFile sets the content-type.
router.get('/api/portal/community/media/:id', (req, res) => {
  const { id } = req.params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) { res.status(400).end(); return; }
  let file: string | undefined;
  try { file = fs.readdirSync(COMMUNITY_MEDIA_DIR).find((f) => f.startsWith(`${id}.`)); } catch { /* dir missing */ }
  if (!file) { res.status(404).end(); return; }
  res.sendFile(path.join(COMMUNITY_MEDIA_DIR, file));
});

router.get('/api/portal/community/calendar', requireParticipant, async (req, res) => {
  try {
    const { getUpcomingEvents } = await import('../services/communityCalendarService');
    const events = await getUpcomingEvents(req.participant!.sub);
    res.json({ events });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/notifications', requireParticipant, async (req, res) => {
  try {
    const { listNotifications } = await import('../services/communityNotificationService');
    const notifications = await listNotifications(req.participant!.sub);
    res.json({ notifications });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/notifications/unread-count', requireParticipant, async (req, res) => {
  try {
    const { unreadNotificationCount } = await import('../services/communityNotificationService');
    res.json({ count: await unreadNotificationCount(req.participant!.sub) });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/community/notifications/read-all', requireParticipant, async (req, res) => {
  try {
    const { markAllNotificationsRead } = await import('../services/communityNotificationService');
    res.json(await markAllNotificationsRead(req.participant!.sub));
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/community/notifications/:notificationId/read', requireParticipant, async (req, res) => {
  const paramsParsed = NotificationIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: 'Invalid notification id' });
    return;
  }
  try {
    const { markNotificationRead } = await import('../services/communityNotificationService');
    const notification = await markNotificationRead(req.participant!.sub, paramsParsed.data.notificationId);
    res.json({ notification });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.patch('/api/portal/community/posts/:postId/pin', requireParticipant, async (req, res) => {
  const paramsParsed = PostIdParamSchema.safeParse(req.params);
  const bodyParsed = TogglePinSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    const { togglePin } = await import('../services/communityService');
    const post = await togglePin(req.participant!.sub, paramsParsed.data.postId, bodyParsed.data);
    res.json({ post });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/community/posts/:postId/comments', communityCommentRateLimiter, requireParticipant, async (req, res) => {
  const paramsParsed = PostIdParamSchema.safeParse(req.params);
  const bodyParsed = CreateCommentSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: 'Invalid comment' });
    return;
  }
  try {
    const { createComment } = await import('../services/communityService');
    const comment = await createComment(req.participant!.sub, paramsParsed.data.postId, bodyParsed.data);
    res.status(201).json({ comment });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/posts/:postId/comments', requireParticipant, async (req, res) => {
  const paramsParsed = PostIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const { listComments } = await import('../services/communityService');
    const comments = await listComments(req.participant!.sub, paramsParsed.data.postId);
    res.json({ comments });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/community/posts/:postId/like', requireParticipant, async (req, res) => {
  const paramsParsed = PostIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: 'Invalid post id' });
    return;
  }
  try {
    const { toggleLike } = await import('../services/communityService');
    const result = await toggleLike(req.participant!.sub, 'post', paramsParsed.data.postId);
    res.json(result);
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/community/comments/:commentId/like', requireParticipant, async (req, res) => {
  const paramsParsed = CommentIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: 'Invalid comment id' });
    return;
  }
  try {
    const { toggleLike } = await import('../services/communityService');
    const result = await toggleLike(req.participant!.sub, 'comment', paramsParsed.data.commentId);
    res.json(result);
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

// Per-card student comments (Runtime workspace) — newest first. Registered here
// (after the community limiters are defined) so the shared rate limiter is in scope.
router.get('/api/portal/classroom/cards/:cardId/comments', requireParticipant, handleListCardComments);
router.post('/api/portal/classroom/cards/:cardId/comments', communityCommentRateLimiter, requireParticipant, handleCreateCardComment);

router.post('/api/portal/community/posts/:postId/report', requireParticipant, async (req, res) => {
  const paramsParsed = PostIdParamSchema.safeParse(req.params);
  const bodyParsed = ReportPostSchema.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    const { reportPost } = await import('../services/communityService');
    const result = await reportPost(req.participant!.sub, paramsParsed.data.postId, bodyParsed.data.reason);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

// Specific literal routes ('me', bare directory) are registered before the
// generic ':memberId' route so Express matches them first.
router.get('/api/portal/community/members/me', requireParticipant, async (req, res) => {
  try {
    const { getMyProfile } = await import('../services/communityService');
    const profile = await getMyProfile(req.participant!.sub);
    res.json({ profile });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.patch('/api/portal/community/members/me', requireParticipant, async (req, res) => {
  const parsed = UpdateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update', details: parsed.error.flatten() });
    return;
  }
  try {
    const { updateMyProfile } = await import('../services/communityService');
    const profile = await updateMyProfile(req.participant!.sub, parsed.data);
    res.json({ profile });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/members', requireParticipant, async (req, res) => {
  try {
    const { listMembers, isMemberRole } = await import('../services/communityService');
    // Safe integer parse — reject NaN/blank so a bad ?minLevel= never filters
    // everyone out (typeof NaN === 'number' would slip past the service guard).
    const num = (v: unknown): number | undefined => {
      if (typeof v !== 'string' || v.trim() === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const { search, role, minLevel, limit, offset } = req.query;
    const page = await listMembers(req.participant!.sub, {
      search: typeof search === 'string' ? search : undefined,
      role: typeof role === 'string' && isMemberRole(role) ? role : undefined,
      minLevel: num(minLevel),
      limit: num(limit),
      offset: num(offset),
    });
    // `members` preserved for existing callers; `total`/`has_more` are new.
    res.json(page);
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/community/presence/ping', requireParticipant, async (req, res) => {
  try {
    const { touchPresence } = await import('../services/communityService');
    const result = await touchPresence(req.participant!.sub);
    res.json(result);
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

// Cohort presence for the portal right-rail "Contacts" panel (PortalShell).
router.get('/api/portal/cohort/presence', requireParticipant, async (req, res) => {
  try {
    const { getCohortPresence } = await import('../services/cohortPresenceService');
    const contacts = await getCohortPresence(req.participant!.sub, req.participant!.cohort_id);
    res.json({ contacts });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

// Friends — send a request / respond to one. Idempotent, cohort-scoped. The
// caller's friendship status toward each cohort-mate rides on /cohort/presence
// (friendshipStatus), so the rail needs no separate list endpoint.
router.post('/api/portal/friends/request', requireParticipant, async (req, res) => {
  const parsed = z.object({ targetId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid targetId' }); return; }
  try {
    const { sendFriendRequest } = await import('../services/friendshipService');
    const result = await sendFriendRequest(req.participant!.sub, parsed.data.targetId);
    res.json(result);
  } catch (err: any) {
    if (err?.name === 'FriendRequestError') { res.status(400).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Could not send friend request' });
  }
});

router.post('/api/portal/friends/respond', requireParticipant, async (req, res) => {
  const parsed = z.object({ requesterId: z.string().uuid(), accept: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid request body' }); return; }
  try {
    const { respondToRequest } = await import('../services/friendshipService');
    const result = await respondToRequest(req.participant!.sub, parsed.data.requesterId, parsed.data.accept);
    res.json(result);
  } catch (err: any) {
    if (err?.name === 'FriendRequestError') { res.status(400).json({ error: err.message }); return; }
    res.status(500).json({ error: 'Could not respond to friend request' });
  }
});

// Direct messages — 1:1 chat modelled as a 2-person private room (room_type
// 'dm'), reusing the persisted RoomMessage layer. Not flag-gated. Cohort-scoped.
router.post('/api/portal/dm/open', requireParticipant, async (req, res) => {
  const parsed = z.object({ otherId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid recipient' }); return; }
  try {
    const { openDm } = await import('../services/communityRooms/dmService');
    const result = await openDm(req.participant!.sub, parsed.data.otherId, req.participant!.cohort_id);
    res.json(result);
  } catch (err: any) {
    if (err?.name === 'DmError') { res.status(400).json({ error: err.message }); return; }
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/dm/:roomId/messages', requireParticipant, async (req, res) => {
  const parsed = z.object({ roomId: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid conversation' }); return; }
  try {
    const { listDmMessages } = await import('../services/communityRooms/dmService');
    const ctx = { enrollmentId: req.participant!.sub, cohortId: req.participant!.cohort_id, isAdmin: false };
    const since = typeof req.query.since === 'string' ? req.query.since : undefined;
    const result = await listDmMessages(ctx, parsed.data.roomId, since);
    res.json(result);
  } catch (err: any) {
    if (err?.name === 'DmError') { res.status(400).json({ error: err.message }); return; }
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/dm/:roomId/send', requireParticipant, async (req, res) => {
  const params = z.object({ roomId: z.string().uuid() }).safeParse(req.params);
  const body = z.object({ content: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: 'Invalid message' }); return; }
  try {
    const { sendDmMessage } = await import('../services/communityRooms/dmService');
    const ctx = { enrollmentId: req.participant!.sub, cohortId: req.participant!.cohort_id, isAdmin: false };
    const message = await sendDmMessage(ctx, params.data.roomId, body.data.content);
    res.status(201).json({ message });
  } catch (err: any) {
    if (err?.name === 'DmError') { res.status(400).json({ error: err.message }); return; }
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

// Messages inbox — my DM conversations (+ unread) and a read receipt.
router.get('/api/portal/dm/conversations', requireParticipant, async (req, res) => {
  try {
    const { listConversations } = await import('../services/communityRooms/dmService');
    const conversations = await listConversations(req.participant!.sub);
    res.json({ conversations });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.post('/api/portal/dm/:roomId/read', requireParticipant, async (req, res) => {
  const parsed = z.object({ roomId: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid conversation' }); return; }
  try {
    const { markDmRead } = await import('../services/communityRooms/dmService');
    await markDmRead(req.participant!.sub, parsed.data.roomId);
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'DmError') { res.status(400).json({ error: err.message }); return; }
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

router.get('/api/portal/community/members/:memberId', requireParticipant, async (req, res) => {
  const paramsParsed = MemberIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    res.status(400).json({ error: 'Invalid member id' });
    return;
  }
  try {
    const { getMemberProfileById } = await import('../services/communityService');
    const profile = await getMemberProfileById(req.participant!.sub, paramsParsed.data.memberId);
    res.json({ profile });
  } catch (err: any) {
    res.status(communityErrorStatus(err)).json({ error: err.message });
  }
});

export default router;
