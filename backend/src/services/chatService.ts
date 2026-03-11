import OpenAI from 'openai';
import { env } from '../config/env';
import { getSetting } from './settingsService';
import {
  ChatConversation,
  ChatMessage,
  Visitor,
  Lead,
  BehavioralSignal,
  IntentScore,
  VisitorSession,
  PageEvent,
} from '../models';
import { getVisitorSignalSummary } from './behavioralSignalService';
import { buildMayaSystemPrompt, generateMayaGreeting } from './admissionsMayaService';
import { loadMemory, saveConversationToMemory, classifyVisitorType } from './admissionsMemoryService';
import { buildKnowledgeContext } from './admissionsKnowledgeService';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = env.openaiApiKey;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

async function buildChatSystemPrompt(params: {
  pageUrl: string;
  pageCategory: string;
  visitorId: string;
  leadId?: number | null;
  triggerContext?: Record<string, any> | null;
  campaignSystemPrompt?: string | null;
}): Promise<string> {
  const parts: string[] = [];

  // Base persona
  const campaignPrompt = params.campaignSystemPrompt;
  if (campaignPrompt) {
    parts.push(campaignPrompt);
  } else {
    parts.push(`You are an AI assistant for Colaberry Enterprise AI Division, a professional education company that offers an AI Leadership Accelerator program for enterprise executives.

Your persona: You are knowledgeable, consultative, and helpful. You speak with authority about AI strategy, enterprise transformation, and executive education. You are never pushy or salesy — you provide genuine value in every response. You match the professional tone of a Bloomberg or Salesforce experience.

Your goals:
1. Answer visitor questions about the program, pricing, outcomes, and enrollment
2. Provide value by sharing relevant insights about AI leadership and strategy
3. When appropriate, gently guide toward booking a strategy call or exploring enrollment
4. If a visitor shares their name or email, acknowledge it naturally`);
  }

  // Page context
  const pageCategoryDescriptions: Record<string, string> = {
    homepage: 'the homepage — they are getting an overview of Colaberry',
    program: 'the program details page — they are researching the AI Leadership Accelerator curriculum',
    pricing: 'the pricing page — they are evaluating cost and ROI',
    enroll: 'the enrollment page — they are considering signing up',
    case_studies: 'the case studies page — they are looking at success stories and social proof',
    contact: 'the contact page — they want to get in touch',
    strategy_call_prep: 'the strategy call preparation page — they are preparing for or considering a strategy call',
    advisory: 'the advisory services page — they are exploring advisory and consulting options',
    sponsorship: 'the corporate sponsorship page — they may be exploring group enrollment',
  };

  const pageDesc = pageCategoryDescriptions[params.pageCategory] || `a page (${params.pageUrl})`;
  parts.push(`\nCURRENT CONTEXT: The visitor is on ${pageDesc}.`);

  // Visitor behavioral context
  try {
    const signalSummary = await getVisitorSignalSummary(params.visitorId);
    if (signalSummary.total_signals > 0) {
      const signalList = Object.entries(signalSummary.signal_types)
        .sort((a, b) => b[1].total_strength - a[1].total_strength)
        .slice(0, 5)
        .map(([type, data]) => `${type.replace(/_/g, ' ')} (${data.count}x)`)
        .join(', ');
      parts.push(`BEHAVIORAL SIGNALS: ${signalList}`);
    }

    const intentScore = await IntentScore.findOne({
      where: { visitor_id: params.visitorId },
    });
    if (intentScore) {
      parts.push(`INTENT LEVEL: ${intentScore.intent_level} (score: ${intentScore.score}/100)`);
    }
  } catch (err) {
    // Non-critical — continue without behavioral context
  }

  // Lead context (if identified)
  if (params.leadId) {
    try {
      const lead = await Lead.findByPk(params.leadId);
      if (lead) {
        parts.push(`\nVISITOR IDENTIFIED AS: ${lead.name || 'Unknown'}${lead.company ? ` from ${lead.company}` : ''}${(lead as any).title ? `, ${(lead as any).title}` : ''}`);
        if ((lead as any).pipeline_stage) parts.push(`Pipeline stage: ${(lead as any).pipeline_stage}`);
      }
    } catch (err) {
      // Non-critical
    }
  }

  // Trigger context
  if (params.triggerContext) {
    parts.push(`\nThis conversation was proactively initiated because: ${JSON.stringify(params.triggerContext)}`);
    parts.push(`Be especially relevant and helpful — reference why you reached out.`);
  }

  // Rules
  parts.push(`
IMPORTANT RULES:
- Keep responses concise (2-4 sentences typical, longer only when explaining something detailed)
- Never fabricate specific numbers, dates, or facts about the program — if unsure, suggest they check the relevant page or speak with the team
- If the visitor shares their name or email, acknowledge it warmly
- If asked about pricing, you can discuss value and ROI but suggest they check the pricing page or book a strategy call for specific numbers
- Never be pushy about enrollment — be a helpful guide
- Use plain text, not markdown formatting (no ** or ## etc.)
- Be conversational and warm while maintaining professionalism`);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Start Conversation
// ---------------------------------------------------------------------------

export async function startConversation(params: {
  visitorId: string;
  sessionId?: string | null;
  pageUrl: string;
  pageCategory: string;
  triggerType?: string;
  triggerContext?: Record<string, any> | null;
  campaignSystemPrompt?: string | null;
}): Promise<{ conversation_id: string; greeting: string }> {
  // Get visitor's lead_id if identified
  const visitor = await Visitor.findByPk(params.visitorId);
  const leadId = visitor?.lead_id || null;

  // Load admissions memory for returning visitor detection
  // Wrapped in try-catch: visitor may not yet exist in visitors table (tracking is async)
  let memory: Awaited<ReturnType<typeof loadMemory>> | null = null;
  let visitorType = 'new';
  let isReturning = false;
  try {
    memory = await loadMemory(params.visitorId);
    visitorType = await classifyVisitorType(params.visitorId);
    isReturning = memory.conversation_count > 0;

    // Update visitor type in memory
    if (memory.visitor_type !== visitorType) {
      await memory.update({ visitor_type: visitorType as any });
    }
  } catch (memErr) {
    console.warn('[Chat] Admissions memory unavailable (visitor may not exist yet):', (memErr as Error).message);
  }

  // Build Maya system prompt (or campaign override)
  let systemPrompt: string;
  if (params.campaignSystemPrompt) {
    systemPrompt = await buildChatSystemPrompt({
      pageUrl: params.pageUrl,
      pageCategory: params.pageCategory,
      visitorId: params.visitorId,
      leadId,
      triggerContext: params.triggerContext,
      campaignSystemPrompt: params.campaignSystemPrompt,
    });
  } else {
    systemPrompt = await buildMayaSystemPrompt({
      pageUrl: params.pageUrl,
      pageCategory: params.pageCategory,
      visitorId: params.visitorId,
      leadId,
      triggerContext: params.triggerContext,
    });
  }

  // Create conversation record
  const conversation = await ChatConversation.create({
    visitor_id: params.visitorId,
    lead_id: leadId,
    session_id: params.sessionId || null,
    status: 'active',
    started_at: new Date(),
    message_count: 0,
    visitor_message_count: 0,
    page_url: params.pageUrl,
    page_category: params.pageCategory,
    trigger_type: params.triggerType || 'visitor_initiated',
    trigger_context: params.triggerContext || null,
    ai_system_prompt: systemPrompt,
  } as any);

  // Generate Maya greeting (deterministic for known types, LLM fallback)
  const mayaGreeting = await generateMayaGreeting({
    visitorType,
    pageCategory: params.pageCategory,
    isReturning,
    memory,
  });

  // For returning visitors, use the deterministic Maya greeting directly
  // For new visitors, optionally enhance with LLM
  let greeting = mayaGreeting;
  let tokensUsed = 0;
  let latencyMs = 0;
  const chatModel = env.chatModel;

  if (!isReturning && visitorType !== 'ceo') {
    // Use LLM to generate contextual greeting for new visitors
    const client = getClient();
    const model = chatModel;
    const maxTokens = env.chatMaxTokens;

    let greetingPrompt: string;
    if (params.triggerType === 'proactive_behavioral') {
      greetingPrompt = `Generate a proactive greeting as Maya, Director of Admissions. You are reaching out because their behavior indicates interest. Be warm and relevant. One to two sentences. Always introduce yourself as Maya.`;
    } else {
      greetingPrompt = `Generate a welcoming greeting as Maya, Director of Admissions. Be warm, brief, and contextually relevant to the page they are on. One to two sentences. Always introduce yourself as Maya.`;
    }

    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: greetingPrompt },
      ],
    });

    greeting = response.choices[0]?.message?.content?.trim() || mayaGreeting;
    tokensUsed = response.usage?.total_tokens || 0;
    latencyMs = Date.now() - startTime;
  }

  // Save greeting as assistant message
  await ChatMessage.create({
    conversation_id: conversation.id,
    role: 'assistant',
    content: greeting,
    tokens_used: tokensUsed,
    timestamp: new Date(),
    metadata: { model: chatModel, latency_ms: latencyMs },
  } as any);

  await conversation.update({
    message_count: 1,
  } as any);

  return {
    conversation_id: conversation.id,
    greeting,
    returning_visitor: isReturning,
    visitor_type: visitorType,
  } as any;
}

