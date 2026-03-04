import { Op } from 'sequelize';
import {
  Campaign,
  CampaignLead,
  Visitor,
  BehavioralSignal,
  IntentScore,
  EventLedger,
} from '../models';
import { enrollLeadsInCampaign } from './campaignService';

interface TriggerRule {
  signal_type: string;
  min_count: number;
}

interface TriggerCriteria {
  trigger_rules?: TriggerRule[];
  min_intent_score?: number;
  require_all_rules?: boolean;
  exclude_identified?: boolean;
  auto_start_chat?: boolean;
  cooldown_hours?: number;
}

// ---------------------------------------------------------------------------
// Evaluate all active behavioral_trigger campaigns
// ---------------------------------------------------------------------------

export async function evaluateBehavioralTriggers(): Promise<number> {
  const campaigns = await Campaign.findAll({
    where: {
      type: 'behavioral_trigger',
      status: 'active',
    },
  });

  if (campaigns.length === 0) return 0;

  let totalEnrolled = 0;

  for (const campaign of campaigns) {
    try {
      const enrolled = await evaluateCampaignTriggers(campaign);
      totalEnrolled += enrolled;
    } catch (err) {
      console.error(`[BehavioralTrigger] Error evaluating campaign ${campaign.id}:`, (err as Error).message);
    }
  }

  if (totalEnrolled > 0) {
    console.log(`[BehavioralTrigger] Enrolled ${totalEnrolled} leads across ${campaigns.length} campaigns`);
  }

  return totalEnrolled;
}

// ---------------------------------------------------------------------------
// Evaluate a single campaign's triggers against all visitors
// ---------------------------------------------------------------------------

async function evaluateCampaignTriggers(campaign: any): Promise<number> {
  const criteria: TriggerCriteria = campaign.targeting_criteria || {};
  const triggerRules = criteria.trigger_rules || [];
  const minIntentScore = criteria.min_intent_score ?? 0;
  const requireAllRules = criteria.require_all_rules !== false; // default AND
  const excludeIdentified = criteria.exclude_identified || false;
  const cooldownHours = criteria.cooldown_hours ?? 72;

  if (triggerRules.length === 0 && minIntentScore === 0) return 0;

  // Get visitors already enrolled in this campaign to exclude them
  const existingEnrollments = await CampaignLead.findAll({
    where: { campaign_id: campaign.id },
    attributes: ['lead_id'],
  });
  const enrolledLeadIds = new Set(existingEnrollments.map((e: any) => e.lead_id));

  // Find visitors matching intent score threshold
  const intentWhere: any = {};
  if (minIntentScore > 0) {
    intentWhere.score = { [Op.gte]: minIntentScore };
  }

  const matchingIntentScores = await IntentScore.findAll({
    where: intentWhere,
    attributes: ['visitor_id', 'lead_id', 'score'],
  });

  if (matchingIntentScores.length === 0 && minIntentScore > 0) return 0;

  // Build candidate visitor set from intent scores
  const candidateVisitorIds = minIntentScore > 0
    ? new Set(matchingIntentScores.map((s: any) => s.visitor_id))
    : null; // null means no intent filter, check all

  // For each trigger rule, find visitors with matching signals
  const visitorSignalCounts: Map<string, Map<string, number>> = new Map();

  for (const rule of triggerRules) {
    const signals = await BehavioralSignal.findAll({
      where: {
        signal_type: rule.signal_type,
        detected_at: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // last 30 days
      },
      attributes: ['visitor_id'],
    });

    for (const sig of signals) {
      if (candidateVisitorIds && !candidateVisitorIds.has(sig.visitor_id)) continue;

      if (!visitorSignalCounts.has(sig.visitor_id)) {
        visitorSignalCounts.set(sig.visitor_id, new Map());
      }
      const counts = visitorSignalCounts.get(sig.visitor_id)!;
      counts.set(rule.signal_type, (counts.get(rule.signal_type) || 0) + 1);
    }
  }

  // If no trigger rules, use all intent-matching visitors
  if (triggerRules.length === 0 && candidateVisitorIds) {
    for (const visitorId of candidateVisitorIds) {
      visitorSignalCounts.set(visitorId, new Map());
    }
  }

  // Evaluate which visitors match all/any rules
  const matchingVisitorIds: string[] = [];

  for (const [visitorId, signalCounts] of visitorSignalCounts) {
    if (triggerRules.length > 0) {
      const ruleMatches = triggerRules.map(rule => {
        const count = signalCounts.get(rule.signal_type) || 0;
        return count >= rule.min_count;
      });

      const matches = requireAllRules
        ? ruleMatches.every(Boolean)
        : ruleMatches.some(Boolean);

      if (!matches) continue;
    }

    matchingVisitorIds.push(visitorId);
  }

  if (matchingVisitorIds.length === 0) return 0;

  // Resolve visitors to leads and enroll
  let enrolled = 0;

  for (const visitorId of matchingVisitorIds) {
    try {
      const visitor = await Visitor.findByPk(visitorId);
      if (!visitor) continue;

      const leadId = visitor.lead_id;

      // Skip anonymous visitors if they don't have a lead_id
      if (!leadId) {
        // Flag for proactive chat if configured
        if (criteria.auto_start_chat) {
          await flagForProactiveChat(visitor, campaign);
        }
        continue;
      }

      // Skip if exclude_identified is set
      if (excludeIdentified) continue;

      // Skip if already enrolled
      if (enrolledLeadIds.has(leadId)) continue;

      // Check cooldown
      if (cooldownHours > 0) {
        const cooldownCutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
        const recentEnrollment = await CampaignLead.findOne({
          where: {
            lead_id: leadId,
            campaign_id: campaign.id,
            enrolled_at: { [Op.gte]: cooldownCutoff },
          },
        });
        if (recentEnrollment) continue;
      }

      // Enroll the lead
      if (campaign.sequence_id) {
        await enrollLeadsInCampaign(campaign.id, [leadId]);
        enrolled++;

        // Log to event ledger
        try {
          await EventLedger.create({
            event_type: 'behavioral_trigger_enrollment',
            entity_type: 'lead',
            entity_id: String(leadId),
            payload: {
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              visitor_id: visitorId,
              trigger_criteria: criteria,
            },
          } as any);
        } catch (err) {
          // Non-critical
        }
      }

      // Flag for proactive chat if configured
      if (criteria.auto_start_chat) {
        await flagForProactiveChat(visitor, campaign);
      }
    } catch (err) {
      console.error(`[BehavioralTrigger] Error processing visitor ${visitorId}:`, (err as Error).message);
    }
  }

  return enrolled;
}

