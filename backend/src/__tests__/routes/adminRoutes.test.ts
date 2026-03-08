/**
 * Route Registration Test
 * Validates that all expected admin routes are registered and wired to handlers.
 * This test imports the router and inspects its route stack — no database needed.
 */

// Mock all controller imports before importing the router
jest.mock('../../controllers/adminAuthController', () => mockHandlers('handleAdminLogin', 'handleAdminLogout'));
jest.mock('../../controllers/adminCohortController', () => mockHandlers('handleAdminListCohorts', 'handleAdminGetCohort', 'handleAdminUpdateCohort', 'handleAdminExportCohort', 'handleAdminGetStats'));
jest.mock('../../controllers/adminLeadController', () => mockHandlers('handleAdminListLeads', 'handleAdminGetLeadStats', 'handleAdminGetLead', 'handleAdminUpdateLead', 'handleAdminExportLeads', 'handleAdminUpdatePipelineStage', 'handleAdminGetPipelineStats', 'handleAdminCreateLead', 'handleAdminBatchUpdate', 'handleGetTemperatureHistory', 'handleUpdateTemperature', 'handleGetLeadStrategyPrep', 'handleDeleteLead'));
jest.mock('../../controllers/adminActivityController', () => mockHandlers('handleListActivities', 'handleCreateActivity'));
jest.mock('../../controllers/adminAppointmentController', () => mockHandlers('handleListAppointments', 'handleGetUpcomingAppointments', 'handleCreateAppointment', 'handleUpdateAppointment'));
jest.mock('../../controllers/adminSequenceController', () => mockHandlers('handleListSequences', 'handleGetSequence', 'handleCreateSequence', 'handleUpdateSequence', 'handleDeleteSequence', 'handleEnrollLeadInSequence', 'handleCancelLeadSequence', 'handleGetLeadSequenceStatus'));
jest.mock('../../controllers/adminImportController', () => ({ ...mockHandlers('handleImportLeads', 'handleGetImportTemplate'), uploadMiddleware: (_req: any, _res: any, next: any) => next() }));
jest.mock('../../controllers/adminRevenueController', () => mockHandlers('handleGetRevenueDashboard'));
jest.mock('../../controllers/adminSettingsController', () => mockHandlers('handleGetSettings', 'handleUpdateSettings', 'handleListEvents', 'handleGetEventTypes', 'handleSendTestDigest'));
jest.mock('../../controllers/adminOpportunityController', () => mockHandlers('handleGetLeadJourney', 'handleGetVisitorJourney', 'handleGetOpportunityScores', 'handleGetOpportunitySummary', 'handleGetForecastProjections', 'handleRecomputeOpportunities'));
jest.mock('../../controllers/adminInsightController', () => mockHandlers('handleGetInsights', 'handleGetInsightSummary', 'handleGetRecommendations', 'handleComputeInsights', 'handleGetOutcomes', 'handleGetOutcomeStats', 'handleGetCampaignOutcomes', 'handleGetLeadOutcomes'));
jest.mock('../../controllers/adminVisitorController', () => mockHandlers('handleListVisitors', 'handleGetVisitorStats', 'handleGetLiveVisitors', 'handleGetVisitorTrend', 'handleGetVisitorProfile', 'handleGetVisitorSessions', 'handleGetSessionEvents', 'handleGetVisitorSignals', 'handleGetVisitorIntent', 'handleGetHighIntentVisitors', 'handleGetIntentDistribution', 'handleGetSignalDefinitions', 'handleListChatConversations', 'handleGetChatConversation', 'handleGetChatStats'));
jest.mock('../../controllers/icpProfileController', () => mockHandlers('handleCreateICPProfile', 'handleListICPProfiles', 'handleGetICPProfile', 'handleUpdateICPProfile', 'handleDeleteICPProfile', 'handleSearchApolloFromProfile', 'handleRefreshProfileStats', 'handleGetProfileRecommendations', 'handleApplyRecommendation', 'handleSearchAndEnroll', 'handleBuildColdCampaign', 'handleGetSequenceTemplates'));
jest.mock('../../controllers/adminCampaignController', () => mockHandlers('handleListCampaigns', 'handleCreateCampaign', 'handleGetCampaign', 'handleUpdateCampaign', 'handleDeleteCampaign', 'handleActivateCampaign', 'handlePauseCampaign', 'handleCompleteCampaign', 'handleEnrollLeads', 'handleRemoveLeadFromCampaign', 'handleGetMatchingLeads', 'handleGetCampaignStats', 'handleGetCampaignLeads', 'handleApolloSearch', 'handleApolloImport', 'handleApolloEnrich', 'handleApolloQuota', 'handleAIPreview', 'handleGetCampaignAnalytics', 'handleGetCampaignSettings', 'handleUpdateCampaignSettings', 'handleUpdateCampaignGTM', 'handleGetEnrichedCampaignLeads', 'handleGetLeadCampaignTimeline', 'handleGhlSync', 'handleGhlStatus', 'handleGhlTestSms', 'handleGhlResyncLead', 'handleGenerateICP'));
jest.mock('../../controllers/acceleratorController', () => mockHandlers('handleListSessions', 'handleGetSession', 'handleCreateSession', 'handleUpdateSession', 'handleDeleteSession', 'handleGenerateMeetLink', 'handleGetAttendance', 'handleMarkAttendance', 'handleUpdateAttendance', 'handleListEnrollmentSubmissions', 'handleListSessionSubmissions', 'handleCreateSubmission', 'handleUpdateSubmission', 'handleUploadSubmission', 'handleGetReadiness', 'handleComputeReadiness', 'handleComputeAllReadiness', 'handleGetDashboard', 'handleCreateEnrollment', 'handleListCohortEnrollments', 'handleSetPortalAccess'));
jest.mock('../../controllers/curriculumController', () => mockHandlers('handleAdminOverrideLessonStatus', 'handleAdminGetLabResponses', 'handleAdminListModules', 'handleAdminGetParticipantProgress', 'handleAdminExportProjectArchitect'));
jest.mock('../../controllers/programBlueprintController', () => mockHandlers('handleListPrograms', 'handleGetProgram', 'handleCreateProgram', 'handleUpdateProgram', 'handleDeleteProgram', 'handleCloneProgram'));
jest.mock('../../controllers/miniSectionController', () => mockHandlers('handleListMiniSections', 'handleGetMiniSection', 'handleCreateMiniSection', 'handleUpdateMiniSection', 'handleDeleteMiniSection', 'handleReorderMiniSections'));
jest.mock('../../controllers/variableDefinitionController', () => mockHandlers('handleListVariableDefinitions', 'handleGetVariableDefinition', 'handleCreateVariableDefinition', 'handleUpdateVariableDefinition', 'handleDeleteVariableDefinition'));
jest.mock('../../controllers/sessionChecklistController', () => mockHandlers('handleListChecklistItems', 'handleCreateChecklistItem', 'handleUpdateChecklistItem', 'handleDeleteChecklistItem'));
jest.mock('../../controllers/orchestrationController', () => mockHandlers('handleListPromptTemplates', 'handleGetPromptTemplate', 'handleCreatePromptTemplate', 'handleUpdatePromptTemplate', 'handleDeletePromptTemplate', 'handlePreviewPromptTemplate', 'handleListSections', 'handleGetSection', 'handleCreateSection', 'handleUpdateSection', 'handleDeleteSection', 'handleListArtifacts', 'handleGetArtifact', 'handleCreateArtifact', 'handleUpdateArtifact', 'handleDeleteArtifact', 'handleGetVariables', 'handleGetVariableGraph', 'handleGetSessionFlow', 'handleGetSessionDetail', 'handleGetDashboard', 'handleGetArtifactStatus', 'handleGetProgramModules', 'handleGetProgramSessions', 'handleGetProgramFlow', 'handleGetProgramSkills', 'handleGetProgramGates', 'handleGetLesson', 'handleUpdateLesson', 'handleUpdateSessionFields', 'handleValidatePrompt', 'handlePreviewPrompt', 'handleIntegrityCheck', 'handleDryRunSection', 'handleRouteAudit'));
jest.mock('../../middlewares/authMiddleware', () => ({ requireAdmin: (_req: any, _res: any, next: any) => next() }));
jest.mock('../../middlewares/auditMiddleware', () => ({ auditMiddleware: (_req: any, _res: any, next: any) => next() }));
jest.mock('../../config/upload', () => ({ strategyPrepUpload: { single: () => (_req: any, _res: any, next: any) => next() }, UPLOAD_DIR: '/tmp' }));
jest.mock('../../services/analyticsService', () => ({
  getSessionCompletionRates: jest.fn().mockResolvedValue([]),
  getArtifactCompletionMatrix: jest.fn().mockResolvedValue([]),
  getBuildPhaseTracker: jest.fn().mockResolvedValue([]),
  getGitHubCommitSummary: jest.fn().mockResolvedValue([]),
  getPresentationReadiness: jest.fn().mockResolvedValue([]),
}));

