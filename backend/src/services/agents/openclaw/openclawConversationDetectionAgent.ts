import { Op } from 'sequelize';
import { OpenclawSignal, OpenclawTask } from '../../../models';
import type { AgentExecutionResult, AgentAction } from '../types';

/**
 * OpenClaw Conversation Detection Agent
 * Scores discovered signals for relevance, engagement, and risk.
 * Queues high-scoring signals for content generation.
 */
export async function runOpenclawConversationDetectionAgent(
  _agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const start = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];
  const relevanceThreshold = config.relevance_threshold || 0.45;
  const engagementThreshold = config.engagement_threshold || 0.35;
  const riskThreshold = config.risk_threshold || 0.7;
  const maxQueue = config.max_queue_per_run || 20;

  try {
    // Fetch unscored signals
    const signals = await OpenclawSignal.findAll({
      where: { status: 'discovered' },
      order: [['discovered_at', 'DESC']],
      limit: 100,
    });

    let queued = 0;

    for (const signal of signals) {
      if (queued >= maxQueue) break;

      // Score the signal
      const relevance = scoreRelevance(signal);
      const engagement = scoreEngagement(signal);
      const risk = scoreRisk(signal);

      await signal.update({
        relevance_score: relevance,
        engagement_score: engagement,
        risk_score: risk,
        scored_at: new Date(),
        status: 'scored',
        updated_at: new Date(),
      });

      // Queue if above thresholds and below risk threshold
      if (relevance >= relevanceThreshold && engagement >= engagementThreshold && risk < riskThreshold) {
        await signal.update({ status: 'queued', updated_at: new Date() });

        // Create a generate_response task
        await OpenclawTask.create({
          task_type: 'generate_response',
          priority: Math.round(relevance * 10),
          status: 'pending',
          signal_id: signal.id,
          input_data: {
            platform: signal.platform,
            title: signal.title,
            content_excerpt: signal.content_excerpt,
            relevance_score: relevance,
            engagement_score: engagement,
          },
          created_at: new Date(),
        });

        queued++;
        actions.push({
          campaign_id: '',
          action: 'queue_signal',
          reason: `Signal scored: relevance=${relevance.toFixed(2)}, engagement=${engagement.toFixed(2)}, risk=${risk.toFixed(2)}`,
          confidence: relevance,
          before_state: { status: 'discovered' },
          after_state: { status: 'queued', relevance, engagement, risk },
          result: 'success',
          entity_type: 'system',
          entity_id: signal.id,
        });
      } else {
        // Skip signals that don't meet thresholds
        if (risk >= riskThreshold) {
          await signal.update({ status: 'skipped', updated_at: new Date() });
        }
      }
    }

    actions.push({
      campaign_id: '',
      action: 'scoring_summary',
      reason: `Scored ${signals.length} signals, queued ${queued} for response generation`,
      confidence: 0.9,
      before_state: null,
      after_state: { scored: signals.length, queued },
      result: 'success',
      entity_type: 'system',
    });
  } catch (err: any) {
    errors.push(err.message || 'Detection error');
  }

  return {
    agent_name: 'OpenclawConversationDetectionAgent',
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - start,
    entities_processed: actions.filter((a) => a.action === 'queue_signal').length,
  };
}

function scoreRelevance(signal: any): number {
  let score = 0.3; // base
  const text = ((signal.title || '') + ' ' + (signal.content_excerpt || '')).toLowerCase();

  // Tier 1: Direct match to our value prop (enterprise AI adoption, training, leadership)
  const tier1 = ['ai training', 'enterprise ai', 'ai leadership', 'workforce', 'upskilling', 'bootcamp', 'certification', 'ai adoption', 'ai strategy', 'ai transformation', 'ai skills gap'];
  for (const term of tier1) {
    if (text.includes(term)) score += 0.15;
  }

  // Tier 2: Broad AI topics where we can add value with thought leadership
  const tier2 = ['artificial intelligence', 'machine learning', 'generative ai', 'llm', 'chatgpt', 'ai agent', 'prompt engineering', 'rag', 'fine-tun', 'ai tool', 'ai workflow', 'ai automat'];
  for (const term of tier2) {
    if (text.includes(term)) score += 0.1;
  }

  // Tier 3: Adjacent tech/business topics where AI commentary is relevant
  const tier3 = ['data science', 'deep learning', 'neural network', 'nlp', 'computer vision', 'ai model', 'openai', 'anthropic', 'claude', 'gpt', 'copilot', 'ai coding', 'ai engineer'];
  for (const term of tier3) {
    if (text.includes(term)) score += 0.06;
  }

  // General AI mention — signals discovered by MarketSignalAgent already passed keyword filters
  if (text.includes(' ai ') || text.includes('ai:') || text.match(/\bai\b/)) {
    score += 0.1;
  }

  // Boost for question-style posts (higher engagement opportunity)
  if (text.includes('?') || text.includes('how to') || text.includes('recommend') || text.includes('advice') || text.includes('thoughts on')) {
    score += 0.12;
  }

  return Math.min(1, score);
}

function scoreEngagement(signal: any): number {
  const details = signal.details || {};
  let score = 0.3; // base — if the signal was discovered, it already has some engagement potential

  // Platform-specific engagement signals
  const comments = details.num_comments || details.comments_count || 0;
  const upvotes = details.score || details.points || details.positive_reactions_count || 0;

  if (comments >= 2) score += 0.1;
  if (comments >= 5) score += 0.1;
  if (comments >= 20) score += 0.15;
  if (upvotes >= 3) score += 0.1;
  if (upvotes >= 10) score += 0.1;
  if (upvotes >= 50) score += 0.1;

  // Recency boost (less than 24 hours old)
  const createdAt = details.created_utc
    ? new Date(details.created_utc * 1000)
    : details.created_at
    ? new Date(details.created_at)
    : details.published_at
    ? new Date(details.published_at)
    : null;
  if (createdAt) {
    const hoursOld = (Date.now() - createdAt.getTime()) / 3600000;
    if (hoursOld < 2) score += 0.2;
    else if (hoursOld < 6) score += 0.15;
    else if (hoursOld < 24) score += 0.05;
  }

  return Math.min(1, score);
}

function scoreRisk(signal: any): number {
  let risk = 0.1;
  const text = ((signal.title || '') + ' ' + (signal.content_excerpt || '')).toLowerCase();
  const details = signal.details || {};

  // High-risk indicators
  const riskyTerms = ['scam', 'spam', 'promotional', 'advertisement', 'shill', 'lawsuit', 'controversy'];
  for (const term of riskyTerms) {
    if (text.includes(term)) risk += 0.2;
  }

  // Risky subreddits or contexts
  const riskySubreddits = ['antiwork', 'latestagecapitalism'];
  if (riskySubreddits.includes(details.subreddit?.toLowerCase())) {
    risk += 0.3;
  }

  // Very low engagement might mean dead thread
  const comments = details.num_comments || details.comments_count || 0;
  if (comments === 0) risk += 0.05;

  return Math.min(1, risk);
}
