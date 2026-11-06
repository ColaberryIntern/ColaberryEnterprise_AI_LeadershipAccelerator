import OpenAI from 'openai';
import { requestPortalCallback, type CallbackOutcome } from './mayaCallbackService';

/**
 * C121/C122 — the ONLY tools Maya has in the portal's shared chat. Three, on purpose:
 *
 *   retrieve_knowledge   plans, pricing and program facts, through the same gated knowledge search her site chat uses
 *                        (mayaToolsService.retrieveKnowledgeContent, which withholds retired facts).
 *   book_admissions_call offers the campus booking sheet. It books nothing itself: the learner picks a slot in the sheet,
 *                        which writes through /api/portal/campus/admissions-call onto the admissions calendar, so the call
 *                        shows in "Coming up". Maya's old schedule_strategy_call wrote different records and never showed.
 *   request_callback     writes a callback_requests row for the admissions team (mayaCallbackService.ts).
 *
 * NOT HERE, deliberately: Synthflow voice calls, SMS, document email, campaign enrollment, lead capture and the marketing
 * tools. Those are her public-site tools and reach a stranger; a signed-in learner already has an account, and Ali asked
 * for "Call me" to reach the team rather than an AI dialer that reported calls it never placed.
 *
 * SECURITY: no tool takes an enrollment, lead or visitor id from the model. The caller (mayaReplyService.ts) binds every
 * call to the sender of the triggering DM.
 */

/** The deep link the chat dock turns into the booking sheet (frontend ChatDock + BookCallHost read the same string). */
export const BOOK_CALL_PATH = '/portal/campus?book=call';
export const BOOK_CALL_LINK = `[Book a call with admissions](${BOOK_CALL_PATH})`;

export const MAYA_PORTAL_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'retrieve_knowledge',
      description:
        'Search the admissions knowledge base for program facts: plans, pricing, what membership includes, curriculum, ' +
        'logistics. Use it before stating any fact you are not given in the instructions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look up' },
          category: {
            type: 'string',
            enum: ['program', 'curriculum', 'pricing', 'outcomes', 'enterprise', 'logistics', 'faq', 'sponsorship'],
            description: 'Optional category to narrow the search',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_admissions_call',
      description:
        'The learner wants to book a call or meeting with the admissions team. This gives them the booking calendar, where ' +
        'they pick a time themselves. It does not book anything on its own, so never say a call is booked.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_callback',
      description:
        'The learner wants someone from admissions to phone them ("call me", "have someone call me"). Records the request ' +
        'for the admissions team. Uses the phone on their account unless they gave one in this conversation.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Only a phone number the learner typed in this conversation. Never invent one.' },
          preferred_time: { type: 'string', description: 'When they would like the call, in their own words, if they said.' },
        },
      },
    },
  },
];

const NAMES = new Set(MAYA_PORTAL_TOOLS.map((t) => (t.type === 'function' ? t.function.name : '')).filter(Boolean));
export function isMayaPortalTool(name: string): boolean {
  return NAMES.has(name);
}

export interface MayaPortalToolContext {
  /** The sender of the triggering DM: the only person any tool acts for. */
  senderEnrollmentId: string;
}

/** What the model is told after request_callback: plain facts, so it can only confirm what really happened. */
export function callbackResultText(r: CallbackOutcome): string {
  switch (r.status) {
    case 'requested':
      return JSON.stringify({ recorded: true, phone_last4: r.phoneLast4, note: 'The admissions team will call this number. Do not promise a time.' });
    case 'already_requested':
      return JSON.stringify({ recorded: true, already_requested_today: true, phone_last4: r.phoneLast4, note: 'A request from today already exists; no second one was made.' });
    case 'needs_phone':
      return JSON.stringify({ recorded: false, reason: 'no_phone_on_file', note: 'Ask the learner for the best phone number, then call request_callback again with it.' });
    case 'invalid_phone':
      return JSON.stringify({ recorded: false, reason: 'invalid_phone', note: 'That did not look like a phone number. Ask them to type it again, with the area code.' });
    case 'not_found':
      return JSON.stringify({ recorded: false, reason: 'account_not_found', note: 'Say you could not record it and suggest booking a call instead.' });
    default:
      return JSON.stringify({ recorded: false, reason: 'technical_error', note: 'Say honestly that you could not record the request just now and offer the booking calendar.' });
  }
}

export async function executeMayaPortalTool(name: string, args: Record<string, unknown>, ctx: MayaPortalToolContext): Promise<string> {
  try {
    if (name === 'retrieve_knowledge') {
      const query = typeof args.query === 'string' ? args.query.slice(0, 300) : '';
      const category = typeof args.category === 'string' ? args.category : undefined;
      const { retrieveKnowledgeContent } = await import('../mayaToolsService');
      const r = await retrieveKnowledgeContent({ query, category }, '', '');
      return JSON.stringify({ ok: r.success, result: r.summary });
    }
    if (name === 'book_admissions_call') {
      return JSON.stringify({ offered: true, link: BOOK_CALL_LINK, note: 'The link opens the booking calendar. Nothing is booked until they pick a time.' });
    }
    if (name === 'request_callback') {
      const r = await requestPortalCallback({
        enrollmentId: ctx.senderEnrollmentId,
        phone: typeof args.phone === 'string' ? args.phone : null,
        preferredTime: typeof args.preferred_time === 'string' ? args.preferred_time : null,
      });
      return callbackResultText(r);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (e: any) {
    console.warn(JSON.stringify({
      level: 'warn', service: 'maya', event: 'portal_tool_failed', outcome: 'failure',
      error_class: e?.name || 'Error', context: { tool: name }, message: String(e?.message || e),
    }));
    return JSON.stringify({ error: 'tool_failed', note: 'Say honestly that this did not work just now.' });
  }
}
