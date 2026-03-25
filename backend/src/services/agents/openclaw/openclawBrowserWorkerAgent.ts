import { Op } from 'sequelize';
import { OpenclawTask, OpenclawResponse, OpenclawSession, OpenclawSignal } from '../../../models';
import { postToDevTo, postToHashnode, postToDiscourse, postToTwitter, postToBluesky, postToYouTube, postToProductHunt, hasPlatformCredentials } from './openclawPlatformPostingService';
import { postViaBrowser, hasBrowserSupport } from './openclawBrowserPostingService';
import { getStrategy, isPostCreationAllowed } from './openclawPlatformStrategy';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Posting Agent
 * Processes approved responses via: API → browser fallback → manual queue.
 * Handles authentication, screenshots, and session health.
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
            // API posting failed — try browser fallback before manual queue
            console.warn(`[OpenClaw Posting] API post failed for ${response.platform}: ${postErr.message}`);

            if (hasBrowserSupport(response.platform) && signal?.source_url) {
              try {
                console.log(`[OpenClaw Posting] Attempting browser fallback for ${response.platform}...`);
                const browserResult = await postViaBrowser(
                  response.platform,
                  signal.source_url,
                  response.content,
                  {
                    headless: config.headless ?? true,
                    screenshot_on_post: config.screenshot_on_post ?? true,
                    min_delay_ms: minDelay,
                    max_delay_ms: maxDelay,
                  },
                );

                await response.update({
                  post_status: 'posted',
                  posted_at: new Date(),
                  post_url: browserResult.post_url,
                  updated_at: new Date(),
                });

                actions.push({
                  campaign_id: '',
                  action: 'browser_post_response',
                  reason: `Posted to ${response.platform} via browser (session: ${browserResult.session_id})`,
                  confidence: 0.85,
                  before_state: { post_status: 'approved' },
                  after_state: { post_status: 'posted', post_url: browserResult.post_url, method: 'browser' },
                  result: 'success',
                  entity_type: 'system',
                  entity_id: response.id,
                });

                // Update task and signal, then skip to next task
                await task.update({
                  status: 'completed',
                  output_data: { response_id: response.id, post_status: 'posted', post_url: browserResult.post_url, method: 'browser' },
                  completed_at: new Date(),
                  updated_at: new Date(),
                });
                if (signal) await signal.update({ status: 'responded', responded_at: new Date(), updated_at: new Date() });
                continue;
              } catch (browserErr: any) {
                console.warn(`[OpenClaw Posting] Browser fallback also failed: ${browserErr.message}`);
              }
            }

            // Final fallback: manual queue
            await response.update({
              post_status: 'ready_to_post',
              updated_at: new Date(),
            });

            actions.push({
              campaign_id: '',
              action: 'queue_manual_post',
              reason: `API + browser failed for ${response.platform}: ${postErr.message}`,
              confidence: 0.7,
              before_state: { post_status: 'approved' },
              after_state: { post_status: 'ready_to_post' },
              result: 'success',
              entity_type: 'system',
              entity_id: response.id,
            });
          }
        } else if (hasBrowserSupport(response.platform) && signal?.source_url) {
          // No API credentials but browser support available
          try {
            console.log(`[OpenClaw Posting] No API creds — using browser for ${response.platform}...`);
            const browserResult = await postViaBrowser(
              response.platform,
              signal.source_url,
              response.content,
              {
                headless: config.headless ?? true,
                screenshot_on_post: config.screenshot_on_post ?? true,
                min_delay_ms: minDelay,
                max_delay_ms: maxDelay,
              },
            );

            await response.update({
              post_status: 'posted',
              posted_at: new Date(),
              post_url: browserResult.post_url,
              updated_at: new Date(),
            });

            actions.push({
              campaign_id: '',
              action: 'browser_post_response',
              reason: `Posted to ${response.platform} via browser (session: ${browserResult.session_id})`,
              confidence: 0.85,
              before_state: { post_status: 'approved' },
              after_state: { post_status: 'posted', post_url: browserResult.post_url, method: 'browser' },
              result: 'success',
              entity_type: 'system',
              entity_id: response.id,
            });

            await task.update({
              status: 'completed',
              output_data: { response_id: response.id, post_status: 'posted', post_url: browserResult.post_url, method: 'browser' },
              completed_at: new Date(),
              updated_at: new Date(),
            });
            if (signal) await signal.update({ status: 'responded', responded_at: new Date(), updated_at: new Date() });
            continue;
          } catch (browserErr: any) {
            console.warn(`[OpenClaw Posting] Browser posting failed: ${browserErr.message}`);
            await response.update({ post_status: 'ready_to_post', updated_at: new Date() });
            actions.push({
              campaign_id: '',
              action: 'queue_manual_post',
              reason: `Browser failed for ${response.platform}: ${browserErr.message}`,
              confidence: 0.7,
              before_state: { post_status: 'approved' },
              after_state: { post_status: 'ready_to_post' },
              result: 'success',
              entity_type: 'system',
              entity_id: response.id,
            });
          }
        } else {
          // No API credentials and no browser support — manual queue
          await response.update({
            post_status: 'ready_to_post',
            updated_at: new Date(),
          });

          actions.push({
            campaign_id: '',
            action: 'queue_manual_post',
            reason: `No API or browser support for ${response.platform} — queued for manual posting`,
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
      return postToDevTo(articleId, response.content, signal?.source_url);
    }
    case 'hashnode': {
      const postId = signal?.details?.id;
      if (!postId) throw new Error('No Hashnode post ID in signal details');
      return postToHashnode(postId, response.content, signal?.source_url);
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
