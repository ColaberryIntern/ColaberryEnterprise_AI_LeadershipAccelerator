/**
 * The site-chat document send is governed (MR1).
 *
 * WHY THESE EXIST, in order of how much damage each regression would do.
 *
 *   1. **Consent is checked against the RECIPIENT, not the visitor.** The address comes
 *      from whatever the visitor typed, so it is not necessarily their own. Keying the
 *      check on the visitor's lead would check one person's consent and mail another.
 *      That was the actual hole: this path called no consent check at all.
 *   2. **A refusal is not reported as a send.** The old code returned "Successfully sent"
 *      on paths where no mail left, including when SMTP was unconfigured and when the
 *      document did not exist. Maya telling a visitor she emailed something she did not
 *      is worse than the missing email.
 *   3. **A second call sends no second email.** There was no idempotency key, so N tool
 *      calls produced N emails. The model calling a tool twice in one turn is ordinary.
 *   4. **No outbound copy claims an attachment.** The body always read "is attached to
 *      this email" and no attachment was ever added.
 */
export {};

jest.mock('../../models', () => ({
  Lead: { findOne: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../../models/AdmissionsMemory', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../models/AdmissionsActionLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../../models/DocumentDeliveryLog', () => ({ __esModule: true, default: { create: jest.fn() } }));
jest.mock('../admissionsWorkflowService', () => ({ canDeliverDocument: jest.fn() }));
jest.mock('../emailService', () => ({ sendAdmissionsDocument: jest.fn() }));
jest.mock('../communicationSafetyService', () => ({ evaluateSend: jest.fn() }));
jest.mock('../email/idempotentSend', () => ({ sendOnce: jest.fn() }));
// Must resolve a promise: the caller fires it and attaches `.catch`, so a bare jest.fn()
// returning undefined throws inside production code rather than testing it.
jest.mock('../mayaCampaignRouter', () => ({ addMayaInteractionTag: jest.fn(async () => undefined) }));
jest.mock('../mayaToolsService', () => ({
  captureLeadDetails: jest.fn(), updateLeadRecord: jest.fn(), sendSmsSummary: jest.fn(),
  initiateVoiceCall: jest.fn(), getAvailableSlots: jest.fn(), scheduleStrategyCall: jest.fn(),
  enrollInCampaign: jest.fn(), retrieveKnowledgeContent: jest.fn(),
}));
// The recorder lazily imports aiEventService, which builds a real Sequelize. Stub the
// wrapper so this suite needs no database.
jest.mock('../agents/tools/toolInvocationRecorder', () => ({
  withToolRecording: (_ctx: unknown, run: () => Promise<unknown>) => run(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeMayaAction } = require('../mayaActionService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Lead } = require('../../models');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmissionsMemory = require('../../models/AdmissionsMemory').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DocumentDeliveryLog = require('../../models/DocumentDeliveryLog').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { canDeliverDocument } = require('../admissionsWorkflowService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendAdmissionsDocument } = require('../emailService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { evaluateSend } = require('../communicationSafetyService');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendOnce } = require('../email/idempotentSend');

const VISITOR = 'visitor-1';
const CONVO = 'convo-1';
const ARGS = { document_type: 'program_overview', recipient_email: 'Dana@Example.com', recipient_name: 'Dana' };

const leadRow = (id: number) => ({ getDataValue: (k: string) => (k === 'id' ? id : 'Dana Whitfield') });

const call = (args: Record<string, unknown> = ARGS) =>
  executeMayaAction('send_document', args, VISITOR, CONVO);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  (canDeliverDocument as jest.Mock).mockResolvedValue({ allowed: true });
  (AdmissionsMemory.findOne as jest.Mock).mockResolvedValue({ lead_id: 999 });
  (Lead.findOne as jest.Mock).mockResolvedValue(leadRow(42));
  (Lead.findByPk as jest.Mock).mockResolvedValue(leadRow(42));
  (evaluateSend as jest.Mock).mockResolvedValue({ allowed: true, redirect: null, testMode: false, deliveryMode: 'live' });
  (DocumentDeliveryLog.create as jest.Mock).mockResolvedValue({});
  (sendAdmissionsDocument as jest.Mock).mockResolvedValue({ outcome: 'sent', messageId: 'msg-1' });
  // Default: the guard grants the claim and runs the provider.
  (sendOnce as jest.Mock).mockImplementation(async (_id: unknown, send: () => Promise<any>) => {
    const r = await send();
    return r.ok
      ? { outcome: 'sent', ledgerId: 'l1', idempotencyKey: 'k1', messageId: r.messageId }
      : { outcome: 'failed', ledgerId: 'l1', idempotencyKey: 'k1', errorClass: r.errorClass, error: r.error };
  });
});

afterEach(() => jest.restoreAllMocks());

describe('consent is checked, and against the recipient', () => {
  it('asks evaluateSend before sending, on the email channel', async () => {
    await call();
    expect(evaluateSend).toHaveBeenCalledTimes(1);
    expect(evaluateSend).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 42, channel: 'email', toEmail: 'Dana@Example.com',
    }));
  });

  it('resolves the lead from the RECIPIENT address, not the visitor memory', async () => {
    // The visitor's own lead is 999; the typed address belongs to lead 42. 42 must win,
    // or we would check one person's consent and mail a different person.
    await call();
    expect(Lead.findOne).toHaveBeenCalledTimes(1);
    expect((evaluateSend as jest.Mock).mock.calls[0][0].leadId).toBe(42);
  });

  it('matches the address case-insensitively, lower-cased on both sides', async () => {
    // Production holds 986 mixed-case lead addresses, 21 of them opted out. An exact match
    // would find no lead for those and skip the consent check entirely. The query must
    // compare lower(email) to a lower-cased value, and must not use a LIKE wildcard.
    await call({ ...ARGS, recipient_email: '  Dana@Example.COM  ' });
    const arg = (Lead.findOne as jest.Mock).mock.calls[0][0];
    const rendered = JSON.stringify(arg.where);
    expect(rendered).toContain('lower');
    expect(rendered).toContain('dana@example.com');
    expect(rendered).not.toMatch(/iLike|%/);
  });

  it('falls back to the visitor lead only when the address has none', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    await call();
    expect((evaluateSend as jest.Mock).mock.calls[0][0].leadId).toBe(999);
  });

  it('refuses to send when the recipient is suppressed, and sends nothing', async () => {
    (evaluateSend as jest.Mock).mockResolvedValue({
      allowed: false, redirect: null, testMode: false,
      blockedReason: 'unsubscribe_event_exists', deliveryMode: 'blocked',
    });
    const out = await call();
    expect(out.success).toBe(false);
    expect(sendOnce).not.toHaveBeenCalled();
    expect(sendAdmissionsDocument).not.toHaveBeenCalled();
  });

  it('does not leak the suppression reason to the visitor', async () => {
    (evaluateSend as jest.Mock).mockResolvedValue({
      allowed: false, redirect: null, testMode: false,
      blockedReason: 'lead_bounced', deliveryMode: 'blocked',
    });
    const out = await call();
    expect(out.summary).not.toContain('lead_bounced');
    expect(out.summary).not.toContain('bounced');
    expect(out.summary).not.toContain('unsubscribe');
  });

  it('honours a test-mode redirect instead of mailing the real recipient', async () => {
    (evaluateSend as jest.Mock).mockResolvedValue({
      allowed: true, redirect: { email: 'sink@colaberry.com' }, testMode: true, deliveryMode: 'test_redirect',
    });
    await call();
    expect((sendAdmissionsDocument as jest.Mock).mock.calls[0][0].to).toBe('sink@colaberry.com');
  });

  it('proceeds when the recipient has no lead at all, because there is no opt-out to honour', async () => {
    (Lead.findOne as jest.Mock).mockResolvedValue(null);
    (AdmissionsMemory.findOne as jest.Mock).mockResolvedValue(null);
    const out = await call();
    expect(evaluateSend).not.toHaveBeenCalled();
    expect(out.success).toBe(true);
  });
});

describe('a refusal is never reported as a send', () => {
  it('reports failure, not success, when the document does not exist', async () => {
    (sendAdmissionsDocument as jest.Mock).mockResolvedValue({ outcome: 'refused', reason: 'no_document_to_send' });
    const out = await call();
    expect(out.success).toBe(false);
    expect(out.summary).not.toMatch(/sent|emailed/i);
  });

  it('reports failure when SMTP is not configured, rather than claiming delivery', async () => {
    (sendAdmissionsDocument as jest.Mock).mockResolvedValue({ outcome: 'refused', reason: 'smtp_not_configured' });
    const out = await call();
    expect(out.success).toBe(false);
  });

  it('records a failed delivery row so the request stays actionable by a person', async () => {
    (sendAdmissionsDocument as jest.Mock).mockResolvedValue({ outcome: 'refused', reason: 'no_document_to_send' });
    await call();
    expect(DocumentDeliveryLog.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });

  it('does not tag the lead as having received a document when nothing was sent', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { addMayaInteractionTag } = require('../mayaCampaignRouter');
    (sendAdmissionsDocument as jest.Mock).mockResolvedValue({ outcome: 'refused', reason: 'no_document_to_send' });
    await call();
    expect(addMayaInteractionTag).not.toHaveBeenCalled();
  });
});

describe('the send is idempotent', () => {
  it('routes the send through sendOnce rather than calling the mailer directly', async () => {
    await call();
    expect(sendOnce).toHaveBeenCalledTimes(1);
  });

  it('keys the claim on the recipient, the subject and a per-visitor-per-document event', async () => {
    await call();
    const id = (sendOnce as jest.Mock).mock.calls[0][0];
    expect(id.recipient).toBe('Dana@Example.com');
    expect(id.businessEventId).toBe(`maya-doc-program_overview-${VISITOR}`);
    expect(id.subject).toContain('Program Overview');
  });

  it('a repeat call sends no second email and does not claim a new send', async () => {
    (sendOnce as jest.Mock).mockResolvedValue({
      outcome: 'skipped', reason: 'already_sent', idempotencyKey: 'k1',
    });
    const out = await call();
    expect(sendAdmissionsDocument).not.toHaveBeenCalled();
    expect(out.summary).toMatch(/already been sent/i);
  });

  it('a duplicate writes no second delivery row', async () => {
    (sendOnce as jest.Mock).mockResolvedValue({
      outcome: 'skipped', reason: 'already_sent', idempotencyKey: 'k1',
    });
    await call();
    expect(DocumentDeliveryLog.create).not.toHaveBeenCalled();
  });

  it('a different document type is a different claim, so it is not suppressed', async () => {
    await call({ ...ARGS, document_type: 'pricing_guide' });
    expect((sendOnce as jest.Mock).mock.calls[0][0].businessEventId)
      .toBe(`maya-doc-pricing_guide-${VISITOR}`);
  });
});

describe('the workflow gate still applies, and boundaries hold', () => {
  it('refuses an unsupported document type before any lookup', async () => {
    const out = await call({ ...ARGS, document_type: 'not_a_document' });
    expect(out.success).toBe(false);
    expect(evaluateSend).not.toHaveBeenCalled();
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('refuses a missing recipient address', async () => {
    const out = await call({ document_type: 'program_overview' });
    expect(out.success).toBe(false);
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('still honours the workflow stage denial', async () => {
    (canDeliverDocument as jest.Mock).mockResolvedValue({ allowed: false, reason: 'stage_too_early' });
    const out = await call({ ...ARGS, document_type: 'executive_briefing' });
    expect(out.success).toBe(false);
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('reports success only on an actual send', async () => {
    const out = await call();
    expect(out.success).toBe(true);
    expect(DocumentDeliveryLog.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });
});
