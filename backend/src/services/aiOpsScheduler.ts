import cron from 'node-cron';
import { seedAgents, runHealthScans, runRepairAgent, runContentOptimization, runConversationOptimization } from './aiOrchestrator';

/**
 * Start all AI Operations cron jobs.
 * Called from schedulerService.startScheduler() to keep scheduling isolated.
 */
export function startAIOpsScheduler(): void {
  // Seed agent records on startup (idempotent)
  seedAgents().catch((err) => {
    console.error('[AI Ops] Failed to seed agents:', err.message);
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

  console.log('[AI Ops] Scheduler started:');
  console.log('[AI Ops]   Campaign health scan: every 15 minutes');
  console.log('[AI Ops]   Campaign repair agent: every 20 minutes (offset)');
  console.log('[AI Ops]   Content optimization: every 6 hours');
  console.log('[AI Ops]   Conversation optimization: daily at 4 AM');
}
