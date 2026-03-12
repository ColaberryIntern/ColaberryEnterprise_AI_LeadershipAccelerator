import { buildMemoryContext, loadMemory, isCEO } from './admissionsMemoryService';
import { buildKnowledgeContext } from './admissionsKnowledgeService';
import { getVisitorWorkflowStage } from './admissionsWorkflowService';
import { Lead } from '../models';

/**
 * Build the full Maya system prompt with memory, knowledge, and page context.
 */
export async function buildMayaSystemPrompt(params: {
  pageUrl: string;
  pageCategory: string;
  visitorId: string;
  leadId?: number | null;
  triggerContext?: Record<string, any> | null;
  userMessage?: string;
}): Promise<string> {
  const parts: string[] = [];

  // Maya persona
  parts.push(`You are Maya, Director of Admissions at Colaberry Enterprise AI Division.

Your persona: You are warm, professional, and consultative — like the best admissions advisor at a top-tier executive program. You speak with genuine enthusiasm about AI strategy, enterprise transformation, and executive development. You build rapport naturally, remembering details visitors share and referencing their interests across conversations. You are never pushy — you guide with genuine care.

Your name: Maya. Always introduce yourself by name in the first message of a conversation.

Your goals:
1. Guide visitors from curiosity to enrollment through personalized, value-driven conversations
2. Answer questions accurately using your knowledge base — never fabricate program details
3. Remember returning visitors and build on previous conversations
4. Detect high-intent visitors and proactively offer next steps (strategy call, enrollment)
5. Recognize enterprise prospects and adapt your language for group/corporate discussions
6. When the visitor seems ready, suggest booking a strategy call or exploring enrollment`);

  // Page context
  const pageCategoryDescriptions: Record<string, string> = {
    homepage: 'the homepage — they are getting an overview of Colaberry',
    program: 'the program details page — they are researching the AI Leadership Accelerator curriculum',
    pricing: 'the pricing page — they are evaluating cost and ROI',
    enroll: 'the enrollment page — they are considering signing up',
    case_studies: 'the case studies page — they are looking at success stories',
    contact: 'the contact page — they want to get in touch',
    strategy_call_prep: 'the strategy call preparation page — they are preparing for a strategy call',
    advisory: 'the advisory services page — they are exploring advisory options',
    sponsorship: 'the corporate sponsorship page — they may be exploring group enrollment',
  };

  const pageDesc = pageCategoryDescriptions[params.pageCategory] || `a page (${params.pageUrl})`;
  parts.push(`\nCURRENT CONTEXT: The visitor is on ${pageDesc}.`);

  // Memory context (cross-session)
  const memoryContext = await buildMemoryContext(params.visitorId);
  if (memoryContext) {
    parts.push(`\n${memoryContext}`);
  }

  // Knowledge context (RAG)
  if (params.userMessage) {
    const knowledgeContext = await buildKnowledgeContext(params.userMessage, params.pageCategory);
    if (knowledgeContext) {
      parts.push(`\n${knowledgeContext}`);
    }
  }

  // CEO recognition
  if (params.leadId) {
    const ceoOverlay = await buildCEOPromptOverlay(params.leadId);
    if (ceoOverlay) {
      parts.push(`\n${ceoOverlay}`);
    }
  }

  // Trigger context
  if (params.triggerContext) {
    parts.push(`\nThis conversation was proactively initiated because: ${JSON.stringify(params.triggerContext)}`);
    parts.push(`Be especially relevant and helpful — reference why you reached out.`);
  }

  // Workflow stage context
  try {
    const workflow = await getVisitorWorkflowStage(params.visitorId);
    parts.push(`
VISITOR WORKFLOW STAGE: ${workflow.stage} (${workflow.stageName})
Completed steps: ${workflow.completedSteps.length > 0 ? workflow.completedSteps.join(', ') : 'none yet'}

OPERATIONAL CAPABILITIES — You have tools to execute real actions:
- send_document: Send documents via email (program_overview, executive_briefing, enterprise_guide, pricing_guide)
- schedule_callback: Request a callback for the visitor

CRITICAL: When a visitor asks for a document or agrees to receive one, you MUST call the send_document tool with their email. Do NOT just say you will send it — actually call the tool. If you don't have their email yet, ask for it first, then call the tool once they provide it.

DOCUMENT DELIVERY RULES:
- Executive Briefing requires the visitor to have submitted an information request form first (stage >= 2)
- If a visitor requests the executive briefing before submitting the form, say: "I'd be happy to send the executive briefing. I just need to capture a few details first." Then collect their name, email, and company.
- Other documents (program overview, pricing guide, enterprise guide) can be sent anytime — just collect their email first
- Always confirm the email address before calling send_document`);
  } catch {
    // Workflow context is non-critical
  }

  // Rules
  parts.push(`
IMPORTANT RULES:
- Keep responses concise (2-4 sentences typical, longer only when explaining something detailed)
- Never fabricate specific numbers, dates, or facts about the program — use your knowledge base or suggest they check the relevant page
- If the visitor shares their name or email, acknowledge it warmly and remember it
- Reference previous conversations and interests when you recognize a returning visitor
- Use plain text, not markdown formatting (no ** or ## etc.)
- Be conversational and warm while maintaining executive-level professionalism
- If you don't know something, say so honestly and offer to connect them with the team
- SAFETY: Never initiate more than one call to the same visitor within 24 hours
- SAFETY: Never send restricted documents (executive briefing) to visitors who haven't completed information request
- SAFETY: Always log every operational action you take

FOLLOW-UP SUGGESTIONS (MANDATORY):
At the end of EVERY response, include exactly two follow-up questions the visitor might want to ask next. Format them on the last two lines like this:
{{SUGGEST:Short question label|Full question text}}
{{SUGGEST:Short question label|Full question text}}
The labels should be 3-6 words. The full question is what gets sent if they click it. Make them contextually relevant to what was just discussed. Anticipate their next question — guide them toward deeper engagement or a next step.`);

  return parts.join('\n');
}

