// Ali's email style kit as a guard (T18). Source of truth: Basecamp to-do
// 9982045924, "Email writing style kit (6 files)", which Ali sent with the
// instruction to share it with any project that drafts email on his behalf.
// /inbox-zero does, and before this its Gmail executor sent a plain-text body
// with no signature and no check of any kind.
//
// These tests pin the three non-negotiables (no em-dashes, branded signature,
// no double sign-off) at BOTH points they are enforced: the draft the planner
// proposes, and the send the executor performs. The 2026-09-01 lesson is the
// reason for two: "this must be a GUARD, not a thing to remember."

import {
  ALI_SIGNATURE_TEXT,
  hasBrandedSignature,
  lintAliEmail,
  normalizeAliEmailText,
  normalizeAliSubject,
} from '../aliEmailStyle';

const EMDASH = '—';
const ENDASH = '–';

describe('the three non-negotiables', () => {
  it('flags an em-dash and an en-dash, in the body and in the subject', () => {
    expect(lintAliEmail({ text: `The refund ${EMDASH} which we approved ${ENDASH} ships Friday.${'\n\n'}${ALI_SIGNATURE_TEXT}` }).hardFails.map((f) => f.rule)).toContain('no-emdash');
    expect(lintAliEmail({ subject: `Refund ${EMDASH} approved`, text: ALI_SIGNATURE_TEXT }).hardFails.map((f) => f.rule)).toContain('no-emdash');
  });

  it('flags the dash every time it is asked, in body AND subject, and on a repeat call', () => {
    // A /g regex used with .test() keeps lastIndex between calls: the second
    // question would answer "no dash" on content that has one.
    const withDash = { subject: `Refund ${EMDASH} approved`, text: `Ships Friday ${EMDASH} confirmed.

${ALI_SIGNATURE_TEXT}` };
    for (let i = 0; i < 3; i++) {
      expect(lintAliEmail(withDash).hardFails.map((f) => f.rule)).toContain('no-emdash');
    }
    expect(lintAliEmail({ subject: `Refund ${EMDASH} approved`, text: ALI_SIGNATURE_TEXT }).hardFails.map((f) => f.rule)).toContain('no-emdash');
    expect(lintAliEmail({ text: `Ships Friday ${EMDASH} confirmed.

${ALI_SIGNATURE_TEXT}` }).hardFails.map((f) => f.rule)).toContain('no-emdash');
  });

  it('flags a missing branded signature', () => {
    expect(lintAliEmail({ text: 'Confirmed. The refund ships Friday.' }).hardFails.map((f) => f.rule)).toContain('has-branded-signature');
  });

  it('flags a double sign-off when the branded signature is present', () => {
    const body = `Confirmed, the refund ships Friday.\n\nBest,\nAli\n\n${ALI_SIGNATURE_TEXT}`;
    const rules = lintAliEmail({ text: body }).hardFails.map((f) => f.rule);
    // One full name (the signature) plus a bare "Ali" is a double SIGN-OFF, not a duplicate name.
    expect(rules).toEqual(['no-double-signoff']);
    // The duplicate-name rule fires on its own when the body names him twice.
    expect(lintAliEmail({ text: `Ali Muwwakkil here.

${ALI_SIGNATURE_TEXT}` }).hardFails.map((f) => f.rule)).toContain('no-duplicate-full-name');
  });

  it('passes a compliant draft with zero hard fails', () => {
    const body = `Confirmed, the refund ships Friday. I will send the receipt the same day.\n\n${ALI_SIGNATURE_TEXT}`;
    expect(lintAliEmail({ subject: 'Refund confirmed: ships Friday', text: body })).toEqual({ ok: true, hardFails: [], softFails: [] });
  });
});

describe('soft rules (style suggestions, never a block)', () => {
  const sign = (s: string) => `${s}\n\n${ALI_SIGNATURE_TEXT}`;

  it('catches a fluff opener, vague urgency, a subject exclamation and a vague subject', () => {
    expect(lintAliEmail({ text: sign('Hope you are doing well. Quick note on the refund.') }).softFails.map((f) => f.rule)).toContain('no-fluff-opener');
    expect(lintAliEmail({ text: sign('Please confirm ASAP.') }).softFails.map((f) => f.rule)).toContain('no-vague-urgency');
    expect(lintAliEmail({ subject: 'Refund confirmed!', text: sign('Done.') }).softFails.map((f) => f.rule)).toContain('no-marketing-exclamation');
    expect(lintAliEmail({ subject: 'Quick question', text: sign('Done.') }).softFails.map((f) => f.rule)).toContain('subject-not-vague');
  });

  it('a soft fail alone still leaves the draft sendable', () => {
    const r = lintAliEmail({ subject: 'Update', text: sign('Hope you are doing well. The refund ships Friday.') });
    expect(r.ok).toBe(true);
    expect(r.softFails.length).toBeGreaterThan(0);
  });
});

