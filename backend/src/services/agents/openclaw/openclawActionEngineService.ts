/**
 * OpenClaw Action Engine -Phase 3
 *
 * Pure functions that compute "what should Ali do RIGHT NOW".
 * No DB writes, no side effects. All queries are read-only.
 * Action queue is computed on-the-fly from existing conversation/lead data.
 */

import { Op } from 'sequelize';
import OpenclawConversation from '../../../models/OpenclawConversation';
import { Lead } from '../../../models';
import ResponseQueue from '../../../models/ResponseQueue';
import { computeLeadScore } from './openclawLeadScoringService';
import { detectConversionSignals } from './openclawPlatformStrategy';

// ─── Types ───────────────────────────────────────────────────────────────────

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export interface UrgencyResult {
  level: UrgencyLevel;
  hours_silent: number;
  decay_rate: number; // 0-1, how fast opportunity is decaying
}

export type ActionType =
  | 'follow_up_required'
  | 'conversion_ready'
  | 'respond_to_interest'
  | 'advance_stage'
  | 'close_opportunity';

export interface ActionClassification {
  type: ActionType;
  description: string;
  recommended_action: string;
}

export interface ActionItem {
  conversation_id: string;
  lead_name: string | null;
  lead_email: string | null;
  platform: string;
  stage: number;
  urgency: UrgencyResult;
  action_type: ActionType;
  description: string;
  recommended_action: string;
  priority_score: number;
  lead_score: number;
  hours_since_activity: number;
  priority_tier: string;
  conversion_signals: Array<{ signal: string; confidence: number }>;
  thread_identifier: string;
}

// ─── Urgency Computation ─────────────────────────────────────────────────────

/**
 * Compute urgency from conversation state.
 * Uses last_their_activity_at (when THEY last replied) for silence calculation.
 * Falls back to last_activity_at if no their-reply tracked.
 */
export function computeUrgency(
  conversation: {
    last_their_activity_at: Date | string | null;
    last_activity_at: Date | string;
    current_stage: number;
    priority_tier: string;
    stall_detected_at: Date | string | null;
  },
): UrgencyResult {
  const referenceTime = conversation.last_their_activity_at
    ? new Date(conversation.last_their_activity_at).getTime()
    : new Date(conversation.last_activity_at).getTime();

  const hours_silent = Math.max(0, (Date.now() - referenceTime) / 3600000);
  const stage = conversation.current_stage;
  const tier = conversation.priority_tier;

  let level: UrgencyLevel = 'low';

  // Critical: 72h+ at stage >= 3, OR hot lead 48h+ silent
  if (
    (hours_silent >= 72 && stage >= 3) ||
    (tier === 'hot' && hours_silent >= 48)
  ) {
    level = 'critical';
  }
  // High: 48h+ at stage >= 2, OR warm lead 48h+ at stage >= 3
  else if (
    (hours_silent >= 48 && stage >= 2) ||
    (tier === 'warm' && hours_silent >= 48 && stage >= 3)
  ) {
    level = 'high';
  }
  // Medium: 24h+ at stage >= 2
  else if (hours_silent >= 24 && stage >= 2) {
    level = 'medium';
  }

  // Decay rate: how fast this opportunity is deteriorating (0-1)
  // Higher stage + longer silence = faster decay
  const stageMultiplier = Math.min(1, stage / 8);
  const silenceMultiplier = Math.min(1, hours_silent / 168); // caps at 7 days
  const decay_rate = Math.round((stageMultiplier * 0.4 + silenceMultiplier * 0.6) * 100) / 100;

  return { level, hours_silent: Math.round(hours_silent * 10) / 10, decay_rate };
}

// ─── Action Priority Scoring ─────────────────────────────────────────────────

const URGENCY_WEIGHTS: Record<UrgencyLevel, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

/**
 * Compute action priority score (0-100).
 * Formula: (leadScore * 0.35) + (urgencyWeight * 0.30) + (stageWeight * 0.20) + (conversionSignalWeight * 0.15)
 */
export function computeActionPriority(
  leadScore: number,
  urgency: UrgencyResult,
  stage: number,
  conversionSignals: Array<{ signal: string; confidence: number }>,
): number {
  const urgencyWeight = URGENCY_WEIGHTS[urgency.level];
  const stageWeight = Math.min(100, stage * 12.5);
  const maxConfidence = conversionSignals.length > 0
    ? Math.max(...conversionSignals.map(s => s.confidence))
    : 0;
  const conversionSignalWeight = maxConfidence * 100;

  const raw = (leadScore * 0.35) + (urgencyWeight * 0.30) + (stageWeight * 0.20) + (conversionSignalWeight * 0.15);
  return Math.min(100, Math.round(raw * 10) / 10);
}

// ─── Hesitation & Readiness Detection ────────────────────────────────────────

export interface HesitationResult {
  detected: boolean;
  signals: string[];
  recommendation: string;
}

