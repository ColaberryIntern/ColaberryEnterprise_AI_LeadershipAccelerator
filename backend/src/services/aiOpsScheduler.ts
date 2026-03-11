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

  console.log('[AI Ops] Scheduler started (46 agents registered):');
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
}
