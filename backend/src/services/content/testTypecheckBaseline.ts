/**
 * testTypecheckBaseline - the frozen, SHRINK-ONLY high-water mark for type
 * errors in backend test files.
 *
 * WHY THIS EXISTS. `tsconfig.json` excludes test files, and ts-jest runs with
 * `isolatedModules`, which transpiles without checking types. So a type error
 * in a test file passes every gate in this repo. That matters more here than it
 * would elsewhere: the guards protecting Person 360 and the Sales Readiness
 * Score ARE test files. The thing doing the checking was itself unchecked.
 *
 * WHY A BASELINE AND NOT A CLEAN GATE. Measured 2026-10-17 with
 * `tsconfig.test.json`: **400 errors across 141 files, every one a test file and
 * none in src**. A gate that simply failed could not be merged, so it would be
 * switched off instead. A baseline makes the existing debt a tracked, named
 * number and gates the only thing still preventable - a NEW one.
 *
 * WHY SHRINK-ONLY. Per file the count must EQUAL the frozen number. Up is a new
 * error. DOWN also fails, naming the new number, and an entry that reaches zero
 * must be deleted. A file absent from this table must have zero. So a new test
 * file is covered the moment it is written, and the baseline can only shrink.
 *
 * COST, measured, because it is a real tradeoff: the full check takes about
 * 12.5 minutes and needs --max-old-space-size=8192. At the default heap it dies
 * after ~490s with a heap FATAL ERROR, which prints no diagnostics and exits
 * 134 - a crash that reads exactly like a clean pass. The runner must therefore
 * assert that tsc actually COMPLETED, never merely that it found nothing.
 *
 * HOW TO CHANGE IT. Fix the errors, run the checker, paste the number it tells
 * you. Never raise an entry to make a build pass; raising one is the thing this
 * file exists to prevent.
 */

