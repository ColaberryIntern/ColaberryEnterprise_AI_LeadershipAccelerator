import cron from 'node-cron';
import { seedAgentRegistry } from './agentRegistrySeed';
import { seedDepartments } from './departmentSeed';
import { seedAdmissionsKnowledge } from './admissionsKnowledgeSeed';
import {
  runHealthScans,
  runRepairAgent,
  runContentOptimization,
  runConversationOptimization,
  runOrchestrationHealth,
  runStudentProgress,
  runPromptMonitor,
  runOrchestrationRepair,
  runCampaignQA,
  runSelfHealing,
  runLeadIntelligence,
  runAdmissionsVisitorActivity,
  runAdmissionsConversationMemory,
  runAdmissionsIntentDetection,
  runAdmissionsProactiveOutreach,
  runAdmissionsConversationContinuity,
  runAdmissionsHighIntentLead,
  runAdmissionsInsights,
  runAdmissionsExecutiveUpdate,
  runAdmissionsCallCompliance,
  runAdmissionsCallback,
  runAdmissionsConversationTaskScan,
  runAdmissionsAssistant,
  runOpenclawSupervisor,
  runOpenclawMarketSignal,
  runOpenclawConversationDetection,
  runOpenclawContentResponse,
  runOpenclawBrowserWorker,
  runOpenclawLearningOptimization,
  runOpenclawInfraMonitor,
  runOpenclawTechResearch,
  runExecutiveStrategyArchitect,
  runGovernanceStrategyArchitect,
  runStrategyFuturesArchitect,
  runFinanceIntelligenceArchitect,
  runOperationsOptimizationArchitect,
  runOrchestrationEcosystemArchitect,
  runInsightArchitect,
  runPartnershipExpansionArchitect,
  runGrowthExperimentArchitect,
  runMarketingAutomationArchitect,
  runAdmissionsConversionArchitect,
  runInfrastructureEvolutionArchitect,
  runPlatformInnovationArchitect,
  runLearningInnovationArchitect,
  runStudentSuccessArchitect,
  runAlumniNetworkArchitect,
  runSecurityDirector,
  runSecretDetection,
  runCodeSecurityAudit,
  runDependencySecurity,
  runRuntimeThreatMonitor,
  runAccessControlGuardian,
  runAiSafetyMonitor,
  runAgentBehaviorMonitor,
} from './aiOrchestrator';
import { runAutonomousCycle } from '../intelligence/autonomy/autonomousEngine';
import { runStrategicCycle } from '../intelligence/strategy/aiCOO';
import { runMetaAgentLoop } from '../intelligence/meta/metaAgentLoop';
import { resolveAllCronSchedules, ResolvedCronSchedule } from './governanceResolutionService';

// ─── Schedule Registry ──────────────────────────────────────────────────────
// Maps agent_name (matching cron_schedule_configs rows) to runner + hardcoded default.

interface ScheduleEntry {
  agentName: string;
  hardcodedSchedule: string;
  runner: () => Promise<any>;
  label: string;
}

