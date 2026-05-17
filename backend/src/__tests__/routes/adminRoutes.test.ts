/**
 * Route Registration Test
 * Validates that all expected admin routes are registered and wired to handlers.
 * This test imports the router and inspects its route stack — no database needed.
 */

// Mock all controller imports before importing the router. This block is
// re-generated from the actual admin route files' imports — every
// controller export referenced by any admin route file is mocked here,
// so the test self-maintains as controllers grow new handlers.
// Re-generate with: node tmp/generateAdminMocks.js
jest.mock('../../controllers/acceleratorController', () => mockHandlers('handleComputeAllReadiness', 'handleComputeReadiness', 'handleCreateEnrollment', 'handleCreateSession', 'handleCreateSubmission', 'handleDeleteSession', 'handleGenerateMeetLink', 'handleGetAttendance', 'handleGetDashboard', 'handleGetReadiness', 'handleGetSession', 'handleListCohortEnrollments', 'handleListEnrollmentSubmissions', 'handleListSessionSubmissions', 'handleListSessions', 'handleMarkAttendance', 'handleSetPortalAccess', 'handleUpdateAttendance', 'handleUpdateSession', 'handleUpdateSubmission', 'handleUploadSubmission'));
jest.mock('../../controllers/adminActivityController', () => mockHandlers('handleCreateActivity', 'handleListActivities'));
jest.mock('../../controllers/adminAppointmentController', () => mockHandlers('handleCreateAppointment', 'handleGetUpcomingAppointments', 'handleListAppointments', 'handleUpdateAppointment'));
jest.mock('../../controllers/adminAuthController', () => mockHandlers('handleAdminLogin', 'handleAdminLogout'));
jest.mock('../../controllers/adminCampaignController', () => mockHandlers('handleAIPreview', 'handleActivateCampaign', 'handleApolloEnrich', 'handleApolloImport', 'handleApolloQuota', 'handleApolloSearch', 'handleCompleteCampaign', 'handleCreateCampaign', 'handleDeleteCampaign', 'handleEnrollLeads', 'handleGenerateICP', 'handleGetCampaign', 'handleGetCampaignAnalytics', 'handleGetCampaignLeads', 'handleGetCampaignSettings', 'handleGetCampaignStats', 'handleGetEnrichedCampaignLeads', 'handleGetLeadCampaignTimeline', 'handleGetMatchingLeads', 'handleGhlResyncLead', 'handleGhlStatus', 'handleGhlSync', 'handleGhlTestSms', 'handleListCampaigns', 'handlePauseCampaign', 'handleRebuildCampaign', 'handleRemoveLeadFromCampaign', 'handleReverseEngineer', 'handleUpdateCampaign', 'handleUpdateCampaignGTM', 'handleUpdateCampaignSettings'));
jest.mock('../../controllers/adminCohortController', () => mockHandlers('handleAdminExportCohort', 'handleAdminGetCohort', 'handleAdminGetStats', 'handleAdminListCohorts', 'handleAdminUpdateCohort'));
jest.mock('../../controllers/adminImportController', () => ({ ...mockHandlers('handleGetImportTemplate', 'handleImportLeads'), uploadMiddleware: (_req: any, _res: any, next: any) => next() }));
jest.mock('../../controllers/adminInsightController', () => mockHandlers('handleComputeInsights', 'handleGetCampaignOutcomes', 'handleGetInsightSummary', 'handleGetInsights', 'handleGetLeadOutcomes', 'handleGetOutcomeStats', 'handleGetOutcomes', 'handleGetRecommendations'));
jest.mock('../../controllers/adminLeadController', () => mockHandlers('handleAdminBatchUpdate', 'handleAdminCreateLead', 'handleAdminExportLeads', 'handleAdminGetLead', 'handleAdminGetLeadStats', 'handleAdminGetPipelineStats', 'handleAdminListLeads', 'handleAdminUpdateLead', 'handleAdminUpdatePipelineStage', 'handleDeleteLead', 'handleGetLeadStrategyPrep', 'handleGetTemperatureHistory', 'handleUpdateTemperature'));
jest.mock('../../controllers/adminLeadSourceController', () => mockHandlers('createEntryPoint', 'createFormDefinition', 'createRoutingRule', 'createSource', 'deleteEntryPoint', 'deleteFormDefinition', 'deleteRoutingRule', 'deleteSource', 'getIngestLog', 'listFormDefinitions', 'listIngestLogs', 'listRoutingRules', 'listSources', 'updateEntryPoint', 'updateFormDefinition', 'updateRoutingRule', 'updateSource'));
jest.mock('../../controllers/adminMarketingController', () => mockHandlers('handleGetCampaignMetrics'));
jest.mock('../../controllers/adminOpportunityController', () => mockHandlers('handleGetForecastProjections', 'handleGetLeadJourney', 'handleGetOpportunityScores', 'handleGetOpportunitySummary', 'handleGetVisitorJourney', 'handleRecomputeOpportunities'));
jest.mock('../../controllers/adminRevenueController', () => mockHandlers('handleGetRevenueDashboard'));
jest.mock('../../controllers/adminSchedulerController', () => mockHandlers('handleGetLaunchReadiness', 'handleGetSchedulerStatus', 'handlePauseScheduler', 'handleResumeScheduler'));
jest.mock('../../controllers/adminSequenceController', () => mockHandlers('handleCancelLeadSequence', 'handleCreateSequence', 'handleDeleteSequence', 'handleEnrollLeadInSequence', 'handleGetLeadSequenceStatus', 'handleGetSequence', 'handleListSequences', 'handleUpdateSequence'));
jest.mock('../../controllers/adminSettingsController', () => mockHandlers('handleGetEventTypes', 'handleGetSettings', 'handleListEvents', 'handleSendTestDigest', 'handleUpdateSettings'));
jest.mock('../../controllers/adminVisitorController', () => mockHandlers('handleGetChatConversation', 'handleGetChatStats', 'handleGetHighIntentVisitors', 'handleGetIntentDistribution', 'handleGetLiveVisitors', 'handleGetSessionEvents', 'handleGetSignalDefinitions', 'handleGetVisitorIntent', 'handleGetVisitorProfile', 'handleGetVisitorSessions', 'handleGetVisitorSignals', 'handleGetVisitorStats', 'handleGetVisitorTrend', 'handleListChatConversations', 'handleListSessions', 'handleListVisitors'));
jest.mock('../../controllers/admissionsController', () => mockHandlers('handleCreateKnowledge', 'handleGetAdmissionsConversations', 'handleGetAdmissionsStats', 'handleGetCallLog', 'handleGetCallbacks', 'handleGetDocuments', 'handleGetKnowledge', 'handleGetOperationsStats', 'handleUpdateKnowledge'));
jest.mock('../../controllers/agentGovernanceController', () => mockHandlers('handleActivateAgent', 'handleApproveProposal', 'handleEmergencyStop', 'handleGetAgentHealth', 'handleGetPendingAgents', 'handleGetPermissions', 'handleGetProposalPreview', 'handleGetProposedActions', 'handleGetSafetyAlerts', 'handleGetWriteAudits', 'handleRejectProposal', 'handleResumeAgents'));
jest.mock('../../controllers/aiOpsController', () => mockHandlers('handleControlAgent', 'handleDiscoverAgents', 'handleGetActivity', 'handleGetActivityDetail', 'handleGetAgentDetail', 'handleGetAgentHealthScores', 'handleGetAgentRegistry', 'handleGetAgents', 'handleGetCampaignTimeline', 'handleGetErrorDetail', 'handleGetErrors', 'handleGetEvents', 'handleGetExecutionTrace', 'handleGetHealth', 'handleGetOverview', 'handleResolveError', 'handleRestartCampaign', 'handleRunAgent', 'handleTriggerCampaignScan', 'handleTriggerScan', 'handleUpdateAgent'));
jest.mock('../../controllers/autonomousIngestController', () => mockHandlers('applyInsight', 'listInsights', 'refreshInsights'));
jest.mock('../../controllers/campaignDiagnosticsController', () => mockHandlers('handleCampaignAudit', 'handleFullRecovery', 'handleGlobalAudit', 'handleLiveTest', 'handleQueueRebuild', 'handleRampReset', 'handleSafeActivate', 'handleSchedulerVerify', 'handleWatchdogStatus'));
jest.mock('../../controllers/campaignSimulationController', () => mockHandlers('handleAdvanceStep', 'handleCancelSimulation', 'handleGetSimulation', 'handleGetSimulationComms', 'handleGetSimulationHistory', 'handleJumpToStep', 'handlePauseSimulation', 'handleRespondAsLead', 'handleResumeSimulation', 'handleSkipStep', 'handleStartSimulation'));
jest.mock('../../controllers/campaignTestController', () => mockHandlers('handleGetQASummary', 'handleGetTestRunDetail', 'handleGetTestRuns', 'handleRunCampaignTest'));
jest.mock('../../controllers/curriculumController', () => mockHandlers('handleAdminExportProjectArchitect', 'handleAdminGetLabResponses', 'handleAdminGetParticipantProgress', 'handleAdminListModules', 'handleAdminOverrideLessonStatus'));
jest.mock('../../controllers/deploymentController', () => mockHandlers('handleCreateDeployment', 'handleDeleteDeployment', 'handleListDeployments', 'handleListLandingPages', 'handleUpdateDeployment', 'handleUpdateLandingPage'));
jest.mock('../../controllers/generatorController', () => mockHandlers('getGenerator'));
jest.mock('../../controllers/governanceController', () => mockHandlers('handleGetAgents', 'handleGetAlerts', 'handleGetConfig', 'handleGetOverview', 'handleUpdateAgentToggle', 'handleUpdateConfig'));
jest.mock('../../controllers/icpProfileController', () => mockHandlers('handleApplyRecommendation', 'handleBuildColdCampaign', 'handleCreateICPProfile', 'handleDeleteICPProfile', 'handleGetICPProfile', 'handleGetProfileRecommendations', 'handleGetSequenceTemplates', 'handleListICPProfiles', 'handleRefreshProfileStats', 'handleScorePreview', 'handleSearchAndEnroll', 'handleSearchApolloFromProfile', 'handleUpdateICPProfile'));
jest.mock('../../controllers/inboxController', () => mockHandlers('handleApproveDraft', 'handleBatchReclassify', 'handleCreateRule', 'handleCreateVip', 'handleDeleteRule', 'handleDeleteVip', 'handleDigestAction', 'handleGetAuditLogs', 'handleGetDecisionDetail', 'handleGetDecisions', 'handleGetDrafts', 'handleGetLearningInsights', 'handleGetRules', 'handleGetStats', 'handleGetVips', 'handleReclassify', 'handleRejectDraft', 'handleUpdateRule', 'handleUpdateVip'));
jest.mock('../../controllers/ingestStatsController', () => mockHandlers('getIngestStats'));
jest.mock('../../controllers/intelligenceController', () => mockHandlers('handleAssistantQuery', 'handleDataAccessReport', 'handleGetAnomalies', 'handleGetBusinessHierarchy', 'handleGetConfig', 'handleGetDataset', 'handleGetDictionary', 'handleGetEntityCharts', 'handleGetEntityNetwork', 'handleGetExecutiveSummary', 'handleGetForecasts', 'handleGetHealth', 'handleGetKPIs', 'handleGetQAHistory', 'handleGetRankedInsights', 'handleGetRiskEntities', 'handleListDatasets', 'handleListProcesses', 'handleQueryOrchestrator', 'handleTriggerDiscovery', 'handleUpdateConfig'));
jest.mock('../../controllers/leadRecommendationController', () => mockHandlers('handleApproveLeadRec', 'handleApproveRecommendation', 'handleBulkApproveRecommendations', 'handleGetRecommendationStats', 'handleListRecommendations', 'handleRejectLeadRec', 'handleRejectRecommendation'));
jest.mock('../../controllers/miniSectionController', () => mockHandlers('handleCreateMiniSection', 'handleDeleteMiniSection', 'handleGetMiniSection', 'handleGetVariableMap', 'handleListMiniSections', 'handleReorderMiniSections', 'handleUpdateMiniSection'));
jest.mock('../../controllers/orchestrationController', () => mockHandlers('handleCreateArtifact', 'handleCreateOrchSection', 'handleCreatePromptTemplate', 'handleCreateSection', 'handleDeleteArtifact', 'handleDeleteOrchSection', 'handleDeletePromptTemplate', 'handleDeleteSection', 'handleDryRunSection', 'handleGetArtifact', 'handleGetArtifactStatus', 'handleGetDashboard', 'handleGetLesson', 'handleGetOrchDashboard', 'handleGetOrchSection', 'handleGetOrchSessionDetail', 'handleGetProgramFlow', 'handleGetProgramGates', 'handleGetProgramModules', 'handleGetProgramSessions', 'handleGetProgramSkills', 'handleGetPromptTemplate', 'handleGetSection', 'handleGetSessionDetail', 'handleGetSessionFlow', 'handleGetVariableGraph', 'handleGetVariables', 'handleIntegrityCheck', 'handleListArtifacts', 'handleListOrchArtifacts', 'handleListOrchSections', 'handleListPromptTemplates', 'handleListSections', 'handlePreviewPrompt', 'handlePreviewPromptTemplate', 'handleRouteAudit', 'handleUpdateArtifact', 'handleUpdateLesson', 'handleUpdateOrchSection', 'handleUpdatePromptTemplate', 'handleUpdateSection', 'handleUpdateSessionFields', 'handleValidatePrompt'));
jest.mock('../../controllers/programBlueprintController', () => mockHandlers('handleCloneProgram', 'handleCreateProgram', 'handleDeleteProgram', 'handleGetProgram', 'handleListPrograms', 'handleUpdateProgram'));
jest.mock('../../controllers/sessionChecklistController', () => mockHandlers('handleCreateChecklistItem', 'handleDeleteChecklistItem', 'handleListChecklistItems', 'handleUpdateChecklistItem'));
jest.mock('../../controllers/variableDefinitionController', () => mockHandlers('handleCreateVariableDefinition', 'handleDeleteVariableDefinition', 'handleGetVariableDefinition', 'handleListVariableDefinitions', 'handleUpdateVariableDefinition'));
jest.mock('../../controllers/websiteIntelligenceController', () => mockHandlers('handleGetIssueDetail', 'handleGetIssues', 'handleGetSummary', 'handleTriggerScan', 'handleUpdateIssue'));
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

// Decode an Express sub-router mount regex back into its mount path.
// Express stores `router.use('/api/admin/orchestration', sub)` as a layer
// whose regexp.source looks like '^\\/api\\/admin\\/orchestration\\/?(?=\\/|$)'.
// We reverse that into '/api/admin/orchestration' so we can prefix child routes.
function decodeMountPath(regexp: any): string {
  if (!regexp) return '';
  if (regexp.fast_slash) return '';
  const source: string = regexp.source || '';
  return source
    .replace(/^\^/, '')
    .replace(/\\\//g, '/')
    .replace(/\?\(\?=\/\|\$\)/, '')
    .replace(/\$$/, '')
    .replace(/\/\?$/, '')
    .replace(/\/$/, '');
}

function extractRoutes(router: any, basePath = ''): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];
  const stack = router?.stack || [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: basePath + layer.route.path });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const mountPath = decodeMountPath(layer.regexp);
      routes.push(...extractRoutes(layer.handle, basePath + mountPath));
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
