// ─── Maya Conversation Intelligence Service ─────────────────────────────────
// Extracts signals from Maya chat conversations and classifies outcomes so the
// system can learn which conversations convert into strategy call bookings.
//
// SAFETY: This service only INSERTs into maya_conversation_outcomes.  It never
// modifies conversation, lead, or campaign records.

import { Op } from 'sequelize';
import ChatMessage from '../models/ChatMessage';
import ChatConversation from '../models/ChatConversation';
import MayaConversationOutcome, {
  type ConversationOutcomeType,
} from '../models/MayaConversationOutcome';
import { getCampaignContext } from './campaignContextService';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConversationSignals {
  messageCount: number;
  visitorMessageCount: number;
  durationSeconds: number;
  mentionedBooking: boolean;
  mentionedROI: boolean;
  mentionedTeam: boolean;
  mentionedPricing: boolean;
  askedQuestion: boolean;
  sharedEmail: boolean;
  sharedPhone: boolean;
  intentScore: number;
}

// ─── Signal Extraction ───────────────────────────────────────────────────────

const BOOKING_KEYWORDS = [
  'book', 'schedule', 'call', 'meeting', 'calendar', 'slot', 'availability',
  'strategy call', 'demo', 'appointment',
];
const ROI_KEYWORDS = ['roi', 'return on investment', 'cost', 'budget', 'pricing', 'investment', 'worth'];
const TEAM_KEYWORDS = ['team', 'department', 'organization', 'company', 'employees', 'staff', 'leadership'];
const PRICING_KEYWORDS = ['price', 'pricing', 'cost', 'how much', 'fee', 'tuition', 'payment'];
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_PATTERN = /(\+?1?\s*[-.]?\s*)?(\(?\d{3}\)?)\s*[-.]?\s*\d{3}\s*[-.]?\s*\d{4}/;

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

/**
 * Extract conversation signals from the message history of a conversation.
 */
export async function extractConversationSignals(
  conversationId: string,
): Promise<ConversationSignals> {
  const conversation = await ChatConversation.findByPk(conversationId);
  const messages = await ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
  });

  const visitorMessages = messages.filter((m) => m.role === 'visitor');
  const visitorText = visitorMessages.map((m) => m.content).join(' ');

  // Duration: time between first and last message
  let durationSeconds = 0;
  if (messages.length >= 2) {
    const first = new Date(messages[0].timestamp).getTime();
    const last = new Date(messages[messages.length - 1].timestamp).getTime();
    durationSeconds = Math.round((last - first) / 1000);
  }

  // Intent score: simple heuristic based on engagement depth
  let intentScore = 0;
  const vCount = visitorMessages.length;
  if (vCount >= 1) intentScore += 10;
  if (vCount >= 3) intentScore += 15;
  if (vCount >= 5) intentScore += 10;
  if (durationSeconds > 60) intentScore += 10;
  if (durationSeconds > 180) intentScore += 10;
  if (containsKeyword(visitorText, BOOKING_KEYWORDS)) intentScore += 20;
  if (containsKeyword(visitorText, ROI_KEYWORDS)) intentScore += 10;
  if (containsKeyword(visitorText, TEAM_KEYWORDS)) intentScore += 5;
  if (EMAIL_PATTERN.test(visitorText)) intentScore += 10;
  if (PHONE_PATTERN.test(visitorText)) intentScore += 10;

  // Cap at 100
  intentScore = Math.min(intentScore, 100);

  return {
    messageCount: conversation?.message_count || messages.length,
    visitorMessageCount: conversation?.visitor_message_count || vCount,
    durationSeconds,
    mentionedBooking: containsKeyword(visitorText, BOOKING_KEYWORDS),
    mentionedROI: containsKeyword(visitorText, ROI_KEYWORDS),
    mentionedTeam: containsKeyword(visitorText, TEAM_KEYWORDS),
    mentionedPricing: containsKeyword(visitorText, PRICING_KEYWORDS),
    askedQuestion: visitorText.includes('?'),
    sharedEmail: EMAIL_PATTERN.test(visitorText),
    sharedPhone: PHONE_PATTERN.test(visitorText),
    intentScore,
  };
}

// ─── Outcome Classification ─────────────────────────────────────────────────

/**
 * Classify the conversation outcome based on extracted signals and booking state.
 */
export function calculateConversationOutcome(
  signals: ConversationSignals,
  bookingState: { offered: boolean; clicked: boolean; completed: boolean },
): ConversationOutcomeType {
  // Highest priority: completed booking
  if (bookingState.completed) return 'booked_call';

  // High intent but no booking completion
  if (bookingState.offered && !bookingState.completed && signals.intentScore >= 50) {
    return 'high_intent_no_booking';
  }

  // No visitor messages at all
  if (signals.visitorMessageCount === 0) return 'no_response';

  // Strong engagement signals without booking
  if (signals.intentScore >= 40 && (signals.mentionedBooking || signals.mentionedROI)) {
    return 'high_intent_no_booking';
  }

  // Information-seeking behavior
  if (signals.askedQuestion && signals.visitorMessageCount >= 2) {
    return 'information_request';
  }

  // Minimal engagement — continued nurture
  return 'continued_nurture';
}

// ─── Conversion Probability ──────────────────────────────────────────────────

/**
 * Calculate a conversion probability (0–1) based on conversation signals.
 * This is a lightweight heuristic — not an ML model.
 */
