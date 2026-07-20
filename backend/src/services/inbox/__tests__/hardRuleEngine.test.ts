/**
 * Hard-rule engine tests — Basecamp direct-mention detection.
 *
 * isBasecampDirectMention is pure (no DB), so we feed real subject lines
 * pulled from Ali's inbox. The contract: a person tagging or assigning Ali
 * (@mention / to-do assignment) routes to INBOX; recurring automation prompts
 * and "X completed a to-do" status pings do not. This pins the boundary that
 * regressed on 2026-06-24 (week 1/2/3 todo mentions auto-archived to AUTOMATION).
 */
jest.mock('../../../models/InboxVip', () => ({ findOne: jest.fn() }));
jest.mock('../../../models/InboxRule', () => ({ findAll: jest.fn() }));
jest.mock('../senderHistory', () => ({ countPriorEmailsFromSender: jest.fn() }));

import { isBasecampDirectMention, isBasecampDirectComment, isBasecampSender, evaluateHardRules } from '../hardRuleEngine';
import InboxVip from '../../../models/InboxVip';
import InboxRule from '../../../models/InboxRule';

const findOneVip = InboxVip.findOne as jest.Mock;
const findAllRules = InboxRule.findAll as jest.Mock;

function baseCoraEmail(overrides: Record<string, any> = {}) {
  return {
    id: 'email-1',
    from_address: 'student@example.com',
    from_name: 'A Student',
    to_addresses: ['support@colaberry.com'],
    cc_addresses: [],
    subject: 'Question about the program',
    body_text: 'Hi, I have a question.',
    headers: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findOneVip.mockResolvedValue(null);
  findAllRules.mockResolvedValue([]);
});

describe('isBasecampSender', () => {
  it('matches the current app.basecamp.com notification host', () => {
    expect(isBasecampSender('notifications@app.basecamp.com')).toBe(true);
  });

  it('matches the legacy 3.basecamp.com host', () => {
    expect(isBasecampSender('notifications@3.basecamp.com')).toBe(true);
  });

  it('matches the bare basecamp.com domain', () => {
    expect(isBasecampSender('support@basecamp.com')).toBe(true);
  });

  it('does not match a basecamp.com look-alike domain', () => {
    expect(isBasecampSender('phish@notbasecamp.com')).toBe(false);
    expect(isBasecampSender('x@basecamp.com.evil.io')).toBe(false);
  });

  it('handles null/empty input', () => {
    expect(isBasecampSender(null)).toBe(false);
    expect(isBasecampSender('')).toBe(false);
  });
});

// The real, current Basecamp notification sender (Basecamp 3). Pulled from
// Ali's live inbox 2026-06-29. The prior value here was 'notifications@3.basecamp.com'
// (legacy Basecamp Classic), which Basecamp no longer sends from — so every test
// passed against an address that never arrives, masking the production bug where
// app.basecamp.com @mentions were auto-archived.
const BC = 'notifications@app.basecamp.com';
const BC_LEGACY = 'notifications@3.basecamp.com';

// The footer Basecamp stamps into EVERY notification — Ali's name always
// appears here, so it must never, on its own, route a comment to the inbox.
const BC_FOOTER =
  '\n\nView this on Basecamp\nThis message was sent to Ali Muwwakkil, Jackie Chalk, Jude ojobo, and Robelyn Florague.\nUnsubscribe';

describe('isBasecampDirectMention', () => {
  // --- Should reach the inbox (someone is asking Ali to act) ---
  it('matches an @mention notification', () => {
    expect(
      isBasecampDirectMention({
        from_address: BC,
        subject: '(Internship / Apprenticeship Projects) Kalkidan B. @mentioned you in Re: PortfolioForge AI',
      })
    ).toBe(true);
  });

  it('matches a to-do assignment notification', () => {
    expect(
      isBasecampDirectMention({
        from_address: BC,
        subject: '(ShipCES - Autonomous Brokerage) Karun S. assigned you: KPIs',
      })
    ).toBe(true);
  });

  it('is case-insensitive on the subject', () => {
    expect(
      isBasecampDirectMention({ from_address: BC, subject: 'Someone @MENTIONED YOU in a thing' })
    ).toBe(true);
  });

  // --- Regression: the exact email that was silently archived for a week ---
  // Real notification from Ali's inbox 2026-06-29. Before the domain fix this
  // returned false (sender app.basecamp.com missed the /3\.basecamp\.com/ check)
  // and the @mention was auto-archived under the List-Unsubscribe rule.
  it('matches the real app.basecamp.com SAM.gov @mention that was archived', () => {
    expect(
      isBasecampDirectMention({
        from_address: 'notifications@app.basecamp.com',
        subject: '(Gov Contracts) Ram K. @mentioned you in Re: Create a Login.gov account + sign in to SAM.gov',
      })
    ).toBe(true);
  });

  it('still matches @mentions from the legacy 3.basecamp.com host', () => {
    expect(
      isBasecampDirectMention({ from_address: BC_LEGACY, subject: 'Ram K. @mentioned you in Re: X' })
    ).toBe(true);
  });

  // --- Should NOT match (automation noise stays automation) ---
  it('does not match a "completed a to-do" status ping', () => {
    expect(
      isBasecampDirectMention({ from_address: BC, subject: '(Dev Team) Narendra N. completed a to-do' })
    ).toBe(false);
  });

  it('does not match a recurring check-in prompt', () => {
    expect(
      isBasecampDirectMention({ from_address: BC, subject: '(Admissions Team) What are you working on today?' })
    ).toBe(false);
  });

  // --- Sender gating: the @mention phrasing only counts from Basecamp ---
  it('does not match a non-Basecamp sender even with mention-like wording', () => {
    expect(
      isBasecampDirectMention({ from_address: 'marketer@acme.com', subject: 'We assigned you a free trial!' })
    ).toBe(false);
  });

  // --- Failure path: missing/empty fields never throw ---
  it('handles a null subject', () => {
    expect(isBasecampDirectMention({ from_address: BC, subject: null })).toBe(false);
  });

  it('handles an empty from_address', () => {
    expect(isBasecampDirectMention({ from_address: '', subject: 'X @mentioned you' })).toBe(false);
  });
});

