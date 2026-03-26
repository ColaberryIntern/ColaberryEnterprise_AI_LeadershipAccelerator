import crypto from 'crypto';
import { Op } from 'sequelize';
import { OpenclawSignal, OpenclawTask, OpenclawResponse, OpenclawLearning } from '../../../models';
import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';
import { getStrategy, getExecutionType, isHumanExecution, isLinkAllowed, STRATEGY_PROMPT_INSTRUCTIONS, CONVERSION_STAGE_PROMPTS, validateContentForStrategy, shouldAutoApprove as shouldAutoApproveStrategy } from './openclawPlatformStrategy';
import { captureLeadFromSignal } from './openclawLeadCaptureService';
import type { AgentExecutionResult, AgentAction } from '../types';

const BASE_URL = process.env.BASE_URL || 'https://enterprise.colaberry.ai';

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
  const maxLength = config.max_response_length || 700;

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

        // Generate response content — learning-aware tone selection
        const { tone, toneSource, learningId } = await selectToneFromLearnings(signal, defaultTone);
        const topicHints = await getTopPerformingTopics();
        const includeLink = isLinkAllowed(signal.platform);
        const content = await generateLLMResponse(signal, tone, maxLength, includeLink ? trackedUrl : null, topicHints);

        // Strategy validation gate — deterministic backstop catches LLM violations
        const validation = validateContentForStrategy(content, signal.platform);
        if (!validation.passed) {
          console.warn(`[OpenClaw Content] Strategy validation failed for ${signal.platform}: ${validation.reason}`);
          await task.update({
            status: 'failed',
            error_message: `Strategy validation: ${validation.reason}`,
            completed_at: new Date(),
            updated_at: new Date(),
          });
          errors.push(`Task ${task.id}: Strategy validation failed — ${validation.reason}`);
          continue;
        }

        // Determine execution type and build metadata
        const executionType = getExecutionType(signal.platform);
        const humanExecution = isHumanExecution(signal.platform);
        const priorityScore = Math.round((Number(signal.relevance_score) || 0) * 100);
        const intentLevel = priorityScore >= 70 ? 'high' : priorityScore >= 50 ? 'medium' : 'low';

        // Create response with routing metadata
        const response = await OpenclawResponse.create({
          signal_id: signal.id,
          platform: signal.platform,
          content,
          tone: tone as any,
          short_id: shortId,
          tracked_url: trackedUrl,
          utm_params: utmParams,
          post_status: humanExecution ? 'ready_for_manual_post' : 'draft',
          execution_type: executionType === 'HUMAN_EXECUTION' ? 'human_execution' : 'api_posting',
          reasoning: `${signal.platform} signal: "${(signal.title || '').slice(0, 100)}" — relevance ${signal.relevance_score}`,
          priority_score: priorityScore,
          intent_level: intentLevel,
          recommended_action: buildRecommendedAction(signal),
          follow_up_suggestion: 'If they respond positively, advance to Stage 2 qualification',
          created_at: new Date(),
        });

        // Update signal with response reference
        await signal.update({
          response_id: response.id,
          updated_at: new Date(),
        });

        // Lead capture — create/update lead from signal author
        try {
          const lead = await captureLeadFromSignal(signal, response);
          if (lead) {
            await response.update({ lead_id: lead.id, updated_at: new Date() });
          }
        } catch (leadErr: any) {
          console.warn(`[OpenClaw Content] Lead capture failed: ${leadErr.message}`);
        }

        // Route based on execution type
        if (!humanExecution) {
          // API_POSTING: auto-approve check
          const autoApprovePlatforms: string[] = config.auto_approve_platforms || [];
          const shouldApprove = shouldAutoApproveStrategy(signal.platform, autoApprovePlatforms);
          if (shouldApprove) {
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
        }
        // HUMAN_EXECUTION: already set to 'ready_for_manual_post' — no post task created

        await task.update({
          status: 'completed',
          output_data: { response_id: response.id, tone, tone_source: toneSource, learning_id: learningId, content_length: content.length, short_id: shortId },
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

/**
 * Learning-aware tone selection. Queries platform_tone_combo learnings first,
 * falls back to keyword heuristic if no learnings exist.
 */
async function selectToneFromLearnings(
  signal: any,
  defaultTone: string,
): Promise<{ tone: string; toneSource: 'learning' | 'heuristic'; learningId?: string }> {
  try {
    // Query learnings for best tone on this platform
    const comboLearnings = await OpenclawLearning.findAll({
      where: {
        learning_type: 'platform_tone_combo',
        platform: signal.platform,
        confidence: { [Op.gte]: 0.5 },
        sample_size: { [Op.gte]: 3 },
      },
      order: [['metric_value', 'DESC']],
      limit: 1,
    });

    if (comboLearnings.length > 0) {
      const best = comboLearnings[0];
      const details = best.details || {};
      const tone = details.tone || defaultTone;
      return { tone, toneSource: 'learning', learningId: best.id };
    }
  } catch {
    // Fall through to heuristic
  }

  // Fallback: keyword heuristic
  const platform = signal.platform;
  const text = ((signal.title || '') + ' ' + (signal.content_excerpt || '')).toLowerCase();

  if (platform === 'hackernews' || platform === 'devto') {
    if (text.includes('code') || text.includes('implementation') || text.includes('architecture')) {
      return { tone: 'technical', toneSource: 'heuristic' };
    }
  }

  // New platform tone defaults
  if (platform === 'twitter' || platform === 'bluesky' || platform === 'facebook_groups') {
    return { tone: 'conversational', toneSource: 'heuristic' };
  }
  if (platform === 'linkedin_comments') {
    return { tone: 'professional', toneSource: 'heuristic' };
  }
  if (platform === 'youtube') {
    return { tone: 'educational', toneSource: 'heuristic' };
  }
  if (platform === 'producthunt') {
    return { tone: 'professional', toneSource: 'heuristic' };
  }

  if (text.includes('?') || text.includes('advice') || text.includes('thoughts')) {
    return { tone: 'conversational', toneSource: 'heuristic' };
  }

  return { tone: defaultTone, toneSource: 'heuristic' };
}

/**
 * Fetch top-performing topic keywords from learnings to inject as hints.
 */
async function getTopPerformingTopics(): Promise<string[]> {
  try {
    const topTopics = await OpenclawLearning.findAll({
      where: {
        learning_type: 'topic_performance',
        sample_size: { [Op.gte]: 3 },
      },
      order: [['metric_value', 'DESC']],
      limit: 3,
    });
    return topTopics.map(t => t.metric_key);
  } catch {
    return [];
  }
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

function buildUserPrompt(signal: any, tone: string, maxLength: number, trackedUrl: string | null, topicHints: string[] = []): string {
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
    platformContext = `This is a Hashnode blog post. The audience is developers and tech enthusiasts. Be technical but accessible. Reference practical frameworks and real-world patterns.`;
  } else if (platform === 'discourse') {
    platformContext = `This is a Discourse forum discussion (${details.forum_name || 'community forum'}). Be helpful and thorough. Forum communities appreciate detailed, well-structured answers.`;
  } else if (platform === 'twitter') {
    platformContext = `This is a Twitter/X thread. STRICT 280-character limit for replies. Be punchy, insightful, and direct. No bullet points. One sharp insight per tweet. Use casual but knowledgeable tone.`;
  } else if (platform === 'bluesky') {
    platformContext = `This is a Bluesky post. 300-character limit. The audience is tech-forward early adopters. Be concise, authentic, and skip corporate speak. Similar vibe to early Twitter but more thoughtful.`;
  } else if (platform === 'youtube') {
    platformContext = `This is a YouTube video comment. Keep it under 500 characters. Reference specific points from the video title/description. Be enthusiastic but substantive. YouTube comments that add value get pinned.`;
  } else if (platform === 'producthunt') {
    platformContext = `This is a Product Hunt launch discussion. The audience is founders, PMs, and early adopters. Be encouraging but add genuine technical insight about the product's AI approach. Keep it under 500 characters. Product Hunt values constructive feedback.`;
  } else if (platform === 'facebook_groups') {
    platformContext = `This is a Facebook Group discussion about AI. Be conversational and approachable — Facebook groups are community spaces. Share practical experience, ask follow-up questions, and blend in naturally. No jargon walls. Keep it under 300 words.`;
  } else if (platform === 'linkedin_comments') {
    platformContext = `This is a LinkedIn post comment. Be professional but personable. Reference the original post's key point, add your perspective from experience, and keep it concise (2-3 short paragraphs max). LinkedIn comments that add real value get visibility.`;
  }

  // Strategy-level instructions (highest priority — enforced before platform style)
  const strategy = getStrategy(platform);
  const strategyContext = STRATEGY_PROMPT_INSTRUCTIONS[strategy];

  // All initial responses are Stage 1 (insight only, no pitch)
  const stageContext = CONVERSION_STAGE_PROMPTS[1];

  let linkInstruction = '';
  if (trackedUrl) {
    linkInstruction = `\n\nIMPORTANT: End your response with this exact link on its own line, introduced naturally (e.g. "I wrote more about this here:" or "We break this down further here:"). The link MUST appear: ${trackedUrl}`;
  }

  return `Platform: ${platform}
Tone: ${tone}
STRICT MAX: ${maxLength} characters total (including the link). Keep it SHORT — 2-3 concise paragraphs max. Do NOT ramble.

${strategyContext}

${stageContext}

${platformContext}

--- ORIGINAL POST ---
Title: ${title}
Content: ${excerpt.slice(0, 500)}
${details.subreddit ? `Subreddit: r/${details.subreddit}` : ''}
${details.num_comments ? `Comments: ${details.num_comments}` : ''}
--- END ---

Write a SHORT, punchy response (under ${maxLength} characters). Lead with one specific insight, add brief context, done. No walls of text. No filler. Provide genuine value, no self-promotion.${topicHints.length > 0 ? `\n\nTopics that perform well with our audience: ${topicHints.join(', ')}. Weave these in if naturally relevant.` : ''}${linkInstruction}`;
}

// Use gpt-4o for outreach content — higher quality than gpt-4o-mini
const OPENCLAW_MODEL = 'gpt-4o';

async function generateLLMResponse(signal: any, tone: string, maxLength: number, trackedUrl: string | null, topicHints: string[] = []): Promise<string> {
  // Platform-specific character limits
  if (signal.platform === 'twitter') maxLength = Math.min(maxLength, 270);
  if (signal.platform === 'bluesky') maxLength = Math.min(maxLength, 290);
  if (signal.platform === 'youtube') maxLength = Math.min(maxLength, 500);
  if (signal.platform === 'producthunt') maxLength = Math.min(maxLength, 500);

  const userPrompt = buildUserPrompt(signal, tone, maxLength, trackedUrl, topicHints);
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
        max_tokens: Math.min(Math.ceil(maxLength / 3), 400),
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
    // Remove any accidental self-references the LLM might add (but protect enterprise.colaberry.ai URLs)
    cleaned = cleaned.replace(/\b[Cc]olaberry\b(?![./])/g, '');
    // Remove URLs ONLY if the platform doesn't allow links (keep tracked URL for link-allowed platforms)
    if (!trackedUrl) {
      cleaned = cleaned.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim();
    } else {
      // Strip any URLs that aren't our tracked URL
      const trackedBase = trackedUrl.replace(/\/+$/, '');
      cleaned = cleaned.replace(/https?:\/\/\S+/g, (match) => {
        const stripped = match.replace(/[)\]},;.!?]+$/, '');
        return stripped.startsWith(trackedBase) ? match : '';
      }).replace(/\s{2,}/g, ' ').trim();
    }
    // Truncate content BEFORE appending tracked URL to prevent URL cutoff
    if (trackedUrl && !cleaned.includes(trackedUrl)) {
      const suffix = `\n\nI go deeper on the enterprise AI adoption side here: ${trackedUrl}`;
      cleaned = cleaned.slice(0, maxLength - suffix.length) + suffix;
    } else {
      cleaned = cleaned.slice(0, maxLength);
    }
    return cleaned;
  }

  // Fallback to template if LLM unavailable
  return generateTemplateResponse(signal, tone, maxLength);
}

