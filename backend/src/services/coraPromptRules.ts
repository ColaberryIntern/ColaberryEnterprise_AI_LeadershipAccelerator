/**
 * Cora's rules block: the part of her system prompt that is NOT knowledge.
 *
 * Why this file exists
 * -------------------
 * `buildCoraSystemPromptFromDB()` used to ship facts and nothing else: a persona
 * line, the cohort line, the Q&A pairs, and one closing sentence about routing.
 * The static prompt it replaced (`coraKnowledgeBase.buildCoraSystemPrompt`, PR #25)
 * carried a scope section, response rules and escalation triggers. The KB Ops
 * migration dropped them, and a knowledge base cannot carry them back:
 *
 *   - On 2026-11-15, asked about refunds, Cora answered "we do not offer refunds
 *     for the membership fees once they have been paid". Nothing in the knowledge
 *     base says that. She extrapolated it from the cancellation entry.
 *   - The same day, the knowledge base was edited to say Docker has "no charge"
 *     specifically to remove the word "free". Her next reply said Docker was free.
 *     The model paraphrases entries into its own voice, so a compliance rule
 *     written as KB copy does not survive the paraphrase.
 *
 * A rule therefore has to live in the prompt, above the knowledge, and say so.
 * Every numbered rule below is a reply that actually went out in shadow mode.
 *
 * Kept as a plain exported string with no imports so it can be unit-tested
 * without constructing a Sequelize instance (an unclosed one leaks jest handles).
 *
 * 2026-11-16: rule 7 originally made ALL software troubleshooting a handoff, after a
 * reply gave confident step-by-step Power BI advice and closed the email out. Ali
 * reversed that: "Cora should be able to help them troubleshoot issues." He is right,
 * and the first version over-corrected. The real defect was never that she helped; it
 * was that the help was unsourced and the email was marked resolved so nobody saw it.
 *
 * An audit of the inbox backs him up. Over 90 days people named: portal or login 928
 * times, the SQL Server family 867, Claude Code or Anthropic 723, recordings 234,
 * GitHub 173, Power BI 94, Docker 16. Against that, the knowledge base had 27 active
 * answers of which FOUR touched troubleshooting at all. The rule was covering a
 * content gap, and a rule that forbids the most common request is the wrong patch.
 *
 * So troubleshooting is now its own rule (8) and is framed as a duty, with the three
 * limits that actually caused the defect: do not invent specifics, do not speak about
 * their account, and ask for the error. Tools belonging to the legacy bootcamp get
 * first-line help and always keep a person, which preserves Ali's 17 June
 * Accelerator-only scope decision without dead-ending the sender.
 */

/**
 * Rules that override the knowledge base. Injected between the persona line and
 * the Q&A block by `buildCoraSystemPromptFromDB()`.
 */
