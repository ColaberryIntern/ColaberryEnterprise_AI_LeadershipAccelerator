import { Op } from 'sequelize';
import { OpenclawTask, OpenclawResponse, OpenclawSignal } from '../../../models';
import { postToDevTo, postToHashnode, postToMedium, postToDiscourse, postToTwitter, postToBluesky, postToYouTube, postToProductHunt, hasPlatformCredentials } from './openclawPlatformPostingService';
import { postViaBrowser, hasBrowserSupport } from './openclawBrowserPostingService';
import { getStrategy, isPostCreationAllowed, isHumanExecution } from './openclawPlatformStrategy';
import { checkCircuitBreaker } from './openclawCircuitBreaker';
import { isRateLimited } from './openclawRateLimiter';
import type { AgentExecutionResult, AgentAction } from '../types';

const MAX_RETRIES = 3;

/**
 * OpenClaw Posting Agent
 * Processes approved responses via: API → browser fallback → retry → manual queue.
 * Handles authentication, screenshots, and session health.
 * Includes recovery sweep for orphaned responses stuck in ready_to_post.
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
    // ── Recovery sweep: re-queue orphaned ready_to_post responses on auto platforms ──
    await recoverOrphanedResponses(actions);

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
        if (!response || !['approved', 'ready_to_post'].includes(response.post_status)) {
          await task.update({
            status: 'failed',
            error_message: response ? `Response status is ${response.post_status}, expected approved` : 'Response not found',
            completed_at: new Date(),
            updated_at: new Date(),
          });
          continue;
        }

        // Hard safety gate — NEVER auto-post on HUMAN_EXECUTION platforms
        if (isHumanExecution(response.platform)) {
          await task.update({
            status: 'failed',
            error_message: `HUMAN_EXECUTION: ${response.platform} requires manual posting — auto-post blocked`,
            completed_at: new Date(),
            updated_at: new Date(),
          });
          continue;
        }

        // Platform strategy gate — block post creation on PASSIVE_SIGNAL platforms
        if ((task.task_type as string) === 'create_post' && !isPostCreationAllowed(response.platform)) {
          await task.update({
            status: 'failed',
            error_message: `Strategy ${getStrategy(response.platform)} blocks create_post on ${response.platform}`,
            completed_at: new Date(),
            updated_at: new Date(),
          });
          continue;
        }

        // Circuit breaker gate — halt if error rate too high for this platform
        try {
          const circuitStatus = await checkCircuitBreaker(response.platform);
          if (circuitStatus.state === 'OPEN') {
            await task.update({
              status: 'pending',
              error_message: `Circuit breaker OPEN for ${response.platform} (error rate: ${circuitStatus.error_rate}%)`,
              updated_at: new Date(),
            });
            continue;
          }
        } catch { /* non-fatal — proceed if circuit check fails */ }

        // Rate limit gate — defer if platform limit reached
        try {
          const rateLimitResult = await isRateLimited(response.platform);
          if (!rateLimitResult.allowed) {
            await task.update({
              status: 'pending',
              error_message: rateLimitResult.reason || 'Rate limited',
              updated_at: new Date(),
            });
            continue;
          }
        } catch { /* non-fatal — proceed if rate check fails */ }

        const signal = response.signal_id
          ? await OpenclawSignal.findByPk(response.signal_id)
          : null;

        // Anti-detection delay
        const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
        await new Promise((resolve) => setTimeout(resolve, delay));

        const retryCount = task.input_data?.retry_count || 0;

        // Attempt posting: API → browser fallback
        const postResult = await attemptPosting(response, signal, config, minDelay, maxDelay);

        if (postResult.success) {
          // Successfully posted
          await response.update({
            post_status: 'posted',
            posted_at: new Date(),
            post_url: postResult.post_url,
            updated_at: new Date(),
          });

          actions.push({
            campaign_id: '',
            action: postResult.method === 'browser' ? 'browser_post_response' : 'auto_post_response',
            reason: `Posted to ${response.platform} via ${postResult.method} (delay: ${delay}ms)`,
            confidence: 0.9,
            before_state: { post_status: response.post_status },
            after_state: { post_status: 'posted', post_url: postResult.post_url },
            result: 'success',
            entity_type: 'system',
            entity_id: response.id,
          });

          await task.update({
            status: 'completed',
            output_data: { response_id: response.id, post_status: 'posted', post_url: postResult.post_url, method: postResult.method },
            completed_at: new Date(),
            updated_at: new Date(),
          });

          if (signal) await signal.update({ status: 'responded', responded_at: new Date(), updated_at: new Date() });
        } else if (retryCount < MAX_RETRIES) {
          // Posting failed but retries remaining — keep task pending for next cycle
          console.warn(`[OpenClaw Posting] Failed attempt ${retryCount + 1}/${MAX_RETRIES} for ${response.platform}: ${postResult.error}`);

          await response.update({ post_status: 'approved', updated_at: new Date() });

          await task.update({
            status: 'pending',
            error_message: `Attempt ${retryCount + 1}/${MAX_RETRIES}: ${postResult.error}`,
            input_data: { ...task.input_data, retry_count: retryCount + 1 },
            updated_at: new Date(),
          });

          actions.push({
            campaign_id: '',
            action: 'retry_post',
            reason: `Posting failed (attempt ${retryCount + 1}/${MAX_RETRIES}): ${postResult.error}`,
            confidence: 0.6,
            before_state: { post_status: response.post_status, retry_count: retryCount },
            after_state: { post_status: 'approved', retry_count: retryCount + 1 },
            result: 'skipped',
            entity_type: 'system',
            entity_id: response.id,
          });
        } else {
          // Retries exhausted — move to manual queue
          console.warn(`[OpenClaw Posting] Max retries (${MAX_RETRIES}) exhausted for ${response.platform}, moving to manual queue`);

          await response.update({
            post_status: 'ready_to_post',
            execution_type: 'human_execution',
            updated_at: new Date(),
          });

          await task.update({
            status: 'completed',
            error_message: `Max retries exhausted: ${postResult.error}`,
            output_data: { response_id: response.id, post_status: 'ready_to_post', moved_to_manual: true },
            completed_at: new Date(),
            updated_at: new Date(),
          });

          if (signal) await signal.update({ status: 'responded', responded_at: new Date(), updated_at: new Date() });

          actions.push({
            campaign_id: '',
            action: 'queue_manual_post',
            reason: `All ${MAX_RETRIES} attempts failed for ${response.platform}: ${postResult.error}`,
            confidence: 0.7,
            before_state: { post_status: 'approved' },
            after_state: { post_status: 'ready_to_post', execution_type: 'human_execution' },
            result: 'success',
            entity_type: 'system',
            entity_id: response.id,
          });
        }
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

