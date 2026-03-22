import Cohort from './Cohort';
import Enrollment from './Enrollment';
import AdminUser from './AdminUser';
import Lead from './Lead';
import AutomationLog from './AutomationLog';
import Activity from './Activity';
import Appointment from './Appointment';
import FollowUpSequence from './FollowUpSequence';
import ScheduledEmail from './ScheduledEmail';
import SystemSetting from './SystemSetting';
import EventLedger from './EventLedger';
import Campaign from './Campaign';
import CampaignLead from './CampaignLead';
import InteractionOutcome from './InteractionOutcome';
import ICPInsight from './ICPInsight';
import LeadTemperatureHistory from './LeadTemperatureHistory';
import StrategyCall from './StrategyCall';
import StrategyCallIntelligence from './StrategyCallIntelligence';
import Visitor from './Visitor';
import VisitorSession from './VisitorSession';
import PageEvent from './PageEvent';
import BehavioralSignal from './BehavioralSignal';
import IntentScore from './IntentScore';
import ChatConversation from './ChatConversation';
import ChatMessage from './ChatMessage';
import OpportunityScore from './OpportunityScore';
import ICPProfile from './ICPProfile';
import LiveSession from './LiveSession';
import AttendanceRecord from './AttendanceRecord';
import AssignmentSubmission from './AssignmentSubmission';
import CurriculumModule from './CurriculumModule';
import CurriculumLesson from './CurriculumLesson';
import LessonInstance from './LessonInstance';
import UserCurriculumProfile from './UserCurriculumProfile';
import SessionGate from './SessionGate';
import MentorConversation from './MentorConversation';
import SessionChatMessage from './SessionChatMessage';
import SkillMastery from './SkillMastery';
import PromptTemplate from './PromptTemplate';
import SectionConfig from './SectionConfig';
import ArtifactDefinition from './ArtifactDefinition';
import VariableStore from './VariableStore';
import GitHubConnection from './GitHubConnection';
import SkillDefinition from './SkillDefinition';
import ProgramBlueprint from './ProgramBlueprint';
import MiniSection from './MiniSection';
import VariableDefinition from './VariableDefinition';
import SessionChecklist from './SessionChecklist';
import AuditLog from './AuditLog';
import Department from './Department';
import Initiative from './Initiative';
import DepartmentEvent from './DepartmentEvent';
import BlueprintSnapshot from './BlueprintSnapshot';
import TestSimulationResult from './TestSimulationResult';
import ContentGenerationLog from './ContentGenerationLog';
import AiAgent from './AiAgent';
import AiAgentActivityLog from './AiAgentActivityLog';
import CampaignHealth from './CampaignHealth';
import CampaignError from './CampaignError';
import AiSystemEvent from './AiSystemEvent';
import DatasetRegistry from './DatasetRegistry';
import SystemProcess from './SystemProcess';
import EntitySummary from './EntitySummary';
import QAHistory from './QAHistory';
import IntelligenceConfig from './IntelligenceConfig';
import OrchestrationHealth from './OrchestrationHealth';
import CampaignTestRun from './CampaignTestRun';
import CampaignTestStep from './CampaignTestStep';
import CampaignSimulation from './CampaignSimulation';
import CampaignSimulationStep from './CampaignSimulationStep';
import CommunicationLog from './CommunicationLog';
import CampaignInsight from './CampaignInsight';
import CampaignVariant from './CampaignVariant';
import LeadRecommendation from './LeadRecommendation';
import WebsiteIssue from './WebsiteIssue';
import AdmissionsMemory from './AdmissionsMemory';
import AdmissionsKnowledgeEntry from './AdmissionsKnowledgeEntry';
import AdmissionsActionLog from './AdmissionsActionLog';
import CallContactLog from './CallContactLog';
import CallbackRequest from './CallbackRequest';
import DocumentDeliveryLog from './DocumentDeliveryLog';
import Ticket from './Ticket';
import TicketActivity from './TicketActivity';
import StudentNavigationEvent from './StudentNavigationEvent';
import Alert from './Alert';
import AlertEvent from './AlertEvent';
import AlertSubscription from './AlertSubscription';
import AlertResolution from './AlertResolution';
import OpenclawSignal from './OpenclawSignal';
import OpenclawTask from './OpenclawTask';
import OpenclawSession from './OpenclawSession';
import OpenclawResponse from './OpenclawResponse';
import OpenclawLearning from './OpenclawLearning';
import GovernanceConfig from './GovernanceConfig';
import CronScheduleConfig from './CronScheduleConfig';
import CampaignGovernanceConfig from './CampaignGovernanceConfig';
import RiskScoringConfig from './RiskScoringConfig';
import KnowledgeNode from './KnowledgeNode';
import KnowledgeEdge from './KnowledgeEdge';
import ReportingInsight from './ReportingInsight';
import KPISnapshot from './KPISnapshot';
import ExperimentProposal from './ExperimentProposal';
import RevenueOpportunity from './RevenueOpportunity';
import UserInsightFeedback from './UserInsightFeedback';
import InsightReplacement from './InsightReplacement';
import ExecutiveNotificationPolicy from './ExecutiveNotificationPolicy';
import SimulationAccuracy from './SimulationAccuracy';
import ContentFeedback from './ContentFeedback';
import CurriculumTypeDefinition from './CurriculumTypeDefinition';
import AlumniReferralProfile from './AlumniReferralProfile';
import AlumniReferral from './AlumniReferral';
import ReferralActivityEvent from './ReferralActivityEvent';
import ReferralCommission from './ReferralCommission';
import LandingPage from './LandingPage';
import CampaignDeployment from './CampaignDeployment';
import UnsubscribeEvent from './UnsubscribeEvent';
import Project from './Project';
import ProjectArtifact from './ProjectArtifact';
import ProposedAgentAction from './ProposedAgentAction';
import AgentWriteAudit from './AgentWriteAudit';
import StrategicInitiative from './StrategicInitiative';
import RequirementsGenerationJob from './RequirementsGenerationJob';
import MayaConversationOutcome from './MayaConversationOutcome';
import MentorIntervention from './MentorIntervention';
import SectionExecutionLog from './SectionExecutionLog';
import HealingPlan from './HealingPlan';
import ArtifactRelationship from './ArtifactRelationship';
import RequirementsMap from './RequirementsMap';
import NextAction from './NextAction';
import VerificationLog from './VerificationLog';
import ProgressionLog from './ProgressionLog';
import ProjectRisk from './ProjectRisk';
import AnomalyLog from './AnomalyLog';

