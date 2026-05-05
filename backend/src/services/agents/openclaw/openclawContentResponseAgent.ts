import crypto from 'crypto';
import { Op } from 'sequelize';
import { OpenclawSignal, OpenclawTask, OpenclawResponse, OpenclawLearning } from '../../../models';
import { getOpenAIClient } from '../../../intelligence/assistant/openaiHelper';
import { getStrategy, getExecutionType, isHumanExecution, isLinkAllowed, STRATEGY_PROMPT_INSTRUCTIONS, CONVERSION_STAGE_PROMPTS, validateContentForStrategy, shouldAutoApprove as shouldAutoApproveStrategy, enforceSignOff } from './openclawPlatformStrategy';
import { captureLeadFromSignal } from './openclawLeadCaptureService';
import { classifyAutomationRisk } from './openclawRiskClassifier';
import { isRateLimited } from './openclawRateLimiter';
import { evaluateResponseQuality } from './openclawQualityGateAgent';
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

        // Generate response content -learning-aware tone selection
        const { tone, toneSource, learningId } = await selectToneFromLearnings(signal, defaultTone);
        const topicHints = await getTopPerformingTopics();
        const includeLink = isLinkAllowed(signal.platform);
        const rawContent = await generateLLMResponse(signal, tone, maxLength, includeLink ? trackedUrl : null, topicHints);

        // Deterministic sign-off enforcement -append if LLM omitted it
        const content = enforceSignOff(rawContent, signal.platform);

        // Strategy validation gate -deterministic backstop catches LLM violations
        const validation = validateContentForStrategy(content, signal.platform);
        if (!validation.passed) {
          console.warn(`[OpenClaw Content] Strategy validation failed for ${signal.platform}: ${validation.reason}`);
          await task.update({
            status: 'failed',
            error_message: `Strategy validation: ${validation.reason}`,
            completed_at: new Date(),
            updated_at: new Date(),
          });
          errors.push(`Task ${task.id}: Strategy validation failed -${validation.reason}`);
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
          reasoning: `${signal.platform} signal: "${(signal.title || '').slice(0, 100)}" -relevance ${signal.relevance_score}`,
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

        // Lead capture -create/update lead from signal author
        try {
          const lead = await captureLeadFromSignal(signal, response);
          if (lead) {
            await response.update({ lead_id: lead.id, updated_at: new Date() });
          }
        } catch (leadErr: any) {
          console.warn(`[OpenClaw Content] Lead capture failed: ${leadErr.message}`);
        }

        // Route based on execution type and quality gate
        if (!humanExecution) {
          // Quality gate: deterministic review of generated content
          const quality = evaluateResponseQuality(content, signal.platform);

          if (quality.approved) {
            // Check rate limit before approving
            const rateLimitResult = await isRateLimited(signal.platform);
            if (rateLimitResult.allowed) {
              await response.update({ post_status: 'approved', updated_at: new Date() });
              await OpenclawTask.create({
                task_type: 'post_response',
                priority: task.priority,
                status: 'pending',
                signal_id: signal.id,
                input_data: { response_id: response.id },
                created_at: new Date(),
              });
              actions.push({
                campaign_id: '',
                action: 'quality_gate_approved',
                reason: `Quality gate passed (score: ${quality.score}/100) -approved for ${signal.platform} posting`,
                confidence: quality.score / 100,
                before_state: { post_status: 'draft' },
                after_state: { post_status: 'approved' },
                result: 'success',
                entity_type: 'system',
                entity_id: response.id,
              });
            }
            // Rate-limited: keep as draft -quality gate agent will pick up later
          } else {
            // Quality rejected -mark rejected and queue regeneration
            await response.update({
              post_status: 'rejected',
              reasoning: `Quality gate rejected (score: ${quality.score}): ${quality.reasons.join('; ')}`,
              updated_at: new Date(),
            });
            await signal.update({
              response_id: undefined,
              status: 'queued',
              updated_at: new Date(),
            } as any);
            await OpenclawTask.create({
              task_type: 'generate_response',
              priority: (task.priority || 50) + 10,
              status: 'pending',
              signal_id: signal.id,
              input_data: {
                regeneration: true,
                previous_response_id: response.id,
                rejection_reasons: quality.reasons,
              },
              created_at: new Date(),
            });
            actions.push({
              campaign_id: '',
              action: 'quality_gate_rejected',
              reason: `Quality gate rejected (score: ${quality.score}/100): ${quality.reasons.join('; ')} -queued for regeneration`,
              confidence: quality.score / 100,
              before_state: { post_status: 'draft' },
              after_state: { post_status: 'rejected' },
              result: 'success',
              entity_type: 'system',
              entity_id: response.id,
            });
          }
        }
        // HUMAN_EXECUTION: already set to 'ready_for_manual_post' -no post task created

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

const SYSTEM_PROMPT = `You are an AI Systems Architect who designs and builds AI systems for operating companies. You work directly with operators across utilities, freight, professional services, and government to help them redesign how their company runs with AI as core infrastructure, not as a feature bolted onto existing operations.

You write responses to online discussions about AI from the perspective of a builder who ships real systems for real companies. Your insights come from concrete client work: what actually moves a $50M operating budget, what dispatch decisions break under storm load, what compliance pipelines look like when AI handles 80 percent of evidence gathering, what an AI-native org chart looks like in production.

Core thesis you carry into every reply:
The next wave of competitive advantage is not about which AI tools you use. It is about whether you have redesigned your company around AI as the operating layer. Most companies are still bolting AI onto a 1990s org chart. The companies pulling ahead are designing the AI org first, then mapping the humans into it.

Rules:
1. Lead with one specific operational insight, framework, or pattern from real client work. Not generic AI commentary.
2. Write as a builder. "When we shipped a crew productivity engine for a 2,000-crew utility..." or "On our last rate case automation build, the unlock was..."
3. NEVER use the word "Colaberry". Refer to "our team", "we", or "the firm we run".
4. NEVER pitch a cohort, training program, accelerator, class, bootcamp, or curriculum. The conversation is about systems, operations, and AI org design, not training.
5. Answer the original post or question directly before adding your perspective. No bait-and-switch.
6. Match the platform's communication style (Dev.to = technical, Reddit = casual, LinkedIn = professional, HN = data-rigorous).
7. Be specific. Mention real architectures, real metrics, and real industry verticals you have built in.
8. Be opinionated. The reader should feel you have a point of view, not a balanced both-sides take.
9. Sound like a real practitioner. No buzzwords, no platitudes, no "thought leader" voice.
10. NEVER use em dashes (\u2014). Use regular hyphens, commas, periods, or rewrite the sentence.`;

const SYSTEM_PROMPT_WITH_LINK = `${SYSTEM_PROMPT}

LINK INSTRUCTION: You MUST end your response with a natural reference to a working tool or live resource our team has built, using the tracked URL provided. Frame it as something the reader can use on their own business, not as marketing collateral or an article they should go read. Good framings:
   - "We built a free tool that takes your operation and shows you what your AI org would look like: [URL]"
   - "If you want to see this on your own business, we have a free advisor that walks through it: [URL]"
   - "Here is a working demo you can try on your own scenario: [URL]"
The URL MUST appear in your response. Do NOT use the phrase "I wrote more about this here" or anything that implies the destination is an article. The destination is a tool. Frame it as a tool.`;

function buildUserPrompt(signal: any, tone: string, maxLength: number, trackedUrl: string | null, topicHints: string[] = []): string {
  const platform = signal.platform;
  const title = signal.title || '';
  const excerpt = signal.content_excerpt || '';
  const details = signal.details || {};

  let platformContext = '';
  if (platform === 'reddit') {
    platformContext = `This is a Reddit post in r/${details.subreddit || 'unknown'}. Write like a genuine Reddit commenter -casual but knowledgeable. Don't use bullet points or headers. Keep it to 2-3 paragraphs max.`;
  } else if (platform === 'hackernews') {
    platformContext = `This is a Hacker News discussion. HN values technical depth, contrarian thinking, and data-backed claims. Be concise and intellectually rigorous. Share from experience, not marketing.`;
  } else if (platform === 'devto') {
    platformContext = `This is a Dev.to article discussion. The audience is developers and tech leaders. You can use technical language and reference tools/frameworks. Be practical and actionable.`;
  } else if (platform === 'linkedin') {
    platformContext = `This is a LinkedIn post. Professional tone but not stiff. Share insights from experience running AI training programs. Short paragraphs work well.`;
  } else if (platform === 'quora') {
    platformContext = `This is a Quora question. Give a thorough, authoritative answer. Structure is okay here -numbered points or short sections work well.`;
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
    platformContext = `This is a Facebook Group discussion about AI. Be conversational and approachable -Facebook groups are community spaces. Share practical experience, ask follow-up questions, and blend in naturally. No jargon walls. Keep it under 300 words.`;
  } else if (platform === 'linkedin_comments') {
    platformContext = `This is a LinkedIn post comment. Be professional but personable. Reference the original post's key point, add your perspective from experience, and keep it concise (2-3 short paragraphs max). LinkedIn comments that add real value get visibility.`;
  }

  // Strategy-level instructions (highest priority -enforced before platform style)
  const strategy = getStrategy(platform);
  const strategyContext = STRATEGY_PROMPT_INSTRUCTIONS[strategy];

  // All initial responses are Stage 1 (insight only, no pitch)
  const stageContext = CONVERSION_STAGE_PROMPTS[1];

  let linkInstruction = '';
  if (trackedUrl) {
    linkInstruction = `\n\nIMPORTANT: End your response with this exact link on its own line, introduced naturally as a working tool the reader can use on their own business (e.g. "We built a free tool that walks through this on your own data:" or "If you want to see what this looks like for your operation, try this:"). The link MUST appear: ${trackedUrl}. Do NOT use phrases like "I wrote more about this here" or "we published a guide" - the destination is a tool, not an article.`;
  }

  return `Platform: ${platform}
Tone: ${tone}
STRICT MAX: ${maxLength} characters total (including the link). Keep it SHORT -2-3 concise paragraphs max. Do NOT ramble.

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

// Use gpt-4o for outreach content -higher quality than gpt-4o-mini
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
      const suffix = `\n\nWe built a free tool that walks through this on your own business: ${trackedUrl}`;
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
      `Useful framing on ${title}. The pattern we see across client builds: companies treat AI as a tool they bolt onto an existing org chart, when the leverage is the other way. Redesign the operation around AI as the operating layer first, then map the humans into it. Most "AI adoption stalled" stories trace back to that one mistake.`,
      `The thing most AI strategy decks miss: it is not which model you pick, it is whether your operation has been redesigned to actually run on AI. We have seen the same playbook work across utilities, freight, and government services. The companies pulling ahead are designing the AI org first.`,
    ],
    conversational: [
      `${title} is the right thing to be thinking about. From what we have shipped with clients, the unlock is not better tools, it is reorganizing the work so AI is doing the parts that scale and humans are doing the parts that compound. Most companies have those reversed.`,
      `One pattern that keeps showing up in the builds we run: the AI org chart looks nothing like the human one. The companies that accept this and rebuild around it move faster and with way less headcount. The ones that try to layer AI on top of the existing structure spin their wheels.`,
    ],
    technical: [
      `Useful breakdown. One dimension worth adding from production builds: the pipeline that matters is not just model to deployment, it is the upstream redesign of what work gets done by AI versus humans. We have shipped systems where the AI handles 80 percent of evidence gathering for compliance and the humans only see exceptions. The architecture follows from that decision, not the other way around.`,
      `Solid take. In practice the bottleneck we hit is rarely the model, it is the surrounding operational redesign. When we ship a real AI system into a 2,000 person operation, the first 60 percent of the work is rethinking the org around the system, not building the system itself.`,
    ],
  };

  const options = templates[tone] || templates.educational;
  const selected = options[Math.floor(Math.random() * options.length)];

  return selected.slice(0, maxLength);
}
