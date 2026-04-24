import { Op } from 'sequelize';
import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';
import {
  getCategoryConfig,
  getSystemPrompt,
  validateContent,
} from './skoolPlatformStrategy';

// Models loaded via require with try/catch since they may not be compiled yet
let SkoolSignal: any;
let SkoolTask: any;
let SkoolResponse: any;

try {
  SkoolSignal = require('../../../models').SkoolSignal;
  SkoolTask = require('../../../models').SkoolTask;
  SkoolResponse = require('../../../models').SkoolResponse;
} catch (err: any) {
  console.warn('[Skool][ContentResponse] Failed to load models:', err.message);
}

const SKOOL_MODEL = 'gpt-4o';

/**
 * Skool Content Response Agent
 *
 * Generates replies and new posts for queued Skool engagement tasks.
 * Uses GPT-4o for content generation with the platform strategy system prompt.
 * Creates draft SkoolResponse records pending quality gate review.
 */
export async function runSkoolContentResponse(): Promise<{ generated: number }> {
  let generated = 0;

  if (!SkoolTask || !SkoolSignal || !SkoolResponse) {
    console.error('[Skool][ContentResponse] Models not available, skipping run');
    return { generated };
  }

  // Pull pending tasks distributed across categories (not all from one category).
  // Use a round-robin approach: get 1 task per category, prioritized by score.
  const categoryPriority = ['hiring', 'dev-help', 'leads-help', 'builds', 'introductions', 'announcements'];
  const tasks: any[] = [];
  for (const cat of categoryPriority) {
    if (tasks.length >= 5) break;
    const catTasks = await SkoolTask.findAll({
      where: { task_type: { [Op.in]: ['generate_reply', 'generate_post'] }, status: 'pending' },
      include: [{ model: SkoolSignal, as: 'signal', where: { category: cat }, required: true }],
      order: [['priority', 'DESC']],
      limit: 1,
    });
    tasks.push(...catTasks);
  }
  // Fill remaining slots with highest priority tasks from any category
  if (tasks.length < 5) {
    const taskIds = tasks.map((t: any) => t.id);
    const more = await SkoolTask.findAll({
      where: { task_type: { [Op.in]: ['generate_reply', 'generate_post'] }, status: 'pending', ...(taskIds.length > 0 ? { id: { [Op.notIn]: taskIds } } : {}) },
      order: [['priority', 'DESC']],
      limit: 5 - tasks.length,
    });
    tasks.push(...more);
  }

  if (tasks.length === 0) {
    console.log('[Skool][ContentResponse] No pending tasks found');
    return { generated };
  }

  console.log(`[Skool][ContentResponse] Processing ${tasks.length} task(s)`);

  const client = getOpenAIClient();
  if (!client) {
    console.error('[Skool][ContentResponse] OpenAI client not available (missing OPENAI_API_KEY)');
    // Mark all tasks as failed
    for (const task of tasks) {
      await task.update({
        status: 'failed',
        error_message: 'OpenAI API key not configured',
        completed_at: new Date(),
      });
    }
    return { generated };
  }

  const categoryConfig = getCategoryConfig();

  for (const task of tasks) {
    try {
      // Mark task as running
      await task.update({ status: 'running', started_at: new Date() });

      // Determine response type from task type
      const isReply = task.task_type === 'generate_reply';
      const responseType = isReply ? 'reply' : 'new_post';

      // Load the associated signal
      const signal = task.signal_id
        ? await SkoolSignal.findByPk(task.signal_id)
        : null;

      if (isReply && !signal) {
        await task.update({
          status: 'failed',
          error_message: 'Signal not found for reply task',
          completed_at: new Date(),
        });
        console.warn(`[Skool][ContentResponse] Task ${task.id}: signal not found`);
        continue;
      }

      // Get category from signal or task metadata
      const category = signal?.category || (task as any).metadata?.category || 'dev-help';
      const catConfig = categoryConfig[category];
      const tone = catConfig?.tone || 'peer_level';

      // Build the GPT-4o prompt
      const systemPrompt = getSystemPrompt(category);
      let userPrompt: string;

      if (isReply) {
        const postTitle = signal.post_title || 'Untitled post';
        const bodyPreview = (signal.post_body_preview || '').slice(0, 500);
        const authorName = signal.author_name || 'A community member';

        userPrompt = `Write a reply to this Skool post. Category: ${category}. Post by ${authorName}: ${postTitle} - ${bodyPreview}`;

        if (catConfig) {
          userPrompt += `\n\nCategory tone: ${tone}. CTA level: ${catConfig.ctaLevel}. ${catConfig.description}`;
        }
      } else {
        // New post
        const metadata = (task as any).metadata || {};
        const topic = metadata.topic || 'AI implementation for agency owners';
        userPrompt = `Write a new post for the ${category} category. Topic: ${topic}`;

        if (catConfig) {
          userPrompt += `\n\nCategory tone: ${tone}. CTA level: ${catConfig.ctaLevel}. ${catConfig.description}`;
        }

        if (metadata.title_suggestion) {
          userPrompt += `\n\nSuggested title: ${metadata.title_suggestion}`;
        }
      }

      // Call GPT-4o
      let responseBody: string | null = null;
      try {
        const completion = await client.chat.completions.create({
          model: SKOOL_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: isReply ? 400 : 800,
          temperature: 0.7,
        });

        responseBody = completion.choices[0]?.message?.content?.trim() || null;
      } catch (llmErr: any) {
        console.error(`[Skool][ContentResponse] LLM call failed for task ${task.id}:`, llmErr.message?.slice(0, 200));
        await task.update({
          status: 'failed',
          error_message: `LLM call failed: ${llmErr.message?.slice(0, 200)}`,
          attempts: (task.attempts || 0) + 1,
          completed_at: new Date(),
        });
        continue;
      }

      if (!responseBody) {
        await task.update({
          status: 'failed',
          error_message: 'LLM returned empty response',
          attempts: (task.attempts || 0) + 1,
          completed_at: new Date(),
        });
        continue;
      }

      // Clean up LLM artifacts
      let cleaned = responseBody;
      // Replace emdashes with hyphens
      cleaned = cleaned.replace(/\u2014/g, ' - ').replace(/\u2013/g, ' - ');
      // Remove any accidental Colaberry name drops (but protect URLs)
      cleaned = cleaned.replace(/\b[Cc]olaberry\b(?![./])/g, '').replace(/\s{2,}/g, ' ').trim();

      // Run deterministic strategy validation
      const validation = validateContent(cleaned, category);
      if (!validation.passed) {
        console.warn(`[Skool][ContentResponse] Strategy validation failed for task ${task.id}: ${validation.reason}`);
        await task.update({
          status: 'failed',
          error_message: `Strategy validation: ${validation.reason}`,
          attempts: (task.attempts || 0) + 1,
          completed_at: new Date(),
        });
        continue;
      }

      // Create SkoolResponse record
      const response = await SkoolResponse.create({
        signal_id: signal?.id || null,
        response_type: responseType,
        category,
        title: isReply ? null : (cleaned.split('\n')[0] || '').slice(0, 200),
        body: cleaned,
        tone,
        post_status: 'draft',
        metadata: {
          task_id: task.id,
          model: SKOOL_MODEL,
          generated_at: new Date().toISOString(),
        },
        created_at: new Date(),
      });

      console.log(`[Skool][ContentResponse] Generated ${responseType} (${cleaned.length} chars) -> response ${response.id}`);

      // Update the task as completed
      await task.update({
        status: 'completed',
        response_id: response.id,
        completed_at: new Date(),
      });

      // Create a post_content task pointing to the response
      await SkoolTask.create({
        task_type: 'post_content',
        signal_id: signal?.id || null,
        response_id: response.id,
        status: 'pending',
        priority: task.priority || 5,
        created_at: new Date(),
      });

      generated++;
    } catch (err: any) {
      console.error(`[Skool][ContentResponse] Error processing task ${task.id}:`, err.message);
      await task.update({
        status: 'failed',
        error_message: err.message?.slice(0, 500),
        attempts: (task.attempts || 0) + 1,
        completed_at: new Date(),
      }).catch(() => {});
    }
  }

  console.log(`[Skool][ContentResponse] Run complete: ${generated} generated`);
  return { generated };
}