// --- Maya Conversation Outcome associations ---
Lead.hasMany(MayaConversationOutcome, { foreignKey: 'lead_id', as: 'conversationOutcomes' });
MayaConversationOutcome.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

// --- Governance Center associations ---
Campaign.hasOne(CampaignGovernanceConfig, { foreignKey: 'campaign_id', as: 'governanceConfig' });
CampaignGovernanceConfig.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Associations
Cohort.hasMany(Enrollment, { foreignKey: 'cohort_id', as: 'enrollments' });
Enrollment.belongsTo(Cohort, { foreignKey: 'cohort_id', as: 'cohort' });

Lead.belongsTo(AdminUser, { foreignKey: 'assigned_admin', as: 'assignedAdmin' });
AdminUser.hasMany(Lead, { foreignKey: 'assigned_admin', as: 'assignedLeads' });

Lead.hasMany(Activity, { foreignKey: 'lead_id', as: 'activities' });
Activity.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

AdminUser.hasMany(Activity, { foreignKey: 'admin_user_id', as: 'activities' });
Activity.belongsTo(AdminUser, { foreignKey: 'admin_user_id', as: 'adminUser' });

Lead.hasMany(Appointment, { foreignKey: 'lead_id', as: 'appointments' });
Appointment.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

AdminUser.hasMany(Appointment, { foreignKey: 'admin_user_id', as: 'appointments' });
Appointment.belongsTo(AdminUser, { foreignKey: 'admin_user_id', as: 'adminUser' });

Lead.hasMany(ScheduledEmail, { foreignKey: 'lead_id', as: 'scheduledEmails' });
ScheduledEmail.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

FollowUpSequence.hasMany(ScheduledEmail, { foreignKey: 'sequence_id', as: 'scheduledEmails' });
ScheduledEmail.belongsTo(FollowUpSequence, { foreignKey: 'sequence_id', as: 'sequence' });

// Campaign associations
Campaign.belongsTo(FollowUpSequence, { foreignKey: 'sequence_id', as: 'sequence' });
FollowUpSequence.hasOne(Campaign, { foreignKey: 'sequence_id', as: 'campaign' });

Campaign.belongsTo(AdminUser, { foreignKey: 'created_by', as: 'creator' });
AdminUser.hasMany(Campaign, { foreignKey: 'created_by', as: 'campaigns' });

Campaign.hasMany(CampaignLead, { foreignKey: 'campaign_id', as: 'campaignLeads' });
CampaignLead.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

CampaignLead.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(CampaignLead, { foreignKey: 'lead_id', as: 'campaignEnrollments' });

Campaign.hasMany(ScheduledEmail, { foreignKey: 'campaign_id', as: 'scheduledEmails' });
ScheduledEmail.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Interaction Outcome associations
Lead.hasMany(InteractionOutcome, { foreignKey: 'lead_id', as: 'interactionOutcomes' });
InteractionOutcome.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

Campaign.hasMany(InteractionOutcome, { foreignKey: 'campaign_id', as: 'interactionOutcomes' });
InteractionOutcome.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

ScheduledEmail.hasMany(InteractionOutcome, { foreignKey: 'scheduled_email_id', as: 'outcomes' });
InteractionOutcome.belongsTo(ScheduledEmail, { foreignKey: 'scheduled_email_id', as: 'scheduledEmail' });

// Strategy Call associations
StrategyCall.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(StrategyCall, { foreignKey: 'lead_id', as: 'strategyCalls' });
StrategyCall.hasOne(StrategyCallIntelligence, { foreignKey: 'strategy_call_id', as: 'intelligence' });
StrategyCallIntelligence.belongsTo(StrategyCall, { foreignKey: 'strategy_call_id', as: 'strategyCall' });
StrategyCallIntelligence.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

// Lead Temperature History associations
Lead.hasMany(LeadTemperatureHistory, { foreignKey: 'lead_id', as: 'temperatureHistory' });
LeadTemperatureHistory.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

Campaign.hasMany(LeadTemperatureHistory, { foreignKey: 'campaign_id', as: 'temperatureChanges' });
LeadTemperatureHistory.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Visitor Intelligence associations
Visitor.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasOne(Visitor, { foreignKey: 'lead_id', as: 'visitor' });
// Note: visitors.campaign_id is VARCHAR (UTM tracking string), not a UUID FK to campaigns.
// Do NOT create a Sequelize association here — the types are incompatible.