describe('isBasecampDirectComment', () => {
  const reThread = 'Re: (Internship / Apprenticeship Projects) PortfolioForge AI';

  // --- Should reach the inbox (comment addresses Ali by name) ---
  it('matches a greeting addressed to Ali', () => {
    expect(
      isBasecampDirectComment({
        from_address: BC,
        subject: reThread,
        body_text: `Hi Ali, can you confirm the front end is operational?${BC_FOOTER}`,
      })
    ).toBe(true);
  });

  it('matches a line that opens with "Ali,"', () => {
    expect(
      isBasecampDirectComment({
        from_address: BC,
        subject: reThread,
        body_text: `Ali, please add an update before today's meeting.${BC_FOOTER}`,
      })
    ).toBe(true);
  });

  it('matches an inline @Ali', () => {
    expect(
      isBasecampDirectComment({ from_address: BC, subject: reThread, body_text: `cc @Ali for sign-off${BC_FOOTER}` })
    ).toBe(true);
  });

  // --- Should NOT match (subscribed-thread noise stays automation) ---
  it('does not match a status update that never addresses Ali (footer only)', () => {
    expect(
      isBasecampDirectComment({
        from_address: BC,
        subject: reThread,
        body_text: `Today's update: finished the training module and started the dashboard.${BC_FOOTER}`,
      })
    ).toBe(false);
  });

  it('does not match a comment greeting a different person', () => {
    expect(
      isBasecampDirectComment({
        from_address: BC,
        subject: reThread,
        body_text: `Hi Swati, please review my critique.${BC_FOOTER}`,
      })
    ).toBe(false);
  });

  it('does not match a non-comment subject (no "Re:")', () => {
    expect(
      isBasecampDirectComment({
        from_address: BC,
        subject: '(Dev Team) What are you working on today?',
        body_text: `Hi Ali${BC_FOOTER}`,
      })
    ).toBe(false);
  });

  it('does not match a non-Basecamp sender', () => {
    expect(
      isBasecampDirectComment({ from_address: 'x@acme.com', subject: reThread, body_text: `Hi Ali, deal inside!` })
    ).toBe(false);
  });

  it('handles a null body', () => {
    expect(isBasecampDirectComment({ from_address: BC, subject: reThread, body_text: null })).toBe(false);
  });
});

// Regression tests for the 2026-07-14 mail-loop incident (BC #10095332194):
// Cora replied to her own sent messages because (a) the "is this a Cora
// inquiry" check matched ANY header substring, including her own From: line,
// and (b) nothing checked whether the message was FROM her own address.
describe('evaluateHardRules — Cora support inbox rule (cora_0c)', () => {
  it('happy path: routes a real inbound inquiry addressed to support@ to the Cora agent', async () => {
    const result = await evaluateHardRules(baseCoraEmail());

    expect(result).toMatchObject({ matched: true, state: 'AUTOMATION', rule_id: 'cora_0c' });
  });

  it('happy path: matches via Delivered-To when support@ is not in To/Cc directly', async () => {
    const result = await evaluateHardRules(
      baseCoraEmail({ to_addresses: ['ali@colaberry.com'], headers: { 'Delivered-To': 'support@colaberry.com' } })
    );

    expect(result).toMatchObject({ matched: true, rule_id: 'cora_0c' });
  });

  it('happy path: matches via X-Original-To', async () => {
    const result = await evaluateHardRules(
      baseCoraEmail({ to_addresses: ['ali@colaberry.com'], headers: { 'X-Original-To': 'support@colaberry.com' } })
    );

    expect(result).toMatchObject({ matched: true, rule_id: 'cora_0c' });
  });

  it('regression: does NOT match on a From: header containing support@colaberry.com (the exact loop bug)', async () => {
    // This is Cora's own outgoing reply, re-ingested as if it were new inbound
    // mail. Before the fix, the header-blob substring check matched her own
    // From: line and this would have routed straight back into the Cora agent.
    const result = await evaluateHardRules(
      baseCoraEmail({
        from_address: 'support@colaberry.com',
        to_addresses: ['student@example.com'],
        headers: { From: 'Cora (Colaberry Enterprise AI) <support@colaberry.com>' },
      })
    );

    expect(result.rule_id).not.toBe('cora_0c');
  });

  it('regression: a message FROM support@colaberry.com never matches cora_0c even when also addressed back to support@', async () => {
    // Belt-and-suspenders: even if a loop somehow sent support@ mail to
    // support@ itself, the explicit from-address guard blocks it.
    const result = await evaluateHardRules(
      baseCoraEmail({ from_address: 'support@colaberry.com', to_addresses: ['support@colaberry.com'] })
    );

    expect(result.rule_id).not.toBe('cora_0c');
  });

  it('boundary: a CORA_SUPPORT_ADDRESS override still applies the same self-send guard', async () => {
    const original = process.env.CORA_SUPPORT_ADDRESS;
    process.env.CORA_SUPPORT_ADDRESS = 'help@colaberry.com';
    try {
      const result = await evaluateHardRules(
        baseCoraEmail({ from_address: 'help@colaberry.com', to_addresses: ['help@colaberry.com'] })
      );
      expect(result.rule_id).not.toBe('cora_0c');
    } finally {
      process.env.CORA_SUPPORT_ADDRESS = original;
    }
  });
});