function mockHandlers(...names: string[]) {
  const obj: Record<string, any> = {};
  for (const name of names) {
    obj[name] = (_req: any, res: any) => res.json({ ok: true });
  }
  return obj;
}

import adminRouter from '../../routes/adminRoutes';

interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
}

function extractRoutes(router: any): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];
  const stack = router.stack || [];
  for (const layer of stack as RouteLayer[]) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: layer.route.path });
      }
    }
  }
  return routes;
}

describe('Admin Routes Registration', () => {
  const routes = extractRoutes(adminRouter);

  test('should have at least 100 registered routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(100);
  });

  // Orchestration routes — critical for the engine
  const orchestrationRoutes = [
    { method: 'GET', path: '/api/admin/orchestration/prompts' },
    { method: 'POST', path: '/api/admin/orchestration/prompts' },
    { method: 'GET', path: '/api/admin/orchestration/prompts/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/prompts/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/prompts/:id' },
    { method: 'POST', path: '/api/admin/orchestration/prompts/:id/preview' },
    { method: 'GET', path: '/api/admin/orchestration/sessions/:sessionId/sections' },
    { method: 'POST', path: '/api/admin/orchestration/sessions/:sessionId/sections' },
    { method: 'GET', path: '/api/admin/orchestration/sections/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/sections/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/sections/:id' },
    { method: 'GET', path: '/api/admin/orchestration/sessions/:sessionId/artifacts' },
    { method: 'POST', path: '/api/admin/orchestration/sessions/:sessionId/artifacts' },
    { method: 'GET', path: '/api/admin/orchestration/artifacts/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/artifacts/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/artifacts/:id' },
    { method: 'GET', path: '/api/admin/orchestration/enrollments/:enrollmentId/variables' },
    { method: 'GET', path: '/api/admin/orchestration/enrollments/:enrollmentId/variables/graph' },
    { method: 'GET', path: '/api/admin/orchestration/cohorts/:cohortId/flow' },
    { method: 'GET', path: '/api/admin/orchestration/cohorts/:cohortId/dashboard' },
    { method: 'GET', path: '/api/admin/orchestration/sessions/:sessionId/detail' },
    { method: 'GET', path: '/api/admin/orchestration/lessons/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/lessons/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/sessions/:id/fields' },
    { method: 'GET', path: '/api/admin/orchestration/programs' },
    { method: 'POST', path: '/api/admin/orchestration/programs' },
    { method: 'GET', path: '/api/admin/orchestration/programs/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/programs/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/programs/:id' },
    { method: 'POST', path: '/api/admin/orchestration/programs/:id/clone' },
    { method: 'GET', path: '/api/admin/orchestration/lessons/:lessonId/mini-sections' },
    { method: 'POST', path: '/api/admin/orchestration/lessons/:lessonId/mini-sections' },
    { method: 'PUT', path: '/api/admin/orchestration/lessons/:lessonId/mini-sections/reorder' },
    { method: 'GET', path: '/api/admin/orchestration/mini-sections/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/mini-sections/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/mini-sections/:id' },
    { method: 'GET', path: '/api/admin/orchestration/variable-definitions' },
    { method: 'POST', path: '/api/admin/orchestration/variable-definitions' },
    { method: 'GET', path: '/api/admin/orchestration/variable-definitions/:id' },
    { method: 'PUT', path: '/api/admin/orchestration/variable-definitions/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/variable-definitions/:id' },
    { method: 'GET', path: '/api/admin/orchestration/sessions/:sessionId/checklist' },
    { method: 'POST', path: '/api/admin/orchestration/sessions/:sessionId/checklist' },
    { method: 'PUT', path: '/api/admin/orchestration/checklist/:id' },
    { method: 'DELETE', path: '/api/admin/orchestration/checklist/:id' },
    { method: 'GET', path: '/api/admin/orchestration/program/modules' },
    { method: 'GET', path: '/api/admin/orchestration/program/sessions' },
    { method: 'GET', path: '/api/admin/orchestration/program/flow' },
    { method: 'GET', path: '/api/admin/orchestration/program/skills' },
    { method: 'GET', path: '/api/admin/orchestration/program/gates' },
  ];

  test.each(orchestrationRoutes)(
    'should have route $method $path',
    ({ method, path }) => {
      const found = routes.find(r => r.method === method && r.path === path);
      expect(found).toBeDefined();
    }
  );

  // Analytics routes
  const analyticsRoutes = [
    { method: 'GET', path: '/api/admin/orchestration/analytics/completion/:cohortId' },
    { method: 'GET', path: '/api/admin/orchestration/analytics/artifacts/:cohortId' },
    { method: 'GET', path: '/api/admin/orchestration/analytics/build-phase/:cohortId' },
    { method: 'GET', path: '/api/admin/orchestration/analytics/github/:cohortId' },
    { method: 'GET', path: '/api/admin/orchestration/analytics/presentation/:cohortId' },
  ];

  test.each(analyticsRoutes)(
    'should have analytics route $method $path',
    ({ method, path }) => {
      const found = routes.find(r => r.method === method && r.path === path);
      expect(found).toBeDefined();
    }
  );

  // Auth routes (public)
  test('should have login route', () => {
    expect(routes.find(r => r.method === 'POST' && r.path === '/api/admin/login')).toBeDefined();
  });

  test('should have logout route', () => {
    expect(routes.find(r => r.method === 'POST' && r.path === '/api/admin/logout')).toBeDefined();
  });

  // No duplicate routes
  test('should have no duplicate routes', () => {
    const routeKeys = routes.map(r => `${r.method} ${r.path}`);
    const uniqueKeys = new Set(routeKeys);
    const duplicates = routeKeys.filter((key, i) => routeKeys.indexOf(key) !== i);
    expect(duplicates).toEqual([]);
  });
});
