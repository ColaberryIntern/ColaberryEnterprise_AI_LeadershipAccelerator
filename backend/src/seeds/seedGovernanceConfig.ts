import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { GovernanceConfig, CronScheduleConfig, RiskScoringConfig } from '../models';

/**
 * Seeds the governance center tables with current hardcoded defaults.
 * Safe to re-run — uses findOrCreate to avoid duplicates.
 */

const GLOBAL_GOVERNANCE_DEFAULTS = {
  scope: 'global',
  version: 1,
  autonomy_mode: 'full',
  max_dynamic_agents: 50,
  max_agents_total: 100,
  max_auto_executions_per_hour: 10,
  max_risk_budget_per_hour: 200,
  max_proposed_pending: 50,
  auto_execute_risk_threshold: 40,
  auto_execute_confidence_threshold: 70,
  max_experiments_per_agent: 1,
  max_system_experiments: 3,
  approval_required_for_critical: true,
  autonomy_rules: [
    { name: 'Default Rule', mode: 'full', conditions: [], priority: 0 },
  ],
};

const CRON_SCHEDULES: { agent_name: string; default_schedule: string }[] = [
  { agent_name: 'CampaignHealthScanner', default_schedule: '*/15 * * * *' },
  { agent_name: 'CampaignRepairAgent', default_schedule: '8,28,48 * * * *' },
  { agent_name: 'ContentOptimizationAgent', default_schedule: '0 */6 * * *' },
  { agent_name: 'ConversationOptimizationAgent', default_schedule: '0 4 * * *' },
  { agent_name: 'OrchestrationHealthAgent', default_schedule: '*/5 * * * *' },
  { agent_name: 'StudentProgressMonitor', default_schedule: '*/2 * * * *' },
  { agent_name: 'PromptMonitorAgent', default_schedule: '*/1 * * * *' },
  { agent_name: 'OrchestrationAutoRepairAgent', default_schedule: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *' },
  { agent_name: 'CampaignQAAgent', default_schedule: '0 */6 * * *' },
  { agent_name: 'CampaignSelfHealingAgent', default_schedule: '15,45 * * * *' },
  { agent_name: 'AutonomousEngine', default_schedule: '5,15,25,35,45,55 * * * *' },
  { agent_name: 'AICOOStrategicCycle', default_schedule: '0,30 * * * *' },
  { agent_name: 'MetaAgentLoop', default_schedule: '2 * * * *' },
  { agent_name: 'ApolloLeadIntelligenceAgent', default_schedule: '0 */6 * * *' },
  { agent_name: 'AdmissionsVisitorActivity', default_schedule: '*/10 * * * *' },
  { agent_name: 'AdmissionsConversationMemory', default_schedule: '*/30 * * * *' },
  { agent_name: 'AdmissionsIntentDetection', default_schedule: '3,13,23,33,43,53 * * * *' },
  { agent_name: 'AdmissionsProactiveOutreach', default_schedule: '*/5 * * * *' },
  { agent_name: 'AdmissionsConversationContinuity', default_schedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *' },
  { agent_name: 'AdmissionsHighIntentDetection', default_schedule: '6,16,26,36,46,56 * * * *' },
  { agent_name: 'AdmissionsInsightsAggregation', default_schedule: '10,40 * * * *' },
  { agent_name: 'AdmissionsExecutiveUpdate', default_schedule: '0 */4 * * *' },
  { agent_name: 'AdmissionsCallCompliance', default_schedule: '7,22,37,52 * * * *' },
  { agent_name: 'AdmissionsCallbackManagement', default_schedule: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *' },
  { agent_name: 'AdmissionsConversationTaskMonitor', default_schedule: '*/2 * * * *' },
  { agent_name: 'AdmissionsAssistant', default_schedule: '4,14,24,34,44,54 * * * *' },
  { agent_name: 'DailyExecutiveBriefing', default_schedule: '0 7 * * *' },
  { agent_name: 'WeeklyStrategicBriefing', default_schedule: '0 7 * * 1' },
  { agent_name: 'OpenclawSupervisor', default_schedule: '*/2 * * * *' },
  { agent_name: 'OpenclawMarketSignal', default_schedule: '*/30 * * * *' },
  { agent_name: 'OpenclawConversationDetection', default_schedule: '5,35 * * * *' },
  { agent_name: 'OpenclawContentResponse', default_schedule: '10,40 * * * *' },
  { agent_name: 'OpenclawBrowserWorker', default_schedule: '15,45 * * * *' },
  { agent_name: 'OpenclawLearningOptimization', default_schedule: '0 */4 * * *' },
  { agent_name: 'OpenclawInfrastructureMonitor', default_schedule: '*/5 * * * *' },
  { agent_name: 'OpenclawTechResearch', default_schedule: '0 6 * * *' },
];

const RISK_SCORING_DEFAULTS = {
  blast_radius_weights: {
    send_email: 30,
    send_sms: 25,
    make_call: 40,
    modify_campaign: 50,
    create_campaign: 60,
    modify_lead: 20,
    system_config_change: 80,
    agent_spawn: 70,
  },
  reversibility_weights: {
    send_email: 10,
    send_sms: 10,
    make_call: 5,
    modify_campaign: 70,
    create_campaign: 80,
    modify_lead: 60,
    system_config_change: 90,
    agent_spawn: 50,
  },
  intent_thresholds: {
    enrollment_ready: 80,
    high_intent: 60,
    engaged: 40,
    exploring: 20,
  },
};

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  // 1. Seed global governance config
  const [govConfig, govCreated] = await GovernanceConfig.findOrCreate({
    where: { scope: 'global' },
    defaults: GLOBAL_GOVERNANCE_DEFAULTS as any,
  });
  console.log(govCreated
    ? `[Governance] Created global config (id: ${govConfig.id})`
    : `[Governance] Global config already exists (id: ${govConfig.id})`);

  // 2. Seed cron schedule configs
  let cronCreated = 0;
  let cronExisted = 0;
  for (const sched of CRON_SCHEDULES) {
    const [, created] = await CronScheduleConfig.findOrCreate({
      where: { agent_name: sched.agent_name },
      defaults: {
        agent_name: sched.agent_name,
        default_schedule: sched.default_schedule,
        active_schedule: sched.default_schedule,
        enabled: true,
      } as any,
    });
    if (created) cronCreated++;
    else cronExisted++;
  }
  console.log(`[Governance] Cron schedules: ${cronCreated} created, ${cronExisted} already existed`);

  // 3. Seed risk scoring config
  const existingRisk = await RiskScoringConfig.findOne();
  if (!existingRisk) {
    const riskConfig = await RiskScoringConfig.create(RISK_SCORING_DEFAULTS as any);
    console.log(`[Governance] Created risk scoring config (id: ${riskConfig.id})`);
  } else {
    console.log(`[Governance] Risk scoring config already exists (id: ${existingRisk.id})`);
  }

  console.log('[Governance] Seed complete.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[Governance] Seed failed:', err);
  process.exit(1);
});
