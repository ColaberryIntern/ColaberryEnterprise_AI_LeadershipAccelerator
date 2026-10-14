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
 * Matches Basecamp's notification sender across domains. Basecamp 3 ("the new
 * Basecamp") sends from notifications@app.basecamp.com; 3.basecamp.com is the
 * legacy Basecamp Classic host. Match any basecamp.com subdomain so a future
 * sender host keeps working, anchored on @/./start so look-alikes
 * (e.g. notbasecamp.com) never match.
 *
 * Pinned 2026-06-29: the prior /3\.basecamp\.com/ check matched ONLY the legacy
 * host, so every real @mention/assignment from app.basecamp.com fell through to
 * the List-Unsubscribe rule and was auto-archived — Ali never saw Ram's SAM.gov
 * @mentions for a week. The 2026-06-24 fix and its tests both used the wrong
 * domain, so the tests stayed green while production stayed broken.
 */
export function isBasecampSender(fromAddress: string | null | undefined): boolean {
  // Require an @, allow any subdomain chain, and forbid a trailing domain label
  // so "basecamp.com.evil.io" / "x@notbasecamp.com" do not match.
  return /@(?:[\w-]+\.)*basecamp\.com(?![\w.-])/i.test((fromAddress || '').trim());
}

/**
 * True when the sender is Slack itself (workspace invites, account details,
 * "new messages from X in <workspace>" digests). Slack rotates per-message
 * no-reply-<token>@slack.com addresses for invites, so an exact-address VIP
 * entry cannot cover it; the domain is the stable identity. Same look-alike
 * guard as isBasecampSender.
 */
export function isSlackSender(fromAddress: string | null | undefined): boolean {
  return /@(?:[\w-]+\.)*slack\.com(?![\w.-])/i.test((fromAddress || '').trim());
}

/**
 * True when the sender is one of the K-12 platforms the kids' schools use.
 * ParentSquare mints a per-message donotreply+<uuid>@parentsquare.com sender
 * and Wylie ISD sends from do.not.reply@wylieisd.net, so both trip the noreply
 * rule (section 5) and were archived — 66 of them in the 90 days to 2026-09-28,
 * including two password resets Ali was actively waiting on. A rotating +<uuid>
 * local part cannot be covered by an address-level VIP row; the domain is the
 * stable identity. Same look-alike guard as isBasecampSender.
 *
 * Deliberately NOT a generic *.k12.*.us / Schoology / ClassDojo / PowerSchool
 * list: only domains that have actually mailed Ali belong here. Add one when
 * its mail shows up, not in anticipation.
 */
export function isSchoolNotificationSender(fromAddress: string | null | undefined): boolean {
  return /@(?:[\w-]+\.)*(?:parentsquare\.com|wylieisd\.net)(?![\w.-])/i.test((fromAddress || '').trim());
}

/**
 * True when the sender is Anthropic. Their mail reaches the inbox, always.
 *
 * WHY THIS IS HERE. Colaberry applied to the Claude Partner Network on
 * 2026-10-06. The previous attempt, a learning-path completion submitted
 * 2026-06-24 for eleven team members, returned an automated acknowledgement and
 * then nothing — and nobody noticed for three and a half months. The cost of a
 * reply to this one being archived is not an irritation, it is another quarter.
 *
 * A DOMAIN RULE IS RIGHT HERE, where a shape rule was right for account-security
 * mail (0g). The distinction is which half varies. Reset codes come from every
 * sender under the sun with a predictable shape, so shape is the stable thing.
 * Anthropic is one organisation whose mail could be a partner reply, an invoice,
 * a product notice or a person — the SENDER is the stable thing and the content
 * is not. Same reasoning as isBasecampSender and isSlackSender above.
 *
 * Both domains on purpose: anthropic.com for the company, claude.com for the
 * product (the partner portal and the application form both live there, and
 * anthropic.com/partners now 301s to claude.com). Same look-alike guard as the
 * other sender predicates, so `anthropic.com.evil.io` never matches.
 *
 * Billing receipts from `invoice+statements@mail.anthropic.com` also match, and
 * that is accepted deliberately: a handful of receipts in the inbox is a trivial
 * price for never missing the reply this was built for.
 */