Visitor.hasMany(VisitorSession, { foreignKey: 'visitor_id', as: 'sessions' });
VisitorSession.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });

VisitorSession.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

VisitorSession.hasMany(PageEvent, { foreignKey: 'session_id', as: 'events' });
PageEvent.belongsTo(VisitorSession, { foreignKey: 'session_id', as: 'session' });

PageEvent.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });

// Behavioral Signal associations
Visitor.hasMany(BehavioralSignal, { foreignKey: 'visitor_id', as: 'signals' });
BehavioralSignal.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });

BehavioralSignal.belongsTo(VisitorSession, { foreignKey: 'session_id', as: 'session' });
VisitorSession.hasMany(BehavioralSignal, { foreignKey: 'session_id', as: 'signals' });

BehavioralSignal.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(BehavioralSignal, { foreignKey: 'lead_id', as: 'behavioralSignals' });

// Intent Score associations
Visitor.hasOne(IntentScore, { foreignKey: 'visitor_id', as: 'intentScore' });
IntentScore.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });

IntentScore.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasOne(IntentScore, { foreignKey: 'lead_id', as: 'intentScore' });

// Chat Conversation associations
Visitor.hasMany(ChatConversation, { foreignKey: 'visitor_id', as: 'chatConversations' });
ChatConversation.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });

ChatConversation.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(ChatConversation, { foreignKey: 'lead_id', as: 'chatConversations' });

ChatConversation.belongsTo(VisitorSession, { foreignKey: 'session_id', as: 'session' });

ChatConversation.hasMany(ChatMessage, { foreignKey: 'conversation_id', as: 'messages' });
ChatMessage.belongsTo(ChatConversation, { foreignKey: 'conversation_id', as: 'conversation' });

// ICP Profile associations
Campaign.hasMany(ICPProfile, { foreignKey: 'campaign_id', as: 'icpProfiles' });
ICPProfile.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

ICPProfile.belongsTo(AdminUser, { foreignKey: 'created_by', as: 'creator' });

// Opportunity Score associations
Lead.hasOne(OpportunityScore, { foreignKey: 'lead_id', as: 'opportunityScore' });
OpportunityScore.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Visitor.hasOne(OpportunityScore, { foreignKey: 'visitor_id', as: 'opportunityScore' });
OpportunityScore.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });


// LiveSession associations
Cohort.hasMany(LiveSession, { foreignKey: 'cohort_id', as: 'liveSessions' });
LiveSession.belongsTo(Cohort, { foreignKey: 'cohort_id', as: 'cohort' });

// AttendanceRecord associations
Enrollment.hasMany(AttendanceRecord, { foreignKey: 'enrollment_id', as: 'attendanceRecords' });
AttendanceRecord.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
LiveSession.hasMany(AttendanceRecord, { foreignKey: 'session_id', as: 'attendanceRecords' });
AttendanceRecord.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });

// AssignmentSubmission associations
Enrollment.hasMany(AssignmentSubmission, { foreignKey: 'enrollment_id', as: 'submissions' });
AssignmentSubmission.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
LiveSession.hasMany(AssignmentSubmission, { foreignKey: 'session_id', as: 'submissions' });
AssignmentSubmission.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });

// Program Blueprint associations
ProgramBlueprint.hasMany(CurriculumModule, { foreignKey: 'program_id', as: 'modules' });
CurriculumModule.belongsTo(ProgramBlueprint, { foreignKey: 'program_id', as: 'program' });
ProgramBlueprint.hasMany(Cohort, { foreignKey: 'program_id', as: 'cohorts' });
Cohort.belongsTo(ProgramBlueprint, { foreignKey: 'program_id', as: 'program' });

// Curriculum Module associations
Cohort.hasMany(CurriculumModule, { foreignKey: 'cohort_id', as: 'curriculumModules' });
CurriculumModule.belongsTo(Cohort, { foreignKey: 'cohort_id', as: 'cohort' });

// Curriculum Lesson associations
CurriculumModule.hasMany(CurriculumLesson, { foreignKey: 'module_id', as: 'lessons', onDelete: 'CASCADE' });
CurriculumLesson.belongsTo(CurriculumModule, { foreignKey: 'module_id', as: 'module' });

// Lesson Instance associations
CurriculumLesson.hasMany(LessonInstance, { foreignKey: 'lesson_id', as: 'instances' });
LessonInstance.belongsTo(CurriculumLesson, { foreignKey: 'lesson_id', as: 'lesson' });
Enrollment.hasMany(LessonInstance, { foreignKey: 'enrollment_id', as: 'lessonInstances' });
LessonInstance.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// User Curriculum Profile associations
Enrollment.hasOne(UserCurriculumProfile, { foreignKey: 'enrollment_id', as: 'curriculumProfile' });
UserCurriculumProfile.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// Session Gate associations
LiveSession.hasMany(SessionGate, { foreignKey: 'session_id', as: 'gates' });
SessionGate.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });
SessionGate.belongsTo(CurriculumModule, { foreignKey: 'module_id', as: 'module' });
SessionGate.belongsTo(CurriculumLesson, { foreignKey: 'lesson_id', as: 'lesson' });

// Mentor Conversation associations
Enrollment.hasMany(MentorConversation, { foreignKey: 'enrollment_id', as: 'mentorConversations' });
MentorConversation.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
MentorConversation.belongsTo(CurriculumLesson, { foreignKey: 'lesson_id', as: 'lesson' });