export interface ReadinessResult {
  ready: boolean;
  signals: string[];
  recommended_transition: string;
}

/**
 * Detect hesitation: lead is engaged but not pulling the trigger.
 * Signals: many replies but no interest/conversion signals, long pauses.
 */
export function detectHesitation(
  conversation: {
    their_reply_count: number;
    current_stage: number;
    conversion_signals: Array<{ signal: string; confidence: number }>;
    last_their_activity_at: Date | string | null;
    last_activity_at: Date | string;
  },
): HesitationResult {
  const signals: string[] = [];

  // Many replies but no conversion signals
  if (conversation.their_reply_count >= 3 && (!conversation.conversion_signals || conversation.conversion_signals.length === 0)) {
    signals.push('Multiple replies without interest signals');
  }

  // At stage 3+ but stuck (no conversion signals at all)
  if (conversation.current_stage >= 3 && (!conversation.conversion_signals || conversation.conversion_signals.length === 0)) {
    signals.push('Advanced stage without conversion indicators');
  }

  // Long gap between their replies (using last_their_activity_at)
  const lastActivity = conversation.last_their_activity_at
    ? new Date(conversation.last_their_activity_at).getTime()
    : new Date(conversation.last_activity_at).getTime();
  const hoursSilent = (Date.now() - lastActivity) / 3600000;
  if (hoursSilent >= 36 && conversation.their_reply_count >= 2) {
    signals.push('Extended silence after active engagement');
  }

  const detected = signals.length >= 2;
  let recommendation = '';
  if (detected) {
    if (conversation.current_stage <= 3) {
      recommendation = 'Share a relevant case study or framework to re-engage';
    } else {
      recommendation = 'Offer a no-commitment resource -article, template, or short video';
    }
  }

  return { detected, signals, recommendation };
}

/**
 * Detect readiness: lead is showing strong buy signals.
 */
export function detectReadiness(
  conversation: {
    conversion_signals: Array<{ signal: string; confidence: number }>;
    current_stage: number;
    their_reply_count: number;
  },
): ReadinessResult {
  const signals: string[] = [];
  const cs = conversation.conversion_signals || [];

  // High-confidence conversion signals
  const highConfidence = cs.filter(s => s.confidence >= 0.85);
  if (highConfidence.length > 0) {
    signals.push(...highConfidence.map(s => `Interest signal: "${s.signal}" (${Math.round(s.confidence * 100)}%)`));
  }

  // Multiple interest signals (even at medium confidence)
  if (cs.length >= 2) {
    signals.push(`Multiple interest signals detected (${cs.length})`);
  }

  // Pricing/timeline inquiry (very high intent)
  const pricingSignals = cs.filter(s => ['pricing', 'what does it cost', 'how does this work'].includes(s.signal));
  if (pricingSignals.length > 0) {
    signals.push('Pricing or process inquiry detected');
  }

  const ready = signals.length > 0 && conversation.current_stage >= 4;
  let recommended_transition = '';
  if (ready) {
    if (pricingSignals.length > 0) {
      recommended_transition = 'Send pricing details and propose a call to discuss fit';
    } else if (highConfidence.length > 0) {
      recommended_transition = 'Propose a brief call to walk through the details';
    } else {
      recommended_transition = 'Send a relevant resource link and suggest connecting';
    }
  }

  return { ready, signals, recommended_transition };
}

// ─── Action Classification ───────────────────────────────────────────────────

/**
 * Classify what action should be taken for a conversation.
 */
export function classifyAction(
  conversation: {
    current_stage: number;
    status: string;
    stall_detected_at: Date | string | null;
    conversion_signals: Array<{ signal: string; confidence: number }>;
    their_reply_count: number;
    last_their_activity_at: Date | string | null;
    last_activity_at: Date | string;
    priority_tier: string;
  },
  urgency: UrgencyResult,
): ActionClassification {
  const cs = conversation.conversion_signals || [];
  const highConfidence = cs.filter(s => s.confidence >= 0.8);
  const readiness = detectReadiness(conversation);
  const hesitation = detectHesitation(conversation);

  // Stage 6+: close opportunity
  if (conversation.current_stage >= 6) {
    return {
      type: 'close_opportunity',
      description: `Stage ${conversation.current_stage} conversation ready for manual close`,
      recommended_action: conversation.current_stage === 6
        ? 'Follow up on the call/resource offer -confirm meeting or send reminder'
        : 'Update conversation status -mark as won or lost',
    };
  }

  // Stage 5 with high-confidence signals: conversion ready
  if (conversation.current_stage >= 5 && highConfidence.length > 0) {
    return {
      type: 'conversion_ready',
      description: `Interest confirmed with ${highConfidence.length} high-confidence signal(s)`,
      recommended_action: readiness.recommended_transition || 'Propose a call or send scheduling link',
    };
  }

  // New interest signal detected (any stage, unacted upon)
  if (highConfidence.length > 0 && conversation.current_stage < 5) {
    return {
      type: 'respond_to_interest',
      description: `Interest signal detected: "${highConfidence[0].signal}"`,
      recommended_action: 'Respond to their interest -acknowledge and advance the conversation',
    };
  }

  // Stalled conversation needs follow-up
  if (conversation.stall_detected_at || urgency.level === 'critical' || urgency.level === 'high') {
    return {
      type: 'follow_up_required',
      description: hesitation.detected
        ? `Stalled (${Math.round(urgency.hours_silent)}h silent) -hesitation detected`
        : `Stalled for ${Math.round(urgency.hours_silent)}h -needs follow-up`,
      recommended_action: hesitation.detected
        ? hesitation.recommendation
        : `Send a gentle follow-up referencing a recent development on their topic`,
    };
  }

  // Conversation qualifies for stage advancement
  if (
    conversation.their_reply_count >= 2 &&
    conversation.current_stage <= 3 &&
    urgency.level !== 'low'
  ) {
    return {
      type: 'advance_stage',
      description: `Active conversation at stage ${conversation.current_stage} with ${conversation.their_reply_count} replies`,
      recommended_action: 'Continue engagement -deepen the conversation with a framework or qualifying question',
    };
  }

  // Default: follow-up required (catch-all for medium urgency)
  return {
    type: 'follow_up_required',
    description: `Conversation at stage ${conversation.current_stage} needs attention (${Math.round(urgency.hours_silent)}h since last activity)`,
    recommended_action: 'Check in with a value-add message -share insight or ask about their progress',
  };
}