/**
 * Attempt to post a response via API then browser fallback.
 * Returns a result object instead of throwing.
 */
async function attemptPosting(
  response: InstanceType<typeof OpenclawResponse>,
  signal: InstanceType<typeof OpenclawSignal> | null,
  config: Record<string, any>,
  minDelay: number,
  maxDelay: number,
): Promise<{ success: true; post_url: string; method: string } | { success: false; error: string }> {
  // Try API posting first
  if (hasPlatformCredentials(response.platform)) {
    try {
      const result = await postToPlatform(response, signal);
      return { success: true, post_url: result.post_url, method: 'api' };
    } catch (apiErr: any) {
      console.warn(`[OpenClaw Posting] API post failed for ${response.platform}: ${apiErr.message}`);

      // Try browser fallback if available
      if (hasBrowserSupport(response.platform) && signal?.source_url) {
        try {
          // Medium requires non-headless (Cloudflare blocks headless) — use Xvfb virtual display
          const useHeadless = response.platform === 'medium' ? false : (config.headless ?? true);
          if (!useHeadless) process.env.DISPLAY = process.env.DISPLAY || ':99';
          const browserResult = await postViaBrowser(response.platform, signal.source_url, response.content, {
            headless: useHeadless,
            screenshot_on_post: config.screenshot_on_post ?? true,
            min_delay_ms: minDelay,
            max_delay_ms: maxDelay,
          });
          return { success: true, post_url: browserResult.post_url, method: 'browser' };
        } catch (browserErr: any) {
          return { success: false, error: `API: ${apiErr.message}; Browser: ${browserErr.message}` };
        }
      }

      return { success: false, error: `API: ${apiErr.message}; No browser fallback` };
    }
  }

  // No API credentials — try browser directly
  if (hasBrowserSupport(response.platform) && signal?.source_url) {
    try {
      // Medium requires non-headless (Cloudflare blocks headless) — use Xvfb virtual display
      const useHeadless = response.platform === 'medium' ? false : (config.headless ?? true);
      if (!useHeadless) process.env.DISPLAY = process.env.DISPLAY || ':99';
      const browserResult = await postViaBrowser(response.platform, signal.source_url, response.content, {
        headless: useHeadless,
        screenshot_on_post: config.screenshot_on_post ?? true,
        min_delay_ms: minDelay,
        max_delay_ms: maxDelay,
      });
      return { success: true, post_url: browserResult.post_url, method: 'browser' };
    } catch (browserErr: any) {
      return { success: false, error: `Browser: ${browserErr.message}` };
    }
  }

  return { success: false, error: `No API credentials or browser support for ${response.platform}` };
}

