import { Op } from 'sequelize';
import OpenclawConversation from '../../../models/OpenclawConversation';
import EngagementEvent from '../../../models/EngagementEvent';
import { detectConversationStage, detectConversionSignals } from './openclawPlatformStrategy';
import { updateLeadAndOpportunityScore } from './openclawLeadScoringService';

/**
 * Derive a thread identifier from an engagement event.
 * Uses source_url (trimmed of fragments), or falls back to response_id / authority_content_id.
 */
function deriveThreadIdentifier(event: EngagementEvent): string {
  if (event.source_url) {
    // Strip fragment and query params that vary per engagement
    try {
      const url = new URL(event.source_url);
      return `${url.origin}${url.pathname}`;
    } catch {
      return event.source_url.split('#')[0].split('?')[0];
    }
  }
  // Fallback: group by the content we responded to
  if (event.response_id) return `response:${event.response_id}`;
  if (event.authority_content_id) return `authority:${event.authority_content_id}`;
  return `event:${event.id}`;
}

/**
 * Update (or create) a conversation from a new engagement event.
 * Called synchronously after EngagementEvent.create() in the EngagementMonitorAgent.
 *
 * Flow:
 * 1. Find/create OpenclawConversation by platform + thread_identifier
 * 2. Link event via conversation_id
 * 3. Rebuild stage from all conversation events
 * 4. Stages only advance, never regress
 * 5. Detect conversion signals on their-replies
 * 6. Update lead score if lead is linked
 * 7. Update counters and timestamps
 */
export async function updateConversationFromEvent(event: EngagementEvent): Promise<OpenclawConversation> {
  const platform = event.platform;
  const threadId = deriveThreadIdentifier(event);

  // 1. Find or create conversation
  const [conversation, created] = await OpenclawConversation.findOrCreate({
    where: { platform, thread_identifier: threadId },
    defaults: {
      platform,
      thread_identifier: threadId,
      current_stage: 1,
      first_signal_id: null,
      first_response_id: event.response_id || null,
      lead_id: event.lead_id || null,
      engagement_count: 0,
      their_reply_count: 0,
      our_reply_count: 0,
      last_activity_at: new Date(),
      stage_history: [{ stage: 1, timestamp: new Date().toISOString(), trigger: 'conversation_created' }],
      conversion_signals: [],
      priority_tier: 'cold',
      status: 'active',
    },
  });

  // 2. Link event to conversation
  if (!event.conversation_id || event.conversation_id !== conversation.id) {
    await event.update({ conversation_id: conversation.id });
  }

  // If the conversation already has a lead but event doesn't (or vice versa), sync
  if (event.lead_id && !conversation.lead_id) {
    await conversation.update({ lead_id: event.lead_id });
  }

  // 3. Fetch all events in this conversation to rebuild stage
  const allEvents = await EngagementEvent.findAll({
    where: { conversation_id: conversation.id },
    order: [['created_at', 'ASC']],
    attributes: ['id', 'content', 'engagement_type', 'created_at'],
    raw: true,
  });

  // Build history for detectConversationStage -their replies are engagement events
  // Our replies would be tracked in ResponseQueue; for now, all EngagementEvents are "their" activity
  const engagementHistory = allEvents.map(e => ({
    content: (e as any).content || '',
    is_our_reply: false, // EngagementEvents are from external users
    created_at: (e as any).created_at?.toString(),
  }));

  const detectedStage = detectConversationStage(engagementHistory);

  // 4. Stages only advance, never regress
  const newStage = Math.max(conversation.current_stage, detectedStage);
  const stageChanged = newStage > conversation.current_stage;

  // 5. Detect conversion signals on the latest event (their reply)
  const newConversionSignals = event.content
    ? detectConversionSignals(event.content)
    : [];

  const existingSignals = conversation.conversion_signals || [];
  const mergedSignals = [...existingSignals];
  for (const sig of newConversionSignals) {
    // Deduplicate by signal text
    if (!mergedSignals.some(s => s.signal === sig.signal)) {
      mergedSignals.push({ ...sig, detected_at: new Date().toISOString() });
    }
  }

  // Update stage history if stage changed
  const stageHistory = conversation.stage_history || [];
  if (stageChanged) {
    stageHistory.push({
      stage: newStage,
      timestamp: new Date().toISOString(),
      trigger: `engagement_event:${event.id}`,
    });
  }

  // Count replies
  const theirReplyCount = allEvents.filter(
    (e: any) => ['reply', 'comment'].includes(e.engagement_type)
  ).length;

  // 7. Update conversation
  await conversation.update({
    current_stage: newStage,
    stage_history: stageHistory,
    engagement_count: allEvents.length,
    their_reply_count: theirReplyCount,
    last_activity_at: new Date(),
    last_their_activity_at: new Date(),
    conversion_signals: mergedSignals,
    // Clear stall if new activity
    stall_detected_at: null,
    // Reactivate if stalled
    status: conversation.status === 'stalled' ? 'active' : conversation.status,
    updated_at: new Date(),
  });

  // 6. Update lead score if lead is linked
  const leadId = conversation.lead_id || event.lead_id;
  if (leadId) {
    try {
      const scoreResult = await updateLeadAndOpportunityScore(leadId);
      if (scoreResult) {
        await conversation.update({ priority_tier: scoreResult.priority_tier });
      }
    } catch (err) {
      // Non-fatal -log but don't fail the conversation update
      console.error(`[ConversationTracking] Failed to update lead score for lead ${leadId}:`, err);
    }
  }

  return conversation;
}

/**
 * Detect stalled conversations -active conversations silent 48h+ at stage >= 2.
 * Called by ConversationSyncAgent on a schedule.
 */
export async function detectStalledConversations(): Promise<number> {
  const staleThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago

  const [affectedCount] = await OpenclawConversation.update(
    {
      stall_detected_at: new Date(),
      status: 'stalled',
      updated_at: new Date(),
    },
    {
      where: {
        status: 'active',
        current_stage: { [Op.gte]: 2 },
        last_activity_at: { [Op.lt]: staleThreshold },
        stall_detected_at: { [Op.is]: null as any },
      },
    },
  );

  return affectedCount;
}

/**
 * Link orphaned EngagementEvents (conversation_id IS NULL) to conversations.
 * Safety net for events that missed the synchronous hook.
 */
export async function linkOrphanedEvents(): Promise<number> {
  const orphans = await EngagementEvent.findAll({
    where: { conversation_id: { [Op.is]: null as any } },
    limit: 100,
  });

  let linked = 0;
  for (const event of orphans) {
    try {
      await updateConversationFromEvent(event);
      linked++;
    } catch (err) {
      console.error(`[ConversationTracking] Failed to link orphan event ${event.id}:`, err);
    }
  }

  return linked;
}
