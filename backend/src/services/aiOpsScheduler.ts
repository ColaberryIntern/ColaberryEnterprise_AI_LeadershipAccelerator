import cron from 'node-cron';
import { seedAgentRegistry } from './agentRegistrySeed';
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
} from './aiOrchestrator';
import { runAutonomousCycle } from '../intelligence/autonomy/autonomousEngine';
import { runStrategicCycle } from '../intelligence/strategy/aiCOO';
import { runMetaAgentLoop } from '../intelligence/meta/metaAgentLoop';

/**
 * Start all AI Operations cron jobs.
 * Called from schedulerService.startScheduler() to keep scheduling isolated.
 */
export function startAIOpsScheduler(): void {
  // Seed full agent registry on startup (idempotent — 22 agents)
  seedAgentRegistry().catch((err) => {
    console.error('[AI Ops] Failed to seed agent registry:', err.message);
  });

  // Campaign health scan: every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    runHealthScans().catch((err) => {
      console.error('[AI Ops] Health scan cron error:', err);
    });
  });

  // Campaign Repair Agent: every 20 minutes (offset from scanner)
  cron.schedule('8,28,48 * * * *', () => {
    runRepairAgent().catch((err) => {
      console.error('[AI Ops] Repair agent cron error:', err);
    });
  });

  // Content Optimization Agent: every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runContentOptimization().catch((err) => {
      console.error('[AI Ops] Content optimization cron error:', err);
    });
  });

  // Conversation Optimization Agent: daily at 4 AM
  cron.schedule('0 4 * * *', () => {
    runConversationOptimization().catch((err) => {
      console.error('[AI Ops] Conversation optimization cron error:', err);
    });
  });

  // Orchestration Health Agent: every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runOrchestrationHealth().catch((err) => {
      console.error('[AI Ops] Orchestration health cron error:', err);
    });
  });

  // Student Progress Monitor: every 2 minutes
  cron.schedule('*/2 * * * *', () => {
    runStudentProgress().catch((err) => {
      console.error('[AI Ops] Student progress monitor cron error:', err);
    });
  });

  // Prompt Monitor Agent: every minute
  cron.schedule('*/1 * * * *', () => {
    runPromptMonitor().catch((err) => {
      console.error('[AI Ops] Prompt monitor cron error:', err);
    });
  });

  // Orchestration Auto-Repair Agent: every 5 minutes (offset from health scan)
  cron.schedule('3,8,13,18,23,28,33,38,43,48,53,58 * * * *', () => {
    runOrchestrationRepair().catch((err) => {
      console.error('[AI Ops] Orchestration repair cron error:', err);
    });
  });

  // Campaign QA Agent: every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runCampaignQA().catch((err) => {
      console.error('[AI Ops] Campaign QA agent cron error:', err);
    });
  });

  // Campaign Self-Healing Agent: every 30 minutes (offset from repair agent)
  cron.schedule('15,45 * * * *', () => {
    runSelfHealing().catch((err) => {
      console.error('[AI Ops] Self-healing agent cron error:', err);
    });
  });

  // --- Intelligence Layer Crons ---

  // Autonomous Engine: every 10 minutes (offset from existing agents)
  cron.schedule('5,15,25,35,45,55 * * * *', () => {
    runAutonomousCycle().catch((err) => {
      console.error('[AI Ops] Autonomous cycle cron error:', err);
    });
  });

  // AI COO Strategic Cycle: every 30 minutes
  cron.schedule('0,30 * * * *', () => {
    runStrategicCycle().catch((err) => {
      console.error('[AI Ops] Strategic cycle cron error:', err);
    });
  });

  // Meta-Agent Loop: hourly at :02
  cron.schedule('2 * * * *', () => {
    runMetaAgentLoop().catch((err) => {
      console.error('[AI Ops] Meta-agent loop cron error:', err);
    });
  });

  // Apollo Lead Intelligence Agent: every 6 hours
  cron.schedule('0 */6 * * *', () => {
    runLeadIntelligence().catch((err) => {
      console.error('[AI Ops] Lead intelligence agent cron error:', err);
    });
  });

  // --- Admissions Intelligence Crons ---

  // Admissions Visitor Activity: every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    runAdmissionsVisitorActivity().catch((err) => {
      console.error('[AI Ops] Admissions visitor activity cron error:', err);
    });
  });

  // Admissions Conversation Memory: every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runAdmissionsConversationMemory().catch((err) => {
      console.error('[AI Ops] Admissions conversation memory cron error:', err);
    });
  });

  // Admissions Intent Detection: every 10 minutes (offset)
  cron.schedule('3,13,23,33,43,53 * * * *', () => {
    runAdmissionsIntentDetection().catch((err) => {
      console.error('[AI Ops] Admissions intent detection cron error:', err);
    });
  });

  // Admissions Proactive Outreach: every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runAdmissionsProactiveOutreach().catch((err) => {
      console.error('[AI Ops] Admissions proactive outreach cron error:', err);
    });
  });

  // Admissions Conversation Continuity: every 5 minutes (offset)
  cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', () => {
    runAdmissionsConversationContinuity().catch((err) => {
      console.error('[AI Ops] Admissions conversation continuity cron error:', err);
    });
  });

  // Admissions High-Intent Lead Detection: every 10 minutes (offset)
  cron.schedule('6,16,26,36,46,56 * * * *', () => {
    runAdmissionsHighIntentLead().catch((err) => {
      console.error('[AI Ops] Admissions high-intent lead cron error:', err);
    });
  });

  // Admissions Insights Aggregation: every 30 minutes (offset)
  cron.schedule('10,40 * * * *', () => {
    runAdmissionsInsights().catch((err) => {
      console.error('[AI Ops] Admissions insights cron error:', err);
    });
  });

  // Admissions Executive Update: every 4 hours
  cron.schedule('0 */4 * * *', () => {
    runAdmissionsExecutiveUpdate().catch((err) => {
      console.error('[AI Ops] Admissions executive update cron error:', err);
    });
  });

  // Admissions Ops: Call compliance monitor every 15 minutes (offset :07)
  cron.schedule('7,22,37,52 * * * *', () => {
    runAdmissionsCallCompliance().catch((err) => {
      console.error('[AI Ops] Admissions call compliance cron error:', err);
    });
  });

  // Admissions Ops: Callback management every 5 minutes (offset :02)
  cron.schedule('2,7,12,17,22,27,32,37,42,47,52,57 * * * *', () => {
    runAdmissionsCallback().catch((err) => {
      console.error('[AI Ops] Admissions callback management cron error:', err);
    });
  });

  // Admissions Ops: Conversation task monitor every 2 minutes
  cron.schedule('*/2 * * * *', () => {
    runAdmissionsConversationTaskScan().catch((err) => {
      console.error('[AI Ops] Admissions conversation task monitor cron error:', err);
    });
  });

  // Admissions Ops: Assistant agent every 10 minutes (offset :04)
  cron.schedule('4,14,24,34,44,54 * * * *', () => {
    runAdmissionsAssistant().catch((err) => {
      console.error('[AI Ops] Admissions assistant cron error:', err);
    });
  });

  console.log('[AI Ops] Scheduler started (75 agents registered):');
  console.log('[AI Ops]   Campaign health scan: every 15 minutes');
  console.log('[AI Ops]   Campaign repair agent: every 20 minutes (offset)');
  console.log('[AI Ops]   Content optimization: every 6 hours');
  console.log('[AI Ops]   Conversation optimization: daily at 4 AM');
  console.log('[AI Ops]   Orchestration health: every 5 minutes');
  console.log('[AI Ops]   Student progress monitor: every 2 minutes');
  console.log('[AI Ops]   Prompt monitor: every minute');
  console.log('[AI Ops]   Orchestration auto-repair: every 5 minutes (offset)');
  console.log('[AI Ops]   Campaign QA agent: every 6 hours');
  console.log('[AI Ops]   Campaign self-healing: every 30 minutes');
  console.log('[AI Ops]   Autonomous engine: every 10 minutes');
  console.log('[AI Ops]   AI COO strategic cycle: every 30 minutes');
  console.log('[AI Ops]   Meta-agent loop: hourly at :02');
  console.log('[AI Ops]   Apollo lead intelligence: every 6 hours');
  console.log('[AI Ops]   Admissions visitor activity: every 10 minutes');
  console.log('[AI Ops]   Admissions conversation memory: every 30 minutes');
  console.log('[AI Ops]   Admissions intent detection: every 10 minutes');
  console.log('[AI Ops]   Admissions proactive outreach: every 5 minutes');
  console.log('[AI Ops]   Admissions conversation continuity: every 5 minutes');
  console.log('[AI Ops]   Admissions high-intent lead: every 10 minutes');
  console.log('[AI Ops]   Admissions insights: every 30 minutes');
  console.log('[AI Ops]   Admissions executive update: every 4 hours');
  console.log('[AI Ops]   Admissions call compliance: every 15 minutes');
  console.log('[AI Ops]   Admissions callback management: every 5 minutes');
  console.log('[AI Ops]   Admissions conversation task monitor: every 2 minutes');
  console.log('[AI Ops]   Admissions assistant: every 10 minutes');
}
