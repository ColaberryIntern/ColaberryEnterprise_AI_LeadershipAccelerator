import { Op } from 'sequelize';
import { OpenclawTask, OpenclawResponse, OpenclawSession, OpenclawSignal } from '../../../models';
import { postToDevTo, postToHashnode, hasPlatformCredentials } from './openclawPlatformPostingService';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Posting Agent
 * Processes approved responses: auto-posts to platforms with API credentials (Dev.to),
 * queues everything else as 'ready_to_post' for manual posting by admin.
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

        const signal = response.signal_id
          ? await OpenclawSignal.findByPk(response.signal_id)
          : null;

        // Anti-detection delay
        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check if platform supports API posting
        if (hasPlatformCredentials(response.platform)) {
          // Auto-post via API
          try {
            const postResult = await postToPlatform(response, signal);

            await response.update({
              post_status: 'posted',
              posted_at: new Date(),
              post_url: postResult.post_url,
              updated_at: new Date(),
            });

            actions.push({
              campaign_id: '',
              action: 'auto_post_response',
              reason: `Auto-posted to ${response.platform} via API (delay: ${delay}ms)`,
              confidence: 0.9,
              before_state: { post_status: 'approved' },
              after_state: { post_status: 'posted', post_url: postResult.post_url },
              result: 'success',
              entity_type: 'system',
              entity_id: response.id,
            });
          } catch (postErr: any) {
            // API posting failed — fall back to manual queue
            console.warn(`[OpenClaw Posting] API post failed for ${response.platform}: ${postErr.message}`);
            await response.update({
              post_status: 'ready_to_post',
              updated_at: new Date(),
            });

            actions.push({
              campaign_id: '',
              action: 'queue_manual_post',
              reason: `API post failed for ${response.platform}, queued for manual posting: ${postErr.message}`,
              confidence: 0.7,
              before_state: { post_status: 'approved' },
              after_state: { post_status: 'ready_to_post' },
              result: 'success',
              entity_type: 'system',
              entity_id: response.id,
            });
          }
        } else {
          // No API credentials — queue for manual posting
          await response.update({
            post_status: 'ready_to_post',
            updated_at: new Date(),
          });

          actions.push({
            campaign_id: '',
            action: 'queue_manual_post',
            reason: `No API credentials for ${response.platform} — queued for manual posting`,
            confidence: 0.9,
            before_state: { post_status: 'approved' },
            after_state: { post_status: 'ready_to_post' },
            result: 'success',
            entity_type: 'system',
            entity_id: response.id,
          });
        }

        // Update signal status
        if (signal) {
          await signal.update({
            status: 'responded',
            responded_at: new Date(),
            updated_at: new Date(),
          });
        }

        await task.update({
          status: 'completed',
          output_data: { response_id: response.id, post_status: response.post_status, post_url: response.post_url },
          completed_at: new Date(),
          updated_at: new Date(),
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
    errors.push(err.message || 'Posting agent error');
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

async function postToPlatform(
  response: InstanceType<typeof OpenclawResponse>,
  signal: InstanceType<typeof OpenclawSignal> | null,
): Promise<{ post_url: string; platform_post_id: string }> {
  switch (response.platform) {
    case 'devto': {
      const articleId = signal?.details?.id;
      if (!articleId) throw new Error('No Dev.to article ID in signal details');
      return postToDevTo(articleId, response.content);
    }
    case 'hashnode': {
      const postId = signal?.details?.id;
      if (!postId) throw new Error('No Hashnode post ID in signal details');
      return postToHashnode(postId, response.content);
    }
    default:
      throw new Error(`No API posting support for platform: ${response.platform}`);
  }
}
