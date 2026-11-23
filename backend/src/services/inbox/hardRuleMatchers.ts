/**
 * Inbox COS hard-rule MATCHERS: pure, synchronous predicates that answer
 * "what shape is this email?" (Basecamp mention, Slack, school platform,
 * account-security mail, vendor alert, and so on).
 *
 * Split out of hardRuleEngine.ts on 2026-11-23 (CC-20261123-8lfn) because the
 * engine had grown to 761 lines, past the 500-line ceiling in CLAUDE.md. The
 * engine keeps the ORDER the rules run in; this module only answers yes/no
 * questions and never touches the database, so every matcher is unit-testable
 * on its own. hardRuleEngine.ts re-exports all of them, so existing imports
 * keep working.
 */

export interface NormalizedEmail {
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
 * Detects mail that arrived via the Hotmail->Gmail forward rule Ali set up
 * 2026-06-03. The Microsoft forwarder preserves the original From; the only
 * tell-tales are recipient-chain headers showing ali_muwwakkil@hotmail.com.
 * We check Delivered-To, X-Original-To, and the To/Cc address list.
 */
export function isForwardedFromHotmail(email: NormalizedEmail): boolean {
  const hotmailAddr = 'ali_muwwakkil@hotmail.com';
  const headers = email.headers || {};
  const headerEntries = Object.entries(headers).map(([k, v]) => `${k.toLowerCase()}: ${String(v).toLowerCase()}`).join('\n');
  if (headerEntries.includes(hotmailAddr)) return true;
  const toAddrs = (email.to_addresses || []).map((a: any) => (typeof a === 'string' ? a : a?.email || a?.address || '').toLowerCase());
  const ccAddrs = (email.cc_addresses || []).map((a: any) => (typeof a === 'string' ? a : a?.email || a?.address || '').toLowerCase());
  if (toAddrs.includes(hotmailAddr) || ccAddrs.includes(hotmailAddr)) return true;
  return false;
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
 * True when a THIRD-PARTY service is telling us one of our own systems is
 * degraded, suspended or erroring.
 *
 * WHY. Rule 00 above already protects operational alerts, but only ours: it
 * matches the X-Cora-Alert header we set on mail we generate. Nothing we send
 * can protect a vendor's alert about our production, and vendors are where the
 * first warning actually comes from. On 2026-10-06 Twilio sent "Action
 * Required: Your Twilio account is suspended" to ali@colaberry.com and to
 * techadmin, plus fifteen "[Twilio Alarm] Error alarm triggered" messages. All
 * of them were archived unread by section 4 and section 5 below, for the only
 * two reasons every machine-sent alert in existence will always match: a
 * noreply From and a List-Unsubscribe header. Nobody saw any of it. The account
 * stayed suspended for six days, every outbound AI call stopped, and the outage
 * was found by a person noticing calls were missing rather than by the fifteen
 * emails that said so.
 *
 * MATCHED ON SHAPE, NOT ON A SENDER LIST. A list of vendor domains is the
 * sender-by-sender patching that let the account-security defect recur four
 * times before rule 0g matched on shape instead; it would also be wrong the
 * first time we add a service nobody remembered to list. Machine-generated
 * alerts share a shape that marketing does not: a bracketed severity token the
 * sending system stamps on, or a stated service condition.
 *
 * NARROWED BY MEASUREMENT, NOT BY INSTINCT. The first draft also matched
 * bracketed severity tags ("[Warning]", "[Twilio Alarm]") and measured events
 * ("error spike", "alarm triggered"). Backtested against the 26,776 subjects
 * this engine archived in the 60 days to 2026-10-14, those two would have moved
 * 3,180 emails into the inbox, 12% of everything archived and ~53 a day,
 * including 584 copies of one "[Twilio Alarm] Error alarm triggered by 16
 * errors". Surfacing the same alarm 584 times is not better than archiving it;
 * it just moves where the signal drowns. Those tags belong in a digest, not an
 * inbox rule.
 *
 * What is left matched TWO emails in the same 60 days, and both were the Twilio
 * suspension that caused the outage. That is the trade this rule exists to
 * make: it is allowed to miss a leading indicator, because the inbox only stays
 * readable if archiving mostly works, and a condition that actually stops a
 * service always sends something that says so.
 */
export function isVendorOperationalAlert(subject?: string | null): boolean {
  const s = (subject || '').trim();
  if (!s) return false;

  // (a) A service we depend on has STOPPED, or is about to. Someone has to act
  //     and no amount of waiting fixes it.
  if (/\b(account|service|subscription|plan|number|domain)\b[^.]{0,40}\b(is |has been |was )?(suspend|deactivat|terminat|disabl|revok|past due|unpaid)/i.test(s)) return true;

  // (b) A credential is expiring or has been revoked. Same shape: silent until
  //     the day it breaks something.
  if (/\b(certificate|api key|access token|personal access token|credential|licen[cs]e)\b[^.]{0,30}\b(expir|revok)/i.test(s)) return true;

  return false;
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
 * True for the school community forum's automated "New Project Alert - <title>"
 * broadcasts from discussions@school.colaberry.com.
 *
 * WHY THIS IS A HARD RULE. Same coin flip as isRecurringEventReminder. In the
 * 30 days to 2026-11-23 the LLM gave 123 of these identical broadcasts every
 * verdict it has: 77 SILENT_HOLD, 20 AUTOMATION, 19 ASK_USER and 7 INBOX. Some
 * arrive with a List-Unsubscribe header and are archived by section 4; others
 * arrive without one and land wherever the score happens to fall. Across 1,665
 * mails from this sender in 90 days Ali never once moved one back to the
 * inbox, so the consistent answer is "archive".
 *
 * Deliberately NARROW: only the "New Project Alert" broadcast. The same sender
 * also relays forum comments ("Comment Added"), session approvals and SQL job
 * reports, which can carry a person asking for something, so those stay with
 * the classifier. The sender is matched exactly, not by domain, so a forum
 * reply relayed from another school.colaberry.com address is unaffected.
 */
export function isForumProjectAlert(
  fromAddress: string | null | undefined,
  subject: string | null | undefined,
): boolean {
  const from = (fromAddress || '').trim().toLowerCase();
  if (from !== 'discussions@school.colaberry.com') return false;
  return /^new project alert\b/i.test((subject || '').trim());
}