// ---------------------------------------------------------------------------
// Send Message
// ---------------------------------------------------------------------------

export async function sendMessage(
  conversationId: string,
  visitorMessage: string
): Promise<{ message: string; conversation_id: string }> {
  const conversation = await ChatConversation.findByPk(conversationId);
  if (!conversation) throw new Error('Conversation not found');
  if (conversation.status !== 'active') throw new Error('Conversation is closed');

  // Save visitor message
  await ChatMessage.create({
    conversation_id: conversationId,
    role: 'visitor',
    content: visitorMessage,
    timestamp: new Date(),
  } as any);

  // Build message history (last 20 messages)
  const history = await ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
    limit: 20,
  });

  // Inject RAG knowledge context for the current message
  let systemPrompt = conversation.ai_system_prompt || '';
  try {
    const pageCategory = (conversation as any).page_category || '';
    const knowledgeCtx = await buildKnowledgeContext(visitorMessage, pageCategory);
    if (knowledgeCtx) {
      systemPrompt += '\n\n' + knowledgeCtx;
    }
  } catch {
    // Non-critical — continue without knowledge context
  }

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  for (const msg of history) {
    if (msg.role === 'assistant') {
      messages.push({ role: 'assistant', content: msg.content });
    } else if (msg.role === 'visitor') {
      messages.push({ role: 'user', content: msg.content });
    }
    // system messages from context updates are skipped in the OpenAI messages
  }

  // Call OpenAI
  const client = getClient();
  const model = env.chatModel;
  const maxTokens = env.chatMaxTokens;

  const startTime = Date.now();
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    temperature: 0.7,
    messages,
  });

  const reply = response.choices[0]?.message?.content?.trim() || 'I apologize, I had trouble generating a response. Could you try rephrasing your question?';
  const tokensUsed = response.usage?.total_tokens || 0;
  const latencyMs = Date.now() - startTime;

  // Save assistant response
  await ChatMessage.create({
    conversation_id: conversationId,
    role: 'assistant',
    content: reply,
    tokens_used: tokensUsed,
    timestamp: new Date(),
    metadata: { model, latency_ms: latencyMs },
  } as any);

  // Update conversation counters
  await conversation.update({
    message_count: (conversation.message_count || 0) + 2,
    visitor_message_count: (conversation.visitor_message_count || 0) + 1,
    updated_at: new Date(),
  } as any);

  return { message: reply, conversation_id: conversationId };
}