describe('normalizeAliEmailText — makes a draft compliant without rewriting it', () => {
  it('replaces dashes, drops the sign-off, and appends the signature exactly once', () => {
    const out = normalizeAliEmailText(`Confirmed ${EMDASH} the refund ships Friday.\n\nBest,\nAli`);
    expect(out).not.toMatch(/[—–]/);
    expect(out).toContain('Confirmed - the refund ships Friday.');
    expect(out).not.toMatch(/Best,\s*\nAli\b/);
    expect((out.match(/Managing Director \/ AI Systems Architect/g) || []).length).toBe(1);
    expect(lintAliEmail({ text: out })).toEqual({ ok: true, hardFails: [], softFails: [] });
  });

  it('strips a bare trailing "Ali" — the signature already names him', () => {
    const out = normalizeAliEmailText('The receipt is attached.\n\nAli');
    expect(out).toBe(`The receipt is attached.\n\n${ALI_SIGNATURE_TEXT}`);
  });

  it('is idempotent: running it twice changes nothing and never double-signs', () => {
    const once = normalizeAliEmailText('The refund ships Friday.');
    const twice = normalizeAliEmailText(once);
    expect(twice).toBe(once);
    expect((twice.match(/200 Chisholm Place/g) || []).length).toBe(1);
  });

  it('removes a sign-off that sits above an already-present signature, keeping one signature', () => {
    const out = normalizeAliEmailText(`The refund ships Friday.\n\nThanks,\nAli\n\n${ALI_SIGNATURE_TEXT}`);
    expect(lintAliEmail({ text: out }).hardFails).toEqual([]);
    expect((out.match(/Ali Muwwakkil/g) || []).length).toBe(1);
  });

  it('handles an empty draft without producing a bare signature with stray whitespace', () => {
    expect(normalizeAliEmailText('')).toBe(`\n\n${ALI_SIGNATURE_TEXT}`);
    expect(hasBrandedSignature(normalizeAliEmailText(''))).toBe(true);
  });

  it('normalizeAliSubject strips dashes from the subject line', () => {
    expect(normalizeAliSubject(`Re: Refund ${EMDASH} approved`)).toBe('Re: Refund - approved');
  });
});

describe('the guard is wired into the /inbox-zero send path', () => {
  const { executeEmailSend } = require('../../inboxCase/caseActionExecutors');

  const item: any = {
    id: 'i1', source_type: 'email', provider: 'gmail_colaberry', source_id: 'm1', title: 'Refund question',
    snapshot: { from_address: 'student@example.com', message_id: '<abc@mail>', thread_id: 't1' },
  };

  it('refuses to send a draft whose hard violation survived to execute time, and names the rule', async () => {
    const action: any = { payload: { subject: 'Re: Refund', body: `Confirmed.\n\nBest,\nAli\n\n${ALI_SIGNATURE_TEXT}\n\nAli Muwwakkil` } };
    await expect(executeEmailSend(action, item)).rejects.toMatchObject({ error_class: 'StyleViolationError' });
    expect(sent).toHaveLength(0);
  });

  it('sends a compliant draft, with the signature appended and dashes gone in what actually leaves', async () => {
    const action: any = { payload: { subject: `Re: Refund ${EMDASH} question`, body: `Confirmed ${EMDASH} the refund ships Friday.` } };
    const receipt: any = await executeEmailSend(action, item);
    expect(receipt.message_id).toBe('sent-1');
    expect(sent).toHaveLength(1);
    const mime = Buffer.from(String(sent[0].requestBody.raw).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(mime).toContain('To: student@example.com');
    expect(mime).toContain('Subject: Re: Refund - question');
    expect(mime).toContain('Confirmed - the refund ships Friday.');
    expect(mime).toContain('Managing Director / AI Systems Architect');
    expect(mime).not.toMatch(/[—–]/);
  });
});

// Gmail transport fake: records what would have been sent; never a network call.
const sent: any[] = [];
jest.mock('../../inbox/inboxSyncService', () => ({
  getColaberryGmailClient: () => ({
    users: {
      messages: {
        send: async (args: any) => { sent.push(args); return { data: { id: 'sent-1', threadId: 't1' } }; },
      },
    },
  }),
  getPersonalGmailClient: () => null,
}));
jest.mock('../../inbox/graphMailService', () => ({ isConfigured: () => false, archiveMessage: jest.fn() }));
jest.mock('../../ops/basecampClient', () => ({ bcPost: jest.fn(), bcPut: jest.fn() }));

beforeEach(() => { sent.length = 0; });