// Session Chat Message associations
LiveSession.hasMany(SessionChatMessage, { foreignKey: 'session_id', as: 'chatMessages' });
SessionChatMessage.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });
Enrollment.hasMany(SessionChatMessage, { foreignKey: 'enrollment_id', as: 'chatMessages' });
SessionChatMessage.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// Skill Mastery associations
Enrollment.hasMany(SkillMastery, { foreignKey: 'enrollment_id', as: 'skillMasteries' });
SkillMastery.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// CurriculumLesson -> LiveSession (section-to-session association)
CurriculumLesson.belongsTo(LiveSession, { foreignKey: 'associated_session_id', as: 'associatedSession', onDelete: 'SET NULL' });
LiveSession.hasMany(CurriculumLesson, { foreignKey: 'associated_session_id', as: 'associatedLessons' });

// --- Orchestration Engine associations ---

// LiveSession -> CurriculumModule (session maps to module)
LiveSession.belongsTo(CurriculumModule, { foreignKey: 'module_id', as: 'module' });
CurriculumModule.hasMany(LiveSession, { foreignKey: 'module_id', as: 'sessions' });

// SectionConfig associations
LiveSession.hasMany(SectionConfig, { foreignKey: 'session_id', as: 'sectionConfigs' });
SectionConfig.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });
CurriculumLesson.hasOne(SectionConfig, { foreignKey: 'lesson_id', as: 'sectionConfig' });
SectionConfig.belongsTo(CurriculumLesson, { foreignKey: 'lesson_id', as: 'lesson' });
SectionConfig.belongsTo(PromptTemplate, { foreignKey: 'suggested_prompt_id', as: 'suggestedPrompt', onDelete: 'SET NULL' });
SectionConfig.belongsTo(PromptTemplate, { foreignKey: 'mentor_prompt_id', as: 'mentorPrompt', onDelete: 'SET NULL' });

// PromptTemplate inverse associations (SectionConfig)
PromptTemplate.hasMany(SectionConfig, { foreignKey: 'suggested_prompt_id', as: 'suggestedSectionConfigs' });
PromptTemplate.hasMany(SectionConfig, { foreignKey: 'mentor_prompt_id', as: 'mentorSectionConfigs' });

// ArtifactDefinition associations
LiveSession.hasMany(ArtifactDefinition, { foreignKey: 'session_id', as: 'artifactDefinitions' });
ArtifactDefinition.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });
SectionConfig.hasMany(ArtifactDefinition, { foreignKey: 'section_id', as: 'artifactDefinitions' });
ArtifactDefinition.belongsTo(SectionConfig, { foreignKey: 'section_id', as: 'sectionConfig' });
ArtifactDefinition.belongsTo(PromptTemplate, { foreignKey: 'auto_generate_prompt_id', as: 'autoGeneratePrompt', onDelete: 'SET NULL' });
PromptTemplate.hasMany(ArtifactDefinition, { foreignKey: 'auto_generate_prompt_id', as: 'autoGeneratedArtifacts' });
ArtifactDefinition.hasMany(AssignmentSubmission, { foreignKey: 'artifact_definition_id', as: 'submissions' });
AssignmentSubmission.belongsTo(ArtifactDefinition, { foreignKey: 'artifact_definition_id', as: 'artifactDefinition' });

// VariableStore associations
Enrollment.hasMany(VariableStore, { foreignKey: 'enrollment_id', as: 'variables', onDelete: 'CASCADE' });
VariableStore.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
SectionConfig.hasMany(VariableStore, { foreignKey: 'section_id', as: 'variables' });
VariableStore.belongsTo(SectionConfig, { foreignKey: 'section_id', as: 'sectionConfig' });
LiveSession.hasMany(VariableStore, { foreignKey: 'session_id', as: 'variables' });
VariableStore.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'sessionRef' });
ArtifactDefinition.hasMany(VariableStore, { foreignKey: 'artifact_id', as: 'variables' });
VariableStore.belongsTo(ArtifactDefinition, { foreignKey: 'artifact_id', as: 'artifactDefinition' });

// GitHubConnection associations
Enrollment.hasOne(GitHubConnection, { foreignKey: 'enrollment_id', as: 'githubConnection' });
GitHubConnection.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// SessionGate -> ArtifactDefinition (bidirectional)
SessionGate.belongsTo(ArtifactDefinition, { foreignKey: 'artifact_definition_id', as: 'artifactDefinition' });
ArtifactDefinition.hasMany(SessionGate, { foreignKey: 'artifact_definition_id', as: 'gates' });

// MiniSection associations
CurriculumLesson.hasMany(MiniSection, { foreignKey: 'lesson_id', as: 'miniSections', onDelete: 'CASCADE' });
MiniSection.belongsTo(CurriculumLesson, { foreignKey: 'lesson_id', as: 'lesson' });
MiniSection.belongsTo(PromptTemplate, { foreignKey: 'concept_prompt_template_id', as: 'conceptPrompt', onDelete: 'SET NULL' });
MiniSection.belongsTo(PromptTemplate, { foreignKey: 'build_prompt_template_id', as: 'buildPrompt', onDelete: 'SET NULL' });
MiniSection.belongsTo(PromptTemplate, { foreignKey: 'mentor_prompt_template_id', as: 'mentorPrompt', onDelete: 'SET NULL' });

