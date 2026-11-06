import Enrollment from '../../models/Enrollment';
import { MAYA_ADMISSIONS_VOICE } from '../admissionsMayaService';
import { buildKnowledgeContext } from '../admissionsKnowledgeService';
import { pricingPitchRule } from '../admissionsPricing';

/**
 * C121 — Maya's system prompt for the portal's shared chat: the same admissions voice as her site chat
 * (MAYA_ADMISSIONS_VOICE), adapted for a SIGNED-IN learner. Their name and email come from their enrollment, so she never
 * asks for them; the price comes from the pricing rule of record (admissionsPricing.ts); program facts come from the
 * gated knowledge base, matched on the message that triggered this reply and searchable with retrieve_knowledge.
 *
 * Never throws: a failed enrollment or knowledge lookup is logged and the prompt is built without that block. The
 * knowledge block, when it does build, is appended unconditionally because an empty result carries its own
 * "no sourced answer" instruction (see buildKnowledgeContext).
 */

function warn(event: string, e: any): void {
  console.warn(JSON.stringify({
    level: 'warn', service: 'maya', event, outcome: 'failure', error_class: e?.name || 'Error', message: String(e?.message || e),
  }));
}

async function learnerBlock(enrollmentId: string): Promise<string> {
  try {
    const e = await Enrollment.findByPk(enrollmentId, { attributes: ['id', 'full_name', 'email', 'phone'] });
    if (!e) return 'LEARNER: their account details could not be loaded. Do not ask for their name or email; it is their own account.';
    const digits = String(e.phone || '').replace(/\D/g, '');
    const phoneLine = digits.length >= 10 ? `a phone number ending in ${digits.slice(-4)} is on their account` : 'no phone number is on their account';
    return `LEARNER (from their account; never ask for these): name ${e.full_name || 'not set'}, email ${e.email || 'not set'}; ${phoneLine}.`;
  } catch (err: any) {
    warn('portal_prompt_learner_lookup_failed', err);
    return 'LEARNER: their account details could not be loaded. Do not ask for their name or email; it is their own account.';
  }
}

async function knowledgeBlock(message: string): Promise<string> {
  if (!message.trim()) return '';
  try {
    return await buildKnowledgeContext(message.slice(0, 500));
  } catch (err: any) {
    warn('portal_prompt_knowledge_failed', err);
    return '';
  }
}

export async function buildMayaPortalSystemPrompt(senderEnrollmentId: string, triggeringMessage: string): Promise<string> {
  const [learner, knowledge] = await Promise.all([learnerBlock(senderEnrollmentId), knowledgeBlock(triggeringMessage)]);
  return [
    'You are Maya, Director of Admissions at Colaberry Enterprise AI Division, answering a direct message inside the Colaberry portal.',
    MAYA_ADMISSIONS_VOICE,
    'This person is already signed in to the portal: they have an account, so do not collect contact details, do not ask for their name or email, and do not pitch them as a stranger.',
    learner,
    `PRICING RULE: ${pricingPitchRule()}`,
    knowledge,
    [
      'WHAT YOU CAN DO HERE (and nothing else):',
      '- retrieve_knowledge: look up plans, pricing and program facts. Never state a price, date or seat count you did not get from the pricing rule above or a tool.',
      '- book_admissions_call: when they want to book a call or meeting with admissions. It gives them the booking calendar link; include that link in your reply exactly as the tool returns it. Nothing is booked until they pick a time, so never say a call is booked.',
      '- request_callback: when they want someone to phone them. If it returns recorded:true, confirm and mention the number ending in phone_last4. If it asks for a phone, ask for it in one short sentence. If it returns recorded:false for any other reason, say plainly you could not record it and offer the booking link instead.',
      'You cannot place phone calls yourself, send texts, send emails or documents, or enroll anyone. If they ask, say so and offer the booking calendar or a callback.',
    ].join('\n'),
    'RULES: Never say anything costs nothing or is without charge; the only approved wording is "no card needed" or "$0 to start". Use American spelling. Never claim an action you did not take or a result a tool did not return. You are an AI and say so if it is relevant. Keep replies short: two to four sentences unless they ask for detail. Plain text only, no headings.',
  ].filter(Boolean).join('\n\n');
}
