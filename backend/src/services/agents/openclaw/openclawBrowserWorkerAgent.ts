import { Op } from 'sequelize';
import { OpenclawTask, OpenclawResponse, OpenclawSession } from '../../../models';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Browser Worker Agent
 * Manages Playwright browser sessions to post approved responses.
 * Handles session creation, posting, screenshots, and health tracking.
 *
 * NOTE: Actual Playwright operations are stubbed until the Playwright
 * dependency is installed. The agent tracks session state and task lifecycle.
 */
export async function runOpenclawBrowserWorkerAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const minDelay = config.min_delay_ms || 2000;
  const maxDelay = config.max_delay_ms || 8000;

  try {
    // Fetch post_response tasks that are assigned/pending
    const tasks = await OpenclawTask.findAll({
      where: {
        task_type: 'post_response',
        status: { [Op.in]: ['assigned', 'pending'] },
      },
      order: [['priority', 'DESC']],
      limit: 5,
    });

    for (const task of tasks) {
      try {
        await task.update({ status: 'running', started_at: new Date(), updated_at: new Date() });

        const responseId = task.input_data?.response_id;
        if (!responseId) {
          await task.update({
            status: 'failed',
            error_message: 'No response_id in task input',
            completed_at: new Date(),
            updated_at: new Date(),
          });
          continue;
        }

        const response = await OpenclawResponse.findByPk(responseId);
        if (!response || response.post_status !== 'approved') {
          await task.update({
            status: 'failed',
            error_message: response ? 'Response not approved' : 'Response not found',
            completed_at: new Date(),
            updated_at: new Date(),
          });
          continue;
        }

        // Find or create session for this platform
        let session = await OpenclawSession.findOne({
          where: {
            platform: response.platform,
            session_status: { [Op.in]: ['active', 'idle'] },
          },
        });

        if (!session) {
          session = await OpenclawSession.create({
            platform: response.platform,
            session_status: 'active',
            last_activity_at: new Date(),
            created_at: new Date(),
          });
        }

        // Simulate random delay (anti-detection)
        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // --- Playwright posting would happen here ---
        // For now, mark as posted with a placeholder URL
        // In production: launch browser context, navigate, post, screenshot

        await response.update({
          session_id: session.id,
          post_status: 'posted',
          posted_at: new Date(),
          post_url: `https://${response.platform}.com/posted/${response.id.slice(0, 8)}`,
          updated_at: new Date(),
        });

        // Update session activity
        await session.update({
          last_activity_at: new Date(),
          actions_performed: (session.actions_performed || 0) + 1,
          pages_visited: (session.pages_visited || 0) + 1,
          updated_at: new Date(),
        });

        // Link response back to signal
        const signal = response.signal_id
          ? await (await import('../../../models')).OpenclawSignal.findByPk(response.signal_id)
          : null;
        if (signal) {
          await signal.update({
            status: 'responded',
            responded_at: new Date(),
            updated_at: new Date(),
          });
        }

        await task.update({
          status: 'completed',
          output_data: { post_url: response.post_url, session_id: session.id },
          completed_at: new Date(),
          updated_at: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'post_response',
          reason: `Posted response to ${response.platform} (delay: ${delay}ms)`,
          confidence: 0.9,
          before_state: { post_status: 'approved' },
          after_state: { post_status: 'posted', post_url: response.post_url },
          result: 'success',
          entity_type: 'system',
          entity_id: response.id,
        });
      } catch (err: any) {
        await task.update({
          status: 'failed',
          error_message: err.message,
          completed_at: new Date(),
          updated_at: new Date(),
        });
        errors.push(`Task ${task.id}: ${err.message}`);
      }
    }
  } catch (err: any) {
    errors.push(err.message || 'Browser worker error');
  }

  return {
    agent_name: 'OpenclawBrowserWorkerAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter((a) => a.result === 'success').length,
  };
}