export function isAnthropicSender(fromAddress: string | null | undefined): boolean {
  return /@(?:[\w-]+\.)*(?:anthropic\.com|claude\.com)(?![\w.-])/i.test((fromAddress || '').trim());
}

/**
 * True when the subject marks this as account-security mail the recipient
 * asked for seconds ago: a password reset, a verification / one-time code, or
 * a magic sign-in link. These are always user-initiated, always time-limited,
 * and essentially always sent from a noreply address carrying List-Unsubscribe
 * — the exact combination sections 4 and 5 archive. In the 90 days to
 * 2026-09-28 that swallowed 103 of them, including eight Hetzner verification
 * codes (the production VPS provider) and Ceipal password-reset OTPs.
 *
 * Subject-only on purpose, for the same reason the name check in section 2 is
 * subject-only: a body-text match over-fires on any newsletter that happens to
 * explain how to reset a password. Patterns are anchored on the phrasings that
 * actually appeared in Ali's mail rather than a generic /verify/ substring, so
 * "Verify your subscription preferences" style marketing does not qualify.
 */
export function isAccountSecurityMail(subject: string | null | undefined): boolean {
  const s = (subject || '').trim();
  if (!s) return false;
  return (
    /(?:reset|forgot|change)\b.{0,24}\bpassword|\bpassword\b.{0,24}\breset/i.test(s) ||
    /verification code|security code|access code|login code|one[-\s]?time (?:code|password|pin)|\botp\b/i.test(s) ||
    /magic link|sign[-\s]?in link|\b2fa\b|two[-\s]?factor/i.test(s) ||
    /verify your\b.{0,30}\b(?:email|account|identity|address)|confirm your (?:email|account|identity)/i.test(s)
  );
}

/**
 * True when a message carries an operational-health alert header.
 *
 * WHY THIS EXISTS. On 2026-10-01 a delivery-health alert — the control built to
 * shout when Cora's SMS, email or call channel goes silent — was itself archived
 * by this engine. The LLM classifier filed it AUTOMATION at a recorded
 * confidence of 15, reasoning "This is a test email with no action needed."
 * The alert that exists to catch a silent failure failed silently, and the only
 * reason anyone noticed is that Ali went looking for it in the audit log.
 *
 * MATCHED ON THE HEADER, DELIBERATELY, NOT THE SENDER OR THE SUBJECT.
 * Kes's recommendation and it is the right one twice over. The From is his
 * ordinary mailbox, so a sender rule would drag all his personal mail into the
 * inbox. And the subject is prose — "[CRITICAL] Cora: SMS has gone quiet" —
 * which breaks the first time anyone rewords it. The header is the shape of the
 * thing, and matching on shape is what finally stopped the account-security
 * defect (rule 0g) recurring after four sender-by-sender patches.
 *
 * `X-Cora-Alert: health` is on every delivery-health alert; `X-Cora-Alert:
 * system` is on every other system alert (queue lag, new critical exception).
 * Presence of the header alone is the test, so a value added later still
 * matches. Header casing varies by provider, so keys are compared lowercased.
 */
export function hasOperationalAlertHeader(headers: any): boolean {
  if (!headers || typeof headers !== 'object') return false;
  return Object.keys(headers).some((k) => k.toLowerCase() === 'x-cora-alert');
}

