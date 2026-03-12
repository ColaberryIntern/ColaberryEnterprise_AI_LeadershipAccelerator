import OpenAI from 'openai';
import { Op } from 'sequelize';
import MentorConversation from '../models/MentorConversation';
import UserCurriculumProfile from '../models/UserCurriculumProfile';
import CurriculumLesson from '../models/CurriculumLesson';
import CurriculumModule from '../models/CurriculumModule';
import LessonInstance from '../models/LessonInstance';
import { Enrollment } from '../models';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}
const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';

interface MentorMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

/* ------------------------------------------------------------------ */
/*  Build context-aware system prompt                                  */
/* ------------------------------------------------------------------ */

async function buildMentorSystemPrompt(
  enrollmentId: string,
  lessonId?: string
): Promise<string> {
  const parts: string[] = [];

  parts.push(`You are an AI Leadership Mentor for the Colaberry Enterprise AI Leadership Accelerator.
Your role is to guide executive learners through their AI strategy journey.

PERSONALITY:
- Warm, encouraging, and professional
- Use the Socratic method — ask questions to deepen understanding rather than giving direct answers
- Reference the learner's specific industry, company, and goals
- Keep responses concise (2-3 paragraphs max)
- Use practical, business-focused language appropriate for executives

CRITICAL BEHAVIOR:
- DO NOT give direct answers, complete solutions, or copy-paste content
- Instead, EXPLAIN the concept or issue clearly so the learner understands
- Then SUGGEST 2-3 actionable prompts the learner can run in their LLM of choice (ChatGPT, Claude, etc.)
- Each suggested prompt should be a complete, ready-to-use prompt — not a question back to you
- The suggested prompts should help the learner solve the problem themselves with AI assistance

BOUNDARIES:
- NEVER complete assignments, labs, or assessments for the learner
- NEVER bypass curriculum gating or progression rules
- Guide thinking, don't provide copy-paste answers
- If asked to do their work, redirect to the relevant lesson or prompt deeper reflection
- You may explain concepts, provide analogies, and suggest approaches`);

  // Add learner context
  const profile = await UserCurriculumProfile.findOne({
    where: { enrollment_id: enrollmentId },
  });

  if (profile) {
    parts.push('\nLEARNER CONTEXT:');
    if (profile.company_name) parts.push(`Company: ${profile.company_name}`);
    if (profile.industry) parts.push(`Industry: ${profile.industry}`);
    if (profile.role) parts.push(`Role: ${profile.role}`);
    if (profile.goal) parts.push(`Goal: ${profile.goal}`);
    if (profile.ai_maturity_level) parts.push(`AI Maturity: ${profile.ai_maturity_level}/5`);
    if (profile.identified_use_case) parts.push(`Use Case: ${profile.identified_use_case}`);
  }

  // Add enrollment info
  const enrollment = await Enrollment.findByPk(enrollmentId);
  if (enrollment) {
    parts.push(`\nParticipant: ${enrollment.full_name}`);
  }

  // Add current lesson context if on a specific lesson
  if (lessonId) {
    const lesson = await CurriculumLesson.findByPk(lessonId, {
      include: [{ model: CurriculumModule, as: 'module' }],
    });
    if (lesson) {
      const mod = (lesson as any).module;
      parts.push(`\nCURRENT LESSON: "${lesson.title}" (${lesson.lesson_type})`);
      parts.push(`MODULE: ${mod?.title || 'Unknown'}`);
      parts.push(`DESCRIPTION: ${lesson.description}`);

      // Check lesson instance for progress
      const instance = await LessonInstance.findOne({
        where: { lesson_id: lessonId, enrollment_id: enrollmentId },
      });
      if (instance) {
        parts.push(`STATUS: ${instance.status}`);
        if (instance.quiz_score != null) parts.push(`QUIZ SCORE: ${instance.quiz_score}%`);
      }
    }
  }

  // Add admin-configured mentor preparation prompt for implementation tasks
  if (lessonId) {
    const MiniSection = (await import('../models/MiniSection')).default;
    const implTask = await MiniSection.findOne({
      where: { lesson_id: lessonId, mini_section_type: 'implementation_task', is_active: true },
    });
    if (implTask?.mentor_prompt_system) {
      parts.push('\nMENTOR PREPARATION CONTEXT:');
      parts.push(implTask.mentor_prompt_system);
    }
  }

  // Add curriculum progress summary
  const instances = await LessonInstance.findAll({
    where: { enrollment_id: enrollmentId },
  });
  const completed = instances.filter((i) => i.status === 'completed').length;
  const total = instances.length;
  parts.push(`\nCURRICULUM PROGRESS: ${completed}/${total} lessons completed`);

  parts.push('\nAt the end of each response, suggest 2-3 ready-to-use prompts the learner can run in their chosen LLM (ChatGPT, Claude, etc.). These should be complete, actionable prompts — NOT questions to ask you. Format them as:\nSUGGESTED_PROMPTS: ["Complete prompt 1 the learner can paste into ChatGPT", "Complete prompt 2", "Complete prompt 3"]');

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Send message                                                       */
/* ------------------------------------------------------------------ */

export async function sendMentorMessage(
  enrollmentId: string,
  message: string,
  lessonId?: string,
  contextType?: 'implementation_briefing' | 'reflection_guide' | 'knowledge_explanation' | 'general'
): Promise<{ reply: string; suggested_prompts: string[]; conversation_id: string }> {
  // Find or create conversation
  let conversation = await MentorConversation.findOne({
    where: {
      enrollment_id: enrollmentId,
      lesson_id: lessonId ? lessonId : { [Op.is]: null } as any,
    },
    order: [['updated_at', 'DESC']],
  });

  if (!conversation) {
    conversation = await MentorConversation.create({
      enrollment_id: enrollmentId,
      lesson_id: lessonId || undefined,
      messages_json: [],
    });
  }

  const messages: MentorMessage[] = conversation.messages_json || [];

  // Add user message
  messages.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });

  // Build system prompt
  const systemPrompt = await buildMentorSystemPrompt(enrollmentId, lessonId);

  // Build OpenAI messages (keep last 20 messages for context window)
  const recentMessages = messages.slice(-20);
  const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ];

  try {
    const response = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages: openaiMessages,
      temperature: 0.7,
      max_tokens: contextType === 'implementation_briefing' ? 2048 : 1024,
    });

    const replyContent = response.choices[0]?.message?.content || 'I apologize, I was unable to generate a response. Please try again.';

    // Parse suggested prompts from reply
    let reply = replyContent;
    let suggested_prompts: string[] = [];

    const promptMatch = replyContent.match(/SUGGESTED_PROMPTS:\s*\[([^\]]+)\]/);
    if (promptMatch) {
      try {
        suggested_prompts = JSON.parse(`[${promptMatch[1]}]`);
        reply = replyContent.replace(/\n?SUGGESTED_PROMPTS:\s*\[([^\]]+)\]/, '').trim();
      } catch {
        // If parsing fails, try simpler extraction
        suggested_prompts = promptMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''));
        reply = replyContent.replace(/\n?SUGGESTED_PROMPTS:\s*\[([^\]]+)\]/, '').trim();
      }
    }

    // Add assistant message
    messages.push({
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
    });

    // Save conversation
    conversation.messages_json = messages;
    conversation.updated_at = new Date();
    await conversation.save();

    return {
      reply,
      suggested_prompts,
      conversation_id: conversation.id,
    };
  } catch (err) {
    console.error('[MentorService] Error:', err);
    throw new Error('Unable to get mentor response. Please try again.');
  }
}

/* ------------------------------------------------------------------ */
/*  Get history                                                        */
/* ------------------------------------------------------------------ */

export async function getMentorHistory(
  enrollmentId: string,
  lessonId?: string
): Promise<{ messages: MentorMessage[]; conversation_id: string | null }> {
  const conversation = await MentorConversation.findOne({
    where: {
      enrollment_id: enrollmentId,
      lesson_id: lessonId ? lessonId : { [Op.is]: null } as any,
    },
    order: [['updated_at', 'DESC']],
  });

  if (!conversation) {
    return { messages: [], conversation_id: null };
  }

  return {
    messages: (conversation.messages_json || []).filter(
      (m: MentorMessage) => m.role !== 'system'
    ),
    conversation_id: conversation.id,
  };
}