// PromptTemplate inverse associations (MiniSection)
PromptTemplate.hasMany(MiniSection, { foreignKey: 'concept_prompt_template_id', as: 'conceptMiniSections' });
PromptTemplate.hasMany(MiniSection, { foreignKey: 'build_prompt_template_id', as: 'buildMiniSections' });
PromptTemplate.hasMany(MiniSection, { foreignKey: 'mentor_prompt_template_id', as: 'mentorMiniSections' });

// VariableDefinition associations
ProgramBlueprint.hasMany(VariableDefinition, { foreignKey: 'program_id', as: 'variableDefinitions' });
VariableDefinition.belongsTo(ProgramBlueprint, { foreignKey: 'program_id', as: 'program' });
VariableDefinition.hasMany(VariableStore, { foreignKey: 'variable_definition_id', as: 'values' });
VariableStore.belongsTo(VariableDefinition, { foreignKey: 'variable_definition_id', as: 'definition' });

// ArtifactDefinition -> CurriculumLesson (lesson-level artifacts)
ArtifactDefinition.belongsTo(CurriculumLesson, { foreignKey: 'lesson_id', as: 'lesson', onDelete: 'SET NULL' });
CurriculumLesson.hasMany(ArtifactDefinition, { foreignKey: 'lesson_id', as: 'artifactDefinitions' });
ArtifactDefinition.belongsTo(PromptTemplate, { foreignKey: 'instruction_prompt_id', as: 'instructionPrompt', onDelete: 'SET NULL' });
PromptTemplate.hasMany(ArtifactDefinition, { foreignKey: 'instruction_prompt_id', as: 'instructedArtifacts' });

// SessionChecklist associations
LiveSession.hasMany(SessionChecklist, { foreignKey: 'session_id', as: 'checklist', onDelete: 'CASCADE' });
SessionChecklist.belongsTo(LiveSession, { foreignKey: 'session_id', as: 'session' });

// BlueprintSnapshot associations
ProgramBlueprint.hasMany(BlueprintSnapshot, { foreignKey: 'blueprint_id', as: 'snapshots', onDelete: 'CASCADE' });
BlueprintSnapshot.belongsTo(ProgramBlueprint, { foreignKey: 'blueprint_id', as: 'blueprint' });

// --- AI Operations Layer associations ---
AiAgent.hasMany(AiAgentActivityLog, { foreignKey: 'agent_id', as: 'activityLogs' });
AiAgentActivityLog.belongsTo(AiAgent, { foreignKey: 'agent_id', as: 'agent' });

Campaign.hasOne(CampaignHealth, { foreignKey: 'campaign_id', as: 'health' });
CampaignHealth.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

Campaign.hasMany(CampaignError, { foreignKey: 'campaign_id', as: 'campaignErrors' });
CampaignError.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

AiAgentActivityLog.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

CampaignError.belongsTo(AiAgentActivityLog, { foreignKey: 'repair_attempt_id', as: 'repairAttempt' });
AiAgentActivityLog.hasMany(CampaignError, { foreignKey: 'repair_attempt_id', as: 'repairedErrors' });

// --- Agent Governance associations ---
AiAgent.hasMany(ProposedAgentAction, { foreignKey: 'agent_id', as: 'proposedActions' });
ProposedAgentAction.belongsTo(AiAgent, { foreignKey: 'agent_id', as: 'agent' });

Campaign.hasMany(ProposedAgentAction, { foreignKey: 'campaign_id', as: 'proposedAgentActions' });
ProposedAgentAction.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

AiAgent.hasMany(AgentWriteAudit, { foreignKey: 'agent_id', as: 'writeAudits' });
AgentWriteAudit.belongsTo(AiAgent, { foreignKey: 'agent_id', as: 'agent' });

// Orchestration Health associations
AiAgent.hasMany(OrchestrationHealth, { foreignKey: 'agent_id', as: 'orchestrationHealthSnapshots' });
OrchestrationHealth.belongsTo(AiAgent, { foreignKey: 'agent_id', as: 'agent' });

// Campaign Test Run associations
Campaign.hasMany(CampaignTestRun, { foreignKey: 'campaign_id', as: 'testRuns' });
CampaignTestRun.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
CampaignTestRun.belongsTo(Lead, { foreignKey: 'test_lead_id', as: 'testLead' });
CampaignTestRun.hasMany(CampaignTestStep, { foreignKey: 'test_run_id', as: 'steps' });
CampaignTestStep.belongsTo(CampaignTestRun, { foreignKey: 'test_run_id', as: 'testRun' });

// Campaign Simulation associations
Campaign.hasMany(CampaignSimulation, { foreignKey: 'campaign_id', as: 'simulations' });
CampaignSimulation.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
CampaignSimulation.belongsTo(FollowUpSequence, { foreignKey: 'sequence_id', as: 'sequence' });
CampaignSimulation.belongsTo(Lead, { foreignKey: 'test_lead_id', as: 'testLead' });
CampaignSimulation.hasMany(CampaignSimulationStep, { foreignKey: 'simulation_id', as: 'steps' });
CampaignSimulationStep.belongsTo(CampaignSimulation, { foreignKey: 'simulation_id', as: 'simulation' });

// Communication Log associations
Lead.hasMany(CommunicationLog, { foreignKey: 'lead_id', as: 'communicationLogs' });
CommunicationLog.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

Campaign.hasMany(CommunicationLog, { foreignKey: 'campaign_id', as: 'communicationLogs' });
CommunicationLog.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

CampaignSimulation.hasMany(CommunicationLog, { foreignKey: 'simulation_id', as: 'communicationLogs' });
CommunicationLog.belongsTo(CampaignSimulation, { foreignKey: 'simulation_id', as: 'simulation' });

