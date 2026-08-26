# Models

**225 Sequelize models** over Postgres (primary) and MSSQL (CCPP, read-mostly). Registered and associated in [index.ts](index.ts).

A model is the contract for its table. All database access goes through one. Raw `sql.query` is permitted only where no model exists, and the result must be typed at the call site.

---

## Changing a model

Three edits, or the model is broken:

1. **SQL migration** — run against prod via SSH + `docker exec`, mirror on dev. Migrations live in [../seeds/](../seeds/).
2. **The attribute interface** in the model file.
3. **The Sequelize column definition and the matching `declare` line.**

Miss any one and you get a model that type-checks and fails at runtime. `Visitor.ts` / `VisitorSession.ts` and their `site_slug` addition are the canonical worked example.

There is **no global `sync()` at boot**, deliberately. An ungated `sync({ alter: true })` has previously created duplicate indexes and OOM'd the container. Schema changes are explicit migrations, always.

Some seed scripts run at boot and **overwrite direct database edits**. If a row keeps reverting after a restart, find the seed that owns it.

---

## Domain map

### Identity, access, and audit
`AdminUser`, `Enrollment`, `Cohort`, `Department`, `Feature`, `Capability`, `SystemSetting`, `AuditLog`, `CompanyAuditLog`, `AgentWriteAudit`, `InboxAuditLog`, `GovernanceAuditEntry`

### Leads and the admissions funnel
`Lead`, `LeadSource`, `RawLeadPayload`, `LeadRecommendation`, `LeadTemperatureHistory`, `IntentScore`, `OpportunityScore`, `RevenueOpportunity`, `ICPProfile`, `ICPInsight`, `Appointment`, `StrategyCall`, `StrategyCallIntelligence`, `CallbackRequest`, `CallContactLog`, `AdmissionsMemory`, `AdmissionsKnowledgeEntry`, `AdmissionsActionLog`, `MayaConversationOutcome`

### Campaigns and marketing
`Campaign`, `CampaignVariant`, `CampaignLead`, `CampaignDeployment`, `CampaignHealth`, `CampaignInsight`, `CampaignError`, `CampaignExperiment`, `CampaignGovernanceConfig`, `CampaignSimulation`, `CampaignSimulationStep`, `CampaignTestRun`, `CampaignTestStep`, `FollowUpSequence`, `ScheduledEmail`, `UnsubscribeEvent`, `LandingPage`, `EntryPoint`, `FormDefinition`, `RoutingRule`

### Visitor tracking and web intelligence
`Visitor`, `VisitorSession`, `PageEvent`, `EngagementEvent`, `BehavioralEvent`, `BehavioralSignal`, `UserJourneyMap`, `DOMSnapshot`, `WebsiteIssue`, `InteractionOutcome`, `StudentNavigationEvent`

### Curriculum and learning
`CurriculumModule`, `CurriculumLesson`, `CurriculumTypeDefinition`, `LessonInstance`, `MiniSection`, `SectionConfig`, `SectionExecutionLog`, `ProgramBlueprint`, `BlueprintSnapshot`, `UserCurriculumProfile`, `SkillDefinition`, `SkillMastery`, `ProgressionLog`, `AssignmentSubmission`, `AttendanceRecord`, `LiveSession`, `SessionChecklist`, `SessionGate`, `SessionChatMessage`

**`CurriculumTypeDefinition` is the one to understand first.** Curriculum card types are data, not code — each row carries its render band, generation prompt, and I/O contract. Adding a card type is a database change plus two committed seed files, not a deploy.

### Student projects and builds
`Project`, `ProjectDna`, `ProjectArtifact`, `ProjectRisk`, `ProjectSystemContract`, `ArtifactDefinition`, `ArtifactRelationship`, `StudentTask`, `StudentSprint`, `BuildSession`, `BuildManifest`, `ArchitectSession`, `RequirementsMap`, `RequirementsGenerationJob`, `WalkSession`, `WalkCapEntry`

`BuildManifest` is the telemetry contract Claude Code emits after every non-trivial build. The portal ingests it and rebuilds the state maps in [../../../system/](../../../system/).

### Mentoring and portfolio
`MentorConversation`, `MentorIntervention`, `ChatConversation`, `ChatMessage`, `NextAction`, `Initiative`, `StrategicInitiative`, `StrategicAction`