/**
 * True when a financial or insurance provider is asking the recipient to finish
 * something they already started: an application, an enrolment, a signature.
 *
 * WHY. Protective Life's "Action Required! Complete your life insurance
 * application" was archived twice, on 2026-10-02 and again on 2026-10-03, both
 * times by the LLM calling it "a marketing communication". It was not. It
 * carried a policy number and said underwriting could not begin until the
 * application was registered, completed and signed. Ali went looking for it and
 * it was not there.
 *
 * The classifier is not malfunctioning, which is the uncomfortable part. It
 * scores how likely mail needs Ali's personal attention, and transactional mail
 * from a provider he is mid-application with looks exactly like the marketing
 * those same providers send constantly. The score is a judgement, so the answer
 * is to take this class of mail out of its hands rather than to retune it.
 *
 * BOTH HALVES ARE REQUIRED, and that is what keeps it narrow. "Action required"
 * alone is marketing's favourite phrase. A reference number alone appears in
 * every receipt. Together they mean a file is open in the recipient's name and
 * somebody is waiting on them. Deliberately NOT a list of carrier domains: that
 * is the sender-by-sender patching that let the account-security defect recur
 * four times before rule 0g matched on shape instead.
 */
export function isFinancialApplicationMail(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
): boolean {
  const s = (subject || '').trim();
  const b = (bodyText || '').trim();
  if (!s || !b) return false;

  const asksYouToFinish =
    /\b(?:complete|finish|submit|sign|e-?sign|activate)\b[^.!?]{0,40}\b(?:your|the)\b[^.!?]{0,40}\b(?:application|enrol?lment|policy|claim|coverage|paperwork|packet)\b/i.test(s) ||
    /\baction required\b/i.test(s);

  const namesAnOpenFile =
    /\b(?:policy|application|claim|member|contract|account)\s*(?:number|no\.?|#|id)\s*[:#]?\s*[A-Z0-9][A-Z0-9-]{3,}/i.test(b) ||
    /\bunderwriting\b/i.test(b) ||
    /\bapplication packet\b/i.test(b);

  return asksYouToFinish && namesAnOpenFile;
}

/**
 * True when a subject is a recurring calendar reminder with a countdown suffix:
 * "DA Bootcamp Thursday Weekly Help Session  (1 wk out)". Community platforms
 * send three of these per event — a week out, a day out, an hour out — and a
 * recurring event therefore generates three every week, forever.
 *
 * WHY THIS IS A HARD RULE. Ali deleted these at least three times and they kept
 * reappearing. Nothing was restoring them; each week's are new messages. What
 * made it feel like a resurrection is that the LLM gave IDENTICAL mail a
 * different verdict almost every time — INBOX for the Oct 1 week-out notice,
 * AUTOMATION for the Sep 24 one; AUTOMATION for the Oct 1 hour-out, INBOX for
 * the Sep 24. These sit right on the 25-point boundary between SILENT_HOLD and
 * AUTOMATION, so the score lands on either side run to run and roughly one in
 * three reaches the inbox at random. A coin flip is worse than either answer.
 *
 * Subject-only, and anchored on the countdown parenthetical rather than on the
 * sender, so the same convention is covered wherever it comes from.
 */
export function isRecurringEventReminder(subject: string | null | undefined): boolean {
  return /\(\s*\d+\s*(?:min|mins|minute|minutes|hr|hrs|hour|hours|day|days|wk|wks|week|weeks)\s+out\s*\)\s*$/i.test(
    (subject || '').trim(),
  );
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
  if (!isBasecampSender(email.from_address)) return false;
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
  if (!isBasecampSender(email.from_address)) return false;
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
    /^ali,\s+here'?s\s+/i.test(email.subject || '');
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

  // --- 0i. Anthropic → INBOX ---
  // Sits in the 0-series rather than relying on the VIP table below, because
  // the VIP check matches one exact address and we do not know which address a
  // partner reply arrives from. See isAnthropicSender for the application this
  // protects and the quarter the last one cost.
  if (isAnthropicSender(email.from_address)) {
    const reason = 'Anthropic / Claude sender - never archive';
    console.log(`${LOG_PREFIX} Anthropic: ${reason}`);
    return { matched: true, state: 'INBOX', rule_id: 'anthropic_0i', reason: reason + fwdSuffix, classified_by: 'hard_rule', forwarded_from_hotmail: forwardedFromHotmail };
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