export function calculateConversionProbability(
  signals: ConversationSignals,
  bookingState: { offered: boolean; clicked: boolean; completed: boolean },
): number {
  if (bookingState.completed) return 1.0;

  let probability = 0;

  // Base from intent score (0–100 → 0–0.40)
  probability += (signals.intentScore / 100) * 0.40;

  // Booking-related signals
  if (bookingState.offered) probability += 0.15;
  if (bookingState.clicked) probability += 0.20;
  if (signals.mentionedBooking) probability += 0.10;

  // Engagement depth
  if (signals.visitorMessageCount >= 5) probability += 0.05;
  if (signals.durationSeconds > 120) probability += 0.05;

  // Contact info shared
  if (signals.sharedEmail) probability += 0.05;
  if (signals.sharedPhone) probability += 0.05;

  return Math.min(probability, 0.99);
}

// ─── Record Outcome ──────────────────────────────────────────────────────────

interface RecordOutcomeParams {
  conversationId: string;
  leadId: number | null;
  bookingOffered?: boolean;
  bookingClicked?: boolean;
  bookingCompleted?: boolean;
  bookingId?: string | null;
}

/**
 * Extract signals, classify the outcome, and persist to maya_conversation_outcomes.
 * Designed to be called fire-and-forget from closeConversation().
 */
export async function recordConversationOutcome(
  params: RecordOutcomeParams,
): Promise<void> {
  const {
    conversationId,
    leadId,
    bookingOffered = false,
    bookingClicked = false,
    bookingCompleted = false,
    bookingId = null,
  } = params;

  try {
    // Don't duplicate — check if already recorded
    const existing = await MayaConversationOutcome.findOne({
      where: { conversation_id: conversationId },
    });
    if (existing) return;

    const signals = await extractConversationSignals(conversationId);

    const bookingState = {
      offered: bookingOffered,
      clicked: bookingClicked,
      completed: bookingCompleted,
    };

    const outcome = calculateConversationOutcome(signals, bookingState);
    const conversionProbability = calculateConversionProbability(signals, bookingState);

    // Grab campaign context snapshot (read-only)
    let campaignContextJson: Record<string, any> | null = null;
    let campaignStepAtTime: number | null = null;
    if (leadId) {
      try {
        const ctx = await getCampaignContext(leadId);
        if (ctx) {
          campaignContextJson = {
            activeCampaigns: ctx.activeCampaigns,
            engagementSignals: ctx.engagementSignals,
            nextTouchWithinHours: ctx.nextTouchWithinHours,
            recentTouchWithinHours: ctx.recentTouchWithinHours,
          };
          campaignStepAtTime = ctx.activeCampaigns[0]?.currentStepIndex ?? null;
        }
      } catch {
        // Non-critical
      }
    }

    await MayaConversationOutcome.create({
      lead_id: leadId,
      conversation_id: conversationId,
      intent_score: signals.intentScore,
      messages_count: signals.messageCount,
      conversation_duration_seconds: signals.durationSeconds,
      campaign_context_json: campaignContextJson,
      campaign_step_at_time: campaignStepAtTime,
      booking_offered: bookingOffered,
      booking_clicked: bookingClicked,
      booking_completed: bookingCompleted,
      booking_id: bookingId,
      conversation_outcome: outcome,
      engagement_signals_json: {
        mentionedBooking: signals.mentionedBooking,
        mentionedROI: signals.mentionedROI,
        mentionedTeam: signals.mentionedTeam,
        mentionedPricing: signals.mentionedPricing,
        askedQuestion: signals.askedQuestion,
        sharedEmail: signals.sharedEmail,
        sharedPhone: signals.sharedPhone,
        conversionProbability,
      },
    });

    console.log(JSON.stringify({
      event: 'maya_conversation_outcome_recorded',
      conversationId,
      leadId,
      outcome,
      intentScore: signals.intentScore,
      conversionProbability,
      bookingCompleted,
      messagesCount: signals.messageCount,
      durationSeconds: signals.durationSeconds,
      timestamp: new Date().toISOString(),
    }));
  } catch (err: any) {
    console.warn('[ConversationIntelligence] Failed to record outcome:', err.message);
  }
}

// ─── Update Booking State ────────────────────────────────────────────────────

/**
 * Update an existing outcome record with booking flags after a booking event.
 * Called from scheduleStrategyCall when a booking completes mid-conversation.
 */
export async function updateBookingState(
  conversationId: string,
  bookingState: {
    offered?: boolean;
    clicked?: boolean;
    completed?: boolean;
    bookingId?: string;
  },
): Promise<void> {
  try {
    const record = await MayaConversationOutcome.findOne({
      where: { conversation_id: conversationId },
    });

    if (record) {
      const updates: Record<string, any> = {};
      if (bookingState.offered !== undefined) updates.booking_offered = bookingState.offered;
      if (bookingState.clicked !== undefined) updates.booking_clicked = bookingState.clicked;
      if (bookingState.completed !== undefined) updates.booking_completed = bookingState.completed;
      if (bookingState.bookingId) updates.booking_id = bookingState.bookingId;
      if (bookingState.completed) updates.conversation_outcome = 'booked_call';
      await record.update(updates);
    }
    // If no record yet (conversation still open), the flags will be picked up
    // when recordConversationOutcome is called at close time.
  } catch (err: any) {
    console.warn('[ConversationIntelligence] Failed to update booking state:', err.message);
  }
}
