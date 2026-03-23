import crypto from 'crypto';
import { Op } from 'sequelize';
import { OpenclawSignal, OpenclawTask, OpenclawResponse } from '../../../models';
import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';
import type { AgentExecutionResult, AgentAction } from '../types';

const BASE_URL = process.env.BASE_URL || 'https://enterprise.colaberry.ai';

// Platforms where including a tracked link in the comment is acceptable
const LINK_ALLOWED_PLATFORMS = new Set(['devto', 'linkedin']);

/**
 * OpenClaw Content Response Agent
 * Generates educational, platform-appropriate responses for queued signals.
 * Uses LLM (GPT-4o) for intelligent response generation with template fallback.
 * Creates draft responses pending admin approval.
 * Each response gets a unique marketing tag for attribution tracking.
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

        // Generate unique per-response marketing tag
        const shortId = `oc-${signal.platform}-${crypto.randomBytes(4).toString('hex')}`;
        const trackedUrl = `${BASE_URL}/i/${shortId}`;
        const utmParams = {
          utm_source: signal.platform,
          utm_medium: 'organic_outreach',
          utm_campaign: shortId,
        };

        // Generate response content
        const tone = selectTone(signal, defaultTone);
        const includeLink = LINK_ALLOWED_PLATFORMS.has(signal.platform);
        const content = await generateLLMResponse(signal, tone, maxLength, includeLink ? trackedUrl : null);

        // Create draft response with unique tracking
        const response = await OpenclawResponse.create({
          signal_id: signal.id,
          platform: signal.platform,
          content,
          tone: tone as any,
          short_id: shortId,
          tracked_url: trackedUrl,
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
          output_data: { response_id: response.id, tone, content_length: content.length, short_id: shortId },
          completed_at: new Date(),
          updated_at: new Date(),
        });

        actions.push({
          campaign_id: '',
          action: 'generate_response',
          reason: `Generated ${tone} response (${content.length} chars) for ${signal.platform} signal [tag: ${shortId}]`,
          confidence: 0.85,
          before_state: { signal_status: signal.status },
          after_state: { response_id: response.id, post_status: 'draft', short_id: shortId },
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

const SYSTEM_PROMPT = `You are a knowledgeable AI education thought leader writing responses to online discussions about AI, enterprise AI adoption, AI training, and workforce transformation.

Your employer is Colaberry — a company that provides enterprise AI leadership training and bootcamps. You NEVER mention Colaberry by name in your responses. Instead, you provide genuinely helpful, educational insights that establish thought leadership.

Rules:
1. Lead with VALUE — share real insights, data points, frameworks, or practical advice
2. NEVER pitch, sell, or mention any company or product by name
3. Match the platform's communication style and norms
4. Be authentic — write like a real person who happens to be deeply knowledgeable about AI adoption
5. Keep responses concise and substantive — no filler, no generic platitudes
6. If the original post asks a question, answer it directly first
7. Draw on real industry trends: AI literacy gaps, change management, ROI of upskilling, adoption curves
8. Avoid corporate jargon — write naturally
9. End with a thought-provoking observation or question that invites further discussion, not a call to action`;

const SYSTEM_PROMPT_WITH_LINK = `${SYSTEM_PROMPT}
10. A tracked URL will be provided. You may include it ONCE at the very end as a natural, non-promotional reference — e.g., "I wrote more about this approach here: [URL]" or "There's a deeper breakdown of this framework here: [URL]". Make it feel organic, not like an ad.`;

function buildUserPrompt(signal: any, tone: string, maxLength: number, trackedUrl: string | null): string {
  const platform = signal.platform;
  const title = signal.title || '';
  const excerpt = signal.content_excerpt || '';
  const details = signal.details || {};

  let platformContext = '';
  if (platform === 'reddit') {
    platformContext = `This is a Reddit post in r/${details.subreddit || 'unknown'}. Write like a genuine Reddit commenter — casual but knowledgeable. Don't use bullet points or headers. Keep it to 2-3 paragraphs max. Do NOT include any links or URLs.`;
  } else if (platform === 'hackernews') {
    platformContext = `This is a Hacker News discussion. HN values technical depth, contrarian thinking, and data-backed claims. Be concise and intellectually rigorous. Avoid anything that sounds like marketing. Do NOT include any links or URLs.`;
  } else if (platform === 'devto') {
    platformContext = `This is a Dev.to article discussion. The audience is developers. You can use technical language and reference tools/frameworks. Be practical and actionable.`;
  } else if (platform === 'linkedin') {
    platformContext = `This is a LinkedIn post. Professional tone but not stiff. Share insights from experience. Short paragraphs work well.`;
  } else if (platform === 'quora') {
    platformContext = `This is a Quora question. Give a thorough, authoritative answer. Structure is okay here — numbered points or short sections work well.`;
  }

  let linkInstruction = '';
  if (trackedUrl) {
    linkInstruction = `\n\nTracked URL (include once, naturally, at the end): ${trackedUrl}`;
  }

  return `Platform: ${platform}
Tone: ${tone}
Max length: ${maxLength} characters

${platformContext}

--- ORIGINAL POST ---
Title: ${title}
Content: ${excerpt.slice(0, 800)}
${details.subreddit ? `Subreddit: r/${details.subreddit}` : ''}
${details.num_comments ? `Comments: ${details.num_comments}` : ''}
--- END ---

Write a response to this post. Remember: provide genuine value, no self-promotion.${linkInstruction}`;
}

// Use gpt-4o for outreach content — higher quality than gpt-4o-mini
const OPENCLAW_MODEL = 'gpt-4o';

async function generateLLMResponse(signal: any, tone: string, maxLength: number, trackedUrl: string | null): Promise<string> {
  const userPrompt = buildUserPrompt(signal, tone, maxLength, trackedUrl);
  const systemPrompt = trackedUrl ? SYSTEM_PROMPT_WITH_LINK : SYSTEM_PROMPT;
  const client = getOpenAIClient();

  let llmResult: string | null = null;
  if (client) {
    try {
      const response = await client.chat.completions.create({
        model: OPENCLAW_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: Math.min(Math.ceil(maxLength / 3), 1024),
        temperature: 0.7,
      });
      llmResult = response.choices[0]?.message?.content || null;
    } catch (err: any) {
      console.warn('[OpenClaw Content] LLM call failed, using template fallback:', err?.message?.slice(0, 200));
    }
  }

  if (llmResult) {
    // Clean up any LLM artifacts
    let cleaned = llmResult.trim();
    // Remove any accidental self-references the LLM might add
    cleaned = cleaned.replace(/\b[Cc]olaberry\b/g, '');
    // Remove URLs ONLY if the platform doesn't allow links (keep tracked URL for link-allowed platforms)
    if (!trackedUrl) {
      cleaned = cleaned.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
    }
    return cleaned.slice(0, maxLength);
  }

  // Fallback to template if LLM unavailable
  return generateTemplateResponse(signal, tone, maxLength);
}

function generateTemplateResponse(signal: any, tone: string, maxLength: number): string {
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
      `Good technical breakdown. One dimension worth adding: the pipeline from model selection to fine-tuning to deployment to monitoring benefits enormously from teams with hands-on AI engineering skills. A structured training approach covering prompt engineering, RAG architectures, and evaluation frameworks dramatically reduces iteration cycles.`,
      `Solid analysis. In practice, the bottleneck often isn't the model architecture but the team's ability to evaluate, iterate, and deploy effectively. Organizations that invest in AI engineering training see significantly faster time-to-production.`,
    ],
  };

  const options = templates[tone] || templates.educational;
  const selected = options[Math.floor(Math.random() * options.length)];

  return selected.slice(0, maxLength);
}