function buildRecommendedAction(signal: any): string {
  const platform = signal.platform;
  const title = (signal.title || '').slice(0, 80);
  const details = signal.details || {};

  switch (platform) {
    case 'reddit':
      return `Reply to Reddit thread${details.subreddit ? ` in r/${details.subreddit}` : ''}: "${title}"`;
    case 'hackernews':
      return `Comment on HN discussion: "${title}"`;
    case 'quora':
      return `Answer Quora question: "${title}"`;
    case 'facebook_groups':
      return `Comment in Facebook group: "${title}"`;
    case 'linkedin_comments':
      return `Comment on LinkedIn post: "${title}"`;
    case 'devto':
      return `Comment on Dev.to article: "${title}"`;
    case 'hashnode':
      return `Comment on Hashnode post: "${title}"`;
    case 'discourse':
      return `Reply in ${details.forum_name || 'Discourse'} thread: "${title}"`;
    case 'twitter':
      return `Reply to tweet: "${title}"`;
    case 'bluesky':
      return `Reply to Bluesky post: "${title}"`;
    case 'youtube':
      return `Comment on YouTube video: "${title}"`;
    case 'producthunt':
      return `Comment on Product Hunt launch: "${title}"`;
    default:
      return `Engage on ${platform}: "${title}"`;
  }
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