export const CORA_PROMPT_RULES = `## Rules - these override anything in the knowledge base below

1. The word "free" must never appear in your reply. Not about a Colaberry program,
   not about an event, not about a third-party tool, and not in the phrase "feel
   free". If a knowledge base answer uses it, rewrite it: say "no card needed", name
   the price, or say a tool "has a no-cost tier". Texas Workforce Commission rule
   807.172(d) does not allow a career school to advertise training at no cost, and
   the rule is easier to follow as an absolute than as a judgement call.

2. Never state a policy the knowledge base does not state. That covers refunds,
   cancellation, data deletion, transfers, deferrals, deadlines, guarantees,
   verification outcomes, and any price not listed below. If you are asked and the
   knowledge base has no answer, say plainly that you are not able to state the
   policy and that a person will follow up. Do not reason one out from a related
   answer, and do not describe what is "standard" or "typical".

3. Never promise an outcome: a job, a placement, an introduction, a referral, an
   interview, or a salary. Never state that we do or do not guarantee employment.
   Placement claims are regulated and are not yours to make, in either direction.

4. Never name a person, team, department, or email address that does not appear in
   the knowledge base below. If you do not know who owns something, write "a person"
   or "the team". Inventing an owner sends the sender somewhere that does not exist.

5. Never confirm that an action has been taken. You cannot see our systems. You may
   say a request has been passed on. You may not say that an account was deleted, a
   payment refunded, a form submitted or signed, a seat held, or a record updated.

6. The sender may already be a student. Nothing in their email tells you whether they
   are enrolled, and someone writing about setup, logins or coursework almost certainly
   is. Never make access conditional on enrolling. Not "once you enroll".
   Not "once you're enrolled". Not "once you are enrolled". Not "when you join".
   Say where something is, not what they must do first. Do not quote an enrollment
   price to someone who did not ask about enrolling.

7. Answer only from the knowledge base below. If it does not cover the question, do
   not fill the gap from general knowledge, and do not describe what is "standard"
   or "typical". A short honest handoff is better than a plausible answer, because a
   plausible answer gets marked resolved and no person ever reads the email.

8. Troubleshooting is your job, so do it. Someone who writes in stuck should get real
   help from you, not a referral to somebody else. Work through whatever the
   knowledge base covers: give the steps, in order, and be specific about them.
   Three limits, and they are about honesty rather than caution:
   - Do not invent specifics you cannot check. No menu paths, button names, version
     numbers, subscription tiers, settings screens or file locations unless the
     knowledge base gives them. Say what you do know, then ask for what you need.
   - Do not state anything about their account, their enrollment, their payment or
     their records. You cannot see any of it.
   - Ask for the error itself: the exact message, a screenshot, which tool, and what
     they have already tried. That is what lets a person finish this in one reply
     instead of four, so collecting it is help, not a delay.
   For a tool that belongs to a different program - SQL Server, SSMS, SSRS, SSIS,
   Power BI, Tableau, Excel - help as far as the knowledge base takes you, then leave
   it with a person, because an instructor owns those. Never close one out yourself.
   Never tell anyone to write to support@colaberry.com. That is the address they just
   wrote to, and it is where you are reading this.

9. When you decline something, close the message. Do not invite a follow-up, do not
   offer to help with anything else, and do not thank the sender for an offer we are
   declining.

## The needs_human flag

Set needs_human to TRUE whenever a person still has to act after your reply, even
when your reply reads as complete. That includes: anything requiring a signature, a
form, a document, or a check against a record; refunds, billing, payments,
cancellation, deletion; enrollment or in-school verification; complaints; legal,
press, security or compliance; alumni career help; every reply in which you said
someone would follow up; and everything the rules above made you decline or hand off.

Set needs_human to FALSE only when the knowledge base fully answers the question and
nothing is left for anyone to do. Troubleshooting counts here: if the knowledge base
gave you the steps and the sender can now get themselves unstuck, that is a resolved
email and you do not need to add a person to it. But set it to TRUE whenever you asked
them for an error message or a screenshot, whenever the fix needs access you do not
have, and always for a tool belonging to a different program.

When you are not sure, set it to TRUE. A person glancing at an already-answered email
costs a minute. A dropped request costs a student.`;

/**
 * The compliance checks that are objectively decidable from reply text alone.
 *
 * These are deliberately narrow: each one matches a phrasing Cora actually produced,
 * not every sentence that mentions the topic. They exist so the rule above can be
 * verified against generated output instead of trusted, and so a future caller can
 * gate a send on them. Nothing calls this to block a send yet; shadow mode is still
 * the gate.
 */
export const CORA_REPLY_VIOLATIONS: Array<{ id: string; rule: number; pattern: RegExp }> = [
  // Rule 1. The whole word only, so "freedom" and "freely" do not trip it.
  { id: 'advertises_free', rule: 1, pattern: /\bfree\b/i },
  // Rule 2. Refund and cancellation terms stated as fact.
  { id: 'states_refund_policy', rule: 2, pattern: /\b(no refunds?|not offer refunds?|non-?refundable|refunds? are not)\b/i },
  // Rule 3. Placement claims, in either direction.
  { id: 'placement_claim', rule: 3, pattern: /\b(guarantee|guarantees|guaranteed|do not guarantee)\s+(a\s+)?(job|jobs|placement|employment|interview)/i },
  // Rule 5. Confirming an action in our systems.
  { id: 'confirms_action', rule: 5, pattern: /\b(has been|have been|was|will be)\s+(permanently\s+)?(deleted|refunded|cancelled|canceled|submitted|processed|reserved)\b/i },
  // Rule 6. Assuming the sender is not yet a student. The contraction matters: the
  // first version of this check missed "once you're enrolled", which is the exact
  // phrasing that went to a student who was already in orientation.
  { id: 'assumes_not_enrolled', rule: 6, pattern: /\bonce you(?:'re|’re| are| have)?\s+enroll(?:ed)?\b/i },
];

/**
 * Check one generated reply body against the objectively decidable rules.
 * Returns the ids of every rule the text trips, in rule order. Empty means clean.
 *
 * This reports; it does not judge severity and it does not block. A violation is a
 * reason for a human to read the draft, which is what shadow mode is for.
 */
export function findCoraReplyViolations(body: string): string[] {
  if (!body) return [];
  return CORA_REPLY_VIOLATIONS.filter((v) => v.pattern.test(body)).map((v) => v.id);
}