const SCHEDULE_REGISTRY: ScheduleEntry[] = [
  // Campaign agents
  { agentName: 'CampaignHealthScanner', hardcodedSchedule: '*/15 * * * *', runner: runHealthScans, label: 'Campaign health scan' },
  { agentName: 'CampaignRepairAgent', hardcodedSchedule: '8,28,48 * * * *', runner: runRepairAgent, label: 'Campaign repair agent' },
  { agentName: 'ContentOptimizationAgent', hardcodedSchedule: '0 */6 * * *', runner: runContentOptimization, label: 'Content optimization' },
  { agentName: 'ConversationOptimizationAgent', hardcodedSchedule: '0 4 * * *', runner: runConversationOptimization, label: 'Conversation optimization' },
  { agentName: 'CampaignQAAgent', hardcodedSchedule: '0 */6 * * *', runner: runCampaignQA, label: 'Campaign QA agent' },
  { agentName: 'CampaignSelfHealingAgent', hardcodedSchedule: '15,45 * * * *', runner: runSelfHealing, label: 'Campaign self-healing' },

  // Platform agents
  { agentName: 'OrchestrationHealthAgent', hardcodedSchedule: '*/5 * * * *', runner: runOrchestrationHealth, label: 'Orchestration health' },
  { agentName: 'StudentProgressMonitor', hardcodedSchedule: '*/2 * * * *', runner: runStudentProgress, label: 'Student progress monitor' },
  { agentName: 'PromptMonitorAgent', hardcodedSchedule: '*/1 * * * *', runner: runPromptMonitor, label: 'Prompt monitor' },
  { agentName: 'OrchestrationAutoRepairAgent', hardcodedSchedule: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *', runner: runOrchestrationRepair, label: 'Orchestration auto-repair' },

  // Intelligence layer
  { agentName: 'AutonomousEngine', hardcodedSchedule: '5,15,25,35,45,55 * * * *', runner: runAutonomousCycle, label: 'Autonomous engine' },
  { agentName: 'AICOOStrategicCycle', hardcodedSchedule: '0,30 * * * *', runner: runStrategicCycle, label: 'AI COO strategic cycle' },
  { agentName: 'MetaAgentLoop', hardcodedSchedule: '2 * * * *', runner: runMetaAgentLoop, label: 'Meta-agent loop' },
  { agentName: 'ApolloLeadIntelligenceAgent', hardcodedSchedule: '0 */6 * * *', runner: runLeadIntelligence, label: 'Apollo lead intelligence' },

  // Admissions intelligence
  { agentName: 'AdmissionsVisitorActivity', hardcodedSchedule: '*/10 * * * *', runner: runAdmissionsVisitorActivity, label: 'Admissions visitor activity' },
  { agentName: 'AdmissionsConversationMemory', hardcodedSchedule: '*/30 * * * *', runner: runAdmissionsConversationMemory, label: 'Admissions conversation memory' },
  { agentName: 'AdmissionsIntentDetection', hardcodedSchedule: '3,13,23,33,43,53 * * * *', runner: runAdmissionsIntentDetection, label: 'Admissions intent detection' },
  { agentName: 'AdmissionsProactiveOutreach', hardcodedSchedule: '*/5 * * * *', runner: runAdmissionsProactiveOutreach, label: 'Admissions proactive outreach' },
  { agentName: 'AdmissionsConversationContinuity', hardcodedSchedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', runner: runAdmissionsConversationContinuity, label: 'Admissions conversation continuity' },
  { agentName: 'AdmissionsHighIntentDetection', hardcodedSchedule: '6,16,26,36,46,56 * * * *', runner: runAdmissionsHighIntentLead, label: 'Admissions high-intent lead' },
  { agentName: 'AdmissionsInsightsAggregation', hardcodedSchedule: '10,40 * * * *', runner: runAdmissionsInsights, label: 'Admissions insights' },
  { agentName: 'AdmissionsExecutiveUpdate', hardcodedSchedule: '0 */4 * * *', runner: runAdmissionsExecutiveUpdate, label: 'Admissions executive update' },
  { agentName: 'AdmissionsCallCompliance', hardcodedSchedule: '7,22,37,52 * * * *', runner: runAdmissionsCallCompliance, label: 'Admissions call compliance' },
  { agentName: 'AdmissionsCallbackManagement', hardcodedSchedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', runner: runAdmissionsCallback, label: 'Admissions callback management' },
  { agentName: 'AdmissionsConversationTaskMonitor', hardcodedSchedule: '*/2 * * * *', runner: runAdmissionsConversationTaskScan, label: 'Admissions conversation task monitor' },
  { agentName: 'AdmissionsAssistant', hardcodedSchedule: '4,14,24,34,44,54 * * * *', runner: runAdmissionsAssistant, label: 'Admissions assistant' },

  // OpenClaw network
  { agentName: 'OpenclawSupervisor', hardcodedSchedule: '*/2 * * * *', runner: runOpenclawSupervisor, label: 'OpenClaw supervisor' },
  { agentName: 'OpenclawMarketSignal', hardcodedSchedule: '*/30 * * * *', runner: runOpenclawMarketSignal, label: 'OpenClaw market signal' },
  { agentName: 'OpenclawConversationDetection', hardcodedSchedule: '5,35 * * * *', runner: runOpenclawConversationDetection, label: 'OpenClaw conversation detection' },
  { agentName: 'OpenclawContentResponse', hardcodedSchedule: '10,40 * * * *', runner: runOpenclawContentResponse, label: 'OpenClaw content response' },
  { agentName: 'OpenclawBrowserWorker', hardcodedSchedule: '15,45 * * * *', runner: runOpenclawBrowserWorker, label: 'OpenClaw browser worker' },
  { agentName: 'OpenclawLearningOptimization', hardcodedSchedule: '0 */4 * * *', runner: runOpenclawLearningOptimization, label: 'OpenClaw learning optimization' },
  { agentName: 'OpenclawInfrastructureMonitor', hardcodedSchedule: '*/5 * * * *', runner: runOpenclawInfraMonitor, label: 'OpenClaw infra monitor' },
  { agentName: 'OpenclawTechResearch', hardcodedSchedule: '0 6 * * *', runner: runOpenclawTechResearch, label: 'OpenClaw tech research' },

  // Department Strategy Architects (every 6 hours, staggered)
  { agentName: 'ExecutiveStrategyArchitect', hardcodedSchedule: '0 */6 * * *', runner: runExecutiveStrategyArchitect, label: 'Executive strategy architect' },
  { agentName: 'GovernanceStrategyArchitect', hardcodedSchedule: '2 */6 * * *', runner: runGovernanceStrategyArchitect, label: 'Governance strategy architect' },
  { agentName: 'StrategyFuturesArchitect', hardcodedSchedule: '4 */6 * * *', runner: runStrategyFuturesArchitect, label: 'Strategy futures architect' },
  { agentName: 'FinanceIntelligenceArchitect', hardcodedSchedule: '6 */6 * * *', runner: runFinanceIntelligenceArchitect, label: 'Finance intelligence architect' },
  { agentName: 'OperationsOptimizationArchitect', hardcodedSchedule: '8 */6 * * *', runner: runOperationsOptimizationArchitect, label: 'Operations optimization architect' },
  { agentName: 'OrchestrationEcosystemArchitect', hardcodedSchedule: '10 */6 * * *', runner: runOrchestrationEcosystemArchitect, label: 'Orchestration ecosystem architect' },
  { agentName: 'InsightArchitect', hardcodedSchedule: '12 */6 * * *', runner: runInsightArchitect, label: 'Insight architect' },
  { agentName: 'PartnershipExpansionArchitect', hardcodedSchedule: '14 */6 * * *', runner: runPartnershipExpansionArchitect, label: 'Partnership expansion architect' },
  { agentName: 'GrowthExperimentArchitect', hardcodedSchedule: '16 */6 * * *', runner: runGrowthExperimentArchitect, label: 'Growth experiment architect' },
  { agentName: 'MarketingAutomationArchitect', hardcodedSchedule: '18 */6 * * *', runner: runMarketingAutomationArchitect, label: 'Marketing automation architect' },
  { agentName: 'AdmissionsConversionArchitect', hardcodedSchedule: '20 */6 * * *', runner: runAdmissionsConversionArchitect, label: 'Admissions conversion architect' },
  { agentName: 'InfrastructureEvolutionArchitect', hardcodedSchedule: '22 */6 * * *', runner: runInfrastructureEvolutionArchitect, label: 'Infrastructure evolution architect' },
  { agentName: 'PlatformInnovationArchitect', hardcodedSchedule: '24 */6 * * *', runner: runPlatformInnovationArchitect, label: 'Platform innovation architect' },
  { agentName: 'LearningInnovationArchitect', hardcodedSchedule: '26 */6 * * *', runner: runLearningInnovationArchitect, label: 'Learning innovation architect' },
  { agentName: 'StudentSuccessArchitect', hardcodedSchedule: '28 */6 * * *', runner: runStudentSuccessArchitect, label: 'Student success architect' },
  { agentName: 'AlumniNetworkArchitect', hardcodedSchedule: '30 */6 * * *', runner: runAlumniNetworkArchitect, label: 'Alumni network architect' },

  // Security Operations
  { agentName: 'SecurityDirectorAgent', hardcodedSchedule: '*/10 * * * *', runner: runSecurityDirector, label: 'Security director' },
  { agentName: 'SecretDetectionAgent', hardcodedSchedule: '0 */4 * * *', runner: runSecretDetection, label: 'Secret detection' },
  { agentName: 'CodeSecurityAuditAgent', hardcodedSchedule: '0 3 * * *', runner: runCodeSecurityAudit, label: 'Code security audit' },
  { agentName: 'DependencySecurityAgent', hardcodedSchedule: '0 4 * * *', runner: runDependencySecurity, label: 'Dependency security' },
  { agentName: 'RuntimeThreatMonitorAgent', hardcodedSchedule: '*/5 * * * *', runner: runRuntimeThreatMonitor, label: 'Runtime threat monitor' },
  { agentName: 'AccessControlGuardianAgent', hardcodedSchedule: '0 5 * * *', runner: runAccessControlGuardian, label: 'Access control guardian' },
  { agentName: 'AISafetyMonitorAgent', hardcodedSchedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *', runner: runAiSafetyMonitor, label: 'AI safety monitor' },
  { agentName: 'AgentBehaviorMonitorAgent', hardcodedSchedule: '5,15,25,35,45,55 * * * *', runner: runAgentBehaviorMonitor, label: 'Agent behavior monitor' },
];

// Executive briefings use dynamic imports, registered separately
interface DynamicScheduleEntry {
  agentName: string;
  hardcodedSchedule: string;
  dynamicImport: () => void;
  label: string;
}

const DYNAMIC_SCHEDULE_REGISTRY: DynamicScheduleEntry[] = [
  {
    agentName: 'DailyExecutiveBriefing',
    hardcodedSchedule: '0 7 * * *',
    dynamicImport: () => {
      import('./executiveBriefingService').then(({ generateDailyBriefing }) => {
        generateDailyBriefing().catch((err) => {
          console.error('[AI Ops] Daily briefing cron error:', err);
        });
      });
    },
    label: 'Executive daily briefing',
  },
  {
    agentName: 'WeeklyStrategicBriefing',
    hardcodedSchedule: '0 7 * * 1',
    dynamicImport: () => {
      import('./executiveBriefingService').then(({ generateWeeklyStrategicBriefing }) => {
        generateWeeklyStrategicBriefing().catch((err) => {
          console.error('[AI Ops] Weekly briefing cron error:', err);
        });
      });
    },
    label: 'Executive weekly briefing',
  },
  {
    agentName: 'ExecutiveAwarenessMorningDigest',
    hardcodedSchedule: '0 7 * * *',
    dynamicImport: () => {
      import('./executiveBriefingService').then(({ generateExecutiveDigest }) => {
        generateExecutiveDigest('morning').catch((err) => {
          console.error('[AI Ops] Executive morning digest cron error:', err);
        });
      });
    },
    label: 'Executive awareness morning digest',
  },
  {
    agentName: 'ExecutiveAwarenessEveningDigest',
    hardcodedSchedule: '0 18 * * *',
    dynamicImport: () => {
      import('./executiveBriefingService').then(({ generateExecutiveDigest }) => {
        generateExecutiveDigest('evening').catch((err) => {
          console.error('[AI Ops] Executive evening digest cron error:', err);
        });
      });
    },
    label: 'Executive awareness evening digest',
  },
  {
    agentName: 'StrategicMetricCapture',
    hardcodedSchedule: '*/15 * * * *',
    dynamicImport: () => {
      import('./strategic-intelligence/strategicStateStore').then(({ captureStrategicSnapshot }) => {
        captureStrategicSnapshot().catch((err) => {
          console.error('[AI Ops] Strategic snapshot cron error:', err);
        });
      });
    },
    label: 'Strategic metric capture (15min)',
  },
  {
    agentName: 'StrategicTrendAnalysis',
    hardcodedSchedule: '5,35 * * * *',
    dynamicImport: () => {
      import('./strategic-intelligence/anomalyDetectionEngine').then(({ detectAndEmitAnomalies }) => {
        detectAndEmitAnomalies().catch((err) => {
          console.error('[AI Ops] Strategic trend/anomaly cron error:', err);
        });
      });
    },
    label: 'Strategic trend + anomaly analysis',
  },
  {
    agentName: 'StrategicRecommendationCycle',
    hardcodedSchedule: '10,40 * * * *',
    dynamicImport: () => {
      Promise.all([
        import('./strategic-intelligence/metricCollector'),
        import('./strategic-intelligence/trendAnalyzer'),
        import('./strategic-intelligence/anomalyDetectionEngine'),
        import('./strategic-intelligence/strategicInferenceEngine'),
        import('./strategic-intelligence/recommendationEngine'),
      ]).then(async ([{ getStrategicMetrics }, { analyzeStrategicTrends }, { detectAnomalies }, { generateInferences }, { generateRecommendations, persistRecommendations }]) => {
        const [metrics, trends, anomalies] = await Promise.all([
          getStrategicMetrics(),
          analyzeStrategicTrends(),
          detectAnomalies(),
        ]);
        const inferences = await generateInferences(trends, anomalies, metrics);
        const recommendations = await generateRecommendations(inferences, metrics);
        await persistRecommendations(recommendations);
      }).catch((err) => {
        console.error('[AI Ops] Strategic recommendation cron error:', err);
      });
    },
    label: 'Strategic inference + recommendation cycle',
  },
];

/**
 * Start all AI Operations cron jobs.
 * Reads schedules from governance DB (cron_schedule_configs table).
 * Falls back to hardcoded schedules if DB is unavailable.
 * Called from schedulerService.startScheduler() to keep scheduling isolated.
 */
export async function startAIOpsScheduler(): Promise<void> {
  // Seed 17 departments on startup (idempotent)
  seedDepartments().catch((err) => {
    console.error('[AI Ops] Failed to seed departments:', err.message);
  });

  // Seed full agent registry on startup (idempotent — 129 agents)
  seedAgentRegistry().catch((err) => {
    console.error('[AI Ops] Failed to seed agent registry:', err.message);
  });

  // Seed admissions knowledge base on startup (idempotent)
  seedAdmissionsKnowledge().catch((err) => {
    console.error('[AI Ops] Failed to seed admissions knowledge:', err.message);
  });

  // Seed executive notification policy on startup (idempotent)
  import('./executiveAwarenessSeed').then(({ seedExecutiveNotificationPolicy }) => {
    seedExecutiveNotificationPolicy().catch((err) => {
      console.error('[AI Ops] Failed to seed executive notification policy:', err.message);
    });
  });

  // Load all cron schedules from governance DB
  let dbSchedules = new Map<string, ResolvedCronSchedule>();
  try {
    dbSchedules = await resolveAllCronSchedules();
    if (dbSchedules.size > 0) {
      console.log(`[AI Ops] Loaded ${dbSchedules.size} cron schedules from governance DB`);
    }
  } catch (err: any) {
    console.warn('[AI Ops] Failed to load cron schedules from DB, using hardcoded defaults:', err.message);
  }

  let scheduledCount = 0;
  let skippedCount = 0;

  // Schedule standard agents
  for (const entry of SCHEDULE_REGISTRY) {
    const dbEntry = dbSchedules.get(entry.agentName);
    const schedule = dbEntry?.schedule || entry.hardcodedSchedule;
    const enabled = dbEntry?.enabled ?? true;
    const source = dbEntry ? 'DB' : 'hardcoded';

    if (!enabled) {
      console.log(`[AI Ops]   SKIP ${entry.label} (disabled in governance DB)`);
      skippedCount++;
      continue;
    }

    cron.schedule(schedule, () => {
      entry.runner().catch((err) => {
        console.error(`[AI Ops] ${entry.label} cron error:`, err);
      });
    });

    console.log(`[AI Ops]   ${entry.label}: ${schedule} [${source}]`);
    scheduledCount++;
  }

  // Schedule dynamic-import agents (executive briefings)
  for (const entry of DYNAMIC_SCHEDULE_REGISTRY) {
    const dbEntry = dbSchedules.get(entry.agentName);
    const schedule = dbEntry?.schedule || entry.hardcodedSchedule;
    const enabled = dbEntry?.enabled ?? true;
    const source = dbEntry ? 'DB' : 'hardcoded';

    if (!enabled) {
      console.log(`[AI Ops]   SKIP ${entry.label} (disabled in governance DB)`);
      skippedCount++;
      continue;
    }

    cron.schedule(schedule, entry.dynamicImport);

    console.log(`[AI Ops]   ${entry.label}: ${schedule} [${source}]`);
    scheduledCount++;
  }

  console.log(`[AI Ops] Scheduler started: ${scheduledCount} agents scheduled, ${skippedCount} disabled`);
}
