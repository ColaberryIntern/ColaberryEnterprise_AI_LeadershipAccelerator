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

/**
 * Detects mail that arrived via the Hotmail->Gmail forward rule Ali set up
 * 2026-06-03. The Microsoft forwarder preserves the original From; the only
 * tell-tales are recipient-chain headers showing ali_muwwakkil@hotmail.com.
 * We check Delivered-To, X-Original-To, and the To/Cc address list.
 */
function isForwardedFromHotmail(email: NormalizedEmail): boolean {
  const hotmailAddr = 'ali_muwwakkil@hotmail.com';
  const headers = email.headers || {};
  const headerEntries = Object.entries(headers).map(([k, v]) => `${k.toLowerCase()}: ${String(v).toLowerCase()}`).join('\n');
  if (headerEntries.includes(hotmailAddr)) return true;
  const toAddrs = (email.to_addresses || []).map((a: any) => (typeof a === 'string' ? a : a?.email || a?.address || '').toLowerCase());
  const ccAddrs = (email.cc_addresses || []).map((a: any) => (typeof a === 'string' ? a : a?.email || a?.address || '').toLowerCase());
  if (toAddrs.includes(hotmailAddr) || ccAddrs.includes(hotmailAddr)) return true;
  return false;
}

interface NormalizedEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: any[];
  cc_addresses: any[];
  subject: string;
  body_text: string | null;
  headers: any;
}

/**
 * True when a Basecamp notification is a person directly tagging or assigning
 * Ali — an @mention or a to-do assignment — rather than project-management
 * noise. Basecamp encodes both directly in the subject:
 *   "<Name> @mentioned you in <thing>"      (someone tagged Ali)
 *   "<Name> assigned you: <to-do title>"    (someone assigned Ali a to-do)
 * These are a person asking Ali to act and must reach the inbox. Everything
 * else from Basecamp is automation: recurring check-in prompts ("What are you
 * working on today?", "Post links of Tasks worked on today") and status pings
 * ("<Name> completed a to-do") deliberately do NOT match.
 */
export function isBasecampDirectMention(email: { from_address: string; subject: string | null }): boolean {
  const isBasecamp = /3\.basecamp\.com/i.test(email.from_address || '');
  if (!isBasecamp) return false;
  return /@mentioned you|assigned you/i.test(email.subject || '');
}

/**
 * True when a Basecamp *comment* notification (a "Re: ..." thread reply) is
 * directly addressed to Ali by name, even without a formal @mention — e.g.
 * "Hi Ali, can you review this?" or a line that opens with "Ali,". These are
 * someone asking Ali to act and must reach the inbox.
 *
 * We must NOT route every subscribed-thread comment to the inbox: most are
 * intern/teammate status updates Ali merely follows (re-flooding the inbox is
 * exactly what the COS exists to prevent), and Basecamp stamps "...sent to Ali
 * Muwwakkil, ..." into the footer of EVERY email — so a bare "Ali" substring is
 * not a signal. We anchor strictly on a greeting verb + "Ali", a line opening
 * with "Ali,"/"Ali:", or an inline "@Ali", none of which the footer satisfies.
 * Formal @mentions/assignments are handled by isBasecampDirectMention (subject).
 */
export function isBasecampDirectComment(email: {
  from_address: string;
  subject: string | null;
  body_text: string | null;
}): boolean {
  const isBasecamp = /3\.basecamp\.com/i.test(email.from_address || '');
  if (!isBasecamp) return false;
  if (!/\bre:/i.test(email.subject || '')) return false; // comment replies only
  const body = email.body_text || '';
  const greetingToAli = /\b(hi|hello|hey|dear|thanks|thank you|good (?:morning|afternoon|evening))[,!\s]+ali\b/i;
  const lineLeadingAli = /(^|\n)\s*ali\s*[,:]/i;
  const inlineAtMention = /@ali\b/i;
  return greetingToAli.test(body) || lineLeadingAli.test(body) || inlineAtMention.test(body);
}

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
    /^ali,\s+here'?s\s+/i.test(email.subject || '');
  if (isColaberrySystemSender && isCorySubject) {
    const reason = 'Cory briefing / Inbox COS digest - keep in INBOX';
    console.log(`${LOG_PREFIX} Cory/InboxCOS report: ${reason}`);
    return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0b. System Alert Emails → AUTOMATION ---
  if (fromLower.includes('ali@colaberry.com') && /^\[alert\]/i.test(email.subject || '')) {
    const reason = 'System-generated alert email (self-sent [Alert])';
    console.log(`${LOG_PREFIX} System alert: ${reason}`);
    return { matched: true, state: 'AUTOMATION', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
  }

  // --- 0c. Basecamp @mention / to-do assignment → INBOX ---
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

  // --- 0d. Basecamp comment reply that addresses Ali by name → INBOX ---
  // A thread comment that greets/addresses Ali directly ("Hi Ali, ...") is
  // someone asking him to act, even without a formal @mention. Subscribed-thread
  // status updates that do NOT address Ali stay automation (see helper for the
  // anti-flood reasoning and why the BC footer does not trigger this).
  if (isBasecampDirectComment(email)) {
    const reason = 'Basecamp comment directly addresses Ali by name';
    console.log(`${LOG_PREFIX} Basecamp direct comment: ${reason}`);
    return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
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
    /@(3\.basecamp\.com|tc\.rocketmortgage\.com|zoom\.us|dart\.org|opentable\.com|substack\.com|lyftmail\.com|nextdoor\.com|otter\.ai|mailchimp\.com|sendgrid\.net|amazonses\.com)$/i;
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
  const priorityKeywords = ['daycare', 'sports league', 'parent teacher', 'pta', 'field trip'];
  for (const keyword of priorityKeywords) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    if (wordBoundaryRegex.test(email.subject) || wordBoundaryRegex.test(email.body_text || '')) {
      const reason = `Contains priority keyword: ${keyword}`;
      console.log(`${LOG_PREFIX} Keyword match: ${reason}`);
      return { matched: true, state: 'INBOX', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
    }
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

/**
 * Evaluates a single condition against an email.
 */
function evaluateCondition(
  condition: { field: string; operator: string; value: string },
  email: NormalizedEmail,
  fromLower: string,
  subjectLower: string,
  bodyLower: string,
  headers: any
): boolean {
  const { field, operator, value } = condition;
  if (!field || !operator || value === undefined) return false;

  let target: string;
  switch (field) {
    case 'from':
      target = fromLower;
      break;
    case 'subject':
      target = subjectLower;
      break;
    case 'body':
      target = bodyLower;
      break;
    case 'header': {
      // For header conditions, check if any header key/value matches
      const headerEntries = Object.entries(headers);
      const valueLower = value.toLowerCase();
      target = headerEntries
        .map(([k, v]) => `${k.toLowerCase()}: ${String(v).toLowerCase()}`)
        .join('\n');
      return applyOperator(operator, target, valueLower);
    }
    default:
      return false;
  }

  return applyOperator(operator, target, value.toLowerCase());
}

/**
 * Applies a comparison operator to a target string and value.
 */
function applyOperator(operator: string, target: string, value: string): boolean {
  switch (operator) {
    case 'contains':
      return target.includes(value);
    case 'equals':
      return target === value;
    case 'starts_with':
      return target.startsWith(value);
    case 'regex':
      try {
        const regex = new RegExp(value, 'i');
        return regex.test(target);
      } catch {
        console.error(`${LOG_PREFIX} Invalid regex in rule condition: ${value}`);
        return false;
      }
    default:
      console.warn(`${LOG_PREFIX} Unknown operator: ${operator}`);
      return false;
  }
}
