import AdmissionsMemory from '../models/AdmissionsMemory';
import type { AdmissionsVisitorType } from '../models/AdmissionsMemory';
import { ChatConversation, ChatMessage, Visitor, Lead, IntentScore, BehavioralSignal } from '../models';
import { Op } from 'sequelize';

/**
 * The memory row that belongs to a PERSON, or null when the person is unknown.
 *
 * ORDER IS LOAD-BEARING, not tidiness. 49 of 455 leads already carry two or more visitor
 * identities (43 with two, 5 with three, 1 with four), so `findOne({ where: { lead_id } })`
 * without an order returns whichever row Postgres hands back first — which can differ between
 * two calls for the same person. The OLDEST row is chosen as canonical because it holds the
 * earliest history, and because "oldest" is a property of the data rather than of the query
 * plan. callTranscriptProcessor.ts:87 has this exact unordered bug today.
 */
async function findMemoryByPerson(leadId: number | null | undefined): Promise<AdmissionsMemory | null> {
  if (!leadId) return null;
  return AdmissionsMemory.findOne({
    where: { lead_id: leadId },
    order: [['created_at', 'ASC']],
  });
}

/**
 * Load or create the AdmissionsMemory for whoever is at the door.
 *
 * RESOLVES BY PERSON WHERE A PERSON IS KNOWN, and falls back to the browser only for an
 * anonymous first touch. That ordering is the whole ticket.
 *
 * The previous signature took a visitor id alone and did `findOrCreate({ where: { visitor_id } })`,
 * where `visitor_id` traces back to a fingerprint in the browser's localStorage
 * (frontend/src/utils/tracker.ts:21-27, derived from user agent, screen size, timezone and
 * language). A new browser, a new device or cleared storage therefore produced a new identity
 * and a blank memory, so Maya greeted a returning person as a stranger. In production that is
 * 111 memory rows of which 1 carries a lead_id.
 *
 * `leadId` is OPTIONAL so every existing caller keeps compiling and keeps its old behaviour;
 * the callers that already hold a person identity now pass it. Where one is passed and the
 * visitor-scoped row is not yet linked, the link is written here — which is what lets the
 * SECOND device find the SAME memory by person rather than minting another one.
 *
 * NOT a third identity, per the ticket: the lead is the identity that already exists.
 */
export async function loadMemory(
  visitorId: string,
  leadId?: number | null,
): Promise<AdmissionsMemory> {
  const byPerson = await findMemoryByPerson(leadId);
  if (byPerson) return byPerson;

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

  // Attach the person to the row the moment one is known. Without this the link is only ever
  // written by mayaToolsService.captureLeadDetails (behind a bare `.catch(() => {})`, so its
  // failures are invisible) and by a conversation that already knew the lead before it began.
  // Nothing wrote it from /api/t/identify, which is where a visitor actually becomes a person,
  // and that asymmetry is the mechanism behind 1 linked row out of 111.
  if (leadId && !memory.lead_id) {
    await memory.update({ lead_id: leadId });
  }

  return memory;
}

/**
 * After a conversation closes, extract summary and questions into memory.
 */
export async function saveConversationToMemory(conversationId: string): Promise<void> {
  const conversation = await ChatConversation.findByPk(conversationId);
  if (!conversation) return;

  const messages = await ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
  });

  // Extract questions from visitor messages
  const visitorMessages = messages.filter((m) => m.role === 'visitor');

  // THE SUBSTANCE GUARD. A conversation the visitor never spoke in is not a memory.
  //
  // Without this, such a conversation still wrote a row: conversation_count incremented and a
  // summary entry reading "0 messages exchanged" appended, which `buildMemoryContext()` then
  // injects verbatim into Maya's system prompt. She would be told about a conversation that
  // never happened, and the count that is supposed to mean "how well do we know this person"
  // would be inflated by silence.
  //
  // THIS IS NOT HYPOTHETICAL. Measured in production on 2026-11-11, after the idle sweep first
  // ran: 8 such entries existed across 7 memory rows, and 5 of those rows held NOTHING ELSE.
  //
  // THE TEST IS THE MESSAGE ROWS, NOT `visitor_message_count`. The counter disagrees with
  // reality: of the 17 conversations closed that day, 5 carried a non-zero counter while having
  // zero `role='visitor'` rows, and every one of those 5 wrote junk. A guard on the counter
  // would have caught only 3 of the 8. The rows are the evidence; the counter is a claim.
  //
  // A generated summary still counts as substance, so a conversation summarized by the model
  // is kept even if the transcript shape is unusual.
  if (visitorMessages.length === 0 && !(conversation as { summary?: string | null }).summary) {
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'admissions-memory',
        event: 'memory_write_skipped_no_substance',
        outcome: 'success',
        context: {
          conversation_id: conversationId,
          visitor_message_rows: 0,
          visitor_message_count_column: conversation.visitor_message_count ?? null,
        },
      })
    );
    return;
  }

  // The conversation row carries the person. Passing it means a conversation closed on a
  // second device folds into the SAME memory instead of starting a parallel history.
  const memory = await loadMemory(conversation.visitor_id, conversation.lead_id);
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
export async function buildMemoryContext(
  visitorId: string,
  leadId?: number | null,
): Promise<string> {
  // Person first, browser second. This is the function whose empty return IS the bug the
  // ticket describes: it bails out at conversation_count === 0, so a returning person on a
  // second device produced no memory block at all and Maya opened as though they were new.
  const memory = (await findMemoryByPerson(leadId))
    ?? (await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } }));
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
export async function classifyVisitorType(
  visitorId: string,
  leadId?: number | null,
): Promise<AdmissionsVisitorType> {
  // Person first, so conversation_count is the PERSON's count. This is criterion (4): with
  // the browser-scoped row, someone on their second device had a count of 0 and fell through
  // every branch below to 'new', which is precisely "reporting a returning person as new".
  const memory = (await findMemoryByPerson(leadId))
    ?? (await AdmissionsMemory.findOne({ where: { visitor_id: visitorId } }));
  const visitor = await Visitor.findByPk(visitorId);

  // An explicitly supplied person wins over the one hanging off this browser's visitor row,
  // which may be null on a device the person has not been identified on yet.
  const personId = leadId ?? visitor?.lead_id ?? null;

  // Check if CEO
  if (personId) {
    const lead = await Lead.findByPk(personId);
    if (lead && isCEO(lead)) return 'ceo';
  }

  // Check intent score
  const intentScore = await IntentScore.findOne({ where: { visitor_id: visitorId } });

  // Enterprise detection: corporate email domain + multiple visits
  if (personId) {
    const lead = await Lead.findByPk(personId);
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