/**
 * Recovery sweep: find responses stuck in ready_to_post on auto platforms
 * that have no pending/running task, and re-queue them.
 */
async function recoverOrphanedResponses(actions: AgentAction[]): Promise<void> {
  try {
    // Only recover responses on auto platforms (not human_execution)
    const orphaned = await OpenclawResponse.findAll({
      where: {
        post_status: 'ready_to_post',
        [Op.or]: [
          { execution_type: 'api_posting' } as any,
          { execution_type: null } as any,
          { execution_type: '' } as any,
        ],
        platform: { [Op.notIn]: ['reddit', 'hackernews', 'facebook_groups', 'linkedin_comments', 'quora', 'linkedin'] },
      },
      limit: 10,
      order: [['created_at', 'ASC']],
    });

    for (const resp of orphaned) {
      // Check if there's already a pending/running task for this response
      const existingTask = await OpenclawTask.findOne({
        where: {
          task_type: 'post_response',
          status: { [Op.in]: ['pending', 'assigned', 'running'] },
          signal_id: resp.signal_id,
        },
      });

      if (existingTask) continue;

      // Re-queue: set response back to approved and create a new task
      await resp.update({ post_status: 'approved', updated_at: new Date() });

      await OpenclawTask.create({
        task_type: 'post_response',
        priority: 6,
        status: 'pending',
        signal_id: resp.signal_id,
        input_data: { response_id: resp.id, recovered: true, retry_count: 0 },
        created_at: new Date(),
      });

      actions.push({
        campaign_id: '',
        action: 'recover_orphaned_response',
        reason: `Re-queued orphaned ${resp.platform} response for auto-posting`,
        confidence: 0.8,
        before_state: { post_status: 'ready_to_post' },
        after_state: { post_status: 'approved', new_task: true },
        result: 'success',
        entity_type: 'system',
        entity_id: resp.id,
      });
    }
  } catch (err: any) {
    console.warn(`[OpenClaw Posting] Recovery sweep failed: ${err.message}`);
  }
}

async function postToPlatform(
  response: InstanceType<typeof OpenclawResponse>,
  signal: InstanceType<typeof OpenclawSignal> | null,
): Promise<{ post_url: string; platform_post_id: string }> {
  switch (response.platform) {
    case 'devto': {
      const articleId = signal?.details?.id;
      if (!articleId) throw new Error('No Dev.to article ID in signal details');
      return postToDevTo(articleId, response.content, signal?.source_url);
    }
    case 'hashnode': {
      const postId = signal?.details?.id;
      if (!postId) throw new Error('No Hashnode post ID in signal details');
      return postToHashnode(postId, response.content, signal?.source_url);
    }
    case 'medium': {
      const title = signal?.title || 'AI Insight';
      const tags = signal?.topic_tags?.slice(0, 5) || ['artificial-intelligence', 'ai'];
      return postToMedium(title, response.content, tags);
    }
    case 'discourse': {
      const topicId = signal?.details?.topic_id;
      const forumUrl = signal?.details?.forum_url;
      if (!topicId || !forumUrl) throw new Error('No Discourse topic_id or forum_url in signal details');
      const forumEnvPrefix = signal?.details?.forum_env_prefix;
      return postToDiscourse(forumUrl, topicId, response.content, forumEnvPrefix);
    }
    case 'twitter': {
      const tweetId = signal?.details?.tweet_id;
      if (!tweetId) throw new Error('No tweet_id in signal details');
      return postToTwitter(tweetId, response.content);
    }
    case 'bluesky': {
      const uri = signal?.details?.uri;
      const cid = signal?.details?.cid;
      if (!uri) throw new Error('No Bluesky uri in signal details');
      return postToBluesky(uri, response.content, cid);
    }
    case 'youtube': {
      const videoId = signal?.details?.video_id;
      if (!videoId) throw new Error('No video_id in signal details');
      return postToYouTube(videoId, response.content);
    }
    case 'producthunt': {
      const phId = signal?.details?.ph_id;
      if (!phId) throw new Error('No Product Hunt post ID in signal details');
      return postToProductHunt(phId, response.content);
    }
    default:
      throw new Error(`No API posting support for platform: ${response.platform}`);
  }
}