// ---------------------------------------------------------------------------
// Flag a visitor for proactive chat
// ---------------------------------------------------------------------------

async function flagForProactiveChat(visitor: any, campaign: any): Promise<void> {
  const metadata = visitor.metadata || {};

  // Don't flag if already flagged recently
  if (metadata.proactive_chat_pending) return;

  await visitor.update({
    metadata: {
      ...metadata,
      proactive_chat_pending: true,
      proactive_chat_context: {
        reason: 'behavioral_trigger',
        campaign_id: campaign.id,
        campaign_name: campaign.name,
      },
    },
  } as any);
}

// ---------------------------------------------------------------------------
// Evaluate triggers for a single visitor (real-time, after signal detection)
// ---------------------------------------------------------------------------

export async function evaluateVisitorForTriggers(visitorId: string): Promise<void> {
  const campaigns = await Campaign.findAll({
    where: {
      type: 'behavioral_trigger',
      status: 'active',
    },
  });

  if (campaigns.length === 0) return;

  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) return;

  const intentScore = await IntentScore.findOne({
    where: { visitor_id: visitorId },
  });

  const visitorSignals = await BehavioralSignal.findAll({
    where: {
      visitor_id: visitorId,
      detected_at: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });

  // Count signals by type
  const signalCounts = new Map<string, number>();
  for (const sig of visitorSignals) {
    signalCounts.set(sig.signal_type, (signalCounts.get(sig.signal_type) || 0) + 1);
  }

  for (const campaign of campaigns) {
    try {
      const criteria: TriggerCriteria = campaign.targeting_criteria || {};
      const triggerRules = criteria.trigger_rules || [];
      const minIntentScore = criteria.min_intent_score ?? 0;
      const requireAllRules = criteria.require_all_rules !== false;
      const cooldownHours = criteria.cooldown_hours ?? 72;

      // Check intent score
      if (minIntentScore > 0) {
        if (!intentScore || intentScore.score < minIntentScore) continue;
      }

      // Check trigger rules
      if (triggerRules.length > 0) {
        const ruleMatches = triggerRules.map(rule => {
          const count = signalCounts.get(rule.signal_type) || 0;
          return count >= rule.min_count;
        });

        const matches = requireAllRules
          ? ruleMatches.every(Boolean)
          : ruleMatches.some(Boolean);

        if (!matches) continue;
      }

      const leadId = visitor.lead_id;

      if (leadId && campaign.sequence_id) {
        // Check if already enrolled
        const existing = await CampaignLead.findOne({
          where: { campaign_id: campaign.id, lead_id: leadId },
        });
        if (existing) continue;

        // Check cooldown
        if (cooldownHours > 0) {
          const cooldownCutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
          const recent = await CampaignLead.findOne({
            where: {
              lead_id: leadId,
              campaign_id: campaign.id,
              enrolled_at: { [Op.gte]: cooldownCutoff },
            },
          });
          if (recent) continue;
        }

        await enrollLeadsInCampaign(campaign.id, [leadId]);
        console.log(`[BehavioralTrigger] Real-time enrollment: lead ${leadId} → campaign ${campaign.name}`);

        try {
          await EventLedger.create({
            event_type: 'behavioral_trigger_enrollment',
            entity_type: 'lead',
            entity_id: String(leadId),
            payload: {
              campaign_id: campaign.id,
              campaign_name: campaign.name,
              visitor_id: visitorId,
              trigger_type: 'real_time',
            },
          } as any);
        } catch (err) {
          // Non-critical
        }
      }

      // Flag for proactive chat
      if (criteria.auto_start_chat) {
        await flagForProactiveChat(visitor, campaign);
      }
    } catch (err) {
      console.error(`[BehavioralTrigger] Real-time error for campaign ${campaign.id}:`, (err as Error).message);
    }
  }
}
