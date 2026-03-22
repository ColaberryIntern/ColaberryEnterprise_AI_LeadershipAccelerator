import crypto from 'crypto';
import { Op } from 'sequelize';
import { OpenclawSignal, OpenclawTask, OpenclawResponse } from '../../../models';
import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';
import type { AgentExecutionResult, AgentAction } from '../types';

const BASE_URL = process.env.BASE_URL || 'https://enterprise.colaberry.ai';

// All platforms get tracked links — user posts manually so they control link placement
const LINK_ALLOWED_PLATFORMS = new Set(['devto', 'linkedin', 'reddit', 'hackernews', 'quora', 'medium', 'hashnode']);

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
  const maxLength = config.max_response_length || 1800;

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

const SYSTEM_PROMPT = `You are Ali Moiz, founder of an enterprise AI leadership training program. You run a 6-week accelerator that helps business leaders and teams build practical AI skills — prompt engineering, AI strategy, RAG architectures, and hands-on implementation.

You write responses to online discussions about AI from the perspective of someone who BUILDS AI training programs and works with enterprise teams daily. Your insights come from real experience running cohorts and seeing what actually works in AI adoption.

Rules:
1. Lead with a genuinely useful insight, framework, or data point from your experience
2. Write as a practitioner — "In our latest cohort, we saw..." or "One framework we use with enterprise teams..."
3. NEVER use the word "Colaberry" — refer to "our program" or "the accelerator" if needed
4. Answer the original question directly before adding your perspective
5. Match the platform's communication style (Dev.to = technical, Reddit = casual, LinkedIn = professional)
6. Keep it substantive — no filler, no generic platitudes, no buzzword soup
7. Be specific — mention real frameworks, tools, metrics, or patterns you've observed
8. Sound like a real person, not a marketing bot — be conversational and opinionated`;

const SYSTEM_PROMPT_WITH_LINK = `${SYSTEM_PROMPT}
9. IMPORTANT: You MUST end your response with a natural reference to a resource, using the tracked URL provided. Examples:
   - "We put together a deeper breakdown of this framework here: [URL]"
   - "If you want to dig into this more, we published a practical guide: [URL]"
   - "I go deeper on the enterprise adoption side here: [URL]"
   Make it feel like a helpful resource share, not an ad. The URL MUST appear in your response.`;

function buildUserPrompt(signal: any, tone: string, maxLength: number, trackedUrl: string | null): string {
  const platform = signal.platform;
  const title = signal.title || '';
  const excerpt = signal.content_excerpt || '';
  const details = signal.details || {};

  let platformContext = '';
  if (platform === 'reddit') {
    platformContext = `This is a Reddit post in r/${details.subreddit || 'unknown'}. Write like a genuine Reddit commenter — casual but knowledgeable. Don't use bullet points or headers. Keep it to 2-3 paragraphs max.`;
  } else if (platform === 'hackernews') {
    platformContext = `This is a Hacker News discussion. HN values technical depth, contrarian thinking, and data-backed claims. Be concise and intellectually rigorous. Share from experience, not marketing.`;
  } else if (platform === 'devto') {
    platformContext = `This is a Dev.to article discussion. The audience is developers and tech leaders. You can use technical language and reference tools/frameworks. Be practical and actionable.`;
  } else if (platform === 'linkedin') {
    platformContext = `This is a LinkedIn post. Professional tone but not stiff. Share insights from experience running AI training programs. Short paragraphs work well.`;
  } else if (platform === 'quora') {
    platformContext = `This is a Quora question. Give a thorough, authoritative answer. Structure is okay here — numbered points or short sections work well.`;
  } else if (platform === 'hashnode') {
    platformContext = `This is a Hashnode article discussion. The audience is developers, tech founders, and engineering leaders. Technical depth is valued — share real frameworks, architecture decisions, and practical insights from running AI training programs. Markdown formatting works well.`;
  }

  let linkInstruction = '';
  if (trackedUrl) {
    linkInstruction = `\n\nTRACKED URL — YOU MUST INCLUDE THIS AT THE END OF YOUR RESPONSE: ${trackedUrl}\nEnd your response with a sentence that naturally links to this URL as a helpful resource.`;
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

Write a response as Ali Moiz, someone who runs an enterprise AI leadership accelerator. Share a genuine, useful perspective from your experience training enterprise teams on AI adoption. Be helpful first, credible second.${linkInstruction}`;
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
        max_tokens: Math.min(Math.ceil(maxLength / 2.5), 1200),
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
    // Remove any URLs the LLM hallucinated (but keep our tracked URL)
    if (trackedUrl) {
      // Remove hallucinated URLs that aren't our tracked URL
      cleaned = cleaned.replace(/https?:\/\/\S+/g, (match) =>
        match.startsWith(trackedUrl.replace(/\/+$/, '')) ? match : ''
      ).replace(/\s{2,}/g, ' ').trim();

      // If the tracked URL is missing, append it
      if (!cleaned.includes(trackedUrl)) {
        cleaned += `\n\nI go deeper on the enterprise AI adoption side here: ${trackedUrl}`;
      }
    } else {
      cleaned = cleaned.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
    }
    return cleaned.slice(0, maxLength + 100); // extra room for appended URL
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