// ---------------------------------------------------------------------------
// Close Conversation
// ---------------------------------------------------------------------------

export async function closeConversation(conversationId: string): Promise<void> {
  const conversation = await ChatConversation.findByPk(conversationId);
  if (!conversation) return;
  if (conversation.status === 'closed') return;

  // Generate summary
  let summary = '';
  try {
    const messages = await ChatMessage.findAll({
      where: { conversation_id: conversationId },
      order: [['timestamp', 'ASC']],
    });

    if (messages.length > 2) {
      const client = getClient();
      const transcript = messages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'visitor' ? 'Visitor' : 'Assistant'}: ${m.content}`)
        .join('\n');

      const response = await client.chat.completions.create({
        model: env.chatModel,
        max_tokens: 150,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'Summarize this chat conversation in 1-2 sentences. Focus on what the visitor was interested in and any actions discussed.' },
          { role: 'user', content: transcript },
        ],
      });

      summary = response.choices[0]?.message?.content?.trim() || '';
    }
  } catch (err) {
    // Non-critical — close without summary
  }

  await conversation.update({
    status: 'closed',
    ended_at: new Date(),
    summary: summary || null,
    updated_at: new Date(),
  } as any);

  // Emit a behavioral signal if the conversation was substantive
  if (conversation.visitor_message_count >= 3) {
    try {
      await BehavioralSignal.create({
        visitor_id: conversation.visitor_id,
        session_id: conversation.session_id,
        lead_id: conversation.lead_id,
        signal_type: 'chat_engagement',
        signal_strength: 35,
        context: {
          message_count: conversation.message_count,
          page_category: conversation.page_category,
          trigger_type: conversation.trigger_type,
        },
        detected_at: new Date(),
      } as any);
    } catch (err) {
      // Non-critical
    }
  }

  // Save conversation to admissions memory
  saveConversationToMemory(conversationId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Update page context mid-conversation (page navigation without closing)
// ---------------------------------------------------------------------------

export async function updateConversationContext(
  conversationId: string,
  newPageUrl: string,
  newPageCategory: string
): Promise<void> {
  const conversation = await ChatConversation.findByPk(conversationId);
  if (!conversation || conversation.status !== 'active') return;

  await conversation.update({
    page_url: newPageUrl,
    page_category: newPageCategory,
    updated_at: new Date(),
  } as any);

  // Save a system context note
  await ChatMessage.create({
    conversation_id: conversationId,
    role: 'system',
    content: `[Context update: visitor navigated to ${newPageUrl} (${newPageCategory})]`,
    timestamp: new Date(),
  } as any);
}

// ---------------------------------------------------------------------------
// Get Conversation History
// ---------------------------------------------------------------------------

export async function getConversationHistory(conversationId: string): Promise<ChatMessage[]> {
  return ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
  });
}

// ---------------------------------------------------------------------------
// Proactive Chat Check
// ---------------------------------------------------------------------------

export async function checkProactiveChat(visitorId: string): Promise<{
  show_proactive: boolean;
  greeting?: string;
  trigger_context?: Record<string, any>;
} | null> {
  if (!env.enableChat) return null;

  // Check if visitor already has an active conversation
  const activeConversation = await ChatConversation.findOne({
    where: { visitor_id: visitorId, status: 'active' },
  });
  if (activeConversation) return null;

  // Check if visitor was recently flagged for proactive chat
  const visitor = await Visitor.findByPk(visitorId);
  if (!visitor) return null;

  const metadata = (visitor as any).metadata || {};
  if (!metadata.proactive_chat_pending) return null;

  // Clear the flag
  await visitor.update({
    metadata: { ...metadata, proactive_chat_pending: false },
  } as any);

  return {
    show_proactive: true,
    trigger_context: metadata.proactive_chat_context || { reason: 'behavioral_trigger' },
  };
}

// ---------------------------------------------------------------------------
// Admin: List Conversations
// ---------------------------------------------------------------------------

export async function listConversations(params: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ conversations: any[]; total: number; page: number; totalPages: number }> {
  const page = Math.max(params.page ?? 1, 1);
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const offset = (page - 1) * limit;

  const where: any = {};
  if (params.status) where.status = params.status;

  const { rows, count } = await ChatConversation.findAndCountAll({
    where,
    include: [
      {
        model: Visitor,
        as: 'visitor',
        include: [
          { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'], required: false },
        ],
      },
    ],
    order: [['started_at', 'DESC']],
    limit,
    offset,
  });

  return {
    conversations: rows,
    total: count,
    page,
    totalPages: Math.ceil(count / limit),
  };
}

// ---------------------------------------------------------------------------
// Admin: Get Conversation Detail
// ---------------------------------------------------------------------------

export async function getConversationDetail(conversationId: string): Promise<{
  conversation: ChatConversation;
  messages: ChatMessage[];
} | null> {
  const conversation = await ChatConversation.findByPk(conversationId, {
    include: [
      {
        model: Visitor,
        as: 'visitor',
        include: [
          { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'], required: false },
        ],
      },
    ],
  });

  if (!conversation) return null;

  const messages = await ChatMessage.findAll({
    where: { conversation_id: conversationId },
    order: [['timestamp', 'ASC']],
  });

  return { conversation, messages };
}

// ---------------------------------------------------------------------------
// Admin: Chat Stats
// ---------------------------------------------------------------------------

export async function getChatStats(): Promise<{
  total_conversations: number;
  active_conversations: number;
  today_conversations: number;
  avg_messages: number;
}> {
  const { Op, fn, col } = require('sequelize');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, active, today, avgData] = await Promise.all([
    ChatConversation.count(),
    ChatConversation.count({ where: { status: 'active' } }),
    ChatConversation.count({ where: { started_at: { [Op.gte]: todayStart } } }),
    ChatConversation.findOne({
      attributes: [[fn('AVG', col('message_count')), 'avg_messages']],
      raw: true,
    }),
  ]);

  return {
    total_conversations: total,
    active_conversations: active,
    today_conversations: today,
    avg_messages: Math.round(Number((avgData as any)?.avg_messages || 0) * 10) / 10,
  };
}