CampaignSimulationStep.hasMany(CommunicationLog, { foreignKey: 'simulation_step_id', as: 'communicationLogs' });
CommunicationLog.belongsTo(CampaignSimulationStep, { foreignKey: 'simulation_step_id', as: 'simulationStep' });

// Campaign Insight associations
Campaign.hasMany(CampaignInsight, { foreignKey: 'campaign_id', as: 'insights' });
CampaignInsight.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Campaign Variant associations
Campaign.hasMany(CampaignVariant, { foreignKey: 'campaign_id', as: 'variants' });
CampaignVariant.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Lead Recommendation associations
Campaign.hasMany(LeadRecommendation, { foreignKey: 'campaign_id', as: 'leadRecommendations' });
LeadRecommendation.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
ICPProfile.hasMany(LeadRecommendation, { foreignKey: 'icp_profile_id', as: 'leadRecommendations' });
LeadRecommendation.belongsTo(ICPProfile, { foreignKey: 'icp_profile_id', as: 'icpProfile' });
Lead.hasMany(LeadRecommendation, { foreignKey: 'lead_id', as: 'leadRecommendations' });
LeadRecommendation.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

// --- Department Intelligence Layer associations ---
Department.hasMany(Initiative, { foreignKey: 'department_id', as: 'initiatives' });
Initiative.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });

Department.hasMany(DepartmentEvent, { foreignKey: 'department_id', as: 'events' });
DepartmentEvent.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });

Initiative.hasMany(DepartmentEvent, { foreignKey: 'initiative_id', as: 'events' });
DepartmentEvent.belongsTo(Initiative, { foreignKey: 'initiative_id', as: 'initiative' });

// --- Admissions Intelligence associations ---
AdmissionsMemory.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });
Visitor.hasOne(AdmissionsMemory, { foreignKey: 'visitor_id', as: 'admissionsMemory' });

AdmissionsMemory.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasOne(AdmissionsMemory, { foreignKey: 'lead_id', as: 'admissionsMemory' });

AdmissionsMemory.belongsTo(ChatConversation, { foreignKey: 'last_conversation_id', as: 'lastConversation' });

// --- Admissions Operations associations ---
AdmissionsActionLog.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });
Visitor.hasMany(AdmissionsActionLog, { foreignKey: 'visitor_id', as: 'admissionsActions' });

AdmissionsActionLog.belongsTo(ChatConversation, { foreignKey: 'conversation_id', as: 'conversation' });

CallContactLog.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });
Visitor.hasMany(CallContactLog, { foreignKey: 'visitor_id', as: 'callContactLogs' });

CallbackRequest.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });
Visitor.hasMany(CallbackRequest, { foreignKey: 'visitor_id', as: 'callbackRequests' });

CallbackRequest.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(CallbackRequest, { foreignKey: 'lead_id', as: 'callbackRequests' });

CallbackRequest.belongsTo(ChatConversation, { foreignKey: 'conversation_id', as: 'conversation' });

DocumentDeliveryLog.belongsTo(Visitor, { foreignKey: 'visitor_id', as: 'visitor' });
Visitor.hasMany(DocumentDeliveryLog, { foreignKey: 'visitor_id', as: 'documentDeliveries' });

DocumentDeliveryLog.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(DocumentDeliveryLog, { foreignKey: 'lead_id', as: 'documentDeliveries' });
// Ticket associations
Ticket.hasMany(TicketActivity, { foreignKey: 'ticket_id', as: 'activities' });
TicketActivity.belongsTo(Ticket, { foreignKey: 'ticket_id', as: 'ticket' });

Ticket.hasMany(Ticket, { foreignKey: 'parent_ticket_id', as: 'subTasks' });
Ticket.belongsTo(Ticket, { foreignKey: 'parent_ticket_id', as: 'parentTicket' });

// --- Alert Intelligence Layer associations ---
Alert.hasMany(AlertEvent, { foreignKey: 'alert_id', as: 'events' });
AlertEvent.belongsTo(Alert, { foreignKey: 'alert_id', as: 'alert' });

Alert.hasOne(AlertResolution, { foreignKey: 'alert_id', as: 'resolution' });
AlertResolution.belongsTo(Alert, { foreignKey: 'alert_id', as: 'alert' });

Alert.belongsTo(AiAgent, { foreignKey: 'source_agent_id', as: 'sourceAgent' });
AiAgent.hasMany(Alert, { foreignKey: 'source_agent_id', as: 'alerts' });

Alert.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });
Department.hasMany(Alert, { foreignKey: 'department_id', as: 'alerts' });

// Student Navigation Event associations
Enrollment.hasMany(StudentNavigationEvent, { foreignKey: 'enrollment_id', as: 'navigationEvents' });
StudentNavigationEvent.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// --- AssignmentSubmission version chain ---
AssignmentSubmission.belongsTo(AssignmentSubmission, { foreignKey: 'parent_version_id', as: 'previousVersion' });
AssignmentSubmission.hasMany(AssignmentSubmission, { foreignKey: 'parent_version_id', as: 'nextVersions' });

// --- Project associations ---
Enrollment.hasOne(Project, { foreignKey: 'enrollment_id', as: 'project' });
Project.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

ProgramBlueprint.hasMany(Project, { foreignKey: 'program_id', as: 'projects' });
Project.belongsTo(ProgramBlueprint, { foreignKey: 'program_id', as: 'program' });

