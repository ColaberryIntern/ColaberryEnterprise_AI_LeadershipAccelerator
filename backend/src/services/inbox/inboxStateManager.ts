/**
 * Inbox State Manager — Central orchestrator and main pipeline entry point.
 * Classifies unprocessed emails via hard rules then LLM, dispatches by state.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import InboxEmail from '../../models/InboxEmail';
import InboxClassification, { ClassificationState } from '../../models/InboxClassification';
import { evaluateHardRules } from './hardRuleEngine';
import { classifyWithLLM } from './llmClassificationService';
import { logAuditEvent } from './inboxAuditService';
import { archiveEmail } from './autoArchiveService';

const LOG_PREFIX = '[InboxCOS][StateManager]';

interface ProcessResult {
  processed: number;
  breakdown: Record<string, number>;
}

/**
 * Processes all unclassified emails through the classification pipeline.
 * Hard rules run first (deterministic), then LLM for anything unmatched.
 */
export async function processNewEmails(): Promise<ProcessResult> {
  const breakdown: Record<string, number> = {
    INBOX: 0,
    AUTOMATION: 0,
    SILENT_HOLD: 0,
    ASK_USER: 0,
  };

  // Fetch emails that have no classification yet
  const unclassified = await sequelize.query<InboxEmail>(
    `SELECT ie.*
     FROM inbox_emails ie
     LEFT JOIN inbox_classifications ic ON ie.id = ic.email_id
     WHERE ic.id IS NULL
     ORDER BY ie.received_at ASC
     LIMIT 100`,
    { type: QueryTypes.SELECT, model: InboxEmail, mapToModel: true }
  );

  if (unclassified.length === 0) {
    console.log(`${LOG_PREFIX} No unclassified emails to process`);
    return { processed: 0, breakdown };
  }

  console.log(`${LOG_PREFIX} Processing ${unclassified.length} unclassified emails`);

  let processed = 0;

  for (const email of unclassified) {
    try {
      const emailData = {
        id: email.id,
        from_address: email.from_address,
        from_name: email.from_name,
        to_addresses: email.to_addresses || [],
        cc_addresses: email.cc_addresses || [],
        subject: email.subject,
        body_text: email.body_text,
        headers: email.headers || {},
      };

      let state: ClassificationState;
      let confidence: number;
      let classifiedBy: string;
      let ruleId: string | null = null;
      let reasoning: string;
      let replyNeeded = false;

      // Step 1: Try hard rules first
      const hardResult = await evaluateHardRules(emailData);

      if (hardResult.matched && hardResult.state) {
        state = hardResult.state;
        confidence = 100;
        classifiedBy = 'hard_rule';
        ruleId = hardResult.rule_id || null;
        reasoning = hardResult.reason || 'Matched hard rule';
      } else {
        // Step 2: Fall back to LLM classification
        const llmResult = await classifyWithLLM(emailData);
        state = llmResult.suggested_state;
        confidence = llmResult.confidence;
        classifiedBy = 'llm';
        reasoning = llmResult.reasoning;
        replyNeeded = llmResult.reply_needed;
      }

      // Step 3: Create classification record
      await InboxClassification.create({
        email_id: email.id,
        state,
        confidence,
        classified_by: classifiedBy,
        rule_id: ruleId,
        reasoning,
        reply_needed: replyNeeded,
        classified_at: new Date(),
      });

      // Step 4: Log audit event
      await logAuditEvent({
        email_id: email.id,
        action: 'classified',
        new_state: state,
        confidence,
        reasoning,
        actor: classifiedBy,
        metadata: {
          rule_id: ruleId,
          reply_needed: replyNeeded,
          provider: email.provider,
          from: email.from_address,
          subject: email.subject,
        },
      });

      // Step 4b: Detect unsubscribe replies and process opt-out
      // Inbox COS sees Gmail/IMAP replies that bypass the Mandrill webhook handler.
      // Without this, leads who reply "unsubscribe" stay in the active queue.
      try {
        const bodyLower = (email.body_text || '').toLowerCase().trim();
        const subjectLower = (email.subject || '').toLowerCase().trim();
        const unsubKeywords = ['unsubscribe', 'remove me', 'opt out', 'opt-out', 'take me off', 'no more emails', 'stop emailing', 'don\'t email', 'dont email', 'don\'t contact', 'dont contact'];
        const subjectIsUnsub = /^(re:\s*)?unsubscribe\b/i.test(email.subject || '');
        const bodyHasUnsub = unsubKeywords.some(kw => bodyLower.includes(kw));
        if (subjectIsUnsub || bodyHasUnsub) {
          const { Lead } = require('../../models');
          const lead = await Lead.findOne({
            where: sequelize.where(sequelize.fn('LOWER', sequelize.col('email')), email.from_address.toLowerCase()),
          });
          if (lead) {
            const { processOptOut } = require('../unsubscribeEnforcementService');
            const reason = subjectIsUnsub
              ? `Inbox unsubscribe reply (subject): "${(email.subject || '').substring(0, 100)}"`
              : `Inbox unsubscribe reply (body): "${bodyLower.substring(0, 100)}"`;
            await processOptOut(lead.id, 'email', reason, 'inbox_reply');
            console.log(`${LOG_PREFIX} Auto-unsubscribed lead ${lead.id} (${email.from_address}) via Inbox COS`);
          }
        }
      } catch (unsubErr: any) {
        console.warn(`${LOG_PREFIX} Unsub detection failed for ${email.id}: ${unsubErr.message}`);
      }

      // Step 5: SMS alerts (VIP + urgent keywords)
      try {
        const sms = require('./smsAlertService');
        // VIP alert
        if (classifiedBy === 'hard_rule' && reasoning.includes('VIP sender')) {
          await sms.alertVipEmail(email.from_name || email.from_address, email.subject, email.provider);
        }
        // Urgent keyword alert
        const urgentKw = sms.detectUrgentKeywords(email.subject, email.body_text);
        if (urgentKw && state === 'INBOX') {
          await sms.alertUrgentEmail(email.from_name || email.from_address, email.subject, urgentKw);
        }
      } catch {}

      // Step 5b: Detect meeting requests — flag for slot inclusion in draft
      try {
        const { detectMeetingIntent } = require('./calendarIntelligenceService');
        if (state === 'INBOX' && detectMeetingIntent(email.subject, email.body_text)) {
          replyNeeded = true;
          (email as any)._meetingRequest = true;
        }
      } catch {}

      // Step 6: Dispatch by state
      await dispatchByState(state, email, replyNeeded, ruleId);

      breakdown[state] = (breakdown[state] || 0) + 1;
      processed++;
    } catch (error: any) {
      console.error(
        `${LOG_PREFIX} Failed to process email ${email.id}: ${error.message}`
      );
      // Continue processing remaining emails — one failure should not halt the pipeline
    }
  }

  console.log(
    `${LOG_PREFIX} Processed ${processed}/${unclassified.length} emails | ` +
    `INBOX=${breakdown.INBOX} AUTOMATION=${breakdown.AUTOMATION} ` +
    `SILENT_HOLD=${breakdown.SILENT_HOLD} ASK_USER=${breakdown.ASK_USER}`
  );

  return { processed, breakdown };
}