/** Path relative to `backend/`, forward slashes -> frozen error count. */
export const TEST_TYPECHECK_BASELINE: Readonly<Record<string, number>> = {
  'src/__tests__/scripts/auditCurriculumVideoLinks.test.ts': 2,
  'src/__tests__/services/outcomes/outcomeMeasurementService.test.ts': 2,
  'src/__tests__/services/paymentReconciliationService.test.ts': 9,
  'src/controllers/__tests__/inboxCaseController.listCases.test.ts': 19,
  'src/controllers/__tests__/replyClassificationHook.test.ts': 1,
  'src/data/certBlueprints/__tests__/bankRubricFloor.test.ts': 1,
  'src/db/__tests__/ensureGrowthJourneySchema.parity.test.ts': 4,
  'src/middlewares/__tests__/mgmtSectionGate.agentDomains.test.ts': 4,
  'src/middlewares/__tests__/mgmtSectionGate.brandPaths.test.ts': 1,
  'src/models/__tests__/ticketDueDateDefaultHook.test.ts': 1,
  'src/routes/__tests__/caseStudyPrivateRepoLeakProof.test.ts': 1,
  'src/routes/__tests__/linkedInCallbackRoutes.test.ts': 1,
  'src/routes/admin/__tests__/caseStudyServiceLinkRoutes.test.ts': 1,
  'src/routes/admin/__tests__/factoryRoutes.test.ts': 1,
  'src/routes/admin/__tests__/govQualificationRoutes.test.ts': 1,
  'src/routes/admin/__tests__/internshipConsole.test.ts': 1,
  'src/routes/admin/__tests__/internshipConsoleTransition.test.ts': 1,
  'src/routes/admin/__tests__/projectLifecycleRoutes.test.ts': 1,
  'src/scripts/__tests__/backfillBasecampDigestReferences.test.ts': 1,
  'src/scripts/__tests__/backfillExplorerEnteredAt.test.ts': 2,
  'src/scripts/__tests__/backfillTicketDueDates20260928.test.ts': 1,
  'src/scripts/__tests__/classifyAiAgentAutonomyLevels.test.ts': 1,
  'src/scripts/__tests__/consolidateDuplicateStrategicInitiatives.test.ts': 1,
  'src/scripts/__tests__/resolveStaleStrategicInitiatives.test.ts': 1,
  'src/scripts/__tests__/seedSampleContractProject.test.ts': 1,
  'src/scripts/lib/__tests__/internDeliveryCoachNote.test.ts': 2,
  'src/scripts/lib/__tests__/internDeliveryOwnership.test.ts': 3,
  'src/scripts/lib/__tests__/internDeliveryScope.test.ts': 1,
  'src/scripts/lib/__tests__/openclawDuplicateTicketClusters.test.ts': 3,
  'src/scripts/lib/__tests__/studentUnblockBatch.test.ts': 1,
  'src/services/__tests__/agentManagerConversationService.approvalDecisionIntent.test.ts': 1,
  'src/services/__tests__/agentManagerConversationService.assignWorkIntent.test.ts': 1,
  'src/services/__tests__/agentManagerConversationService.goalIntent.test.ts': 1,
  'src/services/__tests__/agentManagerConversationService.instructIntent.test.ts': 1,
  'src/services/__tests__/agentManagerConversationService.oneOnOneIntent.test.ts': 1,
  'src/services/__tests__/bannedWordOutboundCopy.test.ts': 12,
  'src/services/__tests__/leadIngestionRoutingFailure.test.ts': 6,
  'src/services/__tests__/mandrillEngagementPoll.test.ts': 1,
  'src/services/__tests__/marketingRevenueShape.behaviour.test.ts': 1,
  'src/services/__tests__/mentorFeedbackGate.test.ts': 7,
  'src/services/__tests__/projectReleaseMeta.test.ts': 5,
  'src/services/__tests__/synthflowWebhookUrl.test.ts': 3,
  'src/services/__tests__/zoomService.test.ts': 1,
  'src/services/agentDomain/__tests__/agentDomainStoryTemplates.test.ts': 1,
  'src/services/agentDomain/__tests__/promotionCriteria.test.ts': 1,
  'src/services/agents/departments/superAgents/__tests__/superAgentBase.test.ts': 2,
  'src/services/cape/__tests__/capeEligibilityFilter.test.ts': 1,
  'src/services/cape/__tests__/capeLearningValuePolicy.test.ts': 29,
  'src/services/cape/__tests__/capeLearningValueScorer.test.ts': 8,
  'src/services/capstone/__tests__/capstoneRecordContract.test.ts': 3,
  'src/services/career/__tests__/portfolioHeroImage.test.ts': 3,
  'src/services/caseStudy/__tests__/caseStudyPublicationService.test.ts': 2,
  'src/services/caseStudy/__tests__/caseStudyRepoScope.test.ts': 1,
  'src/services/caseStudy/__tests__/caseStudySurfaceLens.test.ts': 1,
  'src/services/caseStudy/__tests__/caseStudySyncService.test.ts': 1,
  'src/services/caseStudy/__tests__/caseStudyVisualStoryGenerate.test.ts': 2,
  'src/services/caseStudy/__tests__/caseStudyVisualStoryValidate.test.ts': 2,
  'src/services/caseStudy/__tests__/snapshotFixtures.ts': 2,
  'src/services/caseStudy/metrics/__tests__/deliveryElapsedDays.test.ts': 1,
  'src/services/caseStudy/metrics/__tests__/stage3Definitions.test.ts': 1,
  'src/services/caseStudy/metrics/__tests__/systemsBuiltByLearners.test.ts': 1,
  'src/services/certPrep/__tests__/certQuestionBankService.test.ts': 1,
  'src/services/classKit/__tests__/kitDeckScript.test.ts': 6,
  'src/services/classKit/__tests__/promptBrief.test.ts': 6,
  'src/services/content/__tests__/composerConfirmation.test.ts': 1,
  'src/services/content/__tests__/documents.test.ts': 1,
  'src/services/curriculumHealth/__tests__/videoLinkClassifier.test.ts': 2,
  'src/services/curriculumHealth/__tests__/videoLinkProbe.test.ts': 1,
  'src/services/delivery/__tests__/buildFromUnderstanding.test.ts': 1,
  'src/services/delivery/__tests__/clientAllowlistContract.test.ts': 1,
  'src/services/delivery/__tests__/deliveryContractService.test.ts': 1,
  'src/services/delivery/__tests__/deliveryDesignLoop.test.ts': 2,
  'src/services/delivery/__tests__/deliveryOpportunityMap.test.ts': 1,
  'src/services/delivery/__tests__/designBriefFacts.test.ts': 1,
  'src/services/delivery/__tests__/flotationCallCompletion.test.ts': 1,
  'src/services/delivery/__tests__/projectSourceLink.test.ts': 1,
  'src/services/factory/__tests__/factoryBackfill.test.ts': 1,
  'src/services/factory/__tests__/factoryDecomposeRun.test.ts': 1,
  'src/services/factory/__tests__/govBuildPlanAI.test.ts': 2,
  'src/services/factory/proposal/__tests__/proposalIngest.test.ts': 1,
  'src/services/growthJourney/classification/__tests__/aiClassifier.test.ts': 6,
  'src/services/inbox/watcher/__tests__/cronRetirement.test.ts': 1,
  'src/services/inbox/watcher/__tests__/watcherFloodGuards.test.ts': 17,
  'src/services/inbox/watcher/__tests__/watcherOffRosterHumans.test.ts': 7,
  'src/services/inboxCase/__tests__/caseActionExecutors.test.ts': 6,
  'src/services/inboxCase/__tests__/caseAutoSyncService.test.ts': 9,
  'src/services/inboxCase/__tests__/caseExecutionService.test.ts': 4,
  'src/services/inboxCase/__tests__/caseKnowledgeService.test.ts': 3,
  'src/services/inboxCase/__tests__/caseReopenService.test.ts': 8,
  'src/services/inboxCase/__tests__/caseRepository.test.ts': 3,
  'src/services/inboxCase/__tests__/caseTicketService.test.ts': 2,
  'src/services/inboxCase/__tests__/inboxLivenessService.test.ts': 2,
  'src/services/inboxCase/__tests__/promptInjection.test.ts': 2,
  'src/services/inboxCase/sources/__tests__/basecampCaseSource.test.ts': 2,
  'src/services/internship/__tests__/internConsoleActivity.test.ts': 7,
  'src/services/internship/__tests__/internConsoleRoster.test.ts': 1,
  'src/services/internship/__tests__/internshipProjectGeneration.test.ts': 1,
  'src/services/internship/__tests__/internshipProjectPortfolio.test.ts': 1,
  'src/services/internship/__tests__/internshipRecommendation.test.ts': 1,
  'src/services/internship/__tests__/internshipStudentDashboard.test.ts': 2,
  'src/services/lifecycle/__tests__/lifecycleEvidence.requirementsGate.test.ts': 1,
  'src/services/lifecycle/__tests__/lifecyclePlanReads.integration.test.ts': 1,
  'src/services/lifecycle/__tests__/registrationCutoff.test.ts': 1,
  'src/services/lifecycle/adapters/__tests__/manifestRefs.test.ts': 4,
  'src/services/lifecycle/generation/__tests__/designSelection.test.ts': 1,
  'src/services/lifecycle/generation/__tests__/workspaceMapping.test.ts': 2,
  'src/services/lifecycle/pilot/__tests__/generatePilotReport.ts': 1,
  'src/services/marketing/__tests__/channelAccountService.test.ts': 2,
  'src/services/marketing/__tests__/clickClassification.test.ts': 1,
  'src/services/marketing/__tests__/trackedLinkDestination.test.ts': 1,
  'src/services/presentation/__tests__/presentationCoach.test.ts': 1,
  'src/services/presentation/__tests__/presentationDeckService.test.ts': 1,
  'src/services/publishing/__tests__/adapterRegistry.live.test.ts': 1,
  'src/services/publishing/__tests__/linkedInAdapter.test.ts': 1,
  'src/services/publishing/__tests__/linkedInVideo.test.ts': 1,
  'src/services/publishing/__tests__/metaAdapter.test.ts': 1,
  'src/services/renewal/__tests__/lapseFollowup.test.ts': 4,
  'src/services/renewal/__tests__/renewalReminderEmail.test.ts': 14,
  'src/services/sbp/__tests__/commandCenterDataContract.test.ts': 2,
  'src/services/sbp/__tests__/commandCenterStory.progressExample.test.ts': 1,
  'src/services/sbp/__tests__/decomposeService.workspaceFlow.test.ts': 1,
  'src/services/sbp/__tests__/planDocSections.references.test.ts': 1,
  'src/services/sbp/__tests__/planDocument.systems.test.ts': 1,
  'src/services/sbp/__tests__/planStore.test.ts': 1,
  'src/services/sbp/__tests__/refreshRepoDocuments.access.test.ts': 1,
  'src/services/sbp/__tests__/repoConnectService.test.ts': 1,
  'src/services/sbp/__tests__/requirementExtraction.test.ts': 5,
  'src/services/sbp/__tests__/sbpOrchestrator.naming.test.ts': 2,
  'src/services/sbp/__tests__/sbpOrchestrator.test.ts': 12,
  'src/services/sbp/__tests__/scopeAgents.test.ts': 2,
  'src/services/sbp/verification/__tests__/progressReadError.test.ts': 3,
  'src/services/sbp/verification/__tests__/rejectedClaimsSignal.test.ts': 1,
  'src/services/timeline/__tests__/feedControlService.listEnrollments.test.ts': 6,
  'src/services/timeline/__tests__/feedTypeStatsService.test.ts': 1,
  'src/services/timeline/__tests__/todayFeedComposer.ambientBackfill.test.ts': 1,
  'src/services/timeline/__tests__/todayFeedComposer.ambientSuppression.test.ts': 3,
  'src/services/timeline/__tests__/todayFeedComposer.capeFlagOn.test.ts': 18,
  'src/services/timeline/__tests__/todayFeedComposer.dailyRefreshFlagOn.test.ts': 1,
  'src/services/workforce/__tests__/orgChartColorAssignment.test.ts': 3,
  'src/types/__tests__/caseStudyContractFixtures.ts': 3,
  'src/types/__tests__/caseStudyContracts.test.ts': 1,
};

/** The sum the table asserts, kept beside it so a careless edit is visible. */
export const TEST_TYPECHECK_BASELINE_TOTAL = 400;