Project.hasMany(ProjectArtifact, { foreignKey: 'project_id', as: 'projectArtifacts', onDelete: 'CASCADE' });
ProjectArtifact.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

ArtifactDefinition.hasMany(ProjectArtifact, { foreignKey: 'artifact_definition_id', as: 'projectArtifacts' });
ProjectArtifact.belongsTo(ArtifactDefinition, { foreignKey: 'artifact_definition_id', as: 'artifactDefinition' });

// --- Artifact Relationship Graph ---
ArtifactDefinition.hasMany(ArtifactRelationship, { foreignKey: 'parent_artifact_id', as: 'childRelationships' });
ArtifactDefinition.hasMany(ArtifactRelationship, { foreignKey: 'child_artifact_id', as: 'parentRelationships' });
ArtifactRelationship.belongsTo(ArtifactDefinition, { foreignKey: 'parent_artifact_id', as: 'parentArtifact' });
ArtifactRelationship.belongsTo(ArtifactDefinition, { foreignKey: 'child_artifact_id', as: 'childArtifact' });

// --- Requirements Map ---
Project.hasMany(RequirementsMap, { foreignKey: 'project_id', as: 'requirementsMaps' });
RequirementsMap.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
RequirementsMap.belongsTo(ArtifactDefinition, { foreignKey: 'source_artifact_id', as: 'sourceArtifact' });

// --- Next Action ---
Project.hasMany(NextAction, { foreignKey: 'project_id', as: 'nextActions' });
NextAction.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// --- Verification Logs ---
Project.hasMany(VerificationLog, { foreignKey: 'project_id', as: 'verificationLogs' });
VerificationLog.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
RequirementsMap.hasMany(VerificationLog, { foreignKey: 'requirement_id', as: 'verificationLogs' });
VerificationLog.belongsTo(RequirementsMap, { foreignKey: 'requirement_id', as: 'requirement' });

// --- Progression Logs ---
Project.hasMany(ProgressionLog, { foreignKey: 'project_id', as: 'progressionLogs' });
ProgressionLog.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
NextAction.hasMany(ProgressionLog, { foreignKey: 'action_id', as: 'progressionLogs' });
ProgressionLog.belongsTo(NextAction, { foreignKey: 'action_id', as: 'action' });

// --- Risk + Anomaly ---
Project.hasMany(ProjectRisk, { foreignKey: 'project_id', as: 'projectRisks' });
ProjectRisk.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Project.hasMany(AnomalyLog, { foreignKey: 'project_id', as: 'anomalyLogs' });
AnomalyLog.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

AssignmentSubmission.hasMany(ProjectArtifact, { foreignKey: 'submission_id', as: 'projectArtifacts' });
ProjectArtifact.belongsTo(AssignmentSubmission, { foreignKey: 'submission_id', as: 'submission' });

// --- Mentor Intervention associations ---
Project.hasMany(MentorIntervention, { foreignKey: 'project_id', as: 'interventions', onDelete: 'CASCADE' });
MentorIntervention.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

AssignmentSubmission.hasMany(MentorIntervention, { foreignKey: 'artifact_submission_id', as: 'interventions' });
MentorIntervention.belongsTo(AssignmentSubmission, { foreignKey: 'artifact_submission_id', as: 'submission' });

// --- Requirements Generation Job associations ---
Project.hasMany(RequirementsGenerationJob, { foreignKey: 'project_id', as: 'requirementsJobs' });
RequirementsGenerationJob.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// --- OpenClaw Outreach Network associations ---
OpenclawSignal.hasOne(OpenclawResponse, { foreignKey: 'signal_id', as: 'response' });
OpenclawResponse.belongsTo(OpenclawSignal, { foreignKey: 'signal_id', as: 'signal' });

OpenclawSession.hasMany(OpenclawResponse, { foreignKey: 'session_id', as: 'responses' });
OpenclawResponse.belongsTo(OpenclawSession, { foreignKey: 'session_id', as: 'session' });

OpenclawSignal.hasMany(OpenclawTask, { foreignKey: 'signal_id', as: 'tasks' });
OpenclawTask.belongsTo(OpenclawSignal, { foreignKey: 'signal_id', as: 'signal' });

OpenclawSession.hasMany(OpenclawTask, { foreignKey: 'session_id', as: 'tasks' });
OpenclawTask.belongsTo(OpenclawSession, { foreignKey: 'session_id', as: 'session' });

Campaign.hasMany(OpenclawResponse, { foreignKey: 'campaign_id', as: 'openclawResponses' });
OpenclawResponse.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// --- Cory Knowledge Graph associations ---
KnowledgeEdge.belongsTo(KnowledgeNode, { foreignKey: 'source_node_id', as: 'sourceNode' });
KnowledgeEdge.belongsTo(KnowledgeNode, { foreignKey: 'target_node_id', as: 'targetNode' });
KnowledgeNode.hasMany(KnowledgeEdge, { foreignKey: 'source_node_id', as: 'outgoingEdges' });
KnowledgeNode.hasMany(KnowledgeEdge, { foreignKey: 'target_node_id', as: 'incomingEdges' });

// --- Reporting Intelligence associations ---
UserInsightFeedback.belongsTo(ReportingInsight, { foreignKey: 'insight_id', as: 'insight' });
ReportingInsight.hasMany(UserInsightFeedback, { foreignKey: 'insight_id', as: 'feedback' });

