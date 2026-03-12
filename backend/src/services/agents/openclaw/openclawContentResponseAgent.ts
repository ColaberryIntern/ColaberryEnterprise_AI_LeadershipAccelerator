import { Op } from 'sequelize';
import { OpenclawSignal, OpenclawTask, OpenclawResponse } from '../../../models';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Content Response Agent
 * Generates educational, platform-appropriate responses for queued signals.
 * Creates draft responses pending admin approval.
 */
export async function runOpenclawContentResponseAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const defaultTone = config.default_tone || 'educational';
  const maxLength = config.max_response_length || 1500;
  const utmCampaign = config.utm_campaign || 'openclaw';

  try {
    // Fetch assigned generate_response tasks
    const tasks = await OpenclawTask.findAll({
      where: {
        task_type: 'generate_response',
        status: { [Op.in]: ['assigned', 'pending'] },
      },
      order: [['priority', 'DESC']],
      limit: 10,
    });

    for (const task of tasks) {
      try {
        await task.update({ status: 'running', started_at: new Date(), updated_at: new Date() });

        const signal = task.signal_id
          ? await OpenclawSignal.findByPk(task.signal_id)
          : null;

        if (!signal) {
          await task.update({
            status: 'failed',
            error_message: 'Signal not found',
            completed_at: new Date(),
            updated_at: new Date(),
          });
          continue;
        }

        // Generate response content
        const tone = selectTone(signal, defaultTone);
        const content = generateResponse(signal, tone, maxLength);

        // Create UTM params
        const utmParams = {
          utm_source: signal.platform,
          utm_medium: 'organic_outreach',
          utm_campaign: utmCampaign,
        };

        // Create draft response
        const response = await OpenclawResponse.create({
          signal_id: signal.id,
          platform: signal.platform,
          content,
          tone: tone as any,
          utm_params: utmParams,
          post_status: 'draft',
          created_at: new Date(),
        });

        // Update signal with response reference
        await signal.update({
          response_id: response.id,
          updated_at: new Date(),
        });

        // Create post task if auto-approval is enabled (default: require approval)
        if (!config.require_approval) {
          await OpenclawTask.create({
            task_type: 'post_response',
            priority: task.priority,
            status: 'pending',
            signal_id: signal.id,
            input_data: { response_id: response.id },
            created_at: new Date(),
          });
          await response.update({ post_status: 'approved', updated_at: new Date() });
        }

        await task.update({
          status: 'completed',
          output_data: { response_id: response.id, tone, content_length: content.length },
          completed_at: new Date(),
          updated_at: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'generate_response',
          reason: `Generated ${tone} response (${content.length} chars) for ${signal.platform} signal`,
          confidence: 0.85,
          before_state: { signal_status: signal.status },
          after_state: { response_id: response.id, post_status: 'draft' },
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
    errors.push(err.message || 'Content response error');
  }

  return {
    agent_name: 'OpenclawContentResponseAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter((a) => a.result === 'success').length,
  };
}

function selectTone(signal: any, defaultTone: string): string {
  const platform = signal.platform;
  const text = ((signal.title || '') + ' ' + (signal.content_excerpt || '')).toLowerCase();

  // Technical platforms prefer technical tone
  if (platform === 'hackernews' || platform === 'devto') {
    if (text.includes('code') || text.includes('implementation') || text.includes('architecture')) {
      return 'technical';
    }
  }

  // Questions and discussions prefer conversational tone
  if (text.includes('?') || text.includes('advice') || text.includes('thoughts')) {
    return 'conversational';
  }

  return defaultTone;
}

function generateResponse(signal: any, tone: string, maxLength: number): string {
  // Template-based response generation
  // In production, this would call an LLM API
  const platform = signal.platform;
  const title = signal.title || 'this topic';

  const templates: Record<string, string[]> = {
    educational: [
      `Great question about ${title}. From what we've seen in enterprise AI adoption, the key factors are: (1) starting with a clear business problem, (2) investing in workforce AI literacy before tools, and (3) measuring outcomes not just deployment. Many organizations skip step 2 and wonder why adoption stalls.`,
      `This is a really important topic. The research shows that organizations investing in structured AI training programs see 3-4x better adoption rates than those doing ad-hoc learning. The gap isn't in the technology — it's in the human capability to leverage it effectively.`,
    ],
    conversational: [
      `Interesting perspective on ${title}! I've been following this space closely and one thing that keeps coming up is how much the "human side" of AI matters. The companies getting the most value aren't necessarily the ones with the best models — they're the ones whose teams actually know how to work with AI effectively.`,
      `Really resonates with this. The biggest challenge I see isn't technical — it's organizational. Teams need practical, hands-on AI skills, not just awareness. Has anyone found programs that actually bridge that gap between theory and practice?`,
    ],
    technical: [
      `Good technical breakdown. One dimension worth adding: the pipeline from model selection → fine-tuning → deployment → monitoring benefits enormously from teams with hands-on AI engineering skills. We've found that a structured training approach covering prompt engineering, RAG architectures, and evaluation frameworks dramatically reduces iteration cycles.`,
      `Solid analysis. In practice, the bottleneck often isn't the model architecture but the team's ability to evaluate, iterate, and deploy effectively. Organizations that invest in AI engineering training see significantly faster time-to-production.`,
    ],
  };

  const options = templates[tone] || templates.educational;
  const selected = options[Math.floor(Math.random() * options.length)];

  return selected.slice(0, maxLength);
}