/**
 * Dispatches an email based on its classification state.
 */
async function dispatchByState(
  state: ClassificationState,
  email: InboxEmail,
  replyNeeded: boolean,
  ruleId: string | null = null
): Promise<void> {
  switch (state) {
    case 'INBOX':
      if (replyNeeded) {
        try {
          // Dynamic import to avoid circular dependencies
          const { generateDraft } = await import('./replyDraftService');
          await generateDraft(email.id);
          console.log(`${LOG_PREFIX} Generated reply draft for email ${email.id}`);
        } catch (error: any) {
          console.error(`${LOG_PREFIX} Failed to generate draft for ${email.id}: ${error.message}`);
        }
      }
      break;

    case 'AUTOMATION': {
      // Cora auto-replies to support@colaberry.com inquiries before archiving.
      // For mail Cora cannot fully resolve (out-of-scope legacy bootcamp/billing/
      // support questions, refunds, complaints, partnerships, send/generation
      // failures), she only acknowledges — so the email must NOT be archived;
      // route it to the human INBOX instead, or the promised follow-up never
      // reaches a person. See coraAgentService.decideCoraDisposition.
      let keepForHuman = false;
      let handoffReason: string | undefined;
      if (ruleId === 'cora_0c') {
        try {
          const { handleCoraInquiry } = await import('./coraAgentService');
          const result = await handleCoraInquiry(email as any);
          if (result && result.archive === false) {
            keepForHuman = true;
            handoffReason = result.handoffReason;
          }
        } catch (error: any) {
          // Cora threw unexpectedly — keep the email for a human rather than burying it.
          console.error(`${LOG_PREFIX} Cora reply failed for ${email.id}: ${error.message}`);
          keepForHuman = true;
          handoffReason = 'cora_unhandled_error';
        }
      }

      if (keepForHuman) {
        await reclassifyToInboxForHuman(email.id, handoffReason);
        break; // do NOT archive — leave it visible in the human INBOX
      }

      try {
        await archiveEmail({
          id: email.id,
          provider: email.provider,
          provider_message_id: email.provider_message_id,
        });
      } catch (error: any) {
        // archiveEmail already handles its own error logging
        console.error(`${LOG_PREFIX} Archive dispatch failed for ${email.id}: ${error.message}`);
      }
      break;
    }

    case 'ASK_USER':
      // No immediate action — collected by digest service on a 4-hour interval
      break;

    case 'SILENT_HOLD':
      // No action — email is stored and accessible but not surfaced
      break;

    default:
      console.warn(`${LOG_PREFIX} Unknown classification state: ${state} for email ${email.id}`);
  }
}

/**
 * Re-route an email Cora could not fully resolve from AUTOMATION to INBOX (the
 * human-visible queue) instead of archiving it. Without this, an out-of-scope or
 * handoff reply ("the team will follow up") would be archived and no human would
 * ever see it. Updates the existing classification row in place — the email is
 * never reprocessed (processNewEmails only picks up rows with NO classification),
 * so this is idempotent. Best-effort: a failure here is logged, never thrown.
 */
async function reclassifyToInboxForHuman(emailId: string, reason?: string): Promise<void> {
  try {
    const existing = await InboxClassification.findOne({ where: { email_id: emailId } });
    const previous = existing?.state ?? 'AUTOMATION';
    if (previous === 'INBOX') return; // already human-visible — nothing to do

    await InboxClassification.update(
      {
        state: 'INBOX',
        previous_state: previous,
        overridden_at: new Date(),
        reply_needed: true,
        reasoning: `Cora handed off to human review (${reason || 'unresolved'})`,
      },
      { where: { email_id: emailId } }
    );

    await logAuditEvent({
      email_id: emailId,
      action: 'cora_routed_to_human',
      old_state: previous,
      new_state: 'INBOX',
      actor: 'cora',
      reasoning: reason,
      metadata: { handoff_reason: reason },
    });

    console.log(`${LOG_PREFIX} Cora routed email ${emailId} to human INBOX (${reason || 'unresolved'})`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Failed to reroute ${emailId} to human INBOX: ${error.message}`);
  }
}