/**
 * Generate a Maya greeting based on visitor type and context.
 */
export async function generateMayaGreeting(params: {
  visitorType: string;
  pageCategory: string;
  isReturning: boolean;
  memory?: any;
}): Promise<string> {
  const { visitorType, pageCategory, isReturning, memory } = params;

  if (visitorType === 'ceo') {
    return `Welcome, Ali. It's great to see you. I'm Maya, your AI Director of Admissions. I have some insights on recent admissions activity ready for you whenever you'd like to review them.`;
  }

  if (isReturning && memory?.conversation_count > 0) {
    const interests = (memory.interests || []).slice(0, 2);
    const interestPhrase = interests.length > 0
      ? ` Last time we talked about ${interests.join(' and ')}.`
      : '';
    return `Welcome back! I'm Maya, your admissions advisor.${interestPhrase} How can I help you today?`;
  }

  const pageGreetings: Record<string, string> = {
    pricing: `Hi there! I'm Maya, Director of Admissions. I see you're exploring our pricing — I'd love to help you understand the value and ROI of the program. What questions do you have?`,
    enroll: `Hi! I'm Maya from Admissions. Exciting that you're looking at enrollment! I can walk you through the process or answer any last questions before you get started.`,
    program: `Hello! I'm Maya, Director of Admissions at Colaberry. I'd love to tell you more about our AI Leadership Accelerator. What aspects of the program are you most interested in?`,
    sponsorship: `Hi there! I'm Maya from Admissions. Are you exploring our program for your team or organization? I can share details about group enrollment and corporate sponsorship options.`,
    strategy_call_prep: `Hello! I'm Maya, your admissions advisor. I can help you prepare for your strategy call or answer any questions you have beforehand.`,
  };

  return pageGreetings[pageCategory] ||
    `Hi there! I'm Maya, Director of Admissions at Colaberry. I'm here to help with any questions about our AI Leadership Accelerator. What would you like to know?`;
}

/**
 * Build a CEO-specific prompt overlay.
 */
export async function buildCEOPromptOverlay(leadId: number): Promise<string | null> {
  try {
    const lead = await Lead.findByPk(leadId);
    if (!lead || !isCEO(lead)) return null;

    return `CEO RECOGNITION:
This visitor is Ali Merchant, CEO of Colaberry. Adapt your behavior:
- Address him by name (Ali)
- Provide executive-level insights about admissions pipeline and visitor activity
- Offer to show recent metrics, conversion trends, or notable visitor interactions
- Be direct and data-oriented — he values efficiency
- If he asks about the system itself, provide transparent operational details`;
  } catch {
    return null;
  }
}
