import { env } from '../../config/env';
import { CommunicationLog, type Lead } from '../../models';
import { logCommunication } from '../communicationLogService';
import { redactForLogs } from '../../utils/piiRedaction';

/**
 * The Mandrill inbound auto-reply, out of `mandrillWebhookController.ts`
 * (Phase 5 T515).
 *
 * The controller is over the ceiling (635 lines), so the next change to it
 * splits before it adds: the auto-reply body - the Ali personal-outreach check,
 * the generated message, the send through nodemailer, the outbound log row -
 * is that file's block moved as it was (de-indented by six spaces inside this
 * function; nothing else changed), and the controller keeps its own try/catch
 * and the Explorer-routed skip around one call to this. The characterization
 * suite (`mandrillInboundAutoReply.characterization.test.ts`) passes byte-
 * identical on both sides of the move.
 *
 * WHAT THIS PATH IS. It sends via nodemailer WITHOUT messageValidatorService,
 * which is why the prompt below names no date, price or seat count
 * (`leadAutoReplyNoStaleFacts.test.ts` pins that, now against this file), and
 * why Explorer replies never reach it. Errors are the caller's: a throw here
 * is the controller's one warn line, and the webhook still answers 200.
 *
 * Growth Journey OS (Phase 5 T515): a lead the journey is mid-sequence with
 * (an open execution receipt) or one a human owns (an open ownership row)
 * never meets this reply - `journeyAutoReplySkip` answers first and fails closed.
 * It is required LAZILY, behind the master flag, for the reason the reply hook
 * is: this module is loaded by the webhook controllers, whose suites stub `env`
 * without a database URL, and the guard's import chain constructs the Sequelize
 * instance. With the master off - production today - nothing is required and
 * every existing campaign takes exactly the path it took before.
 */

export interface InboundAutoReplyArgs {
  lead: Lead;
  campaignId: string | null;
  body: string;
  subject: string;
  fromEmail: string;
  inReplyTo: string | null | undefined;
}

type JourneyAutoReplySkip = (leadId: number) => Promise<string | null>;

/** The journey's guard, only when the journey is on; a guard that cannot be loaded is a skip (fail closed), logged. */
async function journeyAutoReplySkipIfOn(leadId: number): Promise<string | null> {
  if (!env.growthJourney.growthJourneyEnabled) return null;
  let journeyAutoReplySkip: JourneyAutoReplySkip;
  try {
    ({ journeyAutoReplySkip } = require('../growthJourney/execution/autoReplyGuard') as { journeyAutoReplySkip: JourneyAutoReplySkip });
  } catch (err: unknown) {
    console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event: 'growth_journey.auto_reply_guard_unloadable', outcome: 'failure', error_class: (err as { name?: string })?.name || 'UnknownError', context: { lead_id: leadId } }));
    return 'guard_unavailable';
  }
  return journeyAutoReplySkip(leadId);
}

export async function sendInboundAutoReply(args: InboundAutoReplyArgs): Promise<void> {
  const { lead, campaignId, body, subject, fromEmail, inReplyTo } = args;
  const skip = await journeyAutoReplySkipIfOn(lead.id);
  if (skip) {
    console.log(JSON.stringify({ level: 'info', service: 'growth-journey', event: 'inbound_auto_reply_skipped', outcome: 'success', context: { lead_id: lead.id, reason: skip } }));
    return;
  }
  // Don't auto-reply to Ali personal outreach — Ali handles those personally
  const isAliOutreach = await CommunicationLog.findOne({
    where: { lead_id: lead.id, metadata: { trigger: 'ali_personal_outreach' } } as any,
  });
  if (!isAliOutreach) {
    const { generateMessage, buildConversationHistory } = require('../aiMessageService');
    const nodemailer = require('nodemailer');

    const conversationHistory = await buildConversationHistory(lead.id);
    const campaignRecord = campaignId ? await (require('../../models').Campaign.findByPk(campaignId)) : null;
    const senderName = campaignRecord?.settings?.sender_name || 'Dhee - Colaberry Enterprise AI';
    const senderEmail = campaignRecord?.settings?.sender_email || env.emailFrom;
    const replyDomain = env.mandrillInboundDomain || 'reply.colaberry.com';
    const replyToAddr = senderEmail.replace(/@[^@]+$/, '@' + replyDomain);

    const result = await generateMessage({
      channel: 'email',
      ai_instructions: [
        'You are responding to an inbound email reply from a lead.',
        'The lead said: "' + body.substring(0, 500) + '"',
        'Respond helpfully and specifically to what they asked or said.',
        // The instruction here used to read "mention the upcoming April 14
        // cohort". It shipped in spring and was still telling leads in
        // September about an "upcoming" cohort five months past — a
        // hardcoded fact in a prompt outlives the fact itself, and nothing
        // in the reply looks wrong, so nobody notices.
        //
        // NO DATE, PRICE OR SEAT COUNT MAY BE STATED HERE. This path sends
        // via nodemailer WITHOUT passing through messageValidatorService,
        // so nothing downstream checks what the model asserts. Until it
        // does, the only safe instruction is to name no such fact at all.
        'If they asked about pricing, suggest a strategy call to talk it through. Do NOT state a price, a cohort date, a start date, a deadline or a seat count — you do not have current figures, and a stale one is worse than none.',
        'If they expressed interest, acknowledge it warmly and offer to schedule a call.',
        'If they asked a question, answer it directly.',
        'Keep it concise (3-5 sentences). Be warm, professional, and helpful.',
        'Sign off as ' + senderName.split(' - ')[0] + '.',
      ].join('\n'),
      tone: 'warm',
      lead: { name: (lead as any).name, email: (lead as any).email, company: (lead as any).company, title: (lead as any).title } as any,
      conversationHistory,
    });

    if (result.body) {
      const replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;
      const mailer = nodemailer.createTransport({
        host: 'smtp.mandrillapp.com', port: 587, secure: false,
        auth: { user: 'apikey', pass: env.mandrillApiKey },
      });
      await mailer.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        replyTo: `"${senderName}" <${replyToAddr}>`,
        to: fromEmail,
        subject: replySubject,
        html: result.body,
      });

      await logCommunication({
        lead_id: lead.id,
        campaign_id: campaignId,
        channel: 'email',
        direction: 'outbound',
        delivery_mode: 'live',
        status: 'sent',
        to_address: fromEmail,
        from_address: senderEmail,
        subject: replySubject,
        body: result.body,
        provider: 'mandrill',
        metadata: { auto_reply: true, in_reply_to: inReplyTo || null },
      }).catch(() => {});

      console.log(`[MandrillInbound] Auto-replied to ${redactForLogs((lead as any).name)} (${redactForLogs(fromEmail)})`);
    }
  } else {
    console.log(`[MandrillInbound] Skipping auto-reply — Ali personal outreach (Ali handles personally)`);
  }
}