InsightReplacement.belongsTo(ReportingInsight, { foreignKey: 'original_insight_id', as: 'originalInsight' });
InsightReplacement.belongsTo(ReportingInsight, { foreignKey: 'replacement_insight_id', as: 'replacementInsight' });
InsightReplacement.belongsTo(UserInsightFeedback, { foreignKey: 'triggered_by_feedback_id', as: 'triggeringFeedback' });

// --- Alumni Referral System associations ---
AlumniReferralProfile.hasMany(AlumniReferral, { foreignKey: 'profile_id', as: 'referrals' });
AlumniReferral.belongsTo(AlumniReferralProfile, { foreignKey: 'profile_id', as: 'profile' });

AlumniReferral.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(AlumniReferral, { foreignKey: 'lead_id', as: 'alumniReferrals' });

AlumniReferral.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
Campaign.hasMany(AlumniReferral, { foreignKey: 'campaign_id', as: 'alumniReferrals' });

AlumniReferral.hasMany(ReferralActivityEvent, { foreignKey: 'referral_id', as: 'activityEvents' });
ReferralActivityEvent.belongsTo(AlumniReferral, { foreignKey: 'referral_id', as: 'referral' });

AlumniReferral.hasOne(ReferralCommission, { foreignKey: 'referral_id', as: 'commission' });
ReferralCommission.belongsTo(AlumniReferral, { foreignKey: 'referral_id', as: 'referral' });

AlumniReferralProfile.hasMany(ReferralCommission, { foreignKey: 'profile_id', as: 'commissions' });
ReferralCommission.belongsTo(AlumniReferralProfile, { foreignKey: 'profile_id', as: 'profile' });

// --- Unsubscribe Event associations ---
Lead.hasMany(UnsubscribeEvent, { foreignKey: 'lead_id', as: 'unsubscribeEvents' });
UnsubscribeEvent.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

// --- Campaign Deployment & Landing Page associations ---
Campaign.hasMany(CampaignDeployment, { foreignKey: 'campaign_id', as: 'deployments' });
CampaignDeployment.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

CampaignDeployment.belongsTo(LandingPage, { foreignKey: 'landing_page_id', as: 'landingPage' });
LandingPage.hasMany(CampaignDeployment, { foreignKey: 'landing_page_id', as: 'deployments' });

export {
  Cohort, Enrollment, AdminUser, Lead, AutomationLog,
  Activity, Appointment, FollowUpSequence, ScheduledEmail,
  SystemSetting, EventLedger, Campaign, CampaignLead,
  InteractionOutcome, ICPInsight, LeadTemperatureHistory,
  StrategyCall, StrategyCallIntelligence,
  Visitor, VisitorSession, PageEvent,
  BehavioralSignal, IntentScore,
  ChatConversation, ChatMessage,
  OpportunityScore,
  ICPProfile,
  LiveSession, AttendanceRecord, AssignmentSubmission,
  CurriculumModule, CurriculumLesson, LessonInstance,
  UserCurriculumProfile, SessionGate, MentorConversation,
  SessionChatMessage,
  SkillMastery,
  PromptTemplate,
  SectionConfig,
  ArtifactDefinition,
  VariableStore,
  GitHubConnection,
  SkillDefinition,
  ProgramBlueprint,
  MiniSection,
  VariableDefinition,
  SessionChecklist,
  AuditLog,
  BlueprintSnapshot,
  TestSimulationResult,
  ContentGenerationLog,
  AiAgent,
  AiAgentActivityLog,
  CampaignHealth,
  CampaignError,
  AiSystemEvent,
  DatasetRegistry,
  SystemProcess,
  EntitySummary,
  QAHistory,
  IntelligenceConfig,
  OrchestrationHealth,
  CampaignTestRun,
  CampaignTestStep,
  CampaignSimulation,
  CampaignSimulationStep,
  CommunicationLog,
  CampaignInsight,
  CampaignVariant,
  LeadRecommendation,
  Department,
  Initiative,
  DepartmentEvent,
  WebsiteIssue,
  AdmissionsMemory,
  AdmissionsKnowledgeEntry,
  AdmissionsActionLog,
  CallContactLog,
  CallbackRequest,
  DocumentDeliveryLog,
  Ticket,
  TicketActivity,
  StudentNavigationEvent,
  Alert,
  AlertEvent,
  AlertSubscription,
  AlertResolution,
  OpenclawSignal,
  OpenclawTask,
  OpenclawSession,
  OpenclawResponse,
  OpenclawLearning,
  GovernanceConfig,
  CronScheduleConfig,
  CampaignGovernanceConfig,
  RiskScoringConfig,
  KnowledgeNode,
  KnowledgeEdge,
  ReportingInsight,
  KPISnapshot,
  ExperimentProposal,
  RevenueOpportunity,
  UserInsightFeedback,
  InsightReplacement,
  ExecutiveNotificationPolicy,
  SimulationAccuracy,
  ContentFeedback,
  CurriculumTypeDefinition,
  AlumniReferralProfile,
  AlumniReferral,
  ReferralActivityEvent,
  ReferralCommission,
  LandingPage,
  CampaignDeployment,
  UnsubscribeEvent,
  Project,
  ProjectArtifact,
  ProposedAgentAction,
  AgentWriteAudit,
  StrategicInitiative,
  RequirementsGenerationJob,
  MayaConversationOutcome,
  MentorIntervention,
  SectionExecutionLog,
  HealingPlan,
  ArtifactRelationship,
  RequirementsMap,
  NextAction,
  VerificationLog,
  ProgressionLog,
  ProjectRisk,
  AnomalyLog,
};