// ─── Daily Action Queue ──────────────────────────────────────────────────────

/**
 * Build the daily action queue -ranked list of what Ali should do right now.
 * Queries active/stalled conversations at stage >= 2, scores them, returns top N.
 */
export async function buildDailyActionQueue(
  options: { limit?: number; urgency_filter?: UrgencyLevel; type_filter?: ActionType } = {},
): Promise<ActionItem[]> {
  const limit = options.limit || 10;

  // Query conversations that need attention
  const conversations = await OpenclawConversation.findAll({
    where: {
      status: { [Op.in]: ['active', 'stalled'] },
      current_stage: { [Op.gte]: 2 },
    },
    order: [['last_activity_at', 'DESC']],
    limit: 100, // fetch more than needed, we'll score and sort
  });

  if (conversations.length === 0) return [];

  // Gather lead IDs for batch lookup
  const leadIds = [...new Set(conversations.map(c => c.lead_id).filter(Boolean))] as number[];
  const leads = leadIds.length > 0
    ? await Lead.findAll({ where: { id: { [Op.in]: leadIds } }, attributes: ['id', 'name', 'email', 'lead_score'], raw: true })
    : [];
  const leadMap = new Map(leads.map((l: any) => [l.id, l]));

  // Check for recent follow-ups to avoid duplicate recommendations
  const conversationIds = conversations.map(c => c.id);
  const recentFollowUps = await ResponseQueue.findAll({
    where: {
      response_type: 'follow_up',
      status: { [Op.in]: ['draft', 'approved'] },
      created_at: { [Op.gte]: new Date(Date.now() - 48 * 3600000) },
    },
    attributes: ['details'],
    raw: true,
  });
  const followedUpConversationIds = new Set(
    recentFollowUps
      .map((r: any) => r.details?.conversation_id)
      .filter(Boolean),
  );

  // Score each conversation
  const actionItems: ActionItem[] = [];

  for (const conv of conversations) {
    const urgency = computeUrgency(conv);
    const lead = conv.lead_id ? leadMap.get(conv.lead_id) : null;
    const leadScore = (lead as any)?.lead_score || 0;
    const cs = conv.conversion_signals || [];
    const priority = computeActionPriority(leadScore, urgency, conv.current_stage, cs);
    const classification = classifyAction(conv, urgency);

    // Skip conversations with pending follow-ups (already being handled)
    if (classification.type === 'follow_up_required' && followedUpConversationIds.has(conv.id)) {
      continue;
    }

    // Apply filters
    if (options.urgency_filter && urgency.level !== options.urgency_filter) continue;
    if (options.type_filter && classification.type !== options.type_filter) continue;

    actionItems.push({
      conversation_id: conv.id,
      lead_name: (lead as any)?.name || null,
      lead_email: (lead as any)?.email || null,
      platform: conv.platform,
      stage: conv.current_stage,
      urgency,
      action_type: classification.type,
      description: classification.description,
      recommended_action: classification.recommended_action,
      priority_score: priority,
      lead_score: leadScore,
      hours_since_activity: urgency.hours_silent,
      priority_tier: conv.priority_tier,
      conversion_signals: cs,
      thread_identifier: conv.thread_identifier,
    });
  }

  // Sort by priority descending, then by urgency level
  const urgencyOrder: Record<UrgencyLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  actionItems.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    return urgencyOrder[a.urgency.level] - urgencyOrder[b.urgency.level];
  });

  return actionItems.slice(0, limit);
}
