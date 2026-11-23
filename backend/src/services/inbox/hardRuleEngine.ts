import InboxVip from '../../models/InboxVip';
import InboxRule from '../../models/InboxRule';
import { countPriorEmailsFromSender } from './senderHistory';

const LOG_PREFIX = '[InboxCOS][HardRule]';

interface HardRuleResult {
  matched: boolean;
  state?: 'INBOX' | 'AUTOMATION';
  rule_id?: string;
  reason?: string;
  classified_by?: string;
  forwarded_from_hotmail?: boolean;
}

import {
  NormalizedEmail,
  isForwardedFromHotmail,
  isBasecampSender,
  isSlackSender,
  isSchoolNotificationSender,
  isAccountSecurityMail,
  hasOperationalAlertHeader,
  isVendorOperationalAlert,
  isFinancialApplicationMail,
  isRecurringEventReminder,
  isBasecampDirectMention,
  isBasecampDirectComment,
  isForumProjectAlert,
} from './hardRuleMatchers';
import { evaluateCondition } from './userRuleConditions';

// Re-exported so callers and tests that import matchers from the engine keep working.
export {
  isBasecampSender,
  isSlackSender,
  isSchoolNotificationSender,
  isAccountSecurityMail,
  hasOperationalAlertHeader,
  isVendorOperationalAlert,
  isFinancialApplicationMail,
  isRecurringEventReminder,
  isBasecampDirectMention,
  isBasecampDirectComment,
  isForumProjectAlert,
};

/**
 * Deterministic classification engine. Evaluates hard-coded rules and
 * user-defined rules in strict priority order. No LLM, no external calls.
 */
