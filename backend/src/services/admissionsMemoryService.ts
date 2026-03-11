import AdmissionsMemory from '../models/AdmissionsMemory';
import type { AdmissionsVisitorType } from '../models/AdmissionsMemory';
import { ChatConversation, ChatMessage, Visitor, Lead, IntentScore, BehavioralSignal } from '../models';
import { Op } from 'sequelize';

/**
 * Load or create AdmissionsMemory for a visitor.
 */
export async function loadMemory(visitorId: string): Promise<AdmissionsMemory> {
  const [memory] = await AdmissionsMemory.findOrCreate({
    where: { visitor_id: visitorId },
    defaults: {
      visitor_id: visitorId,
      conversation_count: 0,
      conversation_summaries: [],
      interests: [],
      questions_asked: [],
      visitor_type: 'new',
    },
  });
  return memory;
}

/**
 * After a conversation closes, extract summary and questions into memory.
 */
export async function saveConversationToMemory(conversationId: string): Promise<void> {
  const conversation = await ChatConversation.findByPk(conversationId);
  if (!conversation) return;

  const memory = await loadMemory(conversation.visitor_id);

  const messages = await ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
  });

  // Extract questions from visitor messages
  const visitorMessages = messages.filter((m) => m.role === 'visitor');
  const newQuestions = visitorMessages
    .filter((m) => m.content.includes('?'))
    .map((m) => m.content.trim())
    .slice(0, 10);

  // Detect interests from keywords
  const allVisitorText = visitorMessages.map((m) => m.content).join(' ').toLowerCase();
  const interestKeywords: Record<string, string[]> = {
    pricing: ['price', 'cost', 'afford', 'roi', 'invest', 'discount', 'payment'],
    curriculum: ['curriculum', 'module', 'learn', 'skill', 'topic', 'session', 'course'],
    enterprise: ['enterprise', 'team', 'group', 'company', 'corporate', 'sponsor'],
    outcomes: ['outcome', 'result', 'success', 'career', 'promotion', 'job', 'salary'],
    enrollment: ['enroll', 'sign up', 'register', 'start', 'begin', 'apply'],
    strategy_call: ['strategy call', 'consultation', 'meet', 'talk', 'discuss'],
    logistics: ['schedule', 'time', 'duration', 'week', 'month', 'when', 'how long'],
  };

  const detectedInterests: string[] = [];
  for (const [interest, keywords] of Object.entries(interestKeywords)) {
    if (keywords.some((kw) => allVisitorText.includes(kw))) {
      detectedInterests.push(interest);
    }
  }

  // Build summary entry
  const summaryEntry = {
    conversation_id: conversationId,
    summary: (conversation as any).summary || `${visitorMessages.length} messages exchanged`,
    timestamp: new Date().toISOString(),
    page_category: (conversation as any).page_category || 'unknown',
    questions_asked: newQuestions,
  };

  // Merge into memory (keep last 20 conversation summaries)
  const existingSummaries = memory.conversation_summaries || [];
  const updatedSummaries = [...existingSummaries, summaryEntry].slice(-20);

  const existingQuestions = memory.questions_asked || [];
  const updatedQuestions = [...new Set([...existingQuestions, ...newQuestions])].slice(-50);

  const existingInterests = memory.interests || [];
  const updatedInterests = [...new Set([...existingInterests, ...detectedInterests])];

  await memory.update({
    conversation_count: (memory.conversation_count || 0) + 1,
    last_conversation_id: conversationId,
    conversation_summaries: updatedSummaries,
    questions_asked: updatedQuestions,
    interests: updatedInterests,
    lead_id: conversation.lead_id || memory.lead_id,
    last_updated: new Date(),
  });
}

/**
 * Build a memory context string for injection into the system prompt.
 */
export async function buildMemoryContext(visitorId: string): Promise<string> {
  const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } });
  if (!memory || memory.conversation_count === 0) return '';

  const parts: string[] = ['VISITOR MEMORY (cross-session):'];

  parts.push(`- Conversations to date: ${memory.conversation_count}`);
  parts.push(`- Visitor type: ${memory.visitor_type}`);

  if (memory.interests.length > 0) {
    parts.push(`- Known interests: ${memory.interests.join(', ')}`);
  }

  if (memory.questions_asked.length > 0) {
    const recentQs = memory.questions_asked.slice(-5);
    parts.push(`- Recent questions: ${recentQs.map((q) => `"${q.slice(0, 80)}"`).join('; ')}`);
  }

  // Last 3 conversation summaries
  const recentSummaries = (memory.conversation_summaries || []).slice(-3);
  if (recentSummaries.length > 0) {
    parts.push('- Previous conversations:');
    for (const s of recentSummaries) {
      parts.push(`  - [${s.page_category}] ${s.summary}`);
    }
  }

  if (memory.personality_notes) {
    parts.push(`- Personality notes: ${memory.personality_notes}`);
  }

  if (memory.recommended_next_action) {
    parts.push(`- Recommended next action: ${memory.recommended_next_action}`);
  }

  return parts.join('\n');
}

/**
 * Classify the visitor type based on behavior, lead data, and identity.
 */
export async function classifyVisitorType(visitorId: string): Promise<AdmissionsVisitorType> {
  const memory = await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } });
  const visitor = await Visitor.findByPk(visitorId);

  // Check if CEO
  if (visitor?.lead_id) {
    const lead = await Lead.findByPk(visitor.lead_id);
    if (lead && isCEO(lead)) return 'ceo';
  }

  // Check intent score
  const intentScore = await IntentScore.findOne({ where: { visitor_id: visitorId } });

  // Enterprise detection: corporate email domain + multiple visits
  if (visitor?.lead_id) {
    const lead = await Lead.findByPk(visitor.lead_id);
    if (lead?.email) {
      const domain = lead.email.split('@')[1]?.toLowerCase() || '';
      const freeProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com'];
      if (!freeProviders.includes(domain) && (memory?.conversation_count || 0) >= 2) {
        return 'enterprise';
      }
    }
  }

  // High intent
  if (intentScore && intentScore.intent_level === 'very_high') return 'high_intent';

  // Engaged: 2+ conversations or high intent
  if ((memory?.conversation_count || 0) >= 2) return 'engaged';

  // Returning: has memory with at least 1 previous conversation
  if (memory && memory.conversation_count >= 1) return 'returning';

  return 'new';
}

/**
 * Check if a lead is the CEO (Ali).
 */
export function isCEO(lead: any): boolean {
  if (!lead) return false;
  const email = (lead.email || '').toLowerCase();
  const name = (lead.name || '').toLowerCase();

  const ceoEmails = ['ali@colaberry.com', 'ali.merchant@colaberry.com'];
  if (ceoEmails.includes(email)) return true;

  if (name.includes('ali') && name.includes('merchant')) return true;

  const title = ((lead as any).title || '').toLowerCase();
  if (title.includes('ceo') || title.includes('chief executive')) return true;

  return false;
}