### AI agents and governance
`AiAgent`, `AiAgentActivityLog`, `AgentTask`, `AgentTaskResult`, `AgentPerformanceMetric`, `AgentPerformanceSnapshot`, `AgentCreationProposal`, `ProposedAgentAction`, `CapabilityAgentMap`, `GovernanceConfig`, `GovernanceRecommendation`, `AutonomyProgression` fields on related tables, `RiskScoringConfig`, `LearningPolicySnapshot`, `ExperimentProposal`

`AgentWriteAudit` and `ProposedAgentAction` are the pair that makes autonomy reviewable: what an agent wanted to do, and what it actually wrote.

### System state and cognition
`SystemStateSnapshot`, `SystemProcess`, `AiSystemEvent`, `CognitionEvent`, `CognitivePattern`, `CognitiveIncident`, `AnomalyLog`, `EventLedger`, `KnowledgeNode`, `KnowledgeEdge`, `EntitySummary`, `IntelligenceConfig`, `IntelligenceDecision`, `IntelligenceMemory`, `KPISnapshot`, `SimulationAccuracy`, `TestSimulationResult`

`system_state_snapshots` is the engine's table — read it through the engine, never directly. See [../intelligence/systemStateEngine/system/README.md](../intelligence/systemStateEngine/system/README.md).

### Resilience and remediation
`HealingPlan`, `PreparedRemediationPlan`, `RemediationOutcome`, `RemediationTierTransition`, `UXRemediationOutcome`, `IncidentDispatchLog`, `OrchestrationHealth`, `Alert`, `AlertEvent`, `AlertResolution`, `AlertSubscription`, `ExecutiveNotificationPolicy`, `VerificationLog`

### Inbox COS
`InboxEmail`, `InboxClassification`, `InboxRule`, `InboxVip`, `InboxReplyDraft`, `InboxDigestLog`, `InboxDeletedEmail`, `InboxLearningEvent`, `InboxFalseNegativeFeedback`, `InboxOpportunityScore`, `InboxStyleProfile`, `InboxSurfacePreference`

### Ops engine (CB System)
`OpsBcProject`, `OpsBcTodo`, `OpsAiAssessment`, `OpsApprovalQueueItem`, `OpsMetricsDaily`, `OpsSkill`, `Ticket`, `TicketActivity`, `QueueHistoryEntry`, `AutomationLog`, `CronScheduleConfig`

`OpsAiAssessment` has caused disk runaway on prod before. Watch its growth.

### Outbound social (OpenClaw / Skool)
`OpenclawSession`, `OpenclawConversation`, `OpenclawResponse`, `OpenclawSignal`, `OpenclawTask`, `OpenclawLearning`, `SkoolEngagement`, `SkoolResponse`, `SkoolSignal`, `SkoolTask`, `LinkedInActionQueue`, `AuthorityContent`, `ContentGenerationLog`, `ContentFeedback`, `ResponseQueue`

### Alumni and referrals
`AlumniReferral`, `AlumniReferralProfile`, `ReferralActivityEvent`, `ReferralCommission`

### Company and department modeling
`AiCompany`, `CompanyBudget`, `CompanyGoal`, `CompanyDirective`, `DepartmentEvent`, `DepartmentKpi`, `DepartmentReport`

### Preview stacks
`PreviewStack`, `PreviewEvent`

### Visual review
`VisualReviewSession`, `VisualCritiqueItem`, `VisualAISuggestion`, `VisualChangeDecision`, `UIElementFeedback`, `UserInsightFeedback`

### Anthropic partnership tracking
`AnthropicChangeEvent`, `AnthropicContentRegistry`

### Variables, prompts, and templates
`VariableDefinition`, `VariableStore`, `PromptTemplate`, `DatasetRegistry`, `QAHistory`

---

## Conventions

- **PascalCase filename matching the model name**: `LeadSource.ts` exports `LeadSource`.
- **Associations live in [index.ts](index.ts)**, not scattered across model files.
- **Timestamps on everything.** No exceptions for "simple" tables.
- **Unique constraints are the idempotency mechanism** for webhook and ingest writes. Pair them with `INSERT ... ON CONFLICT DO NOTHING` rather than a read-then-write race.
- Models with an `-Ali-AI` suffix (`AiAgent-Ali-AI.ts`, `Cohort-Ali-AI.ts`) are parallel variants from an earlier fork. Check which is registered in `index.ts` before editing.

## Known drift

The `enrollments` table has documented schema drift between dev and production. Verify column presence against the live database before relying on a field that is not covered by a test.