export async function evaluateHardRules(email: NormalizedEmail): Promise<HardRuleResult> {
  const fromLower = email.from_address.toLowerCase();
  const subjectLower = (email.subject || '').toLowerCase();
  const bodyLower = (email.body_text || '').toLowerCase();
  const headers = email.headers || {};
  const forwardedFromHotmail = isForwardedFromHotmail(email);
  const fwdSuffix = forwardedFromHotmail ? ' (forwarded from Hotmail)' : '';

  // --- 00. Operational health alerts → INBOX, ahead of every other rule ---
  // FIRST on purpose. This is the alert that tells us the alerting is broken,
  // so it outranks everything, including any rule added after it. 0c already
  // sends self-sent "[Alert]" mail to AUTOMATION; these alerts come from a
  // person's mailbox with a "[CRITICAL]" subject and would not match 0c today,
  // but putting this above the whole chain means no future rule can quietly
  // start swallowing them either. See hasOperationalAlertHeader for the
  // 2026-10-01 incident this closes.
  if (hasOperationalAlertHeader(headers)) {
    const reason = 'Operational health alert (X-Cora-Alert) - never archive';
    console.log(`${LOG_PREFIX} Health alert: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'operational_alert_00', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 00b. A VENDOR saying one of our systems is broken → INBOX ---
  // Immediately after 00 and for the same reason, except 00 only covers alerts
  // we send ourselves: it matches a header we stamp on. A vendor cannot stamp
  // our header, so Twilio's "account is suspended" and its fifteen error alarms
  // fell to sections 4 and 5 and were archived unread for six days while every
  // outbound call failed. See isVendorOperationalAlert for that incident.
  if (isVendorOperationalAlert(email.subject)) {
    const reason = 'Vendor operational alert (service degraded/suspended) - never archive';
    console.log(`${LOG_PREFIX} Vendor alert: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'vendor_operational_alert_00b', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0i. A financial/insurance application waiting on Ali → INBOX ---
  // Early, alongside the other 0-series keeps, because the cost of archiving one
  // of these is a stalled underwriting file nobody knows is stalled. See
  // isFinancialApplicationMail for the Protective Life case this closes.
  if (isFinancialApplicationMail(email.subject, email.body_text)) {
    const reason = 'Financial/insurance application awaiting action - keep visible';
    console.log(`${LOG_PREFIX} Application mail: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'financial_application_0i', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0a. Cory + Inbox COS system emails → INBOX (keep visible) ---
  // Cory's daily/weekly briefings and the Inbox COS decision digests are sent
  // FROM info@colaberry.com (not ali@colaberry.com). The prior version of this
  // rule checked the wrong From and never matched, so every Cory briefing was
  // falling through to the LLM classifier, getting tagged AUTOMATION, and
  // auto-archived. Caught 2026-06-02 after Ali noticed they were missing.
  const isColaberrySystemSender =
    fromLower.includes('info@colaberry.com') ||
    fromLower.includes('ali@colaberry.com');
  const isCorySubject =
    subjectLower.includes('weekly report') ||
    subjectLower.includes('daily report') ||
    subjectLower.includes('cory') ||
    subjectLower.includes('inbox cos') ||
    subjectLower.includes("here's what happened today") ||
    subjectLower.includes("here's your week in review") ||
    /^ali,\s+here'?s\s+/i.test(email.subject || '') ||
    // Morning Five (sendMorningFive.js -> morningFiveEmail.subjectFor): "Your ten for Thu, Nov 12: ...".
    // Self-sent, so without this it fell to the LLM as AUTOMATION and the first send went to
    // Trash before Ali saw it (12 Nov 2026).
    /^(\[test\]\s*)?your ten for /i.test(email.subject || '');
  if (isColaberrySystemSender && isCorySubject) {
    const reason = 'Cory briefing / Inbox COS digest - keep in INBOX';
    console.log(`${LOG_PREFIX} Cory/InboxCOS report: ${reason}`);
    return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0b. Cora support inbox → route to Cora auto-reply agent ---
  // Emails delivered to support@colaberry.com are forwarded to Ali's Gmail.
  // We detect them by checking To/Cc/Delivered-To/X-Original-To headers ONLY.
  // Classified AUTOMATION so they're archived after Cora sends the reply.
  // The inboxStateManager dispatches to coraAgentService before archiving.
  //
  // 2026-07-14 mail-loop incident (BC #10095332194): this used to also
  // substring-match support@colaberry.com against a blob of EVERY header
  // joined together. Cora's own outgoing replies carry
  // `From: Cora (Colaberry Enterprise AI) <support@colaberry.com>` — that
  // header alone satisfied the old check, so once her reply landed back in
  // the synced mailbox (see inboxSyncService's Sent-folder exclusion fix),
  // she matched her own rule and replied to herself, forever. Fixed by (a)
  // checking only the headers that legitimately indicate delivery TO
  // support@ (never From/Reply-To/anything else), and (b) an explicit guard
  // that a message FROM Cora's own sending address can never match.
  const coraSupportAddress = (process.env.CORA_SUPPORT_ADDRESS || 'support@colaberry.com').toLowerCase();
  const toAddrs = (email.to_addresses || []).map((a: any) =>
    (typeof a === 'string' ? a : a?.email || a?.address || '').toLowerCase()
  );
  const ccAddrs2 = (email.cc_addresses || []).map((a: any) =>
    (typeof a === 'string' ? a : a?.email || a?.address || '').toLowerCase()
  );
  const deliveredToHeader = String(
    headers['delivered-to'] ?? headers['Delivered-To'] ?? ''
  ).toLowerCase();
  const originalToHeader = String(
    headers['x-original-to'] ?? headers['X-Original-To'] ?? ''
  ).toLowerCase();
  const isFromCoraHerself = fromLower === coraSupportAddress;
  const isCoraInquiry =
    !isFromCoraHerself &&
    (toAddrs.includes(coraSupportAddress) ||
      ccAddrs2.includes(coraSupportAddress) ||
      deliveredToHeader.includes(coraSupportAddress) ||
      originalToHeader.includes(coraSupportAddress));

  if (isFromCoraHerself) {
    console.log(`${LOG_PREFIX} Skipping self-sent Cora message ${email.id} (from=${coraSupportAddress}) — loop guard`);
  }

  if (isCoraInquiry) {
    const reason = `Cora support inquiry — recipient is ${coraSupportAddress}`;
    console.log(`${LOG_PREFIX} Cora inquiry: ${reason}`);
    return {
      matched: true,
      state: 'AUTOMATION',
      rule_id: 'cora_0c',
      reason: reason + fwdSuffix,
      classified_by: 'hard_rule',
      forwarded_from_hotmail: forwardedFromHotmail,
    };
  }

  // --- 0c. System Alert Emails → AUTOMATION ---
  if (fromLower.includes('ali@colaberry.com') && /^\[alert\]/i.test(email.subject || '')) {
    const reason = 'System-generated alert email (self-sent [Alert])';
    console.log(`${LOG_PREFIX} System alert: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0d. Basecamp @mention / to-do assignment → INBOX ---
  // When someone tags Ali (@mention) or assigns him a to-do in Basecamp, that
  // is a person asking him to act — it must reach the inbox. Without this rule
  // the email skips the name check (Basecamp is an auto-notification sender,
  // see section 2) and then falls into the List-Unsubscribe rule below →
  // AUTOMATION → auto-archived, so Ali never sees the tag. Caught 2026-06-24
  // after week-1/2/3 todo mentions were silently routed to automation.
  if (isBasecampDirectMention(email)) {
    const reason = 'Basecamp @mention / to-do assignment directed at Ali';
    console.log(`${LOG_PREFIX} Basecamp direct action: ${reason}`);
    return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0e. Basecamp comment reply that addresses Ali by name → INBOX ---
  // A thread comment that greets/addresses Ali directly ("Hi Ali, ...") is
  // someone asking him to act, even without a formal @mention. Subscribed-thread
  // status updates that do NOT address Ali stay automation (see helper for the
  // anti-flood reasoning and why the BC footer does not trigger this).
  if (isBasecampDirectComment(email)) {
    const reason = 'Basecamp comment directly addresses Ali by name';
    console.log(`${LOG_PREFIX} Basecamp direct comment: ${reason}`);
    return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0f. Slack workspace mail → INBOX ---
  // Slack carries a List-Unsubscribe header, so every invite, account notice
  // and "new messages in <workspace>" digest fell into the List-Unsubscribe
  // rule below and was auto-archived. Ali never saw the NuOrg workspace invite
  // or the first messages from Shilpa and Luda (2026-09-16). Slack mail is a
  // person or a workspace asking him to act; it stays in the inbox. This sits
  // ahead of the VIP check on purpose: a VIP row would also route it to the
  // inbox, but VIP rows feed the vipInboxWatcher alert path, and a text for
  // every Slack digest is not wanted.
  if (isSlackSender(email.from_address)) {
    const reason = 'Slack workspace notification (invite, account, or new messages)';
    console.log(`${LOG_PREFIX} Slack: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'slack_0f', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0g. Account-security mail (reset / code / magic link) → INBOX ---
  // A password reset or one-time code is worthless the moment it is hidden:
  // it is user-initiated, expires in minutes, and blocks whatever Ali was
  // doing. Every one of these arrives from a noreply address, usually with a
  // List-Unsubscribe header, so sections 4 and 5 archived them wholesale —
  // 103 in the 90 days to 2026-09-28, including the ParentSquare reset Ali was
  // waiting on and eight Hetzner codes for the production VPS account. This
  // sits ahead of the VIP check and the LLM because neither helped: the LLM
  // independently tagged Ceipal's "Reset Password OTP" as automation.
  if (isAccountSecurityMail(email.subject)) {
    const reason = 'Account-security mail (password reset, verification code, or magic link)';
    console.log(`${LOG_PREFIX} Account security: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'account_security_0g', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0h. K-12 school platform mail → INBOX ---
  // Whether the kids' school reached Ali was previously decided by accident:
  // section 3's keyword list matched a ParentSquare daily digest only when the
  // words "pta" or "field trip" happened to land in that day's body, so the
  // Sep 24 and Sep 25 digests reached the inbox while the Sep 15 and Sep 16
  // ones — same sender, same kind of message — were archived. An absence
  // notification and the weekly grade updates were archived too. School mail
  // runs 1-3 messages a day, which is not enough volume to be worth filtering
  // against the cost of silently dropping one.
  if (isSchoolNotificationSender(email.from_address)) {
    const reason = 'K-12 school platform notification (ParentSquare / Wylie ISD)';
    console.log(`${LOG_PREFIX} School: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'school_0h', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 1. VIP Check ---
  try {
    const vip = await InboxVip.findOne({
      where: InboxVip.sequelize!.where(
        InboxVip.sequelize!.fn('LOWER', InboxVip.sequelize!.col('email_address')),
        fromLower
      ),
    });

    if (vip) {
      const reason = `VIP sender: ${vip.name || vip.email_address}`;
      console.log(`${LOG_PREFIX} VIP match: ${reason}`);
      return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} VIP lookup failed: ${error.message}`);
    // Continue to next rule — VIP check failure should not block classification
  }

  // --- 2. Name Check ---
  // Auto-notification senders include Ali's name in body as part of @-mentions,
  // recipient lists, assignment summaries — not because someone is addressing him.
  // Skip the name check for these domains. Also restrict the check to subject only,
  // since body matches over-fire on project-management noise.
  //
  // Cold-outreach platforms inject "Ali Muwwakkil" into subjects to bypass spam
  // filters (e.g. "Re: Ali Muwwakkil, Opportunity for Private Funding" from a
  // private-funding scam, 2026-06-09). Require the sender to have prior history
  // — known correspondents keep the legacy behavior, first-time senders fall
  // through to the LLM (which has its own first-time-sender penalty).
  const AUTO_NOTIFICATION_SENDERS =
    /@((?:[\w-]+\.)*basecamp\.com|tc\.rocketmortgage\.com|zoom\.us|dart\.org|opentable\.com|substack\.com|lyftmail\.com|nextdoor\.com|otter\.ai|mailchimp\.com|sendgrid\.net|amazonses\.com)$/i;
  const isAutoNotificationSender = AUTO_NOTIFICATION_SENDERS.test(email.from_address);
  const namePattern = /ali\s+muwwakkil/i;
  if (!isAutoNotificationSender && namePattern.test(email.subject)) {
    const priorCount = await countPriorEmailsFromSender(email.from_address, email.id);
    if (priorCount > 0) {
      const reason = `Directly addressed to Ali Muwwakkil (sender has ${priorCount} prior emails)`;
      console.log(`${LOG_PREFIX} Name match: ${reason}`);
      return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
    }
    console.log(`${LOG_PREFIX} Name match skipped — first-time sender, deferring to LLM`);
  }

  // --- 3. Keyword Check ---
  // 'school' was removed — Ali runs Colaberry's data school, so every internal
  // school-related email was triggering this. The remaining keywords are
  // unambiguously kid/family-related.
  // A multi-word keyword tolerates any separator between its words: schools
  // write "Parent/Teacher Conference" at least as often as "parent teacher",
  // and the old literal-space match missed every slashed and hyphenated form.
  const priorityKeywords = ['daycare', 'sports league', 'parent teacher', 'pta', 'field trip'];
  for (const keyword of priorityKeywords) {
    const escapedKeyword = keyword
      .split(' ')
      .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s/_-]+');
    const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    if (wordBoundaryRegex.test(email.subject) || wordBoundaryRegex.test(email.body_text || '')) {
      const reason = `Contains priority keyword: ${keyword}`;
      console.log(`${LOG_PREFIX} Keyword match: ${reason}`);
      return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
    }
  }

  // --- 3.4. Recurring event reminders with a countdown → AUTOMATION ---
  // DELIBERATELY PLACED HERE, not in the 0-series. Every rule above this one can
  // still rescue the mail: a VIP sender (1), Ali addressed by name by someone
  // who has written before (2), and the family keyword list (3) all win first.
  // So a reminder that genuinely matters can still reach him; what this kills is
  // the unattended weekly drip that was landing at random. See
  // isRecurringEventReminder for the coin-flip this replaces.
  if (isRecurringEventReminder(email.subject)) {
    const reason = 'Recurring event reminder (countdown notice)';
    console.log(`${LOG_PREFIX} Event reminder: ${reason}`);
    return { matched: true, state: 'AUTOMATION', rule_id: 'event_reminder_34', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 3.4b. School forum "New Project Alert" broadcasts → AUTOMATION ---
  // Same placement logic as 3.4: VIP, name and family-keyword rules still win
  // first. See isForumProjectAlert for the four-way coin flip this replaces.
  if (isForumProjectAlert(email.from_address, email.subject)) {
    const reason = 'School forum "New Project Alert" broadcast';
    console.log(`${LOG_PREFIX} Forum alert: ${reason}`);
    return { matched: true, state: 'AUTOMATION', rule_id: 'forum_project_alert_34b', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 3.5. P3 Noise Sender Hard List (Inbox Manager v1 Phase 1) ---
  // Hard-coded list per the section 3 plan on BC todo 9942229201.
  // Deterministically archives the senders Ali confirmed as pure noise.
  // Lives BEFORE the generic List-Unsubscribe rule so the audit log
  // shows "P3 noise sender: <domain>" instead of the generic header
  // reason — makes weekly stats + mistake auditing cleaner.
  //
  // The Skool sub-rule: noreply@skool.com is normally P3, but escalates
  // to INBOX when a P1 sender's name appears in the body (Ali approved
  // 2026-06-03). Implemented inline below.
  // Each entry matches "@<entry>" exactly OR "*.<entry>" (any subdomain).
  // Use the bare email-distribution domain (e.g. `email.nextdoor.com`) so all
  // sender subdomains (`rs.`, `is.`, `ss.`, future `xx.`) are covered without
  // having to enumerate each one.
  const P3_NOISE_SENDERS = [
    'deals.priceline.com', 'email.nextdoor.com',
    'marketing.lyftmail.com', 'vimeo.com',
    'noreply.bizjournals.com', 'news.bizjournals.com',
    'pipdecks.com', 'ifttt.com',
    'theinformation.com', 'substack.com',
    'notifications-economictimes.com', 'economictimesnews.com',
    'redditmail.com', 'mail.instagram.com',
    'skool.com',
    'match.indeed.com', 'indeed.com',
    'quora.com',
  ];
  const P1_NAMES_FOR_SKOOL_ESCALATION = [
    'ram', 'karun', 'luda', 'lakeesha', 'sai tejesh', 'jackie',
    'vivek', 'narendra', 'cora', 'sohail', 'aleem', 'swati', 'kes',
  ];
  const matchedP3Domain = P3_NOISE_SENDERS.find((d) => fromLower.endsWith('@' + d) || fromLower.endsWith('.' + d));
  if (matchedP3Domain) {
    // Skool escalation check: if a P1 sender's name is in the body, keep INBOX
    if (matchedP3Domain === 'skool.com') {
      const bodyMentionsP1 = P1_NAMES_FOR_SKOOL_ESCALATION.some((n) => bodyLower.includes(n));
      if (bodyMentionsP1) {
        const reason = `Skool email mentions a P1 sender in the body — keeping in INBOX`;
        console.log(`${LOG_PREFIX} Skool escalation: ${reason}`);
        return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
      }
    }
    const reason = `P3 noise sender: ${matchedP3Domain}`;
    console.log(`${LOG_PREFIX} P3 archive: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 4. Automation Header Check ---
  const headerKeys = Object.keys(headers);
  const hasListUnsubscribe = headerKeys.some(
    (key) => key.toLowerCase() === 'list-unsubscribe'
  );
  if (hasListUnsubscribe) {
    const reason = 'Has List-Unsubscribe header';
    console.log(`${LOG_PREFIX} Automation header: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 5. Noreply Check ---
  if (/no[-_.]?reply|do[-_.]?not[-_.]?reply/i.test(fromLower)) {
    const reason = 'Sent from noreply address';
    console.log(`${LOG_PREFIX} Noreply match: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 6. User-Defined Rules ---
  try {
    const rules = await InboxRule.findAll({
      where: { enabled: true },
      order: [['priority', 'ASC']],
    });

    for (const rule of rules) {
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
      if (conditions.length === 0) continue;

      const allMatch = conditions.every((condition: any) => {
        return evaluateCondition(condition, email, fromLower, subjectLower, bodyLower, headers);
      });

      if (allMatch) {
        const reason = `Matched rule: ${rule.name}`;
        console.log(`${LOG_PREFIX} User rule match: ${reason} (id=${rule.id})`);
        return {
          matched: true,
          state: rule.target_state as 'INBOX' | 'AUTOMATION',
          rule_id: rule.id,
          reason: reason + fwdSuffix,
          classified_by: 'hard_rule',
          forwarded_from_hotmail: forwardedFromHotmail,
        };
      }
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} User-defined rules lookup failed: ${error.message}`);
    // Continue — rule evaluation failure should not block classification
  }

  // --- 7. No Match ---
  console.log(`${LOG_PREFIX} No hard rule matched for email ${email.id}${fwdSuffix}`);
  return { matched: false, forwarded_from_hotmail: forwardedFromHotmail };
}
